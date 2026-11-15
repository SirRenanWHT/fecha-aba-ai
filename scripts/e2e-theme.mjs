/**
 * Regressão do tema da nota: o card e a folha do editor devem obedecer ao tema
 * escolhido na nota, mesmo com o app em outro tema.
 */
import { spawn } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const CHROME = process.env.CHROME_PATH ?? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const APP_URL = 'http://127.0.0.1:4173/'
const PORT = 9335
const OUT = 'shots'

const sleep = (ms) => new Promise((resolvePromise) => setTimeout(resolvePromise, ms))
const profile = join(tmpdir(), `caderno-theme-${Date.now()}`)

const chrome = spawn(
  CHROME,
  [
    '--headless=new',
    '--no-sandbox',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${profile}`,
    'about:blank',
  ],
  { stdio: 'ignore' },
)

let ws
let nextId = 0
const pending = new Map()

function send(method, params = {}) {
  const id = (nextId += 1)
  return new Promise((resolvePromise, reject) => {
    pending.set(id, { resolve: resolvePromise, reject })
    ws.send(JSON.stringify({ id, method, params }))
    setTimeout(() => {
      if (pending.has(id)) {
        pending.delete(id)
        reject(new Error(`Timeout em ${method}`))
      }
    }, 15000)
  })
}

async function evaluate(expression) {
  const response = await send('Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: true,
  })
  if (response.exceptionDetails) {
    const detail = response.exceptionDetails.exception?.description ?? response.exceptionDetails.text
    throw new Error(`Erro no navegador: ${detail}`)
  }
  return response.result.value
}

async function screenshot(name) {
  const { data } = await send('Page.captureScreenshot', { format: 'png' })
  await writeFile(join(OUT, `${name}.png`), Buffer.from(data, 'base64'))
}

async function waitFor(expression, timeout = 6000) {
  const started = Date.now()
  while (Date.now() - started < timeout) {
    if (await evaluate(expression)) return true
    await sleep(100)
  }
  return false
}

async function chooseTheme(label) {
  await evaluate("document.querySelector('[aria-label=\"Personalizar nota\"]').click()")
  await waitFor("!!document.querySelector('.style-panel')")
  await evaluate(`
    [...document.querySelectorAll('.theme-option-card')]
      .find(option => option.textContent.includes(${JSON.stringify(label)}))?.click()
  `)
  await sleep(700)
  await evaluate("document.querySelector('[aria-label=\"Fechar painel de estilo\"]').click()")
  await sleep(300)
}

async function main() {
  await mkdir(OUT, { recursive: true })

  let version
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${PORT}/json/version`)
      version = await response.json()
      break
    } catch {
      await sleep(200)
    }
  }
  if (!version) throw new Error('Chrome não expôs o endpoint de debug')

  const targets = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()
  const page = targets.find((target) => target.type === 'page')
  if (!page) throw new Error('Nenhuma aba disponível')

  ws = new WebSocket(page.webSocketDebuggerUrl)
  await new Promise((resolvePromise, reject) => {
    ws.onopen = resolvePromise
    ws.onerror = () => reject(new Error('Falha ao conectar no WebSocket do Chrome'))
  })

  ws.onmessage = (event) => {
    const message = JSON.parse(event.data)
    if (message.id && pending.has(message.id)) {
      const { resolve: resolvePromise, reject } = pending.get(message.id)
      pending.delete(message.id)
      if (message.error) reject(new Error(message.error.message))
      else resolvePromise(message.result)
    }
  }

  await send('Page.enable')
  await send('Runtime.enable')
  await send('Emulation.setDeviceMetricsOverride', {
    width: 390,
    height: 844,
    deviceScaleFactor: 2,
    mobile: true,
  })
  await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 })
  await send('Emulation.setEmulatedMedia', {
    features: [{ name: 'prefers-color-scheme', value: 'dark' }],
  })

  await send('Page.navigate', { url: APP_URL })
  await sleep(1200)
  await waitFor("document.querySelectorAll('.note-card').length > 0")

  const results = {}
  results.appTheme = await evaluate('document.documentElement.dataset.theme')

  await evaluate("document.querySelector('.note-card').click()")
  await sleep(500)
  await waitFor("!!document.querySelector('.editor-title')")

  await chooseTheme('Claro')
  results.claroEditorBg = await evaluate(
    "getComputedStyle(document.querySelector('.editor-canvas')).backgroundColor",
  )
  results.claroTitleColor = await evaluate(
    "getComputedStyle(document.querySelector('.editor-title')).color",
  )
  results.claroCanvasTheme = await evaluate(
    "document.querySelector('.editor-canvas')?.dataset.cardTheme ?? null",
  )
  await screenshot('editor-theme-claro-mobile')

  await chooseTheme('Papel')
  results.papelEditorBg = await evaluate(
    "getComputedStyle(document.querySelector('.editor-canvas')).backgroundColor",
  )
  await screenshot('editor-theme-papel-mobile')

  await evaluate("document.querySelector('.editor-bar-side .icon-btn').click()")
  await sleep(700)

  results.cardTheme = await evaluate(
    "document.querySelector('.note-card')?.dataset.cardTheme ?? null",
  )
  results.cardBg = await evaluate(
    "getComputedStyle(document.querySelector('.note-card')).backgroundColor",
  )
  results.cardTitleColor = await evaluate(
    "getComputedStyle(document.querySelector('.note-card .card-title')).color",
  )
  results.appThemeAfter = await evaluate('document.documentElement.dataset.theme')
  await screenshot('home-theme-papel-mobile')

  console.log(JSON.stringify(results, null, 2))

  const failed = []
  if (results.appTheme !== 'dark') failed.push('app deveria estar no tema escuro')
  if (results.appThemeAfter !== 'dark') failed.push('tema do app mudou sozinho')
  if (results.claroCanvasTheme !== 'claro') failed.push('editor não recebeu data-card-theme')
  if (results.claroEditorBg !== 'rgb(255, 253, 248)') {
    failed.push(`fundo do editor claro incorreto: ${results.claroEditorBg}`)
  }
  if (results.claroTitleColor !== 'rgb(36, 31, 25)') {
    failed.push(`texto do editor claro incorreto: ${results.claroTitleColor}`)
  }
  if (results.papelEditorBg !== 'rgb(251, 243, 226)') {
    failed.push(`fundo do editor papel incorreto: ${results.papelEditorBg}`)
  }
  if (results.cardTheme !== 'papel') failed.push('card não recebeu o tema papel')
  if (results.cardBg !== 'rgb(251, 243, 226)') {
    failed.push(`fundo do card papel incorreto: ${results.cardBg}`)
  }
  if (results.cardTitleColor !== 'rgb(51, 40, 28)') {
    failed.push(`texto do card papel incorreto: ${results.cardTitleColor}`)
  }

  if (failed.length > 0) {
    console.error('FALHAS:', failed.join('; '))
    process.exitCode = 1
  } else {
    console.log('Tudo certo ✔')
  }
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(async () => {
    try {
      ws?.close()
    } catch {
      // ignora
    }
    chrome.kill()
  })
