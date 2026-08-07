import { PrismaClient } from '@prisma/client';

// Em dev o Next recarrega os módulos a cada edição. Sem esse cache global,
// cada reload abriria uma nova pool de conexões até o Postgres recusar.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
