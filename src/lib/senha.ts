import { scrypt, randomBytes, timingSafeEqual } from 'crypto';

/**
 * Hash de senha dos usuários do painel.
 *
 * scrypt é do próprio Node: nenhuma dependência nova num projeto que já esteve
 * público, e ele é lento de propósito — quem copiar a tabela não testa milhões
 * de senhas por segundo. Os parâmetros ficam gravados junto do hash, então dá
 * para endurecer depois sem invalidar as senhas que já existem.
 *
 * Formato: scrypt$N$r$p$sal$hash (sal e hash em base64).
 */

const N = 16384;
const R = 8;
const P = 1;
const TAMANHO = 64;

export const SENHA_MINIMA = 8;
const SENHA_MAXIMA = 200;

function derivar(senha: string, sal: Buffer, n: number, r: number, p: number): Promise<Buffer> {
  return new Promise((ok, falha) => {
    scrypt(senha.normalize('NFKC'), sal, TAMANHO, { N: n, r, p, maxmem: 64 * 1024 * 1024 }, (erro, chave) =>
      erro ? falha(erro) : ok(chave)
    );
  });
}

export async function gerarHash(senha: string): Promise<string> {
  const sal = randomBytes(16);
  const hash = await derivar(senha, sal, N, R, P);
  return ['scrypt', N, R, P, sal.toString('base64'), hash.toString('base64')].join('$');
}

export async function conferirSenha(senha: string, guardado: string): Promise<boolean> {
  const partes = guardado.split('$');
  if (partes.length !== 6 || partes[0] !== 'scrypt') return false;
  const [n, r, p] = partes.slice(1, 4).map(Number);
  // Limites contra um hash adulterado que pedisse memória ou tempo absurdos.
  if (![n, r, p].every(Number.isInteger) || n < 1024 || n > 1 << 20 || r < 1 || r > 32 || p < 1 || p > 4) {
    return false;
  }
  const sal = Buffer.from(partes[4], 'base64');
  const esperado = Buffer.from(partes[5], 'base64');
  if (!sal.length || esperado.length !== TAMANHO) return false;

  const obtido = await derivar(senha, sal, n, r, p);
  return timingSafeEqual(obtido, esperado);
}

/**
 * Login inexistente também paga o custo do scrypt. Sem isso, responder rápido
 * para "usuário não existe" e devagar para "senha errada" entregaria quais
 * logins são válidos.
 */
let hashDeFachada: Promise<string> | null = null;
export async function gastarTempoDeConferencia(senha: string): Promise<void> {
  hashDeFachada ??= gerarHash(randomBytes(12).toString('hex'));
  await conferirSenha(senha, await hashDeFachada);
}

export function erroDeSenha(senha: string, confirmacao?: string): string | null {
  if (senha.length < SENHA_MINIMA) return `A senha precisa de pelo menos ${SENHA_MINIMA} caracteres.`;
  if (senha.length > SENHA_MAXIMA) return 'Senha longa demais.';
  if (confirmacao !== undefined && senha !== confirmacao) return 'As duas senhas não conferem.';
  return null;
}

/** Login é comparado sempre em minúsculo: "Balcao" e "balcao" são a mesma pessoa. */
export function normalizarLogin(bruto: unknown): string {
  return String(bruto ?? '').trim().toLowerCase();
}

export function erroDeLogin(login: string): string | null {
  if (!/^[a-z0-9][a-z0-9._-]{2,39}$/.test(login)) {
    return 'Usuário deve ter de 3 a 40 caracteres: letras sem acento, números, ponto, hífen ou sublinhado.';
  }
  return null;
}
