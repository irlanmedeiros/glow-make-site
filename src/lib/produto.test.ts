import { describe, it, expect } from 'vitest';
import {
  PRECO_MINIMO_INDIVIDUAL,
  erroDePreco,
  lerTipo,
  precoMinimo,
  tipoValido,
} from './produto';

describe('erroDePreco', () => {
  it('produto individual: R$ 50 passa, R$ 49,99 não', () => {
    expect(erroDePreco('INDIVIDUAL', PRECO_MINIMO_INDIVIDUAL)).toBeNull();
    expect(erroDePreco('INDIVIDUAL', 50.01)).toBeNull();
    expect(erroDePreco('INDIVIDUAL', 49.99)).toMatch(/não pode custar menos/);
    expect(erroDePreco('INDIVIDUAL', 35)).toMatch(/não pode custar menos/);
  });

  it('kit e box podem custar menos de R$ 50', () => {
    expect(erroDePreco('KIT', 35)).toBeNull();
    expect(erroDePreco('KIT', 45)).toBeNull();
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

describe('precoMinimo', () => {
  it('só o individual tem piso', () => {
    expect(precoMinimo('INDIVIDUAL')).toBe(50);
    expect(precoMinimo('KIT')).toBe(0);
    expect(precoMinimo('BOX')).toBe(0);
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
