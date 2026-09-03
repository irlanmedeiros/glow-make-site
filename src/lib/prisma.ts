import { PrismaClient } from '@prisma/client';

/* Aqui havia um `loadEnvConfig(process.cwd())`, para o Prisma enxergar o
   `.env.local` quando rodado fora do pipeline do Next. Foi removido por dois
   motivos:

   1. Virou redundante. O `prisma.config.ts` já carrega o ambiente para os
      comandos do CLI, e o `next dev`/`next build` lê `.env.local` sozinho.

   2. Fazia estrago. O `loadEnvConfig` expande variáveis, e a chave do Asaas
      começa com cifrão. Quando a variável JÁ estava no ambiente (alguém deu
      `export`, ou um script fez `set -a && . ./.env.local`), ele tentava
      expandir `$aact_...` como referência e gravava STRING VAZIA por cima —
      sem erro nenhum. O efeito: `asaasConfigurado()` virava false e o site
      passava a gravar pedido sem gerar cobrança, em silêncio.

   Script avulso que importe este módulo direto precisa carregar o ambiente
   por conta própria — veja `tests/setup.ts`, que usa `process.loadEnvFile`
   justamente por não fazer expansão. */

// Em dev o Next recarrega os módulos a cada edição. Sem esse cache global,
// cada reload abriria uma nova pool de conexões até o Postgres recusar.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
