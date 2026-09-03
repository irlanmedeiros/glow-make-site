import { loadEnvConfig } from '@next/env';
import { PrismaClient } from '@prisma/client';

// Prisma roda fora do pipeline padrão do Next em algumas entradas (build,
// scripts e inicialização do client). Carregar os arquivos de ambiente aqui
// garante que `.env.local` e companhia entrem antes de `env("DATABASE_URL")`.
loadEnvConfig(process.cwd());

// Em dev o Next recarrega os módulos a cada edição. Sem esse cache global,
// cada reload abriria uma nova pool de conexões até o Postgres recusar.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
