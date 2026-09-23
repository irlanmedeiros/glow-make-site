import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { calcularFrete, melhorEnvioConfigurado, cotarMelhorEnvio, temMotoboy } from './frete';
import { SERVICO_MOTOBOY } from './entrega';

/**
 * Quem é atendido por motoboy é decidido por NOME DE CIDADE, não por faixa de
 * CEP (docs/DECISOES.md). Errar a comparação aqui significa mandar motoboy
 * para outro município ou negar a entrega rápida a quem mora ao lado da loja.
 */

describe('calcularFrete — não existe frete grátis na compra avulsa', () => {
  // Destino fora da área do motoboy: aqui se prova o frete cobrado.
  const viaCep = { cep: '50030-230', localidade: 'Recife', uf: 'PE' };

  function respostas(destino: unknown, cotacao: unknown | Error) {
    return vi.fn(async (url: string) => {
      if (String(url).includes('viacep')) {
        return { ok: true, json: async () => destino } as unknown as Response;
      }
      if (cotacao instanceof Error) throw cotacao;
      return { ok: true, json: async () => cotacao } as unknown as Response;
    });
  }

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.MELHOR_ENVIO_TOKEN;
  });

  const params = {
    cepDestino: '50030230',
    cepOrigem: '58056030',
    pesoKg: 0.7,
    valorSegurado: 100,
    freteReserva: 24.9,
  };

  it('cobra o que a transportadora cotou, sem opção grátis', async () => {
    process.env.MELHOR_ENVIO_TOKEN = 'tok';
    vi.stubGlobal(
      'fetch',
      respostas(viaCep, [{ id: 1, name: 'PAC', price: '40.16', delivery_time: 8, company: { name: 'Correios' } }])
    );
    const r = await calcularFrete(params);
    expect(r.destino?.cidade).toBe('Recife');
    expect(r.opcoes.map((o) => [o.servico, o.valor, o.gratis])).toEqual([['PAC', 40.16, false]]);
    expect(r.opcoes.some((o) => o.gratis)).toBe(false);
  });

  it('fora da região não aparece motoboy', async () => {
    process.env.MELHOR_ENVIO_TOKEN = 'tok';
    vi.stubGlobal(
      'fetch',
      respostas(viaCep, [{ id: 1, name: 'PAC', price: '40.16', delivery_time: 8, company: { name: 'Correios' } }])
    );
    const r = await calcularFrete(params);
    expect(r.opcoes.some((o) => o.combinar)).toBe(false);
  });

  it('sem cotação entra o frete padrão, nunca zero', async () => {
    process.env.MELHOR_ENVIO_TOKEN = 'tok';
    vi.stubGlobal('fetch', respostas(viaCep, new Error('Melhor Envio fora do ar')));
    const r = await calcularFrete(params);
    expect(r.opcoes).toEqual([
      { servico: 'Frete padrão', transportadora: 'Glow Make', valor: 24.9, prazoDias: null, gratis: false },
    ]);
    expect(r.aviso).toMatch(/frete padrão/i);
  });

  it('sem token também entra o frete padrão', async () => {
    vi.stubGlobal('fetch', respostas(viaCep, []));
    const r = await calcularFrete(params);
    expect(r.opcoes[0]?.valor).toBe(24.9);
  });

  it('nenhuma transportadora cotou: frete padrão', async () => {
    process.env.MELHOR_ENVIO_TOKEN = 'tok';
    vi.stubGlobal('fetch', respostas(viaCep, []));
    const r = await calcularFrete(params);
    expect(r.opcoes[0]?.servico).toBe('Frete padrão');
  });

  it('frete padrão zerado volta a ser "a combinar", sem opção de R$ 0', async () => {
    process.env.MELHOR_ENVIO_TOKEN = 'tok';
    vi.stubGlobal('fetch', respostas(viaCep, new Error('fora do ar')));
    const r = await calcularFrete({ ...params, freteReserva: 0 });
    expect(r.opcoes).toEqual([]);
    expect(r.aviso).toMatch(/combinar/i);
  });

  it('CEP inexistente não cota nem cobra', async () => {
    process.env.MELHOR_ENVIO_TOKEN = 'tok';
    vi.stubGlobal('fetch', respostas({ erro: true }, []));
    const r = await calcularFrete(params);
    expect(r.destino).toBeNull();
    expect(r.opcoes).toEqual([]);
    expect(r.aviso).toMatch(/CEP não encontrado/);
  });
});

