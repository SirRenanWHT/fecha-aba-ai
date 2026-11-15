/**
 * Teste da Fase 5: manifest, service worker, precache e uso offline.
 */
import { spawn } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const CHROME = process.env.CHROME_PATH ?? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const APP_URL = 'http://127.0.0.1:4173/'
const PORT = 9337
const OUT = 'shots'

const sleep = (ms) => new Promise((resolvePromise) => setTimeout(resolvePromise, ms))
const profile = join(tmpdir(), `caderno-f5-${Date.now()}`)

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
    }, 20000)
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

async function waitFor(expression, timeout = 12000) {
  const started = Date.now()
  while (Date.now() - started < timeout) {
    if (await evaluate(expression)) return true
    await sleep(150)
  }
  return false
}

async function setNativeValue(selector, value) {
  await evaluate(`
    (() => {
      const element = document.querySelector(${JSON.stringify(selector)});
      if (!element) throw new Error('Elemento não encontrado: ${selector}');
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      setter.call(element, ${JSON.stringify(value)});
      element.dispatchEvent(new Event('input', { bubbles: true }));
    })()
  `)
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
  await send('Network.enable')
  await send('Emulation.setDeviceMetricsOverride', {
    width: 390,
    height: 844,
    deviceScaleFactor: 2,
    mobile: true,
  })
  await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 })

  await send('Page.navigate', { url: APP_URL })
  await sleep(1500)
  await waitFor("document.querySelectorAll('.note-card').length > 0")

  const results = {}

  // Manifest + instalabilidade.
  const manifestResult = await send('Page.getAppManifest')
  results.manifestUrl = manifestResult.url
  results.manifestErrors = (manifestResult.errors ?? []).map((error) => error.message)

  const manifest = await evaluate("fetch('/manifest.webmanifest').then((response) => response.json())")
  results.manifestName = manifest.name
  results.manifestDisplay = manifest.display
  results.manifestIcons = (manifest.icons ?? []).length
  results.shortcuts = (manifest.shortcuts ?? []).length
  results.manifestFetchOk = manifest.name === 'Caderno — notas e atividades'
  results.iconStatuses = await evaluate(`
    Promise.all(${JSON.stringify(manifest.icons)}.map((icon) =>
      fetch(icon.src).then((response) => response.status)
    ))
  `)
  results.manifestLink = await evaluate(
    "document.querySelector('link[rel=\"manifest\"]')?.getAttribute('href') ?? null",
  )

  const installability = await send('Page.getInstallabilityErrors').catch(() => null)
  results.installabilityErrors = (installability?.installabilityErrors ?? []).map(
    (error) => error.errorId,
  )

  // Service worker pronto e controlando a página.
  results.registration = await evaluate(`
    navigator.serviceWorker.ready.then((registration) => ({
      scope: registration.scope,
      script: registration.active?.scriptURL ?? null,
      state: registration.active?.state ?? null,
    }))
  `)
  results.controlled = await waitFor('!!navigator.serviceWorker.controller', 15000)

  results.cache = await evaluate(`
    (async () => {
      const names = await caches.keys();
      const name = names.find((key) => key.startsWith('caderno-')) ?? null;
      if (!name) return null;
      const cache = await caches.open(name);
      const keys = await cache.keys();
      return {
        name,
        count: keys.length,
        hasIndex: Boolean(await cache.match('/index.html')),
        hasManifest: Boolean(await cache.match('/manifest.webmanifest')),
        hasIcon: Boolean(await cache.match('/icons/icon-192.png')),
      };
    })()
  `)

  // Offline de verdade: recarrega com a rede desligada.
  await send('Network.emulateNetworkConditions', {
    offline: true,
    latency: 0,
    downloadThroughput: 0,
    uploadThroughput: 0,
    connectionType: 'none',
  })
  await send('Page.reload')
  await sleep(1800)
  await waitFor("document.querySelectorAll('.note-card').length > 0")

  results.offline = {
    onLine: await evaluate('navigator.onLine'),
    cards: await evaluate("document.querySelectorAll('.note-card').length"),
    title: await evaluate("document.querySelector('.page-title')?.textContent ?? null"),
    swController: await evaluate('!!navigator.serviceWorker.controller'),
  }
  await screenshot('offline-notes-mobile')

  // Navegação e criação de atividade sem rede.
  await evaluate(`
    [...document.querySelectorAll('.bottom-link')]
      .find((link) => link.textContent.includes('Atividades'))?.click()
  `)
  await sleep(600)
  await waitFor("!!document.querySelector('.activities-page')")

  await evaluate("document.querySelector('.fab').click()")
  await sleep(500)
  await waitFor("!!document.querySelector('.activity-editor-title')")
  await setNativeValue('.activity-editor-title', 'Atividade offline')
  await sleep(1000)
  results.offlineActivities = await evaluate(
    "JSON.parse(localStorage.getItem('ndb:v2:activities') || '[]').length",
  )
  await screenshot('offline-activity-editor-mobile')

  await evaluate("document.querySelector('.editor-bar-side .icon-btn').click()")
  await sleep(700)
  results.offlineActivityRows = await evaluate("document.querySelectorAll('.activity-row').length")
  await screenshot('offline-activities-mobile')

  // Volta a rede e recarrega para confirmar persistência.
  await send('Network.emulateNetworkConditions', {
    offline: false,
    latency: 0,
    downloadThroughput: -1,
    uploadThroughput: -1,
    connectionType: 'wifi',
  })
  await send('Page.reload')
  await sleep(1500)
  await waitFor("document.querySelectorAll('.activity-row').length > 0")
  results.activitiesAfterOnline = await evaluate(
    "JSON.parse(localStorage.getItem('ndb:v2:activities') || '[]').length",
  )

  // Ajustes: seção de instalação presente.
  await send('Page.navigate', { url: `${APP_URL}#/ajustes` })
  await sleep(800)
  results.installSection = await evaluate(
    "document.querySelector('.settings-page')?.textContent?.includes('Aplicativo') ?? false",
  )
  await screenshot('settings-install-mobile')

  console.log(JSON.stringify(results, null, 2))

  const failed = []
  if (!results.manifestUrl?.endsWith('/manifest.webmanifest')) {
    failed.push('manifest não encontrado')
  }
  if (results.manifestErrors.length > 0) {
    failed.push(`erros no manifest: ${results.manifestErrors.join(', ')}`)
  }
  if (results.manifestName !== 'Caderno — notas e atividades') {
    failed.push('nome do manifest incorreto')
  }
  if (results.manifestDisplay !== 'standalone') failed.push('display não é standalone')
  if (results.manifestIcons < 3) failed.push('manifest sem os 3 ícones')
  if (results.shortcuts !== 2) failed.push('atalhos do manifest ausentes')
  if (results.manifestLink !== '/manifest.webmanifest') failed.push('link do manifest ausente')
  if (!results.manifestFetchOk) failed.push('manifest não pôde ser lido')
  if ((results.iconStatuses ?? []).some((status) => status !== 200)) {
    failed.push('ícone do manifest não carregou')
  }
  if (results.installabilityErrors.length > 0) {
    failed.push(`instalabilidade: ${results.installabilityErrors.join(', ')}`)
  }
  if (!results.registration?.script?.endsWith('/sw.js')) failed.push('service worker não registrou')
  if (!results.controlled) failed.push('service worker não controlou a página')
  if (!results.cache) failed.push('cache do service worker não existe')
  if ((results.cache?.count ?? 0) < 30) failed.push('precache incompleto')
  if (!results.cache?.hasIndex || !results.cache?.hasManifest || !results.cache?.hasIcon) {
    failed.push('itens essenciais fora do precache')
  }
  if (results.offline.cards !== 4) failed.push('notas não abriram offline')
  if (results.offline.title !== 'Notas') failed.push('título offline incorreto')
  if (!results.offline.swController) failed.push('página offline sem service worker')
  if (results.offlineActivities !== 1) failed.push('atividade não foi salva offline')
  if (results.offlineActivityRows !== 1) failed.push('atividade offline não apareceu na lista')
  if (results.activitiesAfterOnline !== 1) failed.push('atividade offline não persistiu')
  if (!results.installSection) failed.push('seção de instalação ausente nos Ajustes')

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
