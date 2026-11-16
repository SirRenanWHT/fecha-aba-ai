import { useEffect, useRef } from 'react'
import type { ChangeEvent, PointerEvent as ReactPointerEvent } from 'react'
import { Button, IconButton } from '@/components/Button'
import { Icon } from '@/components/Icon'
import {
  ACCENT_PRESETS,
  CARD_THEME_HINTS,
  CARD_THEME_LABELS,
  CARD_THEMES,
  FONT_HINTS,
  FONT_LABELS,
  FONT_STACKS,
  type CardTheme,
  type FontFamily,
} from '@/lib/model/note'
import { cn } from '@/lib/utils/cn'
import { coverTransform } from '@/lib/utils/cover'

type StylePanelProps = {
  open: boolean
  onClose: () => void
  fontFamily: FontFamily
  accentColor: string
  cardTheme: CardTheme
  coverUrl: string | null
  coverPositionX: number
  coverPositionY: number
  coverZoom: number
  uploadingCover: boolean
  onChangeFont: (font: FontFamily) => void
  onChangeAccent: (color: string) => void
  onChangeTheme: (theme: CardTheme) => void
  onChangeCoverPosition: (x: number, y: number) => void
  onChangeCoverZoom: (zoom: number) => void
  onPickCover: (file: File) => void
  onRemoveCover: () => void
}

const FONT_OPTIONS: FontFamily[] = ['inter', 'lora', 'caveat', 'mono']

