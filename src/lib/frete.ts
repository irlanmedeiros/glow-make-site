import 'server-only';

/**
 * Cálculo de frete.
 *
 * Regra 1 — João Pessoa é grátis. A checagem é pela CIDADE que o ViaCEP
 * devolve, não por faixa de CEP. Faixa numérica parece mais simples até o dia
 * em que os Correios criam um CEP novo no meio, e aí você passa a dar frete
 * grátis para outra cidade ou a cobrar de quem mora ao lado da loja.
 *
 * Regra 2 — fora dali, o preço vem do Melhor Envio, que devolve o valor real
 * dos Correios e da Jadlog pelo peso e pela distância. Cobrar o preço real
 * evita os dois erros caros: cobrar de menos e bancar a diferença, ou cobrar
 * de mais e perder a venda no último passo.
 */

const VIACEP = 'https://viacep.com.br/ws';

const BASES = {
  sandbox: 'https://sandbox.melhorenvio.com.br/api/v2',
  producao: 'https://melhorenvio.com.br/api/v2',
} as const;

export type Endereco = { cep: string; cidade: string; uf: string };
export type OpcaoFrete = {
  servico: string;
  transportadora: string;
  valor: number;
  prazoDias: number | null;
  gratis: boolean;
};

export function melhorEnvioConfigurado(): boolean {
  return Boolean(process.env.MELHOR_ENVIO_TOKEN);
}

function baseMelhorEnvio(): string {
  return process.env.MELHOR_ENVIO_ENV === 'producao' ? BASES.producao : BASES.sandbox;
}

const soDigitos = (cep: string) => cep.replace(/\D/g, '');

/** Descobre cidade e UF de um CEP. Devolve null se o CEP não existir. */
export async function consultarCep(cep: string): Promise<Endereco | null> {
  const limpo = soDigitos(cep);
  if (limpo.length !== 8) return null;

  try {
    const r = await fetch(`${VIACEP}/${limpo}/json/`, {
      // Endereço de CEP praticamente não muda: cachear um dia poupa
      // chamada e ainda deixa o checkout mais rápido.
      next: { revalidate: 86400 },
    });
    if (!r.ok) return null;
    const d = await r.json();
    if (d.erro) return null;
    return { cep: limpo, cidade: d.localidade ?? '', uf: d.uf ?? '' };
  } catch {
    return null;
  }
}

export function ehCidadeGratis(
  destino: Endereco | null,
  cidadeGratis: string,
  ufGratis: string
): boolean {
  if (!destino) return false;
  const iguais = (a: string, b: string) =>
    a.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase() ===
    b.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
  return iguais(destino.cidade, cidadeGratis) && iguais(destino.uf, ufGratis);
}

type RespostaMelhorEnvio = {
  id: number;
  name: string;
  price: string;
  delivery_time: number | null;
  company?: { name: string };
  error?: string;
}[];

/** Cotação real no Melhor Envio. Lança se não estiver configurado. */
export async function cotarMelhorEnvio(params: {
  cepOrigem: string;
  cepDestino: string;
  pesoKg: number;
  valorSegurado: number;
}): Promise<OpcaoFrete[]> {
  const token = process.env.MELHOR_ENVIO_TOKEN;
  if (!token) throw new Error('MELHOR_ENVIO_TOKEN não configurado.');

  const corpo = {
    from: { postal_code: soDigitos(params.cepOrigem) },
    to: { postal_code: soDigitos(params.cepDestino) },
    package: {
      // Caixa padrão da Glow Box. Ajuste em Configurações se a embalagem mudar.
      height: 11,
      width: 20,
      length: 25,
      weight: Math.max(params.pesoKg, 0.3),
    },
    options: { insurance_value: params.valorSegurado, receipt: false, own_hand: false },
    services: '1,2,3,17', // PAC, SEDEX, Jadlog .Package e Mini Envios
  };

  const r = await fetch(`${baseMelhorEnvio()}/me/shipment/calculate`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      'User-Agent': 'Glow Make (contato@glowmake.com.br)',
    },
    body: JSON.stringify(corpo),
    cache: 'no-store',
  });

  if (!r.ok) throw new Error(`Melhor Envio respondeu ${r.status}`);

  const dados = (await r.json()) as RespostaMelhorEnvio;
  return dados
    .filter((o) => !o.error && o.price)
    .map((o) => ({
      servico: o.name,
      transportadora: o.company?.name ?? '',
      valor: Number(o.price),
      prazoDias: o.delivery_time,
      gratis: false,
    }))
    .filter((o) => Number.isFinite(o.valor) && o.valor > 0)
    .sort((a, b) => a.valor - b.valor);
}

export type ResultadoFrete = {
  opcoes: OpcaoFrete[];
  destino: Endereco | null;
  aviso?: string;
};

/**
 * Ponto único de cálculo — usado pelo checkout e pela API de cotação, para os
 * dois nunca discordarem sobre quanto custa entregar.
 */
export async function calcularFrete(params: {
  cepDestino: string;
  cepOrigem: string;
  pesoKg: number;
  valorSegurado: number;
  cidadeGratis: string;
  ufGratis: string;
}): Promise<ResultadoFrete> {
  const destino = await consultarCep(params.cepDestino);

  if (!destino) {
    return { opcoes: [], destino: null, aviso: 'CEP não encontrado. Confira o número.' };
  }

  if (ehCidadeGratis(destino, params.cidadeGratis, params.ufGratis)) {
    return {
      destino,
      opcoes: [
        {
          servico: `Entrega grátis em ${params.cidadeGratis}`,
          transportadora: 'Glow Make',
          valor: 0,
          prazoDias: 2,
          gratis: true,
        },
      ],
    };
  }

  if (!melhorEnvioConfigurado()) {
    return {
      destino,
      opcoes: [],
      aviso:
        'A cotação de frete ainda não está ligada. Vamos confirmar o valor com você antes de enviar.',
    };
  }

  try {
    const opcoes = await cotarMelhorEnvio({
      cepOrigem: params.cepOrigem,
      cepDestino: destino.cep,
      pesoKg: params.pesoKg,
      valorSegurado: params.valorSegurado,
    });

    if (!opcoes.length) {
      return { destino, opcoes: [], aviso: 'Nenhuma transportadora atende esse CEP no momento.' };
    }
    return { destino, opcoes };
  } catch (e) {
    // Transportadora fora do ar não pode derrubar a venda: o pedido segue e
    // alguém confirma o frete depois, com o aviso registrado.
    console.error('[frete] cotação falhou:', e);
    return {
      destino,
      opcoes: [],
      aviso: 'Não consegui cotar o frete agora. Vamos confirmar o valor com você antes de enviar.',
    };
  }
}
