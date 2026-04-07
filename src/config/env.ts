import { cleanEnv, str, port, bool, num } from 'envalid'

export const env = cleanEnv(process.env, {
      // ─── App ─────────────────────────────────────────────────────────────────
      NODE_ENV: str({
            choices: ['development', 'production', 'test'],
            default: 'development',
      }),
      PORT: port({ default: 8000 }),
      APP_URL: str({ default: 'http://localhost:8000' }),

      // ─── Database ─────────────────────────────────────────────────────────────
      DATABASE_URL: str(),

      // ─── Redis ────────────────────────────────────────────────────────────────
      REDIS_URL: str({ default: 'redis://localhost:6379' }),

      // ─── JWT ──────────────────────────────────────────────────────────────────
      JWT_ACCESS_SECRET: str(),
      JWT_REFRESH_SECRET: str(),
      JWT_ACCESS_EXPIRES_IN: str({ default: '15m' }),
      JWT_REFRESH_EXPIRES_IN: str({ default: '7d' }),

      // ─── CSRF ─────────────────────────────────────────────────────────────────
      // Must be a different secret from the JWT secrets.
      // Generate with: openssl rand -hex 64
      CSRF_SECRET: str(),

      // ─── CORS ─────────────────────────────────────────────────────────────────
      ALLOWED_ORIGINS: str({ default: 'http://localhost:3000' }),

      // ─── Rate Limiting ────────────────────────────────────────────────────────
      RATE_LIMIT_WINDOW_MS: num({ default: 900000 }), // 15 minutes
      RATE_LIMIT_MAX: num({ default: 100 }),
      AUTH_RATE_LIMIT_MAX: num({ default: 10 }),

      // ─── Account Lockout ──────────────────────────────────────────────────────
      LOGIN_MAX_ATTEMPTS: num({ default: 5 }),
      ACCOUNT_LOCKOUT_MINUTES: num({ default: 15 }),

      // ─── Email / SMTP ─────────────────────────────────────────────────────────
      SMTP_HOST: str({ default: 'smtp.ethereal.email' }),
      SMTP_PORT: num({ default: 587 }),
      SMTP_USER: str({ default: '' }),
      SMTP_PASS: str({ default: '' }),
      SMTP_FROM: str({ default: 'Auth System <no-reply@example.com>' }),

      // ─── Cluster ──────────────────────────────────────────────────────────────
      CLUSTER_ENABLED: bool({ default: false }),
})