describe('motoboy — João Pessoa e região', () => {
  function respostas(destino: unknown, cotacao: unknown | Error) {
    return vi.fn(async (url: string) => {
      if (String(url).includes('viacep')) {
        return { ok: true, json: async () => destino } as unknown as Response;
      }
      if (cotacao instanceof Error) throw cotacao;
      return { ok: true, json: async () => cotacao } as unknown as Response;
    });
  }

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.MELHOR_ENVIO_TOKEN;
  });

  const params = {
    cepDestino: '58056030',
    cepOrigem: '58056030',
    pesoKg: 0.7,
    valorSegurado: 100,
    freteReserva: 24.9,
  };

  it('atende as cidades combinadas e ninguém mais', () => {
    for (const cidade of ['João Pessoa', 'joao pessoa', 'BAYEUX', 'Santa Rita', 'Cabedelo']) {
      expect(temMotoboy({ cep: '58000000', cidade, uf: 'PB' })).toBe(true);
    }
    for (const fora of ['Recife', 'Campina Grande', 'Natal', 'Conde']) {
      expect(temMotoboy({ cep: '58000000', cidade: fora, uf: 'PB' })).toBe(false);
    }
    expect(temMotoboy(null)).toBe(false);
  });

  it('cidade homônima em outro estado não entra', () => {
    // Santa Rita existe em vários estados; o motoboy é o da Paraíba.
    expect(temMotoboy({ cep: '13650000', cidade: 'Santa Rita', uf: 'SP' })).toBe(false);
  });

  it('aparece primeiro, com valor a combinar e sem dizer que é grátis', async () => {
    process.env.MELHOR_ENVIO_TOKEN = 'tok';
    vi.stubGlobal(
      'fetch',
      respostas({ cep: '58056-030', localidade: 'João Pessoa', uf: 'PB' }, [
        { id: 1, name: 'SEDEX', price: '16.00', delivery_time: 2, company: { name: 'Correios' } },
      ])
    );
    const r = await calcularFrete(params);
    expect(r.opcoes[0]).toMatchObject({ servico: SERVICO_MOTOBOY, valor: 0, gratis: false, combinar: true });
    expect(r.opcoes[1]?.servico).toBe('SEDEX');
  });

  it('continua disponível quando a cotação falha — é entrega da própria loja', async () => {
    process.env.MELHOR_ENVIO_TOKEN = 'tok';
    vi.stubGlobal(
      'fetch',
      respostas({ cep: '58110-000', localidade: 'Bayeux', uf: 'PB' }, new Error('fora do ar'))
    );
    const r = await calcularFrete({ ...params, freteReserva: 0 });
    expect(r.opcoes.map((o) => o.servico)).toEqual([SERVICO_MOTOBOY]);
  });

  it('com frete padrão, motoboy vem antes dele', async () => {
    process.env.MELHOR_ENVIO_TOKEN = 'tok';
    vi.stubGlobal(
      'fetch',
      respostas({ cep: '58100-000', localidade: 'Cabedelo', uf: 'PB' }, new Error('fora do ar'))
    );
    const r = await calcularFrete(params);
    expect(r.opcoes.map((o) => o.servico)).toEqual([SERVICO_MOTOBOY, 'Frete padrão']);
  });
});

describe('melhorEnvioConfigurado', () => {
  const antes = process.env.MELHOR_ENVIO_TOKEN;
  afterEach(() => {
    if (antes === undefined) delete process.env.MELHOR_ENVIO_TOKEN;
    else process.env.MELHOR_ENVIO_TOKEN = antes;
  });

  it('é falso sem token e sem string vazia', () => {
    delete process.env.MELHOR_ENVIO_TOKEN;
    expect(melhorEnvioConfigurado()).toBe(false);
    process.env.MELHOR_ENVIO_TOKEN = '';
    expect(melhorEnvioConfigurado()).toBe(false);
  });

  it('é verdadeiro com token', () => {
    process.env.MELHOR_ENVIO_TOKEN = 'token-qualquer';
    expect(melhorEnvioConfigurado()).toBe(true);
  });
});

