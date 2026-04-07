import { createHash, randomBytes } from 'node:crypto'

/**
 * Hashes a sensitive token (e.g., refresh token, password reset token) using
 * SHA-256 before storing it in a database or cache.
 *
 * This is a defence-in-depth measure: even if Redis or the DB is compromised,
 * the attacker cannot use the stored hash to forge a session — they need the
 * original token string that was sent to the client.
 *
 * @param token - The raw token string to hash.
 * @returns A hex-encoded SHA-256 digest of the token.
 */
export const hashToken = (token: string): string =>
      createHash('sha256').update(token).digest('hex')

/**
 * Generates a cryptographically secure random one-time token.
 * Used for email verification and password reset flows.
 *
 * @param byteLength - Number of random bytes (default: 32 → 64 hex chars).
 * @returns A hex-encoded random token string.
 */
export const generateSecureToken = (byteLength = 32): string =>
      randomBytes(byteLength).toString('hex')
