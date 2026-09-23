import { describe, it, expect } from 'vitest';
import {
  MINIMO_CARRINHO_INDIVIDUAIS,
  erroDePreco,
  erroDoCarrinho,
  lerTipo,
  tipoValido,
} from './produto';

describe('erroDePreco', () => {
  it('o cadastro aceita qualquer preço: a vitrine tem produto barato', () => {
    expect(erroDePreco('INDIVIDUAL', 19.9)).toBeNull();
    expect(erroDePreco('INDIVIDUAL', 50)).toBeNull();
    expect(erroDePreco('KIT', 35)).toBeNull();
    expect(erroDePreco('BOX', 39.9)).toBeNull();
  });

  it('preço zero, negativo ou ausente é sempre inválido', () => {
    for (const tipo of ['KIT', 'INDIVIDUAL', 'BOX'] as const) {
      expect(erroDePreco(tipo, 0)).toMatch(/Preço inválido/);
      expect(erroDePreco(tipo, -1)).toMatch(/Preço inválido/);
      expect(erroDePreco(tipo, null)).toMatch(/Preço inválido/);
      expect(erroDePreco(tipo, Number.NaN)).toMatch(/Preço inválido/);
    }
  });
});

describe('erroDoCarrinho', () => {
  const avulso = (qtd = 1) => ({ tipo: 'INDIVIDUAL' as const, qtd });

  it('só avulsos: R$ 50 fecha, R$ 49,99 não', () => {
    expect(erroDoCarrinho([avulso()], MINIMO_CARRINHO_INDIVIDUAIS)).toBeNull();
    expect(erroDoCarrinho([avulso()], 60)).toBeNull();
    expect(erroDoCarrinho([avulso()], 49.99)).toMatch(/a partir de R\$ 50/);
  });

  it('diz quanto falta', () => {
    expect(erroDoCarrinho([avulso()], 35)).toMatch(/Faltam 15,00/);
  });

  it('kit no carrinho tira o mínimo, mesmo somando pouco', () => {
    expect(erroDoCarrinho([{ tipo: 'KIT', qtd: 1 }], 35)).toBeNull();
    expect(erroDoCarrinho([{ tipo: 'KIT', qtd: 1 }, avulso()], 40)).toBeNull();
  });

  it('a assinatura não é barrada pelo mínimo', () => {
    expect(erroDoCarrinho([{ tipo: 'BOX', qtd: 1 }], 39.9)).toBeNull();
  });

  it('item com quantidade zero não conta como carrinho', () => {
    expect(erroDoCarrinho([avulso(0)], 0)).toMatch(/vazio/);
    expect(erroDoCarrinho([], 0)).toMatch(/vazio/);
  });
});

describe('tipoValido', () => {
  it('aceita só os três tipos', () => {
    expect(tipoValido('KIT')).toBe('KIT');
    expect(tipoValido('INDIVIDUAL')).toBe('INDIVIDUAL');
    expect(tipoValido('BOX')).toBe('BOX');
    expect(tipoValido('avulso')).toBeNull();
    expect(tipoValido(undefined)).toBeNull();
  });
});

describe('lerTipo (planilha)', () => {
  it('entende o que o lojista escreve', () => {
    expect(lerTipo('Kit')).toBe('KIT');
    expect(lerTipo('  KITS ')).toBe('KIT');
    expect(lerTipo('Produto individual')).toBe('INDIVIDUAL');
    expect(lerTipo('individual')).toBe('INDIVIDUAL');
    expect(lerTipo('avulso')).toBe('INDIVIDUAL');
    expect(lerTipo('Assinatura')).toBe('BOX');
  });

  it('em branco não muda nada; desconhecido é erro de quem preencheu', () => {
    expect(lerTipo('')).toBeNull();
    expect(lerTipo('   ')).toBeNull();
    expect(lerTipo('combo')).toBeNull();
  });
});
