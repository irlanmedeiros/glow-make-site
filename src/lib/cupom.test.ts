import { describe, it, expect } from 'vitest';
import { Prisma } from '@prisma/client';
import {
  calcularDesconto,
  descricaoDesconto,
  motivoRecusa,
  normalizarCodigo,
  sugerirCodigo,
  validarCupom,
} from './cupom';

const D = (v: string) => new Prisma.Decimal(v);

describe('normalizarCodigo', () => {
  it('aceita minusculas, espacos e lixo', () => {
    expect(normalizarCodigo('  ana-7k3qx ')).toBe('ANA-7K3QX');
    expect(normalizarCodigo('ana 7k3qx!')).toBe('ANA7K3QX');
    expect(normalizarCodigo(123)).toBe('');
  });
});

describe('calcularDesconto', () => {
  it('percentual sobre os produtos, arredondado ao centavo', () => {
    expect(calcularDesconto('PERCENTUAL', 10, D('80.00')).toFixed(2)).toBe('8.00');
    expect(calcularDesconto('PERCENTUAL', D('12.5'), D('39.90')).toFixed(2)).toBe('4.99');
  });

  it('valor fixo nunca passa dos produtos', () => {
    expect(calcularDesconto('VALOR', 15, D('40.00')).toFixed(2)).toBe('15.00');
    expect(calcularDesconto('VALOR', 60, D('40.00')).toFixed(2)).toBe('40.00');
  });

  it('zero ou negativo nao da desconto', () => {
    expect(calcularDesconto('VALOR', 0, D('40.00')).toFixed(2)).toBe('0.00');
    expect(calcularDesconto('PERCENTUAL', -5, D('40.00')).toFixed(2)).toBe('0.00');
  });
});

describe('descricaoDesconto', () => {
  it('escreve em portugues', () => {
    expect(descricaoDesconto('PERCENTUAL', D('12.50'))).toBe('12,5% de desconto nos produtos');
    expect(descricaoDesconto('VALOR', D('15'))).toMatch(/R\$\s?15,00 de desconto nos produtos/);
  });
});

describe('sugerirCodigo', () => {
  it('primeiro nome sem acento + 5 caracteres sem ambiguidade', () => {
    let i = 0;
    const seq = [0, 1, 2, 3, 4];
    expect(sugerirCodigo('Ágata de Souza', () => seq[i++])).toBe('AGATA-23456');
    expect(sugerirCodigo('', () => 0)).toBe('INDICA-22222');
    expect(sugerirCodigo('Maria')).toMatch(/^MARIA-[2-9A-HJKMNP-Z]{5}$/);
  });
});

describe('validarCupom', () => {
  const base = {
    codigo: '',
    tipo: 'PERCENTUAL',
    valor: '10',
    indicadorNome: 'Ana',
    indicadorEmail: '',
    indicadorDocumento: '',
    indicadorTelefone: '',
    primeiraCompra: true,
    validoAte: '',
    ativo: true,
    observacao: '',
  };

  it('aceita o minimo e deixa o codigo vazio para gerar', () => {
    const r = validarCupom(base);
    expect(r).not.toHaveProperty('erro');
    if (!('erro' in r)) {
      expect(r.codigo).toBe('');
      expect(r.valor.toFixed(2)).toBe('10.00');
      expect(r.validoAte).toBeNull();
    }
  });

  it('aceita valor com virgula e R$', () => {
    const r = validarCupom({ ...base, tipo: 'VALOR', valor: 'R$ 12,50' });
    expect('erro' in r ? r.erro : r.valor.toFixed(2)).toBe('12.50');
  });

  it('recusa entradas invalidas', () => {
    expect(validarCupom({ ...base, indicadorNome: ' ' })).toHaveProperty('erro');
    expect(validarCupom({ ...base, valor: '0' })).toHaveProperty('erro');
    expect(validarCupom({ ...base, valor: '101' })).toHaveProperty('erro');
    expect(validarCupom({ ...base, tipo: 'BRINDE' })).toHaveProperty('erro');
    expect(validarCupom({ ...base, codigo: 'AB' })).toHaveProperty('erro');
    expect(validarCupom({ ...base, indicadorEmail: 'ana@' })).toHaveProperty('erro');
    expect(validarCupom({ ...base, indicadorDocumento: '111.111.111-11' })).toHaveProperty('erro');
    expect(validarCupom({ ...base, validoAte: '31/12/2026' })).toHaveProperty('erro');
  });

  it('validade vale ate o fim do dia em Joao Pessoa', () => {
    const r = validarCupom({ ...base, validoAte: '2026-12-31' });
    expect('erro' in r ? null : r.validoAte?.toISOString()).toBe('2027-01-01T02:59:59.000Z');
  });
});

describe('motivoRecusa', () => {
  const cupom = {
    ativo: true,
    validoAte: null as Date | null,
    primeiraCompra: true,
    indicadorEmail: 'ana@exemplo.com',
    indicadorDocumento: '529.982.247-25',
  };
  const amiga = { email: 'bia@exemplo.com', documento: '111.444.777-35' };

  it('aceita a amiga na primeira compra', () => {
    expect(motivoRecusa(cupom, amiga, false)).toBeNull();
  });

  it('recusa inativo e vencido', () => {
    expect(motivoRecusa({ ...cupom, ativo: false }, amiga, false)).toMatch(/ativo/);
    const ontem = new Date(Date.now() - 86_400_000);
    expect(motivoRecusa({ ...cupom, validoAte: ontem }, amiga, false)).toMatch(/venceu/);
  });

  it('recusa quem indicou, por e-mail ou por CPF sem mascara', () => {
    expect(motivoRecusa(cupom, { email: 'ana@exemplo.com', documento: '111.444.777-35' }, false)).toMatch(/indicou/);
    expect(motivoRecusa(cupom, { email: 'outra@exemplo.com', documento: '52998224725' }, false)).toMatch(/indicou/);
  });

  it('recusa quem ja comprou so se o cupom for de primeira compra', () => {
    expect(motivoRecusa(cupom, amiga, true)).toMatch(/primeira compra/);
    expect(motivoRecusa({ ...cupom, primeiraCompra: false }, amiga, true)).toBeNull();
  });

  it('previa sem dados da cliente nao casa com indicadora sem e-mail', () => {
    expect(motivoRecusa({ ...cupom, indicadorEmail: '', indicadorDocumento: '' }, { email: '', documento: '' }, false)).toBeNull();
  });
});
