import path from 'node:path';
import { loadEnvConfig } from '@next/env';
import { defineConfig } from 'prisma/config';

// A presença deste arquivo desliga o carregamento automático de .env que o
// Prisma fazia sozinho. Sem esta linha, `prisma db push` e `prisma db seed`
// não enxergam `.env.local` — e é lá que a Vercel grava o DATABASE_URL do
// ambiente de desenvolvimento. O `next dev` já lê `.env.local` nativamente.
loadEnvConfig(process.cwd());

export default defineConfig({
  schema: path.join('prisma', 'schema.prisma'),
  migrations: {
    // Antes ficava em `package.json#prisma.seed`, agora removido por estar
    // deprecado (Prisma 7 vai ignorar).
    seed: 'tsx prisma/seed.ts',
  },
});
