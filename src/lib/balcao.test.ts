import { describe, it, expect } from 'vitest';
import { combinaComBusca, produtosParaVender, type ProdutoDoBalcao } from './balcao';

/**
 * O balcão vende o que está na prateleira. Produto oculto no site continua
 * tendo caixa na loja — antes ele sumia daqui, e a vendedora tinha que abrir
 * outra página para pegar o código, com a cliente esperando.
 */

const base: ProdutoDoBalcao = { nome: 'Kit Puro Leite', sku: 'GM-PL', codigoBarras: '7891234567890', saldo: 5, ativo: true };
const p = (extra: Partial<ProdutoDoBalcao>): ProdutoDoBalcao => ({ ...base, ...extra });

describe('produtosParaVender', () => {
  it('produto oculto no site aparece no balcão', () => {
    const oculto = p({ nome: 'Kit Só Loja', ativo: false });
    expect(produtosParaVender([oculto], '')).toEqual([oculto]);
  });

  it('sem saldo fica de fora, publicado ou não', () => {
    expect(produtosParaVender([p({ saldo: 0 }), p({ saldo: 0, ativo: false })], '')).toEqual([]);
  });

  it('a busca acha o produto oculto por nome, SKU e código de barras', () => {
    const oculto = p({ nome: 'Dueto Puro Leite', sku: 'GM-DUO', codigoBarras: '7899999000111', ativo: false });
    for (const termo of ['dueto', 'GM-DUO', 'gm-duo', '7899999000111']) {
      expect(produtosParaVender([oculto], termo)).toHaveLength(1);
    }
  });

  it('busca sem acento acha nome com acento', () => {
    expect(combinaComBusca(p({ nome: 'Kit Obsessão' }), 'obsessao')).toBe(true);
    expect(combinaComBusca(p({ nome: 'Kit Obsessão' }), 'OBSESSÃO')).toBe(true);
  });

  it('busca em branco devolve tudo que tem saldo', () => {
    const lista = [p({}), p({ ativo: false }), p({ saldo: 0 })];
    expect(produtosParaVender(lista, '   ')).toHaveLength(2);
  });

  it('não inventa resultado: termo que não existe devolve lista vazia', () => {
    expect(produtosParaVender([p({})], 'perfume')).toEqual([]);
  });
});
