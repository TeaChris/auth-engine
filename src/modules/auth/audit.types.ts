/**
 * Enum of all trackable auth events.
 * Using an enum (not a string literal union) ensures the set is finite and
 * can be compared exhaustively in switch statements.
 */
export enum AuditAction {
  // ─── Authentication ────────────────────────────────────────────────────────
  REGISTER = 'REGISTER',
  LOGIN_SUCCESS = 'LOGIN_SUCCESS',
  LOGIN_FAILURE = 'LOGIN_FAILURE',
  LOGOUT = 'LOGOUT',
  TOKEN_ROTATED = 'TOKEN_ROTATED',

  // ─── Account Security ──────────────────────────────────────────────────────
  ACCOUNT_LOCKED = 'ACCOUNT_LOCKED',
  ACCOUNT_UNLOCKED = 'ACCOUNT_UNLOCKED',

  // ─── Email Verification ───────────────────────────────────────────────────
  EMAIL_VERIFICATION_SENT = 'EMAIL_VERIFICATION_SENT',
  EMAIL_VERIFIED = 'EMAIL_VERIFIED',

  // ─── Password Recovery ────────────────────────────────────────────────────
  PASSWORD_RESET_REQUEST = 'PASSWORD_RESET_REQUEST',
  PASSWORD_RESET_SUCCESS = 'PASSWORD_RESET_SUCCESS',
}

/**
 * Input shape for writing a single audit log entry.
 */
export interface AuditEventInput {
  /** The action that occurred. */
  action: AuditAction
  /** The authenticated or targeted user's ID. Optional for pre-auth events. */
  userId?: string
  /** Originating IP address from the request. */
  ip?: string
  /** User-Agent header string. */
  userAgent?: string
  /** Any additional structured data relevant to the event. */
  metadata?: Record<string, unknown>
}
