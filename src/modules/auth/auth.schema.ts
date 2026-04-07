import { z } from 'zod'

// ─── Register ─────────────────────────────────────────────────────────────────
export const RegisterSchema = z.object({
  email: z.string().email('Invalid email address').toLowerCase().trim(),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(72, 'Password cannot exceed 72 characters')
    .regex(/[A-Z]/, 'Must contain at least one uppercase letter')
    .regex(/[0-9]/, 'Must contain at least one number')
    .regex(/[^A-Za-z0-9]/, 'Must contain at least one special character'),
})

// ─── Login ───────────────────────────────────────────────────────────────────
export const LoginSchema = z.object({
  email: z.string().email('Invalid email address').toLowerCase().trim(),
  password: z.string().min(1, 'Password is required'),
})

// ─── Refresh Token ───────────────────────────────────────────────────────────
export const RefreshTokenSchema = z.object({
  refreshToken: z.string().min(1).optional(),
})

// ─── Forgot Password ─────────────────────────────────────────────────────────
export const ForgotPasswordSchema = z.object({
  email: z.string().email('Invalid email address').toLowerCase().trim(),
})

// ─── Reset Password ───────────────────────────────────────────────────────────
export const ResetPasswordSchema = z.object({
  token: z.string().min(1, 'Reset token is required'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(72, 'Password cannot exceed 72 characters')
    .regex(/[A-Z]/, 'Must contain at least one uppercase letter')
    .regex(/[0-9]/, 'Must contain at least one number')
    .regex(/[^A-Za-z0-9]/, 'Must contain at least one special character'),
})

// ─── Verify Email ─────────────────────────────────────────────────────────────
export const VerifyEmailSchema = z.object({
  token: z.string().min(1, 'Verification token is required'),
})

// ─── Inferred Types ─────────────────────────────────────────────────────────
export type RegisterDto = z.infer<typeof RegisterSchema>
export type LoginDto = z.infer<typeof LoginSchema>
export type ForgotPasswordDto = z.infer<typeof ForgotPasswordSchema>
export type ResetPasswordDto = z.infer<typeof ResetPasswordSchema>
export type VerifyEmailDto = z.infer<typeof VerifyEmailSchema>
