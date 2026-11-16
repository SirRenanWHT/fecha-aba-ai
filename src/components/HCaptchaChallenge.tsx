import { useEffect, useRef } from 'react'
import HCaptcha, { type HCaptcha as HCaptchaInstance } from '@hcaptcha/react-hcaptcha'
import { HCAPTCHA_SITE_KEY } from '@/lib/collaboration/supabase'

type HCaptchaChallengeProps = {
  resetKey: number
  onVerify: (token: string) => void
  onExpire: () => void
  onError: (message: string) => void
}

export function HCaptchaChallenge({
  resetKey,
  onVerify,
  onExpire,
  onError,
}: HCaptchaChallengeProps) {
  const captchaRef = useRef<HCaptchaInstance>(null)
  const previousResetKey = useRef(resetKey)

  useEffect(() => {
    if (previousResetKey.current === resetKey) return
    previousResetKey.current = resetKey
    captchaRef.current?.resetCaptcha()
  }, [resetKey])

  return (
    <div className="hcaptcha-challenge">
      <HCaptcha
        ref={captchaRef}
        sitekey={HCAPTCHA_SITE_KEY}
        onVerify={(token) => onVerify(token)}
        onExpire={onExpire}
        onError={onError}
        languageOverride="pt-BR"
      />
    </div>
  )
}
