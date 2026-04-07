import request, { type Response } from 'supertest'
import { describe, it, expect, beforeAll, vi } from 'vitest'
import { createServer } from '@/server'
import { prisma } from '@/infrastructure'
import type { Application } from 'express'

// ─── Mock BullMQ ─────────────────────────────────────────────────────────────
// Avoids requiring a live Redis instance during integration tests.
interface MockJob {
  id?: string
  name: string
  data: unknown
}
const mockJobs: MockJob[] = []

vi.mock('bullmq', () => ({
  Queue: vi.fn().mockImplementation(() => ({
    add: vi.fn().mockImplementation((name: string, data: unknown) => {
      const job: MockJob = { id: `mock-job-${Math.random()}`, name, data }
      mockJobs.push(job)
      return Promise.resolve(job)
    }),
    getJobs: vi.fn().mockImplementation(() => Promise.resolve(mockJobs)),
    on: vi.fn(),
    close: vi.fn(),
  })),
  Worker: vi.fn().mockImplementation(() => ({
    on: vi.fn(),
    close: vi.fn(),
  })),
}))

/** Extracts the set-cookie array from a supertest response reliably. */
const getCookies = (res: Response): string[] => {
  const raw = res.headers['set-cookie']
  if (Array.isArray(raw)) return raw
  if (typeof raw === 'string') return [raw]
  return []
}

describe('Auth Module Integration', () => {
  let app: Application

  beforeAll(async () => {
    app = createServer()
    // Clear test data before running suite
    await prisma.user.deleteMany()
    await prisma.auditLog.deleteMany()
  })

  // ─── CSRF ──────────────────────────────────────────────────────────────────
  describe('GET /csrf-token', () => {
    it('should return a valid CSRF token and set the cookie', async () => {
      const response: Response = await request(app).get('/csrf-token')

      expect(response.status).toBe(200)
      expect(response.body).toHaveProperty('token')

      const cookies = getCookies(response)
      expect(cookies.length).toBeGreaterThan(0)
      expect(cookies[0]).toContain('x-csrf-token')
    })
  })

  // ─── Register ──────────────────────────────────────────────────────────────
  describe('POST /api/v1/auth/register', () => {
    it('should fail registration without a CSRF token', async () => {
      const response: Response = await request(app)
        .post('/api/v1/auth/register')
        .send({ email: 'test@example.com', password: 'Password123!' })

      expect(response.status).toBe(403) // CSRF failure
    })

    it('should successfully register a new user with valid CSRF', async () => {
      const csrfResponse: Response = await request(app).get('/csrf-token')
      const token = csrfResponse.body.token as string
      const cookie = getCookies(csrfResponse)

      const response: Response = await request(app)
        .post('/api/v1/auth/register')
        .set('Cookie', cookie)
        .set('X-CSRF-Token', token)
        .send({ email: 'test@example.com', password: 'Password123!' })

      expect(response.status).toBe(201)
      expect(response.body.data).toHaveProperty('email', 'test@example.com')
      expect(response.body.data).toHaveProperty('emailVerifiedAt', null)

      // Verify DB persistence
      const user = await prisma.user.findUnique({ where: { email: 'test@example.com' } })
      expect(user).toBeDefined()
      expect(user?.emailVerificationToken).not.toBeNull()

      // Verify email-verification job was enqueued
      const { container } = await import('@/container')
      const emailQueue = container.resolve('emailQueue')
      const jobs = (await emailQueue.getJobs(['waiting', 'active', 'completed'])) as MockJob[]
      const verifyJob = jobs.find(
        (j) => j.name === 'email-verification' && (j.data as { to: string }).to === 'test@example.com',
      )
      expect(verifyJob).toBeDefined()
    })

    it('should sanitize input and strip XSS payloads', async () => {
      const csrfResponse: Response = await request(app).get('/csrf-token')
      const token = csrfResponse.body.token as string
      const cookie = getCookies(csrfResponse)

      const response: Response = await request(app)
        .post('/api/v1/auth/register')
        .set('Cookie', cookie)
        .set('X-CSRF-Token', token)
        .send({
          email: 'xss@<script>alert(1)</script>example.com',
          password: 'Password123!',
        })

      expect(response.status).toBe(201)
      expect(response.body.data.email).not.toContain('<script>')
      expect(response.body.data.email).toBe('xss@example.com')
    })
  })

  // ─── Forgot Password ───────────────────────────────────────────────────────
  describe('POST /api/v1/auth/forgot-password', () => {
    it('should return 200 even for unknown emails (prevents enumeration)', async () => {
      const csrfResponse: Response = await request(app).get('/csrf-token')
      const token = csrfResponse.body.token as string
      const cookie = getCookies(csrfResponse)

      const response: Response = await request(app)
        .post('/api/v1/auth/forgot-password')
        .set('Cookie', cookie)
        .set('X-CSRF-Token', token)
        .send({ email: 'nonexistent@example.com' })

      expect(response.status).toBe(200)
      expect(response.body.success).toBe(true)
    })

    it('should set a reset token for a known user', async () => {
      const csrfResponse: Response = await request(app).get('/csrf-token')
      const token = csrfResponse.body.token as string
      const cookie = getCookies(csrfResponse)

      await request(app)
        .post('/api/v1/auth/forgot-password')
        .set('Cookie', cookie)
        .set('X-CSRF-Token', token)
        .send({ email: 'test@example.com' })

      const user = await prisma.user.findUnique({ where: { email: 'test@example.com' } })
      expect(user?.passwordResetToken).not.toBeNull()
      expect(user?.passwordResetExpiresAt).not.toBeNull()
    })
  })
})
