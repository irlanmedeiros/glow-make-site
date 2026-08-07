import { createHmac, timingSafeEqual, randomBytes } from 'crypto';
import { cookies } from 'next/headers';

/**
 * Autenticação do admin.
 *
 * A senha vive em ADMIN_PASSWORD (variável de ambiente do servidor) e nunca
 * chega ao navegador. O que vai para o cookie é só um token assinado com
 * AUTH_SECRET — quem não tem o segredo não consegue forjar um válido.
 *
 * Comparações usam timingSafeEqual para não vazar a senha por tempo de resposta.
 */

const COOKIE = 'glowmake_admin';
const DURACAO_HORAS = 12;

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

export function senhaConfigurada(): boolean {
  return Boolean(process.env.ADMIN_PASSWORD && process.env.ADMIN_PASSWORD.length >= 8);
}

export function conferirSenha(tentativa: string): boolean {
  const esperada = process.env.ADMIN_PASSWORD;
  if (!esperada) return false;
  return comparar(tentativa, esperada);
}

export function criarToken(): string {
  const expira = Date.now() + DURACAO_HORAS * 60 * 60 * 1000;
  const nonce = randomBytes(8).toString('hex');
  const payload = `${expira}.${nonce}`;
  return `${payload}.${assinar(payload)}`;
}

export function tokenValido(token: string | undefined): boolean {
  if (!token) return false;
  const partes = token.split('.');
  if (partes.length !== 3) return false;
  const [expira, nonce, assinatura] = partes;
  const payload = `${expira}.${nonce}`;
  if (!comparar(assinatura, assinar(payload))) return false;
  const ts = Number(expira);
  return Number.isFinite(ts) && ts > Date.now();
}

export async function abrirSessao() {
  const jar = await cookies();
  jar.set(COOKIE, criarToken(), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: DURACAO_HORAS * 60 * 60,
  });
}

export async function fecharSessao() {
  const jar = await cookies();
  jar.delete(COOKIE);
}

export async function estaLogado(): Promise<boolean> {
  const jar = await cookies();
  return tokenValido(jar.get(COOKIE)?.value);
}

export const COOKIE_ADMIN = COOKIE;
