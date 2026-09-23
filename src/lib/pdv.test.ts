import { describe, it, expect } from 'vitest';
import { ehCartao, normalizarCodigoMaquineta, ROTULO_FORMA, FORMAS } from './pdv';

describe('comprovante da maquininha', () => {
  it('guarda só letras e números, em maiúsculas', () => {
    expect(normalizarCodigoMaquineta(' nsu 12-34/56 ')).toBe('NSU123456');
    expect(normalizarCodigoMaquineta('000123')).toBe('000123');
  });

  it('vazio, espaços e pontuação sozinha viram nulo, não string vazia', () => {
    for (const v of ['', '   ', '---', null, undefined]) {
      expect(normalizarCodigoMaquineta(v)).toBeNull();
    }
  });

  it('corta em 20 caracteres', () => {
    expect(normalizarCodigoMaquineta('1'.repeat(40))).toHaveLength(20);
  });
});

describe('ehCartao', () => {
  it('só débito e crédito passam pela maquininha', () => {
    expect(ehCartao('DEBITO')).toBe(true);
    expect(ehCartao('CREDITO')).toBe(true);
    expect(ehCartao('DINHEIRO')).toBe(false);
    expect(ehCartao('PIX')).toBe(false);
  });

  it('toda forma de pagamento tem rótulo', () => {
    for (const f of FORMAS) expect(ROTULO_FORMA[f]).toBeTruthy();
  });
});
