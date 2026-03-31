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
      sanitizationMiddleware,
      doubleCsrfProtection,
      generateCsrfToken,
} from '@/middleware'
import { authRouter, healthRouter } from '@/modules'

export const createServer = (): Application => {
      const app = express()

      // ─── Trust Proxy ───────────────────────────────────────────────────────────
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
                        'X-CSRF-Token',
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

      // ─── Body Parsing ──────────────────────────────────────────────────────────
      // Must come BEFORE sanitization so req.body is populated
      app.use(express.json({ limit: '10kb' }))
      app.use(express.urlencoded({ extended: true, limit: '10kb' }))
      app.use(cookieParser())

      // ─── Global Input Sanitization (XSS Prevention) ───────────────────────────
      // Runs AFTER body parsing (req.body is now populated), BEFORE routing
      app.use(sanitizationMiddleware)

      // ─── CSRF Protection (Double-Submit Cookie Pattern) ───────────────────────
      // Runs after cookieParser (needs cookies) and before routes
      app.use(doubleCsrfProtection)

      // ─── HTTP Parameter Pollution (HPP) ───────────────────────────────────────
      app.use(hpp())

      // ─── Structured HTTP Logging ──────────────────────────────────────────────
      app.use(httpLogger)

      // ─── General Rate Limiting ────────────────────────────────────────────────
      app.use(generalRateLimiter)

      // ─── CSRF Token Endpoint ──────────────────────────────────────────────────
      app.get('/csrf-token', (req, res) => {
            res.json({ token: generateCsrfToken(req, res) })
      })

      // ─── Routes ───────────────────────────────────────────────────────────────
      app.use('/health', healthRouter)
      app.use('/api/v1/auth', authRouter)

      // ─── 404 & Global Error Handler ───────────────────────────────────────────
      app.use(notFoundHandler)
      app.use(globalErrorHandler)

      return app
}
