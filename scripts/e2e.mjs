/**
 * Teste de fumaça + capturas com Chrome DevTools Protocol.
 * Uso: node scripts/e2e.mjs
 * Requer o app servido em http://127.0.0.1:4173.
 */
import { spawn } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const CHROME = process.env.CHROME_PATH ?? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const APP_URL = 'http://127.0.0.1:4173/'
const PORT = 9333
const OUT = 'shots'
const COVER_PATH = resolve('shots/test-cover.jpg')

const sleep = (ms) => new Promise((resolvePromise) => setTimeout(resolvePromise, ms))

const profile = join(tmpdir(), `caderno-cdp-${Date.now()}`)
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

function getStoredNote(title) {
  return `(JSON.parse(localStorage.getItem('ndb:v2:notes') || '[]').find(n => n.title === ${JSON.stringify(title)}) ?? null)`
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
  await send('DOM.enable')
  await send('Emulation.setDeviceMetricsOverride', {
    width: 390,
    height: 844,
    deviceScaleFactor: 2,
    mobile: true,
  })
  await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 })

  await send('Page.navigate', { url: APP_URL })
  await sleep(1200)
  await waitFor("document.querySelectorAll('.note-card').length > 0")

  const results = {}
  results.initialCards = await evaluate("document.querySelectorAll('.note-card').length")
  results.hasBottomNav = await evaluate(
    "getComputedStyle(document.querySelector('.bottom-nav')).display !== 'none'",
  )
  results.viewport = await evaluate('window.innerWidth')
  results.horizontalOverflow = await evaluate(
    'document.documentElement.scrollWidth > window.innerWidth',
  )

  await screenshot('mobile-390')

  // Cria uma nota nova pelo FAB.
  await evaluate("document.querySelector('.fab').click()")
  await sleep(350)
  await waitFor("!!document.querySelector('.editor-title')")

  await evaluate(`
    (() => {
      const title = document.querySelector('.editor-title');
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      setter.call(title, 'Nota de teste E2E');
      title.dispatchEvent(new Event('input', { bubbles: true }));

      const body = document.querySelector('.rte-content');
      body.innerHTML = '<p>Conteúdo criado pelo teste automatizado.</p><p><strong>Segunda linha</strong> com negrito.</p>';
      body.dispatchEvent(new Event('input', { bubbles: true }));
    })()
  `)
  await sleep(1000)

  results.hashAfterCreate = await evaluate('location.hash')
  results.savedTitle = await evaluate(`${getStoredNote('Nota de teste E2E')}?.title ?? null`)
  results.savedContent = await evaluate(`${getStoredNote('Nota de teste E2E')}?.content ?? null`)

  // Painel de estilo: fonte, cor e tema.
  await evaluate("document.querySelector('[aria-label=\"Personalizar nota\"]').click()")
  await sleep(400)
  results.panelOpen = await evaluate("!!document.querySelector('.style-panel')")

  await evaluate(`
    [...document.querySelectorAll('.font-option')]
      .find(el => el.textContent.includes('Lora'))?.click()
  `)
  await sleep(200)
  await evaluate("document.querySelector('.swatch[aria-label=\"Oliva\"]')?.click()")
  await sleep(200)
  await evaluate(`
    [...document.querySelectorAll('.theme-option-card')]
      .find(el => el.textContent.includes('Escuro'))?.click()
  `)
  await sleep(900)

  const styled = await evaluate(getStoredNote('Nota de teste E2E'))
  results.styledFont = styled?.fontFamily ?? null
  results.styledAccent = styled?.accentColor ?? null
  results.styledTheme = styled?.cardTheme ?? null

  // Upload de capa pelo input de arquivo (CDP).
  const documentNode = await send('DOM.getDocument', { depth: -1 })
  const fileNode = await send('DOM.querySelector', {
    nodeId: documentNode.root.nodeId,
    selector: '.style-panel input[type="file"]',
  })
  if (!fileNode.nodeId) throw new Error('Input de arquivo da capa não encontrado')
  await send('DOM.setFileInputFiles', {
    nodeId: fileNode.nodeId,
    files: [COVER_PATH],
  })
  await sleep(2600)

  results.coverId = await evaluate(`${getStoredNote('Nota de teste E2E')}?.coverImageId ?? null`)
  results.imageCount = await evaluate(`
    new Promise((resolvePromise) => {
      const request = indexedDB.open('ndb-images');
      request.onsuccess = () => {
        const database = request.result;
        const all = database.transaction('images', 'readonly').objectStore('images').getAll();
        all.onsuccess = () => resolvePromise(all.result.length);
        all.onerror = () => resolvePromise(-1);
      };
      request.onerror = () => resolvePromise(-2);
    })
  `)
  results.coverPreviewVisible = await evaluate(
    "!!document.querySelector('.style-panel .cover-preview')",
  )
  await screenshot('style-panel-mobile')

  // Fecha o painel e volta para a lista.
  await evaluate("document.querySelector('[aria-label=\"Fechar painel de estilo\"]').click()")
  await sleep(400)
  await screenshot('editor-styled-mobile')

  await evaluate("document.querySelector('.editor-bar-side .icon-btn').click()")
  await sleep(600)

  results.cardVisible = await evaluate(
    "[...document.querySelectorAll('.note-card')].some(c => c.textContent.includes('Nota de teste E2E'))",
  )
  results.cardHasImage = await evaluate(
    "[...document.querySelectorAll('.note-card')].some(c => c.textContent.includes('Nota de teste E2E') && !!c.querySelector('.card-cover-img'))",
  )
  results.cardFont = await evaluate(
    "[...document.querySelectorAll('.note-card')].find(c => c.textContent.includes('Nota de teste E2E'))?.dataset.noteFont ?? null",
  )
  results.cardTheme = await evaluate(
    "[...document.querySelectorAll('.note-card')].find(c => c.textContent.includes('Nota de teste E2E'))?.dataset.cardTheme ?? null",
  )
  await screenshot('list-with-cover-mobile')

  // Exclui a nota pela lixeira no editor.
  await evaluate(`
    [...document.querySelectorAll('.note-card')]
      .find(c => c.textContent.includes('Nota de teste E2E'))
      ?.click()
  `)
  await sleep(500)
  await evaluate("document.querySelector('.editor-bar-actions .is-danger').click()")
  await sleep(600)
  results.afterDelete = await evaluate("JSON.parse(localStorage.getItem('ndb:v2:notes')).length")

  // Persistência após recarregar.
  await send('Page.reload')
  await sleep(1300)
  await waitFor("document.querySelectorAll('.note-card').length > 0")
  results.cardsAfterReload = await evaluate("document.querySelectorAll('.note-card').length")

  // Busca por texto (ignora as tags HTML).
  await evaluate(`
    (() => {
      const input = document.querySelector('.search-field input');
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      setter.call(input, 'compras');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    })()
  `)
  await sleep(400)
  results.searchResults = await evaluate("document.querySelectorAll('.note-card').length")
  results.searchFirstTitle = await evaluate(
    "document.querySelector('.card-title')?.textContent ?? null",
  )
  await evaluate("document.querySelector('.search-clear')?.click()")
  await sleep(300)
  results.cardsAfterClear = await evaluate("document.querySelectorAll('.note-card').length")

  // Tema escuro pelas opções de ajustes.
  await send('Page.navigate', { url: `${APP_URL}#/ajustes` })
  await sleep(700)
  await evaluate(`
    [...document.querySelectorAll('.theme-card')]
      .find(c => c.textContent.includes('Escuro'))
      ?.click()
  `)
  await sleep(250)
  results.darkThemeApplied = await evaluate("document.documentElement.dataset.theme === 'dark'")
  await screenshot('settings-mobile-dark')

  // Migração v1 (texto puro) -> v2 (HTML).
  await evaluate(`
    localStorage.removeItem('ndb:v2:notes');
    localStorage.setItem('ndb:v1:notes', JSON.stringify([{
      id: 'legacy-test',
      title: 'Nota antiga da Fase 1',
      content: 'Primeira linha\\n\\nSegunda linha com <b>texto</b> literal.',
      fontFamily: 'inter',
      accentColor: '#b0492b',
      cardTheme: 'auto',
      tags: ['antiga'],
      pinned: false,
      archived: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }]));
  `)
  await send('Page.navigate', { url: APP_URL })
  await sleep(1400)
  await waitFor("document.querySelectorAll('.note-card').length > 0")
  results.migratedCount = await evaluate(
    "JSON.parse(localStorage.getItem('ndb:v2:notes') || '[]').length",
  )
  results.migratedHtml = await evaluate(
    "JSON.parse(localStorage.getItem('ndb:v2:notes') || '[]')[0]?.content ?? ''",
  )
  results.legacyRemoved = await evaluate("localStorage.getItem('ndb:v1:notes') === null")
  results.migratedCardText = await evaluate(
    "document.querySelector('.note-card')?.textContent?.includes('Nota antiga da Fase 1') ?? false",
  )
  await screenshot('migrated-note-mobile')

  console.log(JSON.stringify(results, null, 2))

  const failed = []
  if (results.initialCards !== 4) failed.push('esperava 4 cards iniciais')
  if (!results.hasBottomNav) failed.push('navegação inferior não apareceu')
  if (results.viewport !== 390) failed.push(`viewport ${results.viewport} != 390`)
  if (results.horizontalOverflow) failed.push('há overflow horizontal')
  if (!results.savedTitle) failed.push('nota criada não foi salva')
  if (!String(results.savedContent).includes('<strong>Segunda linha</strong>')) {
    failed.push('rich text não foi salvo como HTML')
  }
  if (!results.panelOpen) failed.push('painel de estilo não abriu')
  if (results.styledFont !== 'lora') failed.push('fonte Lora não foi aplicada')
  if (results.styledAccent !== '#6c7a4a') failed.push('cor de destaque não foi aplicada')
  if (results.styledTheme !== 'escuro') failed.push('tema do card não foi aplicado')
  if (!results.coverId) failed.push('capa não foi salva na nota')
  if (results.imageCount !== 1) failed.push(`IndexedDB deveria ter 1 imagem (tem ${results.imageCount})`)
  if (!results.coverPreviewVisible) failed.push('prévia da capa não apareceu')
  if (!results.cardVisible) failed.push('card criado não apareceu na lista')
  if (!results.cardHasImage) failed.push('card não exibiu a capa')
  if (results.cardFont !== 'lora') failed.push('card não herdou a fonte')
  if (results.cardTheme !== 'escuro') failed.push('card não herdou o tema')
  if (results.afterDelete !== 4) failed.push('exclusão não removeu a nota')
  if (results.cardsAfterReload !== 4) failed.push('notas não persistiram após reload')
  if (results.searchResults !== 1) failed.push('busca não filtrou para uma nota')
  if (!String(results.searchFirstTitle).includes('Lista de compras')) {
    failed.push('busca trouxe a nota errada')
  }
  if (results.cardsAfterClear !== 4) failed.push('limpar busca não restaurou a lista')
  if (!results.darkThemeApplied) failed.push('tema escuro não aplicou')
  if (results.migratedCount !== 1) failed.push('migração não gerou a nota v2')
  if (!String(results.migratedHtml).includes('<p>Primeira linha</p>')) {
    failed.push('migração não converteu texto em parágrafos')
  }
  if (!String(results.migratedHtml).includes('&lt;b&gt;')) {
    failed.push('migração não escapou HTML digitado como texto')
  }
  if (!results.legacyRemoved) failed.push('chave v1 não foi removida após migrar')
  if (!results.migratedCardText) failed.push('nota migrada não apareceu na lista')

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
