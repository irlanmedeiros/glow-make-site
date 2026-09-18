import { createHmac, timingSafeEqual, randomBytes } from 'crypto';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/prisma';

/**
 * Autenticação com dois papéis.
 *
 *  - "admin"  → tem acesso a tudo: estoque, pedidos, assinantes, preços,
 *               banners, configurações, usuários.
 *  - "equipe" → a vendedora da loja. Só chega no /catalogo: consulta o
 *               estoque e registra venda feita no balcão. Não vê pedido,
 *               cliente nem faturamento.
 *
 * Duas portas de entrada:
 *  - Usuário e senha cadastrados em Admin > Usuários (tabela Usuario). É o
 *    uso normal: cada acesso pode ser desligado sozinho.
 *  - Senha mestra: ADMIN_PASSWORD e EQUIPE_PASSWORD, em variável de ambiente.
 *    Fica como chave reserva, para ninguém se trancar para fora do painel.
 *
 * O que vai no cookie é um token assinado com AUTH_SECRET; sem o segredo
 * ninguém forja um válido. Papel, usuário e versão fazem parte do texto
 * assinado, então também não dá para uma vendedora editar o cookie e virar
 * admin. A assinatura só prova que o cookie foi emitido aqui — se o usuário
 * ainda existe, está ativo e não teve a sessão encerrada, quem confere é
 * sessaoAtual(), no banco, a cada requisição.
 *
 * Comparações usam timingSafeEqual para não vazar a senha pelo tempo de resposta.
 */

const COOKIE = 'glowmake_sessao';

export type Papel = 'admin' | 'equipe';

// Marca, no lugar do id, a sessão aberta pela senha mestra.
const SEM_USUARIO = 'mestra';

export type Sessao = {
  papel: Papel;
  usuarioId: string | null; // null = entrou pela senha mestra
  nome: string;
};

export type DadosDoToken = { papel: Papel; usuarioId: string | null; versao: number };

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

function criarToken(papel: Papel, usuario?: { id: string; versaoSessao: number }): string {
  const expira = Date.now() + DURACAO_HORAS[papel] * 60 * 60 * 1000;
  const nonce = randomBytes(8).toString('hex');
  const uid = usuario?.id ?? SEM_USUARIO;
  const versao = usuario?.versaoSessao ?? 0;
  const payload = `${expira}.${nonce}.${papel}.${uid}.${versao}`;
  return `${payload}.${assinar(payload)}`;
}

/**
 * Lê o cookie sem ir ao banco: devolve o que está assinado nele, ou null se
 * ausente, adulterado ou vencido. Para decidir acesso use sessaoAtual().
 */
export function lerToken(token: string | undefined): DadosDoToken | null {
  if (!token) return null;
  const partes = token.split('.');
  if (partes.length !== 6) return null;

  const [expira, nonce, papel, uid, versao, assinatura] = partes;
  if (papel !== 'admin' && papel !== 'equipe') return null;

  const payload = `${expira}.${nonce}.${papel}.${uid}.${versao}`;
  if (!comparar(assinatura, assinar(payload))) return null;

  const ts = Number(expira);
  if (!Number.isFinite(ts) || ts <= Date.now()) return null;

  const v = Number(versao);
  if (!uid || !Number.isInteger(v) || v < 0) return null;

  return { papel, usuarioId: uid === SEM_USUARIO ? null : uid, versao: v };
}

/** Só a parte assinada; não sabe se o usuário foi desativado depois. */
export function papelDoToken(token: string | undefined): Papel | null {
  return lerToken(token)?.papel ?? null;
}

export async function abrirSessao(papel: Papel, usuario?: { id: string; versaoSessao: number }) {
  const jar = await cookies();
  jar.set(COOKIE, criarToken(papel, usuario), {
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

export function papelDoUsuario(papel: 'ADMIN' | 'EQUIPE'): Papel {
  return papel === 'ADMIN' ? 'admin' : 'equipe';
}

/**
 * Quem está pedindo a página agora, conferido no banco. Um cookie bem
 * assinado não basta: o usuário pode ter sido desativado, ter trocado de papel
 * ou de senha depois que o cookie foi emitido.
 */
export async function sessaoAtual(): Promise<Sessao | null> {
  const jar = await cookies();
  const dados = lerToken(jar.get(COOKIE)?.value);
  if (!dados) return null;

  if (!dados.usuarioId) {
    // Senha mestra. Se ela foi tirada da Vercel, a sessão que ela abriu cai junto.
    const configurada = dados.papel === 'admin' ? senhaAdminConfigurada() : senhaEquipeConfigurada();
    if (!configurada) return null;
    return {
      papel: dados.papel,
      usuarioId: null,
      nome: dados.papel === 'admin' ? 'Senha mestra do admin' : 'Senha da equipe',
    };
  }

  const u = await prisma.usuario.findUnique({
    where: { id: dados.usuarioId },
    select: { nome: true, papel: true, ativo: true, versaoSessao: true },
  });
  if (!u || !u.ativo || u.versaoSessao !== dados.versao || papelDoUsuario(u.papel) !== dados.papel) {
    return null;
  }
  return { papel: dados.papel, usuarioId: dados.usuarioId, nome: u.nome };
}

/** Papel de quem está pedindo a página agora. */
export async function sessao(): Promise<Papel | null> {
  return (await sessaoAtual())?.papel ?? null;
}

export async function ehAdmin(): Promise<boolean> {
  return (await sessao()) === 'admin';
}

/** Admin também enxerga o catálogo — é o mesmo estoque. */
export async function podeVerCatalogo(): Promise<boolean> {
  return (await sessao()) !== null;
}

export const COOKIE_SESSAO = COOKIE;
