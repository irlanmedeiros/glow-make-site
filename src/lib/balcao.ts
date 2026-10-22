/**
 * Regras da vitrine do balcão, num módulo sem `server-only` para a tela e os
 * testes poderem usar.
 *
 * O balcão vende o que ESTÁ NA LOJA, não o que está publicado no site: um
 * produto oculto no site continua tendo caixa na prateleira. Antes ele não
 * aparecia aqui, e a vendedora precisava abrir outra página, copiar o código
 * e voltar — com a cliente esperando na frente.
 */

export type ProdutoDoBalcao = {
  nome: string;
  sku: string;
  codigoBarras?: string | null;
  saldo: number;
  ativo: boolean;
};

const semAcento = (t: string) =>
  t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Casa por nome, SKU ou código de barras, sem ligar para acento e caixa. */
export function combinaComBusca(produto: ProdutoDoBalcao, busca: string): boolean {
  const termo = semAcento(busca.trim());
  if (!termo) return true;
  return [produto.nome, produto.sku, produto.codigoBarras ?? '']
    .map(semAcento)
    .some((campo) => campo.includes(termo));
}

/**
 * O que entra na lista de venda. Sem saldo fica de fora: a baixa de estoque
 * barraria a venda de qualquer jeito, e oferecer o que não tem só atrapalha
 * quem está atendendo.
 */
export function produtosParaVender<T extends ProdutoDoBalcao>(produtos: T[], busca: string): T[] {
  return produtos.filter((p) => p.saldo > 0 && combinaComBusca(p, busca));
}
