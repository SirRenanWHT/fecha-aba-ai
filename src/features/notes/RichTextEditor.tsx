import { useCallback, useEffect, useRef, useState } from 'react'
import type { ClipboardEvent, MouseEvent, ReactNode } from 'react'
import { Icon } from '@/components/Icon'
import { FONT_STACKS, type FontFamily } from '@/lib/model/note'
import { cn } from '@/lib/utils/cn'
import { normalizeNoteHtml, sanitizeNoteHtml } from '@/lib/utils/html'

type FormatState = {
  bold: boolean
  italic: boolean
  underline: boolean
  strike: boolean
  unordered: boolean
  ordered: boolean
  block: string
}

const EMPTY_FORMATS: FormatState = {
  bold: false,
  italic: false,
  underline: false,
  strike: false,
  unordered: false,
  ordered: false,
  block: '',
}

type RichTextEditorProps = {
  value: string
  onChange: (html: string) => void
  fontFamily: FontFamily
  placeholder?: string
  autoFocus?: boolean
}

type ToolbarButtonProps = {
  label: string
  active?: boolean
  onMouseDown: (event: MouseEvent<HTMLButtonElement>) => void
  children: ReactNode
}

function ToolbarButton({ label, active = false, onMouseDown, children }: ToolbarButtonProps) {
  return (
    <button
      type="button"
      className={cn('rte-button', active && 'is-active')}
      aria-label={label}
      title={label}
      aria-pressed={active}
      onMouseDown={onMouseDown}
    >
      {children}
    </button>
  )
}

