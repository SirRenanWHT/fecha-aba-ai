import { useState } from 'react'
import { Button } from '@/components/Button'
import { HCaptchaChallenge } from '@/components/HCaptchaChallenge'
import { useToast } from '@/components/Toast'
import { useNavigate } from 'react-router-dom'
import type { Activity } from '@/lib/model/activity'
import { createCollaborativeActivityInvite } from '@/lib/collaboration/activities'
import { getCollaborativeActivityToken } from '@/lib/collaboration/activity-links'
import { hasSupabaseSession } from '@/lib/collaboration/supabase'

type Props = { activity: Activity }

export function ActivityCollaborationActions({ activity }: Props) {
  const navigate = useNavigate()
  const notify = useToast()
  const [captcha, setCaptcha] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [invite, setInvite] = useState<string | null>(null)
  const [captchaResetKey, setCaptchaResetKey] = useState(0)

  async function copyInvite(token: string): Promise<void> {
    const url = `${new URL(import.meta.env.BASE_URL, window.location.origin).href}#/atividade-colaborar/${token}`
    try {
      await navigator.clipboard.writeText(url)
      setInvite(url)
      notify('Convite da atividade copiado')
    } catch {
      setInvite(url)
      notify('Selecione e copie o link do convite')
    }
  }

  async function begin(): Promise<void> {
    const existing = getCollaborativeActivityToken(activity.id)
    if (existing) {
      await copyInvite(existing)
      return
    }
    try {
      if (!(await hasSupabaseSession())) {
        setCaptcha(true)
        return
      }
      await create(undefined)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível criar o convite.')
    }
  }

  async function create(captchaToken?: string): Promise<void> {
    setBusy(true)
    setError('')
    try {
      const { token, room } = await createCollaborativeActivityInvite(activity, captchaToken)
      setCaptcha(false)
      await copyInvite(token)
      navigate(`/atividade/${activity.id}?room=${room}`, { replace: true })
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Não foi possível criar o convite.'
      setError(/captcha/i.test(message)
        ? 'A verificação hCaptcha falhou ou expirou. Tente novamente.'
        : message)
      if (/captcha/i.test(message)) {
        setCaptcha(true)
        setCaptchaResetKey((key) => key + 1)
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="collab-share activity-collab-share">
      <div>
        <strong>Compartilhar atividade</strong>
        <p>Quem abrir o convite poderá acompanhar e editar esta atividade em tempo real.</p>
      </div>
      <Button variant="secondary" icon="share" onClick={() => void begin()} disabled={busy}>
        {busy ? 'Criando convite…' : 'Criar convite de colaboração'}
      </Button>
      {captcha ? <HCaptchaChallenge resetKey={captchaResetKey} onVerify={(token) => void create(token)} onExpire={() => setError('O desafio hCaptcha expirou.')} onError={(message) => setError(message)} /> : null}
      {invite ? <input className="share-link-input" readOnly value={invite} aria-label="Link de convite da atividade" onFocus={(event) => event.target.select()} /> : null}
      {error ? <p className="share-error">{error}</p> : null}
    </section>
  )
}
