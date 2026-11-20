import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Button, IconButton } from '@/components/Button'
import { EmptyState } from '@/components/EmptyState'
import { HCaptchaChallenge } from '@/components/HCaptchaChallenge'
import { hasSupabaseSession, HCAPTCHA_SITE_KEY } from '@/lib/collaboration/supabase'
import { joinCollaborativeActivityInvite } from '@/lib/collaboration/activities'

export function CollaborativeActivityInvitePage() {
  const { token = '' } = useParams()
  const navigate = useNavigate()
  const [captchaVisible, setCaptchaVisible] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [captchaResetKey, setCaptchaResetKey] = useState(0)
  const openRef = useRef<(captchaToken?: string) => void>(() => undefined)

  useEffect(() => {
    let cancelled = false
    async function open(captchaToken?: string): Promise<void> {
      setLoading(true)
      setError('')
      try {
        const result = await joinCollaborativeActivityInvite(token, captchaToken)
        if (!cancelled) navigate(`/atividade/${result.activity.id}?room=${result.room}`, { replace: true })
      } catch (cause) {
        if (cancelled) return
        const message = cause instanceof Error ? cause.message : 'Não foi possível abrir o convite.'
        if (/captcha/i.test(message) && !captchaToken) {
          setCaptchaVisible(true)
          setLoading(false)
        } else if (/captcha/i.test(message)) {
          setError('A verificação hCaptcha falhou ou expirou. Tente novamente.')
          setCaptchaVisible(true)
          setCaptchaResetKey((key) => key + 1)
          setLoading(false)
        } else {
          setError(message)
          setLoading(false)
        }
      }
    }
    openRef.current = (captchaToken) => { void open(captchaToken) }
    void hasSupabaseSession().then((hasSession) => {
      if (cancelled) return
      if (hasSession) void open()
      else if (HCAPTCHA_SITE_KEY) {
        setCaptchaVisible(true)
        setLoading(false)
      } else {
        setError('A Sitekey pública do hCaptcha não está configurada no app.')
        setLoading(false)
      }
    }).catch((cause) => {
      if (!cancelled) {
        setError(cause instanceof Error ? cause.message : 'Não foi possível iniciar a conexão.')
        setLoading(false)
      }
    })
    return () => { cancelled = true }
  }, [navigate, token])

  return (
    <div className="editor-page collab-page">
      <header className="editor-bar">
        <div className="editor-bar-side"><IconButton icon="arrow-left" label="Voltar às atividades" onClick={() => navigate('/atividades')} /></div>
        <span className="editor-bar-title">Atividade compartilhada</span>
        <div className="editor-bar-side" />
      </header>
      {captchaVisible ? (
        <div className="collab-captcha-panel">
          <p>Para abrir a atividade, confirme que você é uma pessoa:</p>
          <HCaptchaChallenge resetKey={captchaResetKey} onVerify={(captchaToken) => openRef.current(captchaToken)} onExpire={() => setError('O desafio hCaptcha expirou.')} onError={setError} />
          {error ? <p className="share-error">{error}</p> : null}
        </div>
      ) : loading ? (
        <p className="collab-message">Entrando na atividade compartilhada…</p>
      ) : (
        <EmptyState icon="activity" title="Não foi possível abrir o convite" description={error || 'O link pode ter sido revogado ou estar incompleto.'} action={<Button variant="primary" onClick={() => navigate('/atividades')}>Voltar às atividades</Button>} />
      )}
    </div>
  )
}