export function StylePanel({
  open,
  onClose,
  fontFamily,
  accentColor,
  cardTheme,
  coverUrl,
  coverPositionX,
  coverPositionY,
  coverZoom,
  uploadingCover,
  onChangeFont,
  onChangeAccent,
  onChangeTheme,
  onChangeCoverPosition,
  onChangeCoverZoom,
  onPickCover,
  onRemoveCover,
}: StylePanelProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)
  const dragRef = useRef<{
    pointerId: number
    x: number
    y: number
    positionX: number
    positionY: number
    width: number
    height: number
  } | null>(null)

  useEffect(() => {
    if (!open) return
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKey)
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', handleKey)
      document.body.style.overflow = previousOverflow
    }
  }, [open, onClose])

  if (!open) return null

  function handleFile(event: ChangeEvent<HTMLInputElement>): void {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (file) onPickCover(file)
  }

  function handlePreviewPointerDown(event: ReactPointerEvent<HTMLDivElement>): void {
    if (!coverUrl) return
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    dragRef.current = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      positionX: coverPositionX,
      positionY: coverPositionY,
      width: event.currentTarget.clientWidth,
      height: event.currentTarget.clientHeight,
    }
  }

  function handlePreviewPointerMove(event: ReactPointerEvent<HTMLDivElement>): void {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    const zoomFactor = 100 / coverZoom
    const x = Math.round(drag.positionX - ((event.clientX - drag.x) / drag.width) * 100 * zoomFactor)
    const y = Math.round(drag.positionY - ((event.clientY - drag.y) / drag.height) * 100 * zoomFactor)
    onChangeCoverPosition(Math.max(0, Math.min(100, x)), Math.max(0, Math.min(100, y)))
  }

  function handlePreviewPointerUp(event: ReactPointerEvent<HTMLDivElement>): void {
    if (dragRef.current?.pointerId === event.pointerId) dragRef.current = null
  }

  return (
    <div className="panel-backdrop" onClick={onClose}>
      <aside
        className="style-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="style-panel-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="style-panel-head">
          <div>
            <p className="eyebrow">Personalizar</p>
            <h2 className="style-panel-title" id="style-panel-title">
              Estilo da nota
            </h2>
          </div>
          <IconButton icon="x" label="Fechar painel de estilo" onClick={onClose} autoFocus />
        </header>

        <section className="style-group">
          <h3 className="style-label">Fonte</h3>
          <div className="font-options">
            {FONT_OPTIONS.map((font) => (
              <button
                key={font}
                type="button"
                className={cn('font-option', fontFamily === font && 'is-active')}
                aria-pressed={fontFamily === font}
                onClick={() => onChangeFont(font)}
              >
                <span className="font-preview" style={{ fontFamily: FONT_STACKS[font] }}>
                  Aa
                </span>
                <span className="font-meta">
                  <strong>{FONT_LABELS[font]}</strong>
                  <span>{FONT_HINTS[font]}</span>
                </span>
                <span className="font-check" aria-hidden="true">
                  {fontFamily === font ? <Icon name="check" size={14} /> : null}
                </span>
              </button>
            ))}
          </div>
        </section>

        <section className="style-group">
          <h3 className="style-label">Cor de destaque</h3>
          <div className="accent-row">
            {ACCENT_PRESETS.map((preset) => (
              <button
                key={preset.value}
                type="button"
                className={cn(
                  'swatch',
                  accentColor.toLowerCase() === preset.value.toLowerCase() && 'is-active',
                )}
                style={{ background: preset.value }}
                aria-label={preset.name}
                aria-pressed={accentColor.toLowerCase() === preset.value.toLowerCase()}
                title={preset.name}
                onClick={() => onChangeAccent(preset.value)}
              />
            ))}
            <label className="swatch swatch--custom" title="Cor personalizada">
              <input
                type="color"
                value={accentColor}
                aria-label="Escolher uma cor personalizada"
                onChange={(event) => onChangeAccent(event.target.value)}
              />
              <Icon name="plus" size={13} />
            </label>
          </div>
          <p className="style-hint">Usada na capa, nas tags e nos detalhes do card.</p>
        </section>

        <section className="style-group">
          <h3 className="style-label">Tema do card</h3>
          <div className="theme-options">
            {CARD_THEMES.map((theme) => (
              <button
                key={theme}
                type="button"
                className={cn('theme-option-card', cardTheme === theme && 'is-active')}
                aria-pressed={cardTheme === theme}
                onClick={() => onChangeTheme(theme)}
              >
                <span className={cn('theme-preview', `theme-preview--${theme}`)} aria-hidden="true" />
                <span className="theme-option-text">
                  <strong>{CARD_THEME_LABELS[theme]}</strong>
                  <span>{CARD_THEME_HINTS[theme]}</span>
                </span>
              </button>
            ))}
          </div>
        </section>

        <section className="style-group">
          <h3 className="style-label">Imagem de capa</h3>
          <div
            className={cn('cover-preview-box', coverUrl && 'is-adjustable')}
            onPointerDown={handlePreviewPointerDown}
            onPointerMove={handlePreviewPointerMove}
            onPointerUp={handlePreviewPointerUp}
            onPointerCancel={handlePreviewPointerUp}
          >
            {coverUrl ? (
              <img
                className="cover-preview"
                src={coverUrl}
                alt="Prévia do enquadramento da capa no card"
                draggable={false}
                style={{
                  objectPosition: `${coverPositionX}% ${coverPositionY}%`,
                  transform: coverTransform(coverPositionX, coverPositionY, coverZoom),
                }}
              />
            ) : (
              <div className="cover-empty">
                <Icon name="image" size={22} />
                <span>Sem capa</span>
              </div>
            )}
            {uploadingCover ? <div className="cover-loading">Processando imagem…</div> : null}
            {coverUrl && !uploadingCover ? (
              <span className="cover-preview-hint">Arraste para ajustar</span>
            ) : null}
          </div>

          {coverUrl ? (
            <div className="cover-adjustments">
              <label className="cover-range-row">
                <span>Zoom</span>
                <input
                  type="range"
                  min="100"
                  max="200"
                  step="1"
                  value={coverZoom}
                  aria-label="Zoom da capa"
                  onChange={(event) => onChangeCoverZoom(Number(event.target.value))}
                />
                <output>{coverZoom}%</output>
              </label>
              <label className="cover-range-row">
                <span>Horizontal</span>
                <input
                  type="range"
                  min="0"
                  max="100"
                  step="1"
                  value={coverPositionX}
                  aria-label="Posição horizontal da capa"
                  onChange={(event) => onChangeCoverPosition(Number(event.target.value), coverPositionY)}
                />
                <output>{coverPositionX}%</output>
              </label>
              <label className="cover-range-row">
                <span>Vertical</span>
                <input
                  type="range"
                  min="0"
                  max="100"
                  step="1"
                  value={coverPositionY}
                  aria-label="Posição vertical da capa"
                  onChange={(event) => onChangeCoverPosition(coverPositionX, Number(event.target.value))}
                />
                <output>{coverPositionY}%</output>
              </label>
              <Button
                variant="ghost"
                size="sm"
                disabled={coverZoom === 100 && coverPositionX === 50 && coverPositionY === 50}
                onClick={() => {
                  onChangeCoverPosition(50, 50)
                  onChangeCoverZoom(100)
                }}
              >
                Centralizar enquadramento
              </Button>
            </div>
          ) : null}

          <div className="cover-actions">
            <Button
              variant="secondary"
              icon="image"
              size="sm"
              disabled={uploadingCover}
              onClick={() => fileInputRef.current?.click()}
            >
              Escolher imagem
            </Button>
            <Button
              variant="ghost"
              icon="camera"
              size="sm"
              disabled={uploadingCover}
              onClick={() => cameraInputRef.current?.click()}
            >
              Tirar foto
            </Button>
            {coverUrl ? (
              <Button
                variant="ghost"
                icon="trash"
                size="sm"
                disabled={uploadingCover}
                onClick={onRemoveCover}
              >
                Remover
              </Button>
            ) : null}
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="sr-only"
            tabIndex={-1}
            onChange={handleFile}
          />
          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="sr-only"
            tabIndex={-1}
            onChange={handleFile}
          />

          <p className="style-hint">
            Redimensionada para até 1600 px e comprimida em WebP. A imagem fica no
            IndexedDB, fora do armazenamento das notas.
          </p>
        </section>

        <p className="style-panel-foot">
          <Icon name="check" size={13} />
          As mudanças são salvas automaticamente.
        </p>
      </aside>
    </div>
  )
}
