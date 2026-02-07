import type { Context } from 'hono'
import crypto from 'node:crypto'

/**
 * Compute a strong ETag from a string payload (sha1 hex)
 */
export function computeEtag(payload: string): string {
  return crypto.createHash('sha1').update(payload).digest('hex')
}

/**
 * Read If-None-Match header if present
 */
function getIfNoneMatch(c: Context): string | null {
  const hdr = c.req.header('if-none-match') ?? c.req.header('If-None-Match')
  return hdr ?? null
}

/**
 * Set ETag header on response
 */
export function setEtag(c: Context, etag: string): void {
  c.header('ETag', etag)
}

/**
 * If request's If-None-Match matches provided etag, return 304.
 * Caller should short-circuit if non-null.
 */
export function maybeNotModified(c: Context, etag: string) {
  const inm = getIfNoneMatch(c)
  if (inm && inm === etag) {
    setEtag(c, etag)
    return c.body(null, 304)
  }
  return null
}
