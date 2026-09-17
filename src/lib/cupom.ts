import { randomInt } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { prisma } from './prisma';
import { documentoValido } from './validacao';
import { mesmoDocumento, soDigitos } from './acompanhamento';
import { real } from './format';

/**
 * Cupom de indicacao.
 *
 * Quem indica recebe um codigo; quem USA e a amiga indicada, normalmente na
 * primeira compra dela. Tipo e valor do desconto sao definidos no admin, cupom
 * a cupom. O brinde de quem indicou nao esta aqui: e combinado pela loja, e o
 * sistema so registra quem indicou e qual pedido usou o codigo.
 *
 * Como o preco (docs/DECISOES.md #2), o desconto e sempre recalculado no
 * servidor. O navegador manda so o codigo.
 */

export type TipoDesconto = 'PERCENTUAL' | 'VALOR';

export const CUPOM_INEXISTENTE = 'Cupom não encontrado. Confira o código.';

export function normalizarCodigo(bruto: unknown): string {
  return typeof bruto === 'string'
    ? bruto.trim().toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 30)
    : '';
}

/** Nunca maior que os produtos: desconto nao abate frete nem vira credito. */
export function calcularDesconto(
  tipo: TipoDesconto,
  valor: Prisma.Decimal.Value,
  subtotal: Prisma.Decimal
): Prisma.Decimal {
  const v = new Prisma.Decimal(valor);
  if (v.lte(0) || subtotal.lte(0)) return new Prisma.Decimal(0);
  const bruto = tipo === 'PERCENTUAL' ? subtotal.mul(v).div(100) : v;
  const arredondado = bruto.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
  return Prisma.Decimal.min(arredondado, subtotal);
}

export function descricaoDesconto(tipo: TipoDesconto, valor: Prisma.Decimal.Value): string {
  const v = new Prisma.Decimal(valor);
  return tipo === 'PERCENTUAL'
    ? `${v.toString().replace('.', ',')}% de desconto nos produtos`
    : `${real(v)} de desconto nos produtos`;
}

// Sem 0/O e 1/I/L: o codigo costuma ser ditado por telefone ou WhatsApp.
const ALFABETO = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';

/** Primeiro nome + 5 caracteres sorteados: facil de dizer, dificil de adivinhar. */
export function sugerirCodigo(nome: string, sorteio: (max: number) => number = randomInt): string {
  const base =
    nome
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toUpperCase()
      .trim()
      .split(/\s+/)[0]
      ?.replace(/[^A-Z]/g, '')
      .slice(0, 8) || 'INDICA';
  let sufixo = '';
  for (let i = 0; i < 5; i++) sufixo += ALFABETO[sorteio(ALFABETO.length)];
  return `${base}-${sufixo}`;
}

export type DadosCupom = {
  codigo: string; // vazio = gerar
  tipo: TipoDesconto;
  valor: Prisma.Decimal;
  indicadorNome: string;
  indicadorEmail: string;
  indicadorDocumento: string;
  indicadorTelefone: string;
  primeiraCompra: boolean;
  validoAte: Date | null;
  ativo: boolean;
  observacao: string | null;
};

/** Validacao do formulario do admin. */
export function validarCupom(c: {
  codigo: string;
  tipo: string;
  valor: string;
  indicadorNome: string;
  indicadorEmail: string;
  indicadorDocumento: string;
  indicadorTelefone: string;
  primeiraCompra: boolean;
  validoAte: string;
  ativo: boolean;
  observacao: string;
}): DadosCupom | { erro: string } {
  const indicadorNome = c.indicadorNome.trim();
  if (indicadorNome.length < 2) return { erro: 'Informe o nome de quem indica.' };

  if (c.tipo !== 'PERCENTUAL' && c.tipo !== 'VALOR') return { erro: 'Tipo de desconto inválido.' };

  const numero = Number(c.valor.trim().replace(/\s|R\$/g, '').replace(',', '.'));
  if (!Number.isFinite(numero) || numero <= 0) return { erro: 'O desconto precisa ser maior que zero.' };
  if (c.tipo === 'PERCENTUAL' && numero > 100) return { erro: 'Percentual acima de 100%.' };

  const codigo = normalizarCodigo(c.codigo);
  if (c.codigo.trim() && !/^[A-Z0-9-]{4,30}$/.test(codigo)) {
    return { erro: 'Código com 4 a 30 letras, números ou hífen.' };
  }

  const indicadorEmail = c.indicadorEmail.trim().toLowerCase();
  if (indicadorEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(indicadorEmail)) {
    return { erro: 'E-mail de quem indica é inválido.' };
  }

  const indicadorDocumento = c.indicadorDocumento.trim();
  if (indicadorDocumento && !documentoValido(indicadorDocumento)) {
    return { erro: 'CPF ou CNPJ de quem indica é inválido.' };
  }

  let validoAte: Date | null = null;
  if (c.validoAte.trim()) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(c.validoAte.trim())) return { erro: 'Data de validade inválida.' };
    // Vale ate o fim do dia no horario de Joao Pessoa.
    validoAte = new Date(`${c.validoAte.trim()}T23:59:59-03:00`);
    if (Number.isNaN(validoAte.getTime())) return { erro: 'Data de validade inválida.' };
  }

  return {
    codigo,
    tipo: c.tipo,
    valor: new Prisma.Decimal(numero.toFixed(2)),
    indicadorNome,
    indicadorEmail,
    indicadorDocumento,
    indicadorTelefone: c.indicadorTelefone.trim(),
    primeiraCompra: c.primeiraCompra,
    validoAte,
    ativo: c.ativo,
    observacao: c.observacao.trim() || null,
  };
}

