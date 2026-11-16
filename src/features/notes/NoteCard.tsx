import type { CSSProperties, KeyboardEvent, MouseEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Icon } from '@/components/Icon'
import { useCoverUrl } from '@/hooks/useCoverUrl'
import { FONT_STACKS, type Note } from '@/lib/model/note'
import { cn } from '@/lib/utils/cn'
import { withAlpha } from '@/lib/utils/color'
import { coverTransform } from '@/lib/utils/cover'
import { formatDateTime, formatRelative } from '@/lib/utils/date'
import { htmlToText } from '@/lib/utils/html'

type NoteCardProps = {
  note: Note
  onTogglePin: (note: Note) => void
}

export function NoteCard({ note, onTogglePin }: NoteCardProps) {
  const navigate = useNavigate()
  const coverUrl = useCoverUrl(note.coverImageId)

  const title = note.title.trim()
  const excerpt = htmlToText(note.content)
  const initial = (title || 'Nota').charAt(0).toUpperCase()
  const hiddenTags = Math.max(0, note.tags.length - 2)

  const style = {
    '--note-accent': note.accentColor,
    '--note-font': FONT_STACKS[note.fontFamily],
    '--note-cover': `linear-gradient(145deg, ${withAlpha(note.accentColor, 0.26)}, ${withAlpha(
      note.accentColor,
      0.08,
    )} 62%, ${withAlpha(note.accentColor, 0.02)})`,
  } as CSSProperties

  function open(): void {
    navigate(`/nota/${note.id}`)
  }

  function handleKeyDown(event: KeyboardEvent<HTMLElement>): void {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      open()
    }
  }

  function handlePin(event: MouseEvent<HTMLButtonElement>): void {
    event.stopPropagation()
    onTogglePin(note)
  }

  return (
    <article
      className={cn('note-card', note.pinned && 'is-pinned')}
      style={style}
      data-note-font={note.fontFamily}
      data-card-theme={note.cardTheme}
      role="link"
      tabIndex={0}
      aria-label={`Abrir nota ${title || 'sem título'}`}
      onClick={open}
      onKeyDown={handleKeyDown}
    >
      <div className={cn('card-cover', coverUrl && 'has-image')}>
        {coverUrl ? (
          <img
            className="card-cover-img"
            src={coverUrl}
            alt=""
            loading="lazy"
            draggable={false}
            style={{
              objectPosition: `${note.coverPositionX}% ${note.coverPositionY}%`,
              transform: coverTransform(note.coverPositionX, note.coverPositionY, note.coverZoom),
            }}
          />
        ) : (
          <>
            <span className="card-initial" aria-hidden="true">
              {initial}
            </span>
            <span className="card-lines" aria-hidden="true" />
          </>
        )}

        <button
          type="button"
          className={cn('card-pin', note.pinned && 'is-active')}
          aria-label={note.pinned ? 'Desafixar nota' : 'Fixar nota'}
          aria-pressed={note.pinned}
          title={note.pinned ? 'Desafixar' : 'Fixar'}
          onClick={handlePin}
        >
          <Icon name="pin" size={15} filled={note.pinned} />
        </button>
      </div>

      <div className="card-body">
        <h3 className="card-title">{title || 'Sem título'}</h3>
        <p className="card-excerpt">
          {excerpt ? excerpt.slice(0, 170) : 'Nota vazia — abra para escrever.'}
        </p>

        <div className="card-foot">
          <div className="card-tags">
            {note.tags.slice(0, 2).map((tag) => (
              <span className="tag-pill" key={tag}>
                {tag}
              </span>
            ))}
            {hiddenTags > 0 ? <span className="tag-more">+{hiddenTags}</span> : null}
          </div>
          <time className="card-time" dateTime={note.updatedAt} title={formatDateTime(note.updatedAt)}>
            {formatRelative(note.updatedAt)}
          </time>
        </div>
      </div>
    </article>
  )
}