describe('cotarMelhorEnvio — pacote enviado à transportadora', () => {
  const antes = process.env.MELHOR_ENVIO_TOKEN;

  beforeEach(() => {
    process.env.MELHOR_ENVIO_TOKEN = 'token-de-teste';
  });
  afterEach(() => {
    vi.restoreAllMocks();
    if (antes === undefined) delete process.env.MELHOR_ENVIO_TOKEN;
    else process.env.MELHOR_ENVIO_TOKEN = antes;
  });

  function espionarFetch(resposta: unknown = []) {
    return vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(resposta), { status: 200, headers: { 'Content-Type': 'application/json' } })
    );
  }

  function corpoEnviado(spy: ReturnType<typeof espionarFetch>) {
    const init = spy.mock.calls[0][1] as RequestInit;
    return JSON.parse(String(init.body));
  }

  it('lança sem token, em vez de chamar a API sem credencial', async () => {
    delete process.env.MELHOR_ENVIO_TOKEN;
    await expect(
      cotarMelhorEnvio({ cepOrigem: '58013420', cepDestino: '01310100', pesoKg: 1, valorSegurado: 100 })
    ).rejects.toThrow('MELHOR_ENVIO_TOKEN');
  });

  it('manda as medidas da caixa vindas de Configurações', async () => {
    const spy = espionarFetch();
    await cotarMelhorEnvio({
      cepOrigem: '58013-420',
      cepDestino: '01310-100',
      pesoKg: 1.4,
      valorSegurado: 179.8,
      caixa: { alturaCm: 15, larguraCm: 22, comprimentoCm: 30 },
    });
    const corpo = corpoEnviado(spy);
    expect(corpo.package.height).toBe(15);
    expect(corpo.package.width).toBe(22);
    expect(corpo.package.length).toBe(30);
  });

  it('cai na caixa padrão quando Configurações não traz medidas', async () => {
    const spy = espionarFetch();
    await cotarMelhorEnvio({ cepOrigem: '58013420', cepDestino: '01310100', pesoKg: 1, valorSegurado: 100 });
    const corpo = corpoEnviado(spy);
    expect(corpo.package).toMatchObject({ height: 11, width: 20, length: 25 });
  });

  it('nunca manda dimensão menor que 1 cm — o Melhor Envio recusa', async () => {
    const spy = espionarFetch();
    await cotarMelhorEnvio({
      cepOrigem: '58013420',
      cepDestino: '01310100',
      pesoKg: 1,
      valorSegurado: 100,
      caixa: { alturaCm: 0, larguraCm: -5, comprimentoCm: 1 },
    });
    const corpo = corpoEnviado(spy);
    expect(corpo.package.height).toBe(1);
    expect(corpo.package.width).toBe(1);
    expect(corpo.package.length).toBe(1);
  });

  it('aplica peso mínimo de 0,3 kg', async () => {
    const spy = espionarFetch();
    await cotarMelhorEnvio({ cepOrigem: '58013420', cepDestino: '01310100', pesoKg: 0.05, valorSegurado: 100 });
    expect(corpoEnviado(spy).package.weight).toBe(0.3);
  });

  it('tira a máscara dos CEPs antes de enviar', async () => {
    const spy = espionarFetch();
    await cotarMelhorEnvio({ cepOrigem: '58013-420', cepDestino: '01310-100', pesoKg: 1, valorSegurado: 100 });
    const corpo = corpoEnviado(spy);
    expect(corpo.from.postal_code).toBe('58013420');
    expect(corpo.to.postal_code).toBe('01310100');
  });

  it('descarta serviço com erro ou sem preço e ordena do mais barato', async () => {
    espionarFetch([
      { id: 2, name: 'SEDEX', price: '48.20', delivery_time: 3, company: { name: 'Correios' } },
      { id: 1, name: 'PAC', price: '25.90', delivery_time: 8, company: { name: 'Correios' } },
      { id: 3, name: 'Sem cobertura', error: 'nao atende', price: null, delivery_time: null },
      { id: 4, name: 'Zerado', price: '0', delivery_time: 2 },
    ]);
    const opcoes = await cotarMelhorEnvio({
      cepOrigem: '58013420',
      cepDestino: '01310100',
      pesoKg: 1,
      valorSegurado: 100,
    });

    expect(opcoes.map((o) => o.servico)).toEqual(['PAC', 'SEDEX']);
    expect(opcoes[0].valor).toBe(25.9);
    expect(opcoes[0].transportadora).toBe('Correios');
    expect(opcoes.every((o) => o.gratis === false)).toBe(true);
  });

  it('propaga erro HTTP em vez de devolver lista vazia como se fosse sucesso', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 401 }));
    await expect(
      cotarMelhorEnvio({ cepOrigem: '58013420', cepDestino: '01310100', pesoKg: 1, valorSegurado: 100 })
    ).rejects.toThrow('401');
  });
});
