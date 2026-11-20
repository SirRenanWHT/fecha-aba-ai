import { generateKeyPairSync } from 'node:crypto'

const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' })
const jwk = privateKey.export({ format: 'jwk' })
const toBase64Url = (value) => Buffer.from(value, 'base64url').toString('base64url')
const publicKey = Buffer.concat([
  Buffer.from([4]),
  Buffer.from(jwk.x, 'base64url'),
  Buffer.from(jwk.y, 'base64url'),
]).toString('base64url')

process.stdout.write(`VITE_VAPID_PUBLIC_KEY=${publicKey}\n`)
process.stdout.write(`VAPID_PRIVATE_KEY_JSON=${JSON.stringify({
  publicKey: { kty: 'EC', crv: 'P-256', alg: 'ES256', x: toBase64Url(jwk.x), y: toBase64Url(jwk.y), key_ops: ['verify'], ext: true },
  privateKey: { kty: 'EC', crv: 'P-256', alg: 'ES256', x: toBase64Url(jwk.x), y: toBase64Url(jwk.y), d: toBase64Url(jwk.d), key_ops: ['sign'], ext: true },
})}\n`)
