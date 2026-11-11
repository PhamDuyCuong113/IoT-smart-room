import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { env } from '../../config/env.js'

const secret = env.authSecret || randomBytes(32).toString('hex')
const tokenLifetimeSeconds = 60 * 60 * 12

export function createAuthToken(userId) {
  const payload = Buffer.from(JSON.stringify({
    sub: Number(userId),
    exp: Math.floor(Date.now() / 1000) + tokenLifetimeSeconds,
  })).toString('base64url')
  const signature = createHmac('sha256', secret).update(payload).digest('base64url')
  return `${payload}.${signature}`
}

export function verifyAuthToken(token) {
  if (typeof token !== 'string') return null
  const [payload, signature, extra] = token.split('.')
  if (!payload || !signature || extra) return null

  const expected = createHmac('sha256', secret).update(payload).digest()
  let supplied
  try {
    supplied = Buffer.from(signature, 'base64url')
  } catch {
    return null
  }
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return null

  try {
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
    if (!Number.isInteger(claims.sub) || claims.sub < 1 || claims.exp <= Math.floor(Date.now() / 1000)) {
      return null
    }
    return claims
  } catch {
    return null
  }
}
