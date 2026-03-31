import { PrismaClient, Role } from '@prisma/client';

interface CreateUserInput {
  email: string;
  password: string;
  role?: Role;
}

/**
 * AuthRepository — Data Access Layer.
 * All DB interactions for the auth domain live here.
 * Constructor parameters are injected by the awilix DI container.
 */
export class AuthRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findByEmail(email: string) {
    return this.prisma.user.findUnique({ where: { email } });
  }

  async findById(id: string) {
    return this.prisma.user.findUnique({ where: { id } });
  }

  async create(input: CreateUserInput) {
    return this.prisma.user.create({
      data: {
        email: input.email,
        password: input.password,
        role: input.role ?? Role.USER,
      },
      select: { id: true, email: true, role: true, createdAt: true },
    });
  }
}
