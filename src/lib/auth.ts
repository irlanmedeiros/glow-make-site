import { createHmac, timingSafeEqual, randomBytes } from 'crypto';
import { cookies } from 'next/headers';

/**
 * Autenticação com dois papéis.
 *
 *  - "admin"  → ADMIN_PASSWORD. Tem acesso a tudo: estoque, pedidos,
 *               assinantes, preços, banners, configurações.
 *  - "equipe" → EQUIPE_PASSWORD. É a senha que as vendedoras da loja usam.
 *               Só chega no /catalogo: consulta o estoque e registra venda
 *               feita no balcão. Não vê pedido, cliente nem faturamento.
 *
 * As senhas vivem em variável de ambiente e nunca chegam ao navegador. O que
 * vai no cookie é um token assinado com AUTH_SECRET; sem o segredo ninguém
 * forja um válido. O papel faz parte do texto assinado, então também não dá
 * para uma vendedora editar o cookie e virar admin.
 *
 * Comparações usam timingSafeEqual para não vazar a senha pelo tempo de resposta.
 */

const COOKIE = 'glowmake_sessao';

export type Papel = 'admin' | 'equipe';

// Admin mexe em dinheiro e preço: sessão curta. A vendedora usa o celular no
// balcão o dia inteiro — relogar a cada 12h só atrapalharia, e o que ela
// alcança é bem menos sensível.
const DURACAO_HORAS: Record<Papel, number> = { admin: 12, equipe: 24 * 30 };

function segredo(): string {
  const s = process.env.AUTH_SECRET;
  if (!s || s.length < 16) {
    throw new Error(
      'AUTH_SECRET não configurado (mínimo 16 caracteres). Gere um com: openssl rand -base64 32'
    );
  }
  return s;
}

function assinar(payload: string): string {
  return createHmac('sha256', segredo()).update(payload).digest('hex');
}

function comparar(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

export function senhaAdminConfigurada(): boolean {
  return Boolean(process.env.ADMIN_PASSWORD && process.env.ADMIN_PASSWORD.length >= 8);
}

export function senhaEquipeConfigurada(): boolean {
  return Boolean(process.env.EQUIPE_PASSWORD && process.env.EQUIPE_PASSWORD.length >= 6);
}

/** Descobre qual papel a senha digitada abre. Testa os dois sem sair cedo. */
export function papelDaSenha(tentativa: string): Papel | null {
  const admin = process.env.ADMIN_PASSWORD;
  const equipe = process.env.EQUIPE_PASSWORD;

  const ehAdmin = Boolean(admin) && comparar(tentativa, admin!);
  const ehEquipe = Boolean(equipe) && comparar(tentativa, equipe!);

  if (ehAdmin) return 'admin';
  if (ehEquipe) return 'equipe';
  return null;
}

function criarToken(papel: Papel): string {
  const expira = Date.now() + DURACAO_HORAS[papel] * 60 * 60 * 1000;
  const nonce = randomBytes(8).toString('hex');
  const payload = `${expira}.${nonce}.${papel}`;
  return `${payload}.${assinar(payload)}`;
}

/** Devolve o papel do cookie, ou null se ausente, adulterado ou vencido. */
export function papelDoToken(token: string | undefined): Papel | null {
  if (!token) return null;
  const partes = token.split('.');
  if (partes.length !== 4) return null;

  const [expira, nonce, papel, assinatura] = partes;
  if (papel !== 'admin' && papel !== 'equipe') return null;

  const payload = `${expira}.${nonce}.${papel}`;
  if (!comparar(assinatura, assinar(payload))) return null;

  const ts = Number(expira);
  if (!Number.isFinite(ts) || ts <= Date.now()) return null;

  return papel;
}

export async function abrirSessao(papel: Papel) {
  const jar = await cookies();
  jar.set(COOKIE, criarToken(papel), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: DURACAO_HORAS[papel] * 60 * 60,
  });
}

export async function fecharSessao() {
  const jar = await cookies();
  jar.delete(COOKIE);
}

/** Papel de quem está pedindo a página agora. */
export async function sessao(): Promise<Papel | null> {
  const jar = await cookies();
  return papelDoToken(jar.get(COOKIE)?.value);
}

export async function ehAdmin(): Promise<boolean> {
  return (await sessao()) === 'admin';
}

/** Admin também enxerga o catálogo — é o mesmo estoque. */
export async function podeVerCatalogo(): Promise<boolean> {
  return (await sessao()) !== null;
}

export const COOKIE_SESSAO = COOKIE;
