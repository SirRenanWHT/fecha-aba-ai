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
  taskCount: number
  canIndentTask: boolean
  canOutdentTask: boolean
}

const EMPTY_FORMATS: FormatState = {
  bold: false,
  italic: false,
  underline: false,
  strike: false,
  unordered: false,
  ordered: false,
  block: '',
  taskCount: 0,
  canIndentTask: false,
  canOutdentTask: false,
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
  disabled?: boolean
  onMouseDown: (event: MouseEvent<HTMLButtonElement>) => void
  children: ReactNode
}

function ToolbarButton({ label, active = false, disabled = false, onMouseDown, children }: ToolbarButtonProps) {
  return (
    <button
      type="button"
      className={cn('rte-button', active && 'is-active')}
      aria-label={label}
      title={label}
      aria-pressed={active}
      disabled={disabled}
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
    const selectedTask = anchor instanceof HTMLElement
      ? anchor.closest<HTMLElement>('li[data-task="true"]')
      : anchor.parentElement?.closest<HTMLElement>('li[data-task="true"]')
    const taskList = [...element.querySelectorAll('li[data-task="true"]')]
    const parentTask = selectedTask?.parentElement?.closest<HTMLElement>('li[data-task="true"]')
    const previousTask = selectedTask?.previousElementSibling?.matches('li[data-task="true"]')

    setFormats({
      bold: document.queryCommandState('bold'),
      italic: document.queryCommandState('italic'),
      underline: document.queryCommandState('underline'),
      strike: document.queryCommandState('strikeThrough'),
      unordered: document.queryCommandState('insertUnorderedList'),
      ordered: document.queryCommandState('insertOrderedList'),
      block: String(document.queryCommandValue('formatBlock') ?? '').toLowerCase(),
      taskCount: taskList.length,
      canIndentTask: taskList.length > 1 && !!selectedTask && !!previousTask,
      canOutdentTask: taskList.length > 1 && !!selectedTask && !!parentTask,
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
    refreshFormats()
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

  function insertChecklistItem(): void {
    const element = editorRef.current
    if (!element) return
    element.focus()
    const selection = window.getSelection()
    const anchor = selection?.anchorNode
    const currentItem = anchor
      ? (anchor instanceof HTMLElement ? anchor : anchor.parentElement)
          ?.closest<HTMLLIElement>('li')
      : null

    if (currentItem && element.contains(currentItem)) {
      if (currentItem.dataset.task !== 'true') {
        currentItem.dataset.task = 'true'
        currentItem.dataset.checked = 'false'
        currentItem.style.listStyle = 'none'
      } else {
        const nextItem = document.createElement('li')
        nextItem.dataset.task = 'true'
        nextItem.dataset.checked = 'false'
        nextItem.append(document.createElement('br'))
        currentItem.parentElement?.insertBefore(nextItem, currentItem.nextSibling)
        const range = document.createRange()
        range.selectNodeContents(nextItem)
        range.collapse(false)
        selection?.removeAllRanges()
        selection?.addRange(range)
      }
    } else {
      const list = document.createElement('ul')
      const item = document.createElement('li')
      item.dataset.task = 'true'
      item.dataset.checked = 'false'
      item.append(document.createElement('br'))
      list.append(item)
      const range = selection?.rangeCount ? selection.getRangeAt(0) : null
      if (range && element.contains(range.commonAncestorContainer)) {
        range.deleteContents()
        range.insertNode(list)
      } else {
        element.append(list)
      }
      const caret = document.createRange()
      caret.selectNodeContents(item)
      caret.collapse(false)
      selection?.removeAllRanges()
      selection?.addRange(caret)
    }
    onChange(element.innerHTML)
    refreshFormats()
  }

  function selectedTaskItem(): HTMLElement | null {
    const element = editorRef.current
    const anchor = window.getSelection()?.anchorNode
    if (!element || !anchor || !element.contains(anchor)) return null
    return (anchor instanceof HTMLElement ? anchor : anchor.parentElement)
      ?.closest<HTMLElement>('li[data-task="true"]') ?? null
  }

  function moveTaskLevel(direction: 'in' | 'out'): void {
    const task = selectedTaskItem()
    if (!task || formats.taskCount < 2) return
    if (direction === 'in') {
      const previous = task.previousElementSibling
      if (!(previous instanceof HTMLLIElement) || previous.dataset.task !== 'true') return
      let nested = [...previous.children].find(
        (child): child is HTMLUListElement => child instanceof HTMLUListElement,
      )
      if (!nested) {
        nested = document.createElement('ul')
        previous.append(nested)
      }
      nested.append(task)
    } else {
      const parentTask = task.parentElement?.closest<HTMLElement>('li[data-task="true"]')
      if (!parentTask?.parentElement) return
      parentTask.parentElement.insertBefore(task, parentTask.nextSibling)
      const emptyNestedList = [...parentTask.children].find(
        (child): child is HTMLUListElement => child instanceof HTMLUListElement,
      )
      if (emptyNestedList && !emptyNestedList.querySelector('li[data-task="true"]')) {
        emptyNestedList.remove()
      }
    }
    const element = editorRef.current
    if (element) onChange(element.innerHTML)
    refreshFormats()
  }

  function handleEditorClick(event: MouseEvent<HTMLDivElement>): void {
    const target = event.target
    if (!(target instanceof HTMLElement)) return
    const item = target.closest<HTMLElement>('li[data-task="true"]')
    if (!item || !event.currentTarget.contains(item)) return
    const rect = item.getBoundingClientRect()
    if (event.clientX > rect.left + 18) return
    const checked = item.dataset.checked !== 'true'
    item.dataset.checked = String(checked)
    item.querySelectorAll<HTMLElement>('li[data-task="true"]').forEach((child) => {
      child.dataset.checked = String(checked)
    })
    let parent = item.parentElement?.closest<HTMLElement>('li[data-task="true"]')
    while (parent) {
      const children = [...parent.querySelectorAll(':scope > ul > li[data-task="true"]')]
      parent.dataset.checked = String(
        children.length > 0 && children.every((child) => child.getAttribute('data-checked') === 'true'),
      )
      parent = parent.parentElement?.closest<HTMLElement>('li[data-task="true"]')
    }
    onChange(event.currentTarget.innerHTML)
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
          label="Adicionar checkbox"
          onMouseDown={(event) => {
            preventBlur(event)
            insertChecklistItem()
          }}
        >
          <Icon name="check-square" size={17} />
        </ToolbarButton>
        {formats.taskCount > 1 ? (
          <>
            <ToolbarButton
              label="Avançar checkbox um nível"
              disabled={!formats.canIndentTask}
              onMouseDown={(event) => {
                preventBlur(event)
                moveTaskLevel('in')
              }}
            >
              <Icon name="indent" size={17} />
            </ToolbarButton>
            <ToolbarButton
              label="Recuar checkbox um nível"
              disabled={!formats.canOutdentTask}
              onMouseDown={(event) => {
                preventBlur(event)
                moveTaskLevel('out')
              }}
            >
              <Icon name="outdent" size={17} />
            </ToolbarButton>
          </>
        ) : null}
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
        onClick={handleEditorClick}
      />
    </div>
  )
}
