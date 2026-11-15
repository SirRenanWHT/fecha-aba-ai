/**
 * Teste da Fase 3: compartilhar por link, importar nota, backup com imagem
 * e restauração. Requer o app em http://127.0.0.1:4173.
 */
import { spawn } from 'node:child_process'
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const CHROME = process.env.CHROME_PATH ?? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const APP_URL = 'http://127.0.0.1:4173/'
const PORT = 9334
const OUT = 'shots'
const COVER_PATH = resolve('shots/test-cover.jpg')
const DOWNLOAD_DIR = resolve('tmp/downloads')
const NOTE_FILE_PATH = resolve('tmp/note-import-test.json')

const sleep = (ms) => new Promise((resolvePromise) => setTimeout(resolvePromise, ms))

const profile = join(tmpdir(), `caderno-cdp-f3-${Date.now()}`)
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

async function waitFor(expression, timeout = 8000) {
  const started = Date.now()
  while (Date.now() - started < timeout) {
    if (await evaluate(expression)) return true
    await sleep(100)
  }
  return false
}

async function setFile(selector, filePath) {
  const documentNode = await send('DOM.getDocument', { depth: -1 })
  const node = await send('DOM.querySelector', {
    nodeId: documentNode.root.nodeId,
    selector,
  })
  if (!node.nodeId) throw new Error(`Input não encontrado: ${selector}`)
  await send('DOM.setFileInputFiles', { nodeId: node.nodeId, files: [filePath] })
}

async function notesCount() {
  return evaluate("JSON.parse(localStorage.getItem('ndb:v2:notes') || '[]').length")
}

