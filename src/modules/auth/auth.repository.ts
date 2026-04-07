import { PrismaClient, Role, type User, type Prisma } from '@prisma/client'

interface CreateUserInput {
  email: string
  password: string
  emailVerificationToken: string
  role?: Role
}

interface UpdateUserInput {
  emailVerifiedAt?: Date | null
  emailVerificationToken?: string | null
  password?: string
  passwordResetToken?: string | null
  passwordResetExpiresAt?: Date | null
  failedLoginAttempts?: number
  lockedUntil?: Date | null
}

// The safe public projection — never return the raw password hash
const PUBLIC_USER_SELECT = {
  id: true,
  email: true,
  role: true,
  emailVerifiedAt: true,
  failedLoginAttempts: true,
  lockedUntil: true,
  createdAt: true,
} satisfies Prisma.UserSelect

/**
 * AuthRepository — Data Access Layer.
 * All DB interactions for the auth domain live here.
 * Constructor parameters are injected by the awilix DI container.
 */
export class AuthRepository {
  constructor(private readonly prisma: PrismaClient) {}

  /** Finds a user by email, including the password hash (for verification). */
  async findByEmail(email: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { email } })
  }

  /** Finds a user by ID, including the password hash. */
  async findById(id: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { id } })
  }

  /** Finds a user by their hashed password reset token. */
  async findByPasswordResetToken(hashedToken: string): Promise<User | null> {
    return this.prisma.user.findUnique({
      where: { passwordResetToken: hashedToken },
    })
  }

  /** Finds a user by their hashed email verification token. */
  async findByVerificationToken(hashedToken: string): Promise<User | null> {
    return this.prisma.user.findUnique({
      where: { emailVerificationToken: hashedToken },
    })
  }

  /** Creates a new user. Returns the safe public projection (no password). */
  async create(input: CreateUserInput) {
    return this.prisma.user.create({
      data: {
        email: input.email,
        password: input.password,
        role: input.role ?? Role.USER,
        emailVerificationToken: input.emailVerificationToken,
      },
      select: PUBLIC_USER_SELECT,
    })
  }

  /** Applies a partial update to a user by ID. Returns the updated user. */
  async updateById(id: string, data: UpdateUserInput): Promise<User> {
    return this.prisma.user.update({ where: { id }, data })
  }

  /** Increments the failed login counter atomically. Returns the new count. */
  async incrementFailedLogins(id: string): Promise<number> {
    const user = await this.prisma.user.update({
      where: { id },
      data: { failedLoginAttempts: { increment: 1 } },
      select: { failedLoginAttempts: true },
    })
    return user.failedLoginAttempts
  }

  /** Resets the failed login counter and clears any account lock. */
  async resetFailedLogins(id: string): Promise<void> {
    await this.prisma.user.update({
      where: { id },
      data: { failedLoginAttempts: 0, lockedUntil: null },
    })
  }
}
