/**
 * Tipo de produto e piso de preco.
 *
 * Regra comercial da loja: produto vendido sozinho nao sai por menos de
 * R$ 50. Kit pode — e a graca do kit e justamente montar algo de R$ 35.
 *
 * O piso vale no CADASTRO, nao na venda: cupom de indicacao e desconto do
 * balcao continuam livres para derrubar o valor pago (decisao do dono).
 */

export type TipoProduto = 'KIT' | 'BOX' | 'INDIVIDUAL';

export const PRECO_MINIMO_INDIVIDUAL = 50;

/** A caixa da assinatura nao e escolhida no formulario: ela e unica. */
export const TIPOS_EDITAVEIS: TipoProduto[] = ['KIT', 'INDIVIDUAL'];

/** O que a vitrine do site vende. A BOX tem fluxo proprio, de assinatura. */
export const TIPOS_NA_VITRINE: TipoProduto[] = ['KIT', 'INDIVIDUAL'];

export const ROTULO_TIPO: Record<TipoProduto, string> = {
  KIT: 'Kit',
  INDIVIDUAL: 'Produto individual',
  BOX: 'Assinatura',
};

export function tipoValido(bruto: unknown): TipoProduto | null {
  return bruto === 'KIT' || bruto === 'BOX' || bruto === 'INDIVIDUAL' ? bruto : null;
}

/** Aceita "individual", "produto individual", "avulso", "kit". */
export function lerTipo(bruto: string): TipoProduto | null {
  const t = bruto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toLowerCase();
  if (!t) return null;
  if (t === 'kit' || t === 'kits') return 'KIT';
  if (t.includes('individual') || t === 'avulso' || t === 'unidade' || t === 'produto') return 'INDIVIDUAL';
  if (t === 'box' || t.includes('assinatura')) return 'BOX';
  return null;
}

export function precoMinimo(tipo: TipoProduto): number {
  return tipo === 'INDIVIDUAL' ? PRECO_MINIMO_INDIVIDUAL : 0;
}

/**
 * Mensagem de erro do preco, ou null se estiver bom. R$ 50,00 e permitido;
 * R$ 49,99 nao.
 */
export function erroDePreco(tipo: TipoProduto, preco: number | null): string | null {
  if (preco === null || !Number.isFinite(preco) || preco <= 0) {
    return 'Preço inválido. Use o formato 129,90.';
  }
  if (tipo === 'INDIVIDUAL' && preco < PRECO_MINIMO_INDIVIDUAL) {
    return `Produto individual não pode custar menos de R$ ${PRECO_MINIMO_INDIVIDUAL},00. Se for um conjunto, cadastre como kit.`;
  }
  return null;
}
