import { PrismaClient } from '@/generated/prisma/client';
import { PrismaNeon } from '@prisma/adapter-neon';

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

/* Conexao pelo driver serverless do Neon, e nao pelo TCP padrao do Prisma.
   Motivo: no Cloudflare Workers nao existe socket TCP comum, entao o driver
   normal simplesmente nao conecta.

   Tem que ser o Pool (WebSocket), NUNCA o modo HTTP do Neon. O modo HTTP nao
   suporta transacao interativa, e a baixa de estoque depende exatamente
   disso: UPDATE condicional, leitura do saldo e movimentacao dentro da mesma
   transacao (docs/DECISOES.md #1). Com HTTP, duas compras simultaneas
   voltariam a vender a mesma ultima unidade.

   O mesmo codigo serve para Node e para Workers, sem o pacote `ws`: o
   Workers tem WebSocket global, e o Node tambem desde a versao 22 (a Vercel
   roda a 24). Se um dia o runtime for anterior a isso, o Neon vai reclamar
   de `webSocketConstructor` ausente — e a correcao e instalar `ws` e
   atribuir, nao voltar para o driver TCP. */
const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL });

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],

    /* O padrao do Prisma e 5s por transacao interativa, e isso nao aguenta
       pico de acesso: no teste de carga com 30 compras simultaneas, METADE dos
       checkouts morria com P2028 "Transaction already closed" — o pedido
       voltava 500 para a cliente com o carrinho cheio.

       Nao era lentidao de consulta: a baixa de estoque faz varias idas ao
       banco dentro da transacao (UPDATE condicional, leitura do saldo,
       movimentacao) e, com a fila de conexoes disputada, a soma passa de 5s.
       O banco fica em sa-east-1; cada ida custa dezenas de ms mesmo saudavel.

       15s da folga para o pico sem deixar transacao presa para sempre.
       `maxWait` e quanto esperar por uma conexao livre antes de desistir — sem
       ele, o pico vira erro imediato em vez de fila.
       Vale para TODAS as transacoes (checkout, assinatura, PDV, admin). */
    transactionOptions: { timeout: 15_000, maxWait: 10_000 },
  });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
