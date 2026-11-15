import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { extname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../dist', import.meta.url))
const port = Number(process.env.PORT ?? 4173)

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon',
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? '/', `http://${request.headers.host}`)
  let pathname = decodeURIComponent(url.pathname)
  if (pathname.endsWith('/')) pathname += 'index.html'

  let filePath = join(root, pathname)

  try {
    let body = await readFile(filePath)
    if (filePath.endsWith('.html')) {
      body = Buffer.from(
        body.toString('utf8').replaceAll('__PORT__', String(port)),
      )
    }
    response.writeHead(200, {
      'Content-Type': MIME[extname(filePath)] ?? 'application/octet-stream',
      'Cache-Control': 'no-store',
    })
    response.end(body)
  } catch {
    // SPA fallback
    try {
      filePath = join(root, 'index.html')
      const body = await readFile(filePath)
      response.writeHead(200, { 'Content-Type': MIME['.html'] })
      response.end(body)
    } catch {
      response.writeHead(404).end('Not found')
    }
  }
})

server.listen(port, '127.0.0.1', () => {
  console.log(`Caderno disponível em http://127.0.0.1:${port}`)
})
