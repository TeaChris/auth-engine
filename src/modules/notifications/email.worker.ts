import { Job } from 'bullmq'
import nodemailer from 'nodemailer'
import { logger, createWorker } from '@/infrastructure'
import { env } from '@/config'

// ─── Email Job Data ───────────────────────────────────────────────────────────
export type EmailJobData =
  | {
      type: 'email-verification'
      to: string
      subject: string
      verificationUrl: string
    }
  | {
      type: 'password-reset'
      to: string
      subject: string
      resetUrl: string
      expiresInMinutes: number
    }
  | {
      type: 'welcome'
      to: string
      subject: string
    }

// ─── Nodemailer Transporter ───────────────────────────────────────────────────
// Configured for SMTP. In development, point SMTP_* vars at Ethereal
// (https://ethereal.email) for a free catch-all test inbox.
// In production, swap credentials for SES, SendGrid SMTP relay, Postmark, etc.
const createTransporter = () =>
  nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_PORT === 465, // true for port 465, STARTTLS for others
    auth:
      env.SMTP_USER && env.SMTP_PASS
        ? { user: env.SMTP_USER, pass: env.SMTP_PASS }
        : undefined,
  })

// ─── HTML email templates ─────────────────────────────────────────────────────
const buildVerificationEmail = (verificationUrl: string): string => `
  <div style="font-family:sans-serif;max-width:600px;margin:auto">
    <h2>Verify your email address</h2>
    <p>Click the button below to verify your email. This link expires in 1 hour.</p>
    <a href="${verificationUrl}" style="display:inline-block;padding:12px 24px;background:#4F46E5;color:#fff;border-radius:6px;text-decoration:none;font-weight:600">
      Verify Email
    </a>
    <p style="margin-top:16px;color:#6B7280;font-size:12px">
      If you did not create an account, you can safely ignore this email.
    </p>
  </div>
`

const buildPasswordResetEmail = (resetUrl: string, expiresInMinutes: number): string => `
  <div style="font-family:sans-serif;max-width:600px;margin:auto">
    <h2>Reset your password</h2>
    <p>Click the button below to reset your password. This link expires in ${expiresInMinutes} minutes.</p>
    <a href="${resetUrl}" style="display:inline-block;padding:12px 24px;background:#DC2626;color:#fff;border-radius:6px;text-decoration:none;font-weight:600">
      Reset Password
    </a>
    <p style="margin-top:16px;color:#6B7280;font-size:12px">
      If you did not request a password reset, please ignore this email and your password will remain unchanged.
    </p>
  </div>
`

const buildWelcomeEmail = (to: string): string => `
  <div style="font-family:sans-serif;max-width:600px;margin:auto">
    <h2>Welcome! 🎉</h2>
    <p>Hi ${to}, your account has been created successfully. Thank you for joining us.</p>
  </div>
`

/**
 * EmailWorker — processes all outbound email jobs from the 'email-queue'.
 * Uses Nodemailer with configurable SMTP transport (Ethereal ↔ SES/SendGrid).
 */
export class EmailWorker {
  private readonly transporter: nodemailer.Transporter

  constructor() {
    this.transporter = createTransporter()
    createWorker<EmailJobData>('email-queue', this.process.bind(this))
    logger.info('📧 Email worker initialized and listening on "email-queue"')
  }

  async process(job: Job<EmailJobData>): Promise<void> {
    const { to, subject } = job.data
    logger.info({ jobId: job.id, to, subject, type: job.data.type }, 'Processing email job')

    let html: string

    switch (job.data.type) {
      case 'email-verification':
        html = buildVerificationEmail(job.data.verificationUrl)
        break

      case 'password-reset':
        html = buildPasswordResetEmail(job.data.resetUrl, job.data.expiresInMinutes)
        break

      case 'welcome':
        html = buildWelcomeEmail(to)
        break

      default: {
        // TypeScript exhaustiveness check
        const _exhaustive: never = job.data
        logger.warn({ jobData: _exhaustive }, 'Unknown email job type — skipping')
        return
      }
    }

    await this.transporter.sendMail({
      from: env.SMTP_FROM,
      to,
      subject,
      html,
    })

    logger.info({ jobId: job.id, to }, 'Email sent successfully')
  }
}