async function imageCount() {
  return evaluate(`
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
}

async function main() {
  await mkdir(OUT, { recursive: true })
  await mkdir(DOWNLOAD_DIR, { recursive: true })

  const now = new Date().toISOString()
  await writeFile(
    NOTE_FILE_PATH,
    JSON.stringify({
      v: 1,
      kind: 'note',
      createdAt: now,
      note: {
        note: {
          id: 'arquivo-teste',
          title: 'Nota importada de arquivo',
          content: '<p>Conteúdo vindo de um <strong>arquivo</strong>.</p>',
          fontFamily: 'lora',
          accentColor: '#3e6b7d',
          cardTheme: 'papel',
          tags: ['arquivo'],
          pinned: false,
          archived: false,
          createdAt: now,
          updatedAt: now,
        },
      },
    }),
    'utf8',
  )

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
  await send('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: DOWNLOAD_DIR })

  await send('Page.navigate', { url: APP_URL })
  await sleep(1200)
  await waitFor("document.querySelectorAll('.note-card').length > 0")

  const results = {}
  results.initialNotes = await notesCount()

  // Abre a primeira nota (fixada) e compartilha.
  await evaluate("document.querySelector('.note-card').click()")
  await sleep(500)
  await waitFor("!!document.querySelector('.editor-title')")
  results.editorBarOverflow = await evaluate(
    "document.querySelector('.editor-bar').scrollWidth > window.innerWidth",
  )

  await evaluate("document.querySelector('[aria-label=\"Compartilhar nota\"]').click()")
  await waitFor("!!document.querySelector('.share-link-input')?.value")
  await sleep(300)

  const link = await evaluate("document.querySelector('.share-link-input')?.value ?? ''")
  results.linkPrefix = link.slice(0, 80)
  results.linkHasImportRoute = link.includes('#/importar?d=z')
  await screenshot('share-dialog-mobile')

  // Abre o link compartilhado e importa a nota.
  await send('Page.navigate', { url: link })
  await sleep(1200)
  await waitFor("!!document.querySelector('.import-card-title')")

  results.importTitle = await evaluate(
    "document.querySelector('.import-card-title')?.textContent ?? null",
  )
  results.importHasContent = await evaluate(
    "!!document.querySelector('.import-content')?.textContent?.trim()",
  )
  await screenshot('import-preview-mobile')

  await evaluate("document.querySelector('.import-actions .btn--primary').click()")
  await sleep(900)
  await waitFor("location.hash.startsWith('#/nota/')")
  results.notesAfterImport = await notesCount()
  results.importedTitleCount = await evaluate(
    "JSON.parse(localStorage.getItem('ndb:v2:notes')).filter(n => n.title === 'Bem-vindo ao Caderno').length",
  )
  const importedId = await evaluate("location.hash.split('/').pop()")
  results.importedId = importedId

  // Adiciona capa à nota importada.
  await evaluate("document.querySelector('[aria-label=\"Personalizar nota\"]').click()")
  await waitFor("!!document.querySelector('.style-panel')")
  await setFile('.style-panel input[type="file"]', COVER_PATH)
  await sleep(2600)
  results.importedCoverId = await evaluate(
    `JSON.parse(localStorage.getItem('ndb:v2:notes')).find(n => n.id === ${JSON.stringify(
      importedId,
    )})?.coverImageId ?? null`,
  )
  results.imagesAfterCover = await imageCount()
  await evaluate("document.querySelector('[aria-label=\"Fechar painel de estilo\"]').click()")
  await sleep(300)

  // Compartilhar nota com imagem deve avisar que o link é grande.
  await evaluate("document.querySelector('[aria-label=\"Compartilhar nota\"]').click()")
  await waitFor("!!document.querySelector('.share-warning')", 10000)
  results.longLinkWarning = await evaluate("!!document.querySelector('.share-warning')")
  results.primaryAction = await evaluate(
    "document.querySelector('.share-actions .btn--primary')?.textContent?.trim() ?? null",
  )
  await screenshot('share-warning-mobile')
  await evaluate("document.querySelector('[aria-label=\"Fechar compartilhamento\"]').click()")
  await sleep(300)

  // Exporta o backup.
  await send('Page.navigate', { url: `${APP_URL}#/ajustes` })
  await sleep(800)
  await waitFor("!!document.querySelector('.settings-page')")

  await evaluate(`
    [...document.querySelectorAll('.settings-actions .btn')]
      .find(button => button.textContent.includes('Exportar backup'))?.click()
  `)

  let backupPath = null
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const files = await readdir(DOWNLOAD_DIR).catch(() => [])
    const found = files.find((file) => file.endsWith('.json'))
    if (found) {
      backupPath = join(DOWNLOAD_DIR, found)
      break
    }
    await sleep(250)
  }
  results.backupDownloaded = Boolean(backupPath)

  if (backupPath) {
    const backup = JSON.parse(await readFile(backupPath, 'utf8'))
    results.backupKind = backup.kind
    results.backupNotes = backup.notes.length
    results.backupImages = backup.notes.filter((transfer) => transfer.cover).length
    results.backupHasImageData = backup.notes.some((transfer) =>
      Boolean(transfer.cover?.data?.length > 1000),
    )
  }

  // Restaura do zero usando o backup exportado.
  await evaluate(`
    [...document.querySelectorAll('button')]
      .find(button => button.textContent.includes('Apagar todos os dados'))?.click()
  `)
  await waitFor("!!document.querySelector('.dialog')")
  await evaluate("document.querySelector('.dialog .btn--danger').click()")
  await sleep(1600)
  results.notesAfterReset = await notesCount()

  await setFile('.settings-page input[type="file"]', backupPath)
  await waitFor("!!document.querySelector('.backup-dialog')", 10000)
  results.backupDialogSummary = await evaluate(
    "document.querySelector('.backup-dialog .dialog-description')?.textContent?.trim() ?? null",
  )
  await screenshot('backup-restore-mobile')

  await evaluate(`
    [...document.querySelectorAll('.backup-mode')]
      .find(option => option.textContent.includes('Substituir'))?.click()
  `)
  await sleep(200)
  await evaluate("document.querySelector('.backup-dialog .dialog-actions .btn--danger').click()")
  await sleep(2500)

  results.notesAfterRestore = await notesCount()
  results.imagesAfterRestore = await imageCount()

  await send('Page.navigate', { url: APP_URL })
  await sleep(1200)
  await waitFor("document.querySelectorAll('.note-card').length > 0")
  results.cardsAfterRestore = await evaluate("document.querySelectorAll('.note-card').length")
  results.hasCoverCard = await evaluate(
    "[...document.querySelectorAll('.note-card')].some(card => !!card.querySelector('.card-cover-img'))",
  )
  results.localStorageHasBase64 = await evaluate(
    "(localStorage.getItem('ndb:v2:notes') || '').includes('base64')",
  )
  await screenshot('restored-home-mobile')

  // Importa uma nota avulsa por arquivo, pelo botão da lista.
  await evaluate("document.querySelector('.import-note-btn').click()")
  await sleep(600)
  results.hashAfterImportButton = await evaluate('location.hash')
  await waitFor("!!document.querySelector('.import-page')")

  await setFile('.import-page input[type="file"]', NOTE_FILE_PATH)
  await waitFor("!!document.querySelector('.import-card-title')", 8000)
  results.filePreviewTitle = await evaluate(
    "document.querySelector('.import-card-title')?.textContent ?? null",
  )
  await screenshot('import-file-preview-mobile')

  await evaluate("document.querySelector('.import-actions .btn--primary').click()")
  await sleep(1000)
  await waitFor("location.hash.startsWith('#/nota/')")
  results.notesAfterFileImport = await notesCount()
  results.fileImportedTitleCount = await evaluate(
    "JSON.parse(localStorage.getItem('ndb:v2:notes')).filter(n => n.title === 'Nota importada de arquivo').length",
  )

  console.log(JSON.stringify(results, null, 2))

  const failed = []
  if (results.initialNotes !== 4) failed.push('esperava 4 notas iniciais')
  if (results.editorBarOverflow) failed.push('barra do editor transbordou no celular')
  if (!results.linkHasImportRoute) failed.push('link compartilhado não aponta para /importar')
  if (results.importTitle !== 'Bem-vindo ao Caderno') failed.push('prévia de importação errada')
  if (!results.importHasContent) failed.push('prévia sem conteúdo')
  if (results.notesAfterImport !== 5) failed.push('importação não criou a nota')
  if (results.importedTitleCount !== 2) failed.push('cópia importada não foi encontrada')
  if (!results.importedCoverId) failed.push('capa não foi salva na nota importada')
  if (results.imagesAfterCover !== 1) failed.push('IndexedDB deveria ter 1 imagem')
  if (!results.longLinkWarning) failed.push('link com imagem não avisou sobre o tamanho')
  if (results.primaryAction !== 'Baixar arquivo') failed.push('ação primária deveria ser o arquivo')
  if (!results.backupDownloaded) failed.push('backup não foi baixado')
  if (results.backupKind !== 'backup') failed.push('arquivo baixado não é um backup')
  if (results.backupNotes !== 5) failed.push('backup deveria ter 5 notas')
  if (results.backupImages !== 1) failed.push('backup deveria ter 1 imagem')
  if (!results.backupHasImageData) failed.push('backup não incluiu os dados da imagem')
  if (results.notesAfterReset !== 4) failed.push('reset não voltou para as 4 notas de exemplo')
  if (results.notesAfterRestore !== 5) failed.push('restauração não devolveu as 5 notas')
  if (results.imagesAfterRestore !== 1) failed.push('restauração não devolveu a imagem')
  if (results.cardsAfterRestore !== 5) failed.push('lista não mostrou as 5 notas restauradas')
  if (!results.hasCoverCard) failed.push('card restaurado sem capa')
  if (results.localStorageHasBase64) failed.push('base64 de imagem vazou para o localStorage')
  if (results.hashAfterImportButton !== '#/importar') {
    failed.push('botão Importar da lista não abriu a tela de importação')
  }
  if (results.filePreviewTitle !== 'Nota importada de arquivo') {
    failed.push('prévia do arquivo de nota não apareceu')
  }
  if (results.notesAfterFileImport !== 6) failed.push('importação por arquivo não criou a nota')
  if (results.fileImportedTitleCount !== 1) {
    failed.push('nota importada por arquivo não foi encontrada')
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
