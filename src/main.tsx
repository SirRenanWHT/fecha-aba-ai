import '@fontsource-variable/inter'
import '@fontsource-variable/fraunces'
import '@fontsource-variable/lora'
import '@fontsource-variable/caveat'
import '@fontsource-variable/jetbrains-mono'
import './styles/global.css'

import { createRoot } from 'react-dom/client'
import { App } from './App'
import { notesStore } from '@/lib/storage/notesStore'
import { applyTheme, settingsStore } from '@/lib/storage/settingsStore'

// Aplica o tema antes do primeiro render para evitar "flash" de tema errado.
applyTheme(settingsStore.getSnapshot().theme)

// Garante que as notas de exemplo existam na primeira abertura.
void notesStore.getSnapshot()

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register(`${import.meta.env.BASE_URL}sw.js`)
      .catch((error) => {
        console.error('Não foi possível registrar o service worker', error)
      })
  })
}

const container = document.getElementById('root')
if (!container) {
  throw new Error('Elemento #root não encontrado')
}

createRoot(container).render(<App />)