export type CupomAvaliavel = {
  ativo: boolean;
  validoAte: Date | null;
  primeiraCompra: boolean;
  indicadorEmail: string;
  indicadorDocumento: string;
};

export type Compradora = { email: string; documento: string };

export function motivoRecusa(
  c: CupomAvaliavel,
  cliente: Compradora,
  jaComprou: boolean,
  agora: Date = new Date()
): string | null {
  if (!c.ativo) return 'Este cupom não está mais ativo.';
  if (c.validoAte && c.validoAte.getTime() < agora.getTime()) return 'Este cupom venceu.';
  // O cupom e para quem foi indicada, nao para quem indicou.
  const mesmoEmail = Boolean(cliente.email && c.indicadorEmail && c.indicadorEmail === cliente.email);
  const mesmoDoc = Boolean(c.indicadorDocumento && mesmoDocumento(c.indicadorDocumento, cliente.documento));
  if (mesmoEmail || mesmoDoc) return 'Este cupom é para quem foi indicada, não para quem indicou.';
  if (c.primeiraCompra && jaComprou) return 'Este cupom vale só na primeira compra.';
  return null;
}

/* ============================================================
   Banco
   ============================================================ */

/** O documento e gravado com a mascara que a cliente digitou. */
function variantesDocumento(doc: string): string[] {
  const d = soDigitos(doc);
  const v = new Set([doc.trim(), d]);
  if (d.length === 11) v.add(`${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`);
  if (d.length === 14) {
    v.add(`${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`);
  }
  return [...v].filter(Boolean);
}

/**
 * Ja comprou = tem pedido que nao foi cancelado, com o mesmo e-mail ou CPF.
 * Pedido aguardando pagamento conta: senao a mesma pessoa abriria varios
 * pedidos com o cupom antes de pagar o primeiro.
 */
export async function jaComprou(cliente: Compradora): Promise<boolean> {
  const n = await prisma.pedido.count({
    where: {
      status: { not: 'CANCELADO' },
      OR: [{ email: cliente.email }, { documento: { in: variantesDocumento(cliente.documento) } }],
    },
  });
  return n > 0;
}

export type CupomAplicado = {
  id: string;
  codigo: string;
  desconto: Prisma.Decimal;
  descricao: string;
  primeiraCompra: boolean;
};

async function avaliar(
  codigoBruto: unknown,
  cliente: Compradora | null,
  subtotal: Prisma.Decimal
): Promise<CupomAplicado | { erro: string }> {
  const codigo = normalizarCodigo(codigoBruto);
  if (!codigo) return { erro: 'Informe o código do cupom.' };

  const cupom = await prisma.cupom.findUnique({ where: { codigo } });
  if (!cupom) return { erro: CUPOM_INEXISTENTE };

  const comprou = cliente && cupom.primeiraCompra ? await jaComprou(cliente) : false;
  const motivo = motivoRecusa(cupom, cliente ?? { email: '', documento: '' }, comprou);
  if (motivo) return { erro: motivo };

  return {
    id: cupom.id,
    codigo: cupom.codigo,
    desconto: calcularDesconto(cupom.tipo, cupom.valor, subtotal),
    descricao: descricaoDesconto(cupom.tipo, cupom.valor),
    primeiraCompra: cupom.primeiraCompra,
  };
}

/** No fechamento do pedido: confere tudo, inclusive se a cliente ja comprou. */
export function aplicarCupom(codigo: unknown, cliente: Compradora, subtotal: Prisma.Decimal) {
  return avaliar(codigo, cliente, subtotal);
}

/**
 * Previa para a tela, antes de a cliente preencher os dados. Confere se o
 * codigo existe e vale hoje; primeira compra so da para saber no fechamento.
 */
export function consultarCupom(codigo: unknown, subtotal: Prisma.Decimal) {
  return avaliar(codigo, null, subtotal);
}

export async function codigoLivre(nome: string): Promise<string> {
  for (let i = 0; i < 8; i++) {
    const c = sugerirCodigo(nome);
    const existe = await prisma.cupom.findUnique({ where: { codigo: c }, select: { id: true } });
    if (!existe) return c;
  }
  throw new Error('Não consegui gerar um código livre. Tente de novo.');
}
