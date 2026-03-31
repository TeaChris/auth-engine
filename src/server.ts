import cookieParser from 'cookie-parser'
import express, { Application } from 'express'
import helmet from 'helmet'
import cors from 'cors'
import hpp from 'hpp'

import { env } from '@/config'
import { httpLogger } from '@/infrastructure'
import {
      compressionMiddleware,
      generalRateLimiter,
      globalErrorHandler,
      notFoundHandler,
} from '@/middleware'
import { authRouter, healthRouter } from '@/modules'

export const createServer = (): Application => {
      const app = express()

      // ─── Trust Proxy (required for correct IP behind load balancers / nginx) ───
      app.set('trust proxy', 1)

      // ─── Disable fingerprinting ────────────────────────────────────────────────
      app.disable('x-powered-by')

      // ─── Security Headers (Helmet) ────────────────────────────────────────────
      app.use(
            helmet({
                  contentSecurityPolicy: {
                        directives: {
                              defaultSrc: ["'self'"],
                              scriptSrc: ["'self'"],
                              styleSrc: ["'self'", "'unsafe-inline'"],
                              imgSrc: ["'self'", 'data:', 'https:'],
                              connectSrc: ["'self'"],
                              fontSrc: ["'self'"],
                              objectSrc: ["'none'"],
                              frameSrc: ["'none'"],
                              upgradeInsecureRequests: [],
                        },
                  },
                  hsts: {
                        maxAge: 31536000,
                        includeSubDomains: true,
                        preload: true,
                  },
                  crossOriginEmbedderPolicy: true,
            }),
      )

      // ─── CORS (strict whitelist from env) ─────────────────────────────────────
      const allowedOrigins = env.ALLOWED_ORIGINS.split(',').map((o) => o.trim())
      app.use(
            cors({
                  origin: (origin, callback) => {
                        // Allow server-to-server requests with no Origin header
                        if (!origin || allowedOrigins.includes(origin))
                              return callback(null, true)
                        callback(
                              new Error(
                                    `CORS policy: origin '${origin}' is not allowed`,
                              ),
                        )
                  },
                  credentials: true,
                  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
                  allowedHeaders: [
                        'Content-Type',
                        'Authorization',
                        'X-Requested-With',
                  ],
                  exposedHeaders: [
                        'RateLimit-Limit',
                        'RateLimit-Remaining',
                        'RateLimit-Reset',
                  ],
            }),
      )

      // ─── Compression ──────────────────────────────────────────────────────────
      app.use(compressionMiddleware)

      // ─── Body Parsing (with size limits to prevent oversized payload attacks) ──
      app.use(express.json({ limit: '10kb' }))
      app.use(express.urlencoded({ extended: true, limit: '10kb' }))
      app.use(cookieParser())

      // ─── HTTP Parameter Pollution (HPP) ───────────────────────────────────────
      app.use(hpp())

      // ─── Structured HTTP Logging ──────────────────────────────────────────────
      app.use(httpLogger)

      // ─── General Rate Limiting ────────────────────────────────────────────────
      app.use(generalRateLimiter)

      // ─── Routes ───────────────────────────────────────────────────────────────
      app.use('/health', healthRouter)
      app.use('/api/v1/auth', authRouter)

      // ─── 404 & Global Error Handler ───────────────────────────────────────────
      app.use(notFoundHandler)
      app.use(globalErrorHandler)

      return app
}
