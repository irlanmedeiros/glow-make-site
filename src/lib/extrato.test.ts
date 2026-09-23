import { describe, it, expect } from 'vitest';
import { lerExtrato, lerDataHora, limparCodigo } from './extrato';

const csv = (texto: string) => new TextEncoder().encode(texto).buffer as ArrayBuffer;

describe('lerDataHora', () => {
  it('aceita dd/mm/aaaa com hora ao lado ou na mesma célula', () => {
    const a = lerDataHora('20/09/2026', '14:35');
    const b = lerDataHora('20/09/2026 14:35', '');
    expect(a).toBe(b);
    expect(new Date(a!).getHours()).toBe(14);
  });

  it('aceita aaaa-mm-dd e ano de dois dígitos', () => {
    expect(new Date(lerDataHora('2026-09-20', '08:00')!).getMonth()).toBe(8);
    expect(new Date(lerDataHora('20/09/26', '')!).getFullYear()).toBe(2026);
  });

  it('texto sem data vira nulo em vez de data inventada', () => {
    expect(lerDataHora('total do dia', '')).toBeNull();
    expect(lerDataHora('', '')).toBeNull();
  });
});

describe('limparCodigo', () => {
  it('tira pontuação e sobe para maiúscula', () => {
    expect(limparCodigo(' nsu 12-34 ')).toBe('NSU1234');
    expect(limparCodigo(null)).toBe('');
  });
});

describe('lerExtrato', () => {
  it('lê o extrato com cabeçalhos da PagBank e calcula a taxa que falta', async () => {
    const r = await lerExtrato(
      csv(
        'Data;Hora;Código da transação;Tipo;Bandeira;Valor bruto;Valor líquido;Status\n' +
          '20/09/2026;14:35;123456;Crédito;Visa;R$ 100,00;R$ 97,00;Aprovada\n'
      ),
      'extrato.csv'
    );
    expect(r.linhas).toHaveLength(1);
    const l = r.linhas[0];
    expect(l.codigo).toBe('123456');
    expect(l.bruto).toBe(100);
    expect(l.liquido).toBe(97);
    expect(l.taxa).toBe(3); // não veio no arquivo: sai de bruto − líquido
    expect(l.cancelada).toBe(false);
  });

  it('reconhece "NSU" e taxa negativa, como alguns relatórios exportam', async () => {
    const r = await lerExtrato(
      csv('Data;NSU;Valor;Taxa;Situação\n20/09/2026;987;50,00;-1,50;Aprovada\n'),
      'e.csv'
    );
    expect(r.linhas[0].codigo).toBe('987');
    expect(r.linhas[0].taxa).toBe(1.5);
  });

  it('marca cancelada e recusada, que não podem entrar na conferência', async () => {
    const r = await lerExtrato(
      csv('Data;Valor;Status\n20/09/2026;10,00;Cancelada\n20/09/2026;20,00;Recusada\n20/09/2026;30,00;Aprovada\n'),
      'e.csv'
    );
    expect(r.linhas.map((l) => l.cancelada)).toEqual([true, true, false]);
  });

  it('ignora linha de rodapé sem valor e sem código', async () => {
    const r = await lerExtrato(csv('Data;Valor;Status\n20/09/2026;10,00;Aprovada\nTotal do dia;;\n'), 'e.csv');
    expect(r.linhas).toHaveLength(1);
  });

  it('arquivo sem coluna de valor vira aviso, não lista vazia em silêncio', async () => {
    const r = await lerExtrato(csv('Coluna A;Coluna B\nx;y\n'), 'e.csv');
    expect(r.linhas).toHaveLength(0);
    expect(r.aviso).toMatch(/coluna de valor/i);
  });

  it('arquivo só com cabeçalho avisa que está vazio', async () => {
    const r = await lerExtrato(csv('Data;Valor\n'), 'e.csv');
    expect(r.aviso).toMatch(/vazio/i);
  });
});
