import { describe, it, expect } from 'vitest';
import { ehCartao, normalizarCodigoMaquineta, quandoDaVenda, ROTULO_FORMA, FORMAS, DIAS_PARA_REGISTRAR_DEPOIS } from './pdv';

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

/**
 * Venda que aconteceu antes e so foi digitada depois. O dinheiro dela nao esta
 * na gaveta de hoje, entao ela fica fora do caixa de hoje — somar os dois e
 * como o fechamento deixa de bater (DECISOES #8).
 */
describe('quandoDaVenda', () => {
  const agora = new Date('2026-10-19T15:00:00');

  it('vazio e venda de agora, dentro do caixa', () => {
    const r = quandoDaVenda('', agora);
    expect(r).toEqual({ ok: true, quando: agora, registradaDepois: false });
    expect(quandoDaVenda(null, agora)).toEqual({ ok: true, quando: agora, registradaDepois: false });
  });

  it('hora de hoje continua no caixa de hoje', () => {
    const r = quandoDaVenda('2026-10-19T09:30', agora);
    expect(r.ok && r.registradaDepois).toBe(false);
    expect(r.ok && r.quando.getHours()).toBe(9);
  });

  it('venda de ontem fica fora do caixa de hoje', () => {
    const r = quandoDaVenda('2026-10-18T19:00', agora);
    expect(r.ok && r.registradaDepois).toBe(true);
  });

  it('a virada do dia conta: 23:59 de ontem esta fora, 00:00 de hoje esta dentro', () => {
    expect(quandoDaVenda('2026-10-18T23:59', agora)).toMatchObject({ registradaDepois: true });
    expect(quandoDaVenda('2026-10-19T00:00', agora)).toMatchObject({ registradaDepois: false });
  });

  it('recusa futuro, mas aceita um minuto de relogio adiantado', () => {
    expect(quandoDaVenda('2026-10-20T10:00', agora)).toEqual({
      ok: false,
      erro: 'A data da venda não pode estar no futuro.',
    });
    expect(quandoDaVenda('2026-10-19T15:00:30', agora).ok).toBe(true);
  });

  it(`recusa mais de ${DIAS_PARA_REGISTRAR_DEPOIS} dias atras: ali ja e digitacao errada`, () => {
    const r = quandoDaVenda('2026-01-02T10:00', agora);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.erro).toMatch(/últimos 90 dias/);
  });

  it('texto que nao e data vira erro, nao vira "agora" em silencio', () => {
    expect(quandoDaVenda('ontem', agora)).toEqual({ ok: false, erro: 'Data da venda inválida.' });
  });
});
