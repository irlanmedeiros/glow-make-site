import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ehCidadeGratis, melhorEnvioConfigurado, cotarMelhorEnvio } from './frete';

/**
 * A regra de frete grátis é por NOME DE CIDADE, não por faixa de CEP
 * (docs/DECISOES.md). Errar a comparação aqui significa dar frete grátis para
 * outra cidade ou cobrar de quem mora ao lado da loja.
 */

const JP = { cep: '58013420', cidade: 'João Pessoa', uf: 'PB' };

describe('ehCidadeGratis', () => {
  it('reconhece a cidade-sede exatamente igual', () => {
    expect(ehCidadeGratis(JP, 'João Pessoa', 'PB')).toBe(true);
  });

  it('ignora acento — o ViaCEP nem sempre devolve igual ao que foi digitado', () => {
    expect(ehCidadeGratis({ ...JP, cidade: 'Joao Pessoa' }, 'João Pessoa', 'PB')).toBe(true);
    expect(ehCidadeGratis(JP, 'Joao Pessoa', 'PB')).toBe(true);
  });

  it('ignora caixa e espaço em volta', () => {
    expect(ehCidadeGratis({ ...JP, cidade: '  JOÃO PESSOA  ' }, 'João Pessoa', 'PB')).toBe(true);
    expect(ehCidadeGratis({ ...JP, cidade: 'joão pessoa' }, 'João Pessoa', 'PB')).toBe(true);
  });

  it('ignora caixa da UF', () => {
    expect(ehCidadeGratis({ ...JP, uf: 'pb' }, 'João Pessoa', 'PB')).toBe(true);
  });

  it('NÃO dá frete grátis para outra cidade', () => {
    expect(ehCidadeGratis({ cep: '01310100', cidade: 'São Paulo', uf: 'SP' }, 'João Pessoa', 'PB')).toBe(false);
    expect(ehCidadeGratis({ cep: '58400000', cidade: 'Campina Grande', uf: 'PB' }, 'João Pessoa', 'PB')).toBe(false);
  });

  it('NÃO dá frete grátis para cidade homônima em outro estado', () => {
    // A UF faz parte da comparação de propósito.
    expect(ehCidadeGratis({ cep: '00000000', cidade: 'João Pessoa', uf: 'SP' }, 'João Pessoa', 'PB')).toBe(false);
  });

  it('recusa destino nulo — CEP não encontrado não é frete grátis', () => {
    expect(ehCidadeGratis(null, 'João Pessoa', 'PB')).toBe(false);
  });

  it('não casa por prefixo', () => {
    expect(ehCidadeGratis({ ...JP, cidade: 'João Pessoa do Norte' }, 'João Pessoa', 'PB')).toBe(false);
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
