import { cleanEnv, str, port, bool, num } from 'envalid'

export const env = cleanEnv(process.env, {
      // ─── App ─────────────────────────────────────────────────────────────────
      NODE_ENV: str({
            choices: ['development', 'production', 'test'],
            default: 'development',
      }),
      PORT: port({ default: 8000 }),

      // ─── Database ─────────────────────────────────────────────────────────────
      DATABASE_URL: str(),

      // ─── Redis ────────────────────────────────────────────────────────────────
      REDIS_URL: str({ default: 'redis://localhost:6379' }),

      // ─── JWT ──────────────────────────────────────────────────────────────────
      JWT_ACCESS_SECRET: str(),
      JWT_REFRESH_SECRET: str(),
      JWT_ACCESS_EXPIRES_IN: str({ default: '15m' }),
      JWT_REFRESH_EXPIRES_IN: str({ default: '7d' }),

      // ─── CORS ─────────────────────────────────────────────────────────────────
      ALLOWED_ORIGINS: str({ default: 'http://localhost:3000' }),

      // ─── Rate Limiting ────────────────────────────────────────────────────────
      RATE_LIMIT_WINDOW_MS: num({ default: 900000 }), // 15 minutes
      RATE_LIMIT_MAX: num({ default: 100 }),
      AUTH_RATE_LIMIT_MAX: num({ default: 10 }),

      // ─── Cluster ──────────────────────────────────────────────────────────────
      CLUSTER_ENABLED: bool({ default: false }),
})
