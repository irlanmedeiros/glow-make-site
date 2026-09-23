/**
 * Tipo de produto e minimo de compra.
 *
 * Regra comercial da loja: a loja nao despacha uma compra de produtos avulsos
 * por menos de R$ 50 — o frete e a embalagem comem a venda. O minimo vale no
 * CARRINHO, nao no cadastro: a vitrine tem produto de R$ 20, ele so nao sai
 * sozinho. Carrinho com kit nao tem minimo, porque kit ja passa disso.
 *
 * O minimo olha o subtotal dos produtos, antes do cupom: o desconto da
 * indicacao pode derrubar o valor pago, e isso e de proposito (decisao do
 * dono). Venda no balcao nao passa por aqui — la a cliente leva na hora.
 */

export type TipoProduto = 'KIT' | 'BOX' | 'INDIVIDUAL';

export const MINIMO_CARRINHO_INDIVIDUAIS = 50;

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

/** Mensagem de erro do preco no cadastro, ou null se estiver bom. */
export function erroDePreco(_tipo: TipoProduto, preco: number | null): string | null {
  if (preco === null || !Number.isFinite(preco) || preco <= 0) {
    return 'Preço inválido. Use o formato 129,90.';
  }
  return null;
}

/**
 * O carrinho pode fechar? Recebe o que esta no carrinho e o subtotal.
 * Devolve a mensagem para a cliente, ou null quando esta liberado.
 */
export function erroDoCarrinho(
  itens: { tipo: TipoProduto; qtd: number }[],
  subtotal: number
): string | null {
  const comQtd = itens.filter((i) => i.qtd > 0);
  if (!comQtd.length) return 'Seu carrinho está vazio.';

  const soIndividuais = comQtd.every((i) => i.tipo === 'INDIVIDUAL');
  if (soIndividuais && subtotal < MINIMO_CARRINHO_INDIVIDUAIS) {
    const falta = MINIMO_CARRINHO_INDIVIDUAIS - subtotal;
    return `Compra só de produtos avulsos a partir de R$ ${MINIMO_CARRINHO_INDIVIDUAIS},00. Faltam ${falta.toFixed(2).replace('.', ',')} — ou junte um kit ao carrinho.`;
  }
  return null;
}