export function RichTextEditor({
  value,
  onChange,
  fontFamily,
  placeholder = 'Comece a escrever…',
  autoFocus = false,
}: RichTextEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null)
  const [formats, setFormats] = useState<FormatState>(EMPTY_FORMATS)

  // Inicializa o conteúdo uma vez; depois o DOM é controlado pelo navegador.
  useEffect(() => {
    const element = editorRef.current
    if (!element) return
    element.innerHTML = sanitizeNoteHtml(value)
    try {
      document.execCommand('defaultParagraphSeparator', false, 'p')
      document.execCommand('styleWithCSS', false, 'false')
    } catch {
      // Comandos legados indisponíveis: o editor segue funcionando.
    }
    if (autoFocus) {
      element.focus()
      const range = document.createRange()
      range.selectNodeContents(element)
      range.collapse(false)
      const selection = window.getSelection()
      selection?.removeAllRanges()
      selection?.addRange(range)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Mudanças externas (troca de nota) são aplicadas só quando o editor não está em foco.
  useEffect(() => {
    const element = editorRef.current
    if (!element) return
    if (document.activeElement === element) return
    if (element.innerHTML === value) return
    element.innerHTML = sanitizeNoteHtml(value)
  }, [value])

  const refreshFormats = useCallback(() => {
    const element = editorRef.current
    if (!element) return
    const selection = window.getSelection()
    if (!selection || selection.rangeCount === 0) return
    const anchor = selection.anchorNode
    if (!anchor || !element.contains(anchor)) return

    setFormats({
      bold: document.queryCommandState('bold'),
      italic: document.queryCommandState('italic'),
      underline: document.queryCommandState('underline'),
      strike: document.queryCommandState('strikeThrough'),
      unordered: document.queryCommandState('insertUnorderedList'),
      ordered: document.queryCommandState('insertOrderedList'),
      block: String(document.queryCommandValue('formatBlock') ?? '').toLowerCase(),
    })
  }, [])

  useEffect(() => {
    document.addEventListener('selectionchange', refreshFormats)
    return () => document.removeEventListener('selectionchange', refreshFormats)
  }, [refreshFormats])

  function run(command: string, argument?: string): void {
    const element = editorRef.current
    if (!element) return
    element.focus()
    document.execCommand(command, false, argument)
    onChange(element.innerHTML)
    refreshFormats()
  }

  function handleInput(): void {
    const element = editorRef.current
    if (!element) return
    onChange(element.innerHTML)
  }

  function handleBlur(): void {
    const element = editorRef.current
    if (!element) return
    const clean = normalizeNoteHtml(element.innerHTML)
    if (clean !== element.innerHTML) {
      element.innerHTML = clean
      onChange(clean)
    }
  }

  function handlePaste(event: ClipboardEvent<HTMLDivElement>): void {
    event.preventDefault()
    const text = event.clipboardData.getData('text/plain')
    document.execCommand('insertText', false, text)
  }

  function toggleBlock(tag: 'h2' | 'h3' | 'blockquote'): void {
    const current = String(document.queryCommandValue('formatBlock') ?? '').toLowerCase()
    run('formatBlock', current === tag ? '<p>' : `<${tag}>`)
  }

  function addLink(): void {
    const url = window.prompt('Endereço do link:', 'https://')
    if (!url) return
    run('createLink', url.trim())
  }

  function clearFormatting(): void {
    const element = editorRef.current
    if (!element) return
    element.focus()
    document.execCommand('removeFormat')
    document.execCommand('unlink')
    document.execCommand('formatBlock', false, '<p>')
    onChange(element.innerHTML)
    refreshFormats()
  }

  const preventBlur = (event: MouseEvent<HTMLButtonElement>) => event.preventDefault()

  return (
    <div className="rte">
      <div className="rte-toolbar" role="toolbar" aria-label="Formatação do texto">
        <ToolbarButton
          label="Negrito"
          active={formats.bold}
          onMouseDown={(event) => {
            preventBlur(event)
            run('bold')
          }}
        >
          <span className="rte-glyph rte-glyph--bold">B</span>
        </ToolbarButton>
        <ToolbarButton
          label="Itálico"
          active={formats.italic}
          onMouseDown={(event) => {
            preventBlur(event)
            run('italic')
          }}
        >
          <span className="rte-glyph rte-glyph--italic">I</span>
        </ToolbarButton>
        <ToolbarButton
          label="Sublinhado"
          active={formats.underline}
          onMouseDown={(event) => {
            preventBlur(event)
            run('underline')
          }}
        >
          <span className="rte-glyph rte-glyph--underline">U</span>
        </ToolbarButton>
        <ToolbarButton
          label="Riscado"
          active={formats.strike}
          onMouseDown={(event) => {
            preventBlur(event)
            run('strikeThrough')
          }}
        >
          <span className="rte-glyph rte-glyph--strike">S</span>
        </ToolbarButton>

        <span className="rte-divider" aria-hidden="true" />

        <ToolbarButton
          label="Título grande"
          active={formats.block === 'h2'}
          onMouseDown={(event) => {
            preventBlur(event)
            toggleBlock('h2')
          }}
        >
          <span className="rte-glyph">H2</span>
        </ToolbarButton>
        <ToolbarButton
          label="Subtítulo"
          active={formats.block === 'h3'}
          onMouseDown={(event) => {
            preventBlur(event)
            toggleBlock('h3')
          }}
        >
          <span className="rte-glyph">H3</span>
        </ToolbarButton>

        <span className="rte-divider" aria-hidden="true" />

        <ToolbarButton
          label="Lista com marcadores"
          active={formats.unordered}
          onMouseDown={(event) => {
            preventBlur(event)
            run('insertUnorderedList')
          }}
        >
          <Icon name="list" size={17} />
        </ToolbarButton>
        <ToolbarButton
          label="Lista numerada"
          active={formats.ordered}
          onMouseDown={(event) => {
            preventBlur(event)
            run('insertOrderedList')
          }}
        >
          <Icon name="list-ordered" size={17} />
        </ToolbarButton>
        <ToolbarButton
          label="Citação"
          active={formats.block === 'blockquote'}
          onMouseDown={(event) => {
            preventBlur(event)
            toggleBlock('blockquote')
          }}
        >
          <Icon name="quote" size={17} />
        </ToolbarButton>
        <ToolbarButton
          label="Inserir link"
          onMouseDown={(event) => {
            preventBlur(event)
            addLink()
          }}
        >
          <Icon name="link" size={17} />
        </ToolbarButton>

        <span className="rte-divider" aria-hidden="true" />

        <ToolbarButton
          label="Limpar formatação"
          onMouseDown={(event) => {
            preventBlur(event)
            clearFormatting()
          }}
        >
          <Icon name="eraser" size={17} />
        </ToolbarButton>
      </div>

      <div
        ref={editorRef}
        className="rte-content editor-body"
        style={{ fontFamily: FONT_STACKS[fontFamily] }}
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-multiline="true"
        aria-label="Conteúdo da nota"
        data-placeholder={placeholder}
        onInput={handleInput}
        onBlur={handleBlur}
        onPaste={handlePaste}
      />
    </div>
  )
}
