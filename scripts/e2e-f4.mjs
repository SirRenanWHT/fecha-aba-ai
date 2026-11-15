/**
 * Teste da Fase 4: atividades, subtarefas, progresso, prazos, kanban,
 * exportação/importação e presença no backup.
 */
import { spawn } from 'node:child_process'
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const CHROME = process.env.CHROME_PATH ?? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const APP_URL = 'http://127.0.0.1:4173/'
const PORT = 9336
const OUT = 'shots'
const DOWNLOAD_DIR = resolve('tmp/f4-downloads')

const sleep = (ms) => new Promise((resolvePromise) => setTimeout(resolvePromise, ms))
const profile = join(tmpdir(), `caderno-f4-${Date.now()}`)

function isoDate(offsetDays) {
  const date = new Date()
  date.setDate(date.getDate() + offsetDays)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

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

async function setNativeValue(selector, value, eventName = 'input') {
  await evaluate(`
    (() => {
      const element = document.querySelector(${JSON.stringify(selector)});
      if (!element) throw new Error('Elemento não encontrado: ${selector}');
      const prototype = element instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : element instanceof HTMLSelectElement
          ? HTMLSelectElement.prototype
          : HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(prototype, 'value').set;
      setter.call(element, ${JSON.stringify(value)});
      element.dispatchEvent(new Event('input', { bubbles: true }));
      element.dispatchEvent(new Event('change', { bubbles: true }));
    })()
  `)
}

async function clickByText(selector, text) {
  return evaluate(`
    (() => {
      const element = [...document.querySelectorAll(${JSON.stringify(selector)})]
        .find(item => item.textContent.includes(${JSON.stringify(text)}));
      if (!element) return false;
      element.click();
      return true;
    })()
  `)
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

function activities() {
  return `JSON.parse(localStorage.getItem('ndb:v2:activities') || '[]')`
}

async function addSubtask(title) {
  await setNativeValue('.subtask-add input', title)
  await evaluate("document.querySelector('.subtask-add button[type=\"submit\"]').click()")
  await sleep(120)
}

async function waitForDownload(prefix, timeout = 12000) {
  const started = Date.now()
  while (Date.now() - started < timeout) {
    const files = await readdir(DOWNLOAD_DIR).catch(() => [])
    const found = files.find((file) => file.startsWith(prefix) && file.endsWith('.json'))
    if (found) {
      const path = join(DOWNLOAD_DIR, found)
      const content = await readFile(path, 'utf8')
      if (content.trim().endsWith('}')) return { path, content }
    }
    await sleep(250)
  }
  return null
}

async function main() {
  await mkdir(OUT, { recursive: true })
  await rm(DOWNLOAD_DIR, { recursive: true, force: true })
  await mkdir(DOWNLOAD_DIR, { recursive: true })

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

  // Abre Atividades (vazio).
  await evaluate(`
    [...document.querySelectorAll('.bottom-link')]
      .find(link => link.textContent.includes('Atividades'))?.click()
  `)
  await sleep(500)
  await waitFor("!!document.querySelector('.activities-page')")
  results.emptyState = await evaluate(
    "!!document.querySelector('.empty-state') && document.querySelector('.empty-state').textContent.includes('Nenhuma atividade ainda')",
  )

  // Cria a primeira atividade.
  await clickByText('.empty-actions .btn', 'Criar primeira atividade')
  await sleep(500)
  await waitFor("!!document.querySelector('.activity-editor-title')")

  await setNativeValue('.activity-editor-title', 'Planejar mudança')
  await setNativeValue('.activity-editor-desc', 'Organizar caixas, contrato e mudança.')
  await addSubtask('Separar caixas')
  await addSubtask('Contratar transporte')
  await addSubtask('Atualizar endereço')
  await sleep(900)

  results.createdTitle = await evaluate(`${activities()}.find(a => a.title === 'Planejar mudança')?.title ?? null`)
  results.subtaskCount = await evaluate(
    `${activities()}.find(a => a.title === 'Planejar mudança')?.subtasks.length ?? 0`,
  )

  // Conclui a primeira subtarefa -> 33% e "em andamento".
  await evaluate("document.querySelectorAll('.subtask-check')[0].click()")
  await sleep(900)
  results.afterFirstSubtask = await evaluate(`
    (() => {
      const activity = ${activities()}.find(a => a.title === 'Planejar mudança');
      return activity ? { progress: activity.progress, status: activity.status } : null;
    })()
  `)

  // Prazo, prioridade e projeto.
  await setNativeValue('.activity-fields input[type="date"]', isoDate(2))
  await evaluate("document.querySelector('.priority-option--high').click()")
  await setNativeValue('.field--wide input', 'Casa')
  await sleep(900)

  results.activityDetails = await evaluate(`
    (() => {
      const activity = ${activities()}.find(a => a.title === 'Planejar mudança');
      return activity
        ? { dueDate: activity.dueDate, priority: activity.priority, project: activity.project }
        : null;
    })()
  `)
  await screenshot('activity-editor-mobile')

  // Conclui o restante.
  while (true) {
    const remaining = await evaluate("document.querySelectorAll('.subtask-check:not(.is-done)').length")
    if (remaining === 0) break
    await evaluate("document.querySelector('.subtask-check:not(.is-done)').click()")
    await sleep(250)
  }
  await sleep(600)

  results.completed = await evaluate(`
    (() => {
      const activity = ${activities()}.find(a => a.title === 'Planejar mudança');
      return activity
        ? { progress: activity.progress, status: activity.status, completed: Boolean(activity.completedAt) }
        : null;
    })()
  `)

  await evaluate("document.querySelector('.editor-bar-side .icon-btn').click()")
  await sleep(700)
  await waitFor("!!document.querySelector('.activity-list')")

  results.listSummary = await evaluate(
    "document.querySelector('.activity-summary')?.textContent?.replace(/\\s+/g, ' ').trim() ?? null",
  )
  results.rowsAfterFirst = await evaluate("document.querySelectorAll('.activity-row').length")
  await screenshot('activities-list-mobile')

  // Segunda atividade: manual, 40%, atrasada.
  await evaluate("document.querySelector('.fab').click()")
  await sleep(400)
  await waitFor("!!document.querySelector('.activity-editor-title')")
  await setNativeValue('.activity-editor-title', 'Enviar relatório mensal')
  await clickByText('.segmented button', 'Manual')
  await sleep(200)
  await setNativeValue('.progress-range input', '40')
  await clickByText('.activity-status-option', 'Em andamento')
  await setNativeValue('.activity-fields input[type="date"]', isoDate(-2))
  await setNativeValue('.field--wide input', 'Trabalho')
  await sleep(1000)

  results.manualActivity = await evaluate(`
    (() => {
      const activity = ${activities()}.find(a => a.title === 'Enviar relatório mensal');
      return activity
        ? { progress: activity.progress, status: activity.status, dueDate: activity.dueDate }
        : null;
    })()
  `)

  await evaluate("document.querySelector('.editor-bar-side .icon-btn').click()")
  await sleep(800)
  await waitFor("document.querySelectorAll('.activity-row').length === 2")

  // Filtro de atrasadas.
  await clickByText('.tabs .tab', 'Atrasadas')
  await sleep(400)
  results.overdueRows = await evaluate("document.querySelectorAll('.activity-row').length")
  results.overdueTitle = await evaluate(
    "document.querySelector('.activity-row-title')?.textContent ?? null",
  )
  await screenshot('activities-overdue-mobile')
  await clickByText('.tabs .tab', 'Todas')
  await sleep(300)

  // Kanban + mudança de etapa pelo seletor.
  await clickByText('.view-switch button', 'Kanban')
  await sleep(500)
  results.kanbanColumns = await evaluate("document.querySelectorAll('.kanban-column').length")
  await screenshot('activities-kanban-mobile')

  await evaluate(`
    (() => {
      const card = [...document.querySelectorAll('.kanban-card')]
        .find(item => item.textContent.includes('Enviar relatório mensal'));
      const select = card?.querySelector('select');
      if (!select) return false;
      const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set;
      setter.call(select, 'paused');
      select.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    })()
  `)
  await sleep(700)
  results.pausedStatus = await evaluate(`
    (() => {
      const activity = ${activities()}.find(a => a.title === 'Enviar relatório mensal');
      return activity?.status ?? null;
    })()
  `)
  await screenshot('activities-kanban-paused-mobile')

  // Exporta as atividades.
  await evaluate("document.querySelectorAll('.activity-icon-btn')[1].click()")
  const exported = await waitForDownload('caderno-atividades')
  results.exported = Boolean(exported)
  if (exported) {
    const payload = JSON.parse(exported.content)
    results.exportedKind = payload.kind
    results.exportedCount = payload.activities.length
  }

  // Importa o arquivo (duplica como cópias).
  await setFile('.activities-page input[type="file"]', exported.path)
  await waitFor("!!document.querySelector('.dialog')")
  results.importDialog = await evaluate(
    "document.querySelector('.dialog .dialog-title')?.textContent ?? null",
  )
  await evaluate("document.querySelector('.dialog .dialog-actions .btn--primary').click()")
  await sleep(800)
  results.activitiesAfterImport = await evaluate(`${activities()}.length`)

  // Backup inclui as atividades.
  await send('Page.navigate', { url: `${APP_URL}#/ajustes` })
  await sleep(900)
  await evaluate(`
    [...document.querySelectorAll('.settings-actions .btn')]
      .find(button => button.textContent.includes('Exportar backup'))?.click()
  `)
  const backup = await waitForDownload('caderno-backup')
  results.backupDownloaded = Boolean(backup)
  if (backup) {
    const payload = JSON.parse(backup.content)
    results.backupActivities = payload.activities?.length ?? 0
    results.backupNotes = payload.notes?.length ?? 0

    // Restaura em modo mesclar e confirma o retorno das atividades.
    await setFile('.settings-page input[type="file"]', backup.path)
    await waitFor("!!document.querySelector('.backup-dialog')")
    await evaluate("document.querySelector('.backup-dialog .dialog-actions .btn--primary').click()")
    await sleep(2500)
    results.activitiesAfterRestore = await evaluate(`${activities()}.length`)
  }

  console.log(JSON.stringify(results, null, 2))

  const failed = []
  if (!results.emptyState) failed.push('estado vazio de atividades não apareceu')
  if (results.createdTitle !== 'Planejar mudança') failed.push('atividade não foi criada')
  if (results.subtaskCount !== 3) failed.push('subtarefas não foram salvas')
  if (results.afterFirstSubtask?.progress !== 33) failed.push('progresso automático != 33%')
  if (results.afterFirstSubtask?.status !== 'doing') failed.push('status não virou em andamento')
  if (results.activityDetails?.priority !== 'high') failed.push('prioridade alta não aplicada')
  if (results.activityDetails?.project !== 'Casa') failed.push('projeto não aplicado')
  if (!results.activityDetails?.dueDate) failed.push('prazo não aplicado')
  if (results.completed?.progress !== 100) failed.push('progresso final != 100%')
  if (results.completed?.status !== 'done') failed.push('atividade não foi concluída')
  if (!results.completed?.completed) failed.push('completedAt não registrado')
  if (results.rowsAfterFirst !== 1) failed.push('lista não mostrou a atividade')
  if (!String(results.listSummary).includes('1 de 1 concluídas')) {
    failed.push('resumo da lista incorreto')
  }
  if (results.manualActivity?.progress !== 40) failed.push('progresso manual != 40%')
  if (results.manualActivity?.status !== 'doing') failed.push('status manual != em andamento')
  if (results.overdueRows !== 1) failed.push('filtro de atrasadas incorreto')
  if (!String(results.overdueTitle).includes('Enviar relatório')) {
    failed.push('atividade atrasada errada')
  }
  if (results.kanbanColumns !== 4) failed.push('kanban deveria ter 4 colunas')
  if (results.pausedStatus !== 'paused') failed.push('seletor do kanban não pausou')
  if (!results.exported) failed.push('arquivo de atividades não foi baixado')
  if (results.exportedKind !== 'activities') failed.push('arquivo exportado não é de atividades')
  if (results.exportedCount !== 2) failed.push('exportação deveria ter 2 atividades')
  if (results.importDialog !== 'Importar atividades?') failed.push('diálogo de importação não abriu')
  if (results.activitiesAfterImport !== 4) failed.push('importação não duplicou as atividades')
  if (!results.backupDownloaded) failed.push('backup não foi baixado')
  if (results.backupActivities !== 4) failed.push('backup não incluiu as atividades')
  if (results.backupNotes !== 4) failed.push('backup deveria manter as 4 notas')
  if (results.activitiesAfterRestore !== 8) {
    failed.push('restauração do backup não duplicou as atividades')
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
