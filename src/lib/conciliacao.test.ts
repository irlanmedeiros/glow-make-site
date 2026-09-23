import { describe, it, expect } from 'vitest';
import { conferir, type VendaParaConferir } from './conciliacao';
import type { LinhaExtrato } from './extrato';

/**
 * O que esta conferência precisa acertar é o que dói na loja: transação sem
 * venda significa estoque que não baixou, e o site pode vender uma peça que
 * já saiu. Casar errado é pior que não casar — por isso a ordem das passadas.
 */

const DIA = '2026-09-20T';

function venda(n: number, hora: string, total: number, codigo: string | null = null): VendaParaConferir {
  return { id: `v${n}`, numero: n, criadoEm: `${DIA}${hora}:00.000Z`, total, codigoMaquineta: codigo };
}

function transacao(
  linha: number,
  hora: string | null,
  bruto: number,
  extra: Partial<LinhaExtrato> = {}
): LinhaExtrato {
  return {
    linha,
    quando: hora ? `${DIA}${hora}:00.000Z` : null,
    codigo: '',
    tipo: 'Crédito',
    bandeira: 'Visa',
    bruto,
    liquido: Number((bruto * 0.97).toFixed(2)),
    taxa: Number((bruto * 0.03).toFixed(2)),
    status: 'Aprovada',
    cancelada: false,
    ...extra,
  };
}

describe('conferir — casamento pelo comprovante', () => {
  it('comprovante manda, mesmo com horário distante e outra transação de mesmo valor', () => {
    const vendas = [venda(1, '14:00', 100, 'NSU123')];
    const linhas = [
      transacao(2, '09:00', 100), // mesmo valor, sem código
      transacao(3, '20:00', 100, { codigo: 'NSU123' }), // longe no tempo, mas é o comprovante
    ];
    const r = conferir(vendas, linhas);
    expect(r.pares).toHaveLength(1);
    expect(r.pares[0].como).toBe('comprovante');
    expect(r.pares[0].transacao.linha).toBe(3);
    expect(r.transacoesSemVenda.map((t) => t.linha)).toEqual([2]);
  });

  it('comprovante com pontuação diferente ainda casa', () => {
    const r = conferir([venda(1, '14:00', 50, 'nsu-12 34')], [transacao(2, '14:00', 50, { codigo: 'NSU1234' })]);
    expect(r.pares[0]?.como).toBe('comprovante');
  });
});

describe('conferir — casamento por valor e horário', () => {
  it('casa com a transação mais próxima no tempo', () => {
    const vendas = [venda(1, '14:00', 80)];
    const linhas = [transacao(2, '11:30', 80), transacao(3, '14:05', 80)];
    const r = conferir(vendas, linhas);
    expect(r.pares[0].transacao.linha).toBe(3);
    expect(r.pares[0].como).toBe('valor e horario');
    expect(r.pares[0].distanciaMin).toBe(5);
  });

  it('valor diferente não casa, nem por um centavo', () => {
    const r = conferir([venda(1, '14:00', 80)], [transacao(2, '14:00', 80.01)]);
    expect(r.pares).toHaveLength(0);
    expect(r.vendasSemTransacao).toHaveLength(1);
    expect(r.transacoesSemVenda).toHaveLength(1);
  });

  it('fora da tolerância de horário fica como sobra dos dois lados', () => {
    const r = conferir([venda(1, '09:00', 80)], [transacao(2, '14:00', 80)]);
    expect(r.pares).toHaveLength(0);
    expect(r.vendasSemTransacao).toHaveLength(1);
  });

  it('uma transação não casa com duas vendas', () => {
    const r = conferir([venda(1, '14:00', 60), venda(2, '14:02', 60)], [transacao(3, '14:01', 60)]);
    expect(r.pares).toHaveLength(1);
    expect(r.vendasSemTransacao).toHaveLength(1);
  });

  it('sem hora no arquivo, o valor sozinho ainda casa', () => {
    const r = conferir([venda(1, '14:00', 45)], [transacao(2, null, 45)]);
    expect(r.pares).toHaveLength(1);
    expect(r.pares[0].distanciaMin).toBeNull();
  });
});

describe('conferir — o que nunca pode acontecer', () => {
  it('transação cancelada não casa com venda boa de mesmo valor', () => {
    const r = conferir(
      [venda(1, '14:00', 100)],
      [transacao(2, '14:00', 100, { status: 'Cancelada', cancelada: true })]
    );
    expect(r.pares).toHaveLength(0);
    expect(r.canceladas).toHaveLength(1);
    expect(r.transacoesSemVenda).toHaveLength(0);
    expect(r.vendasSemTransacao).toHaveLength(1);
  });

  it('transação sem venda aparece: é o caso do estoque que não baixou', () => {
    const r = conferir([], [transacao(2, '14:00', 120)]);
    expect(r.transacoesSemVenda).toHaveLength(1);
    expect(r.pares).toHaveLength(0);
  });
});

describe('conferir — totais', () => {
  it('soma taxa e líquido só do que casou, e mostra a diferença', () => {
    const r = conferir(
      [venda(1, '14:00', 100, 'A1'), venda(2, '15:00', 50)],
      [
        transacao(2, '14:00', 100, { codigo: 'A1', liquido: 97, taxa: 3 }),
        transacao(3, '15:00', 50, { liquido: 48.5, taxa: 1.5 }),
        transacao(4, '16:00', 70), // não casa com nada: fica fora dos totais
      ]
    );
    expect(r.pares).toHaveLength(2);
    expect(r.totais.vendas).toBe(150);
    expect(r.totais.extratoBruto).toBe(150);
    expect(r.totais.extratoLiquido).toBe(145.5);
    expect(r.totais.taxa).toBe(4.5);
    expect(r.totais.diferenca).toBe(0);
  });
});
