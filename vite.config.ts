import { createHash } from 'node:crypto'
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join, relative, resolve, sep } from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'

/**
 * Gera o service worker depois do build, com a lista exata dos arquivos
 * versionados e um hash de conteúdo para invalidar caches antigos.
 */
function pwaPlugin(): Plugin {
  let base = '/'
  let outDir = 'dist'
  let rootDir = process.cwd()

  return {
    name: 'caderno-pwa',
    apply: 'build',
    configResolved(config) {
      base = config.base.endsWith('/') ? config.base : `${config.base}/`
      outDir = config.build.outDir
      rootDir = config.root
    },
    closeBundle() {
      const outputRoot = resolve(rootDir, outDir)
      const files: string[] = []

      const walk = (directory: string) => {
        for (const entry of readdirSync(directory, { withFileTypes: true })) {
          const fullPath = join(directory, entry.name)
          if (entry.isDirectory()) walk(fullPath)
          else files.push(fullPath)
        }
      }
      walk(outputRoot)

      const normalized = files
        .map((file) => relative(outputRoot, file).split(sep).join('/'))
        .filter((file) => file !== 'sw.js' && !file.endsWith('.map'))
        .sort()

      const precache = [
        ...new Set([...normalized.map((file) => `${base}${file}`), `${base}index.html`, base]),
      ]

      const hash = createHash('sha256')
      for (const file of normalized) {
        hash.update(file)
        hash.update(readFileSync(join(outputRoot, file)))
      }
      const version = hash.digest('hex').slice(0, 12)

      const template = readFileSync(
        resolve(rootDir, 'src/pwa/sw-template.js'),
        'utf8',
      )
      const serviceWorker = template
        .replaceAll('__VERSION__', version)
        .replaceAll('__BASE__', base)
        .replace('__PRECACHE__', JSON.stringify(precache, null, 2))

      writeFileSync(join(outputRoot, 'sw.js'), serviceWorker)
      console.log(
        `\nPWA: sw.js gerado com ${precache.length} arquivos (versão ${version})`,
      )
    },
  }
}

export default defineConfig({
  plugins: [react(), pwaPlugin()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 5173,
  },
})
