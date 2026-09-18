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

type RespostaMelhorEnvio = {
  id: number;
  name: string;
  price: string;
  delivery_time: number | null;
  company?: { name: string };
  error?: string;
}[];

export type Caixa = { alturaCm: number; larguraCm: number; comprimentoCm: number };

// Fallback só para o caso de a Config não trazer as medidas (banco antigo,
// coluna nula). O valor real vem de Configurações; ver model Config.
const CAIXA_PADRAO: Caixa = { alturaCm: 11, larguraCm: 20, comprimentoCm: 25 };

/** Cotação real no Melhor Envio. Lança se não estiver configurado. */
export async function cotarMelhorEnvio(params: {
  cepOrigem: string;
  cepDestino: string;
  pesoKg: number;
  valorSegurado: number;
  caixa?: Caixa;
}): Promise<OpcaoFrete[]> {
  const token = process.env.MELHOR_ENVIO_TOKEN;
  if (!token) throw new Error('MELHOR_ENVIO_TOKEN não configurado.');

  const caixa = params.caixa ?? CAIXA_PADRAO;
  const corpo = {
    from: { postal_code: soDigitos(params.cepOrigem) },
    to: { postal_code: soDigitos(params.cepDestino) },
    package: {
      // Medidas da embalagem, vindas de Configurações (model Config).
      // Guarda contra 0/negativo: o Melhor Envio recusa dimensão < 1 cm.
      height: Math.max(caixa.alturaCm, 1),
      width: Math.max(caixa.larguraCm, 1),
      length: Math.max(caixa.comprimentoCm, 1),
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
      'User-Agent': 'Glow Make (www.glowmake10.com)',
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
 *
 * NÃO existe frete grátis na compra avulsa, nem na cidade da loja: grátis é
 * benefício de quem assina a Glow Box, e a assinatura nem passa por aqui —
 * ela cobra só a mensalidade.
 *
 * Quando a cotação não vem (CEP sem cobertura, transportadora fora do ar,
 * token vencido), o pedido segue com o FRETE PADRÃO de Configurações em vez
 * de frete zero. Zero seria dar entrega de graça toda vez que um terceiro
 * falhasse — exatamente o que a regra nova quer evitar.
 */
export async function calcularFrete(params: {
  cepDestino: string;
  cepOrigem: string;
  pesoKg: number;
  valorSegurado: number;
  /** Valor fixo de reserva, de Configurações. Zero ou negativo = "a combinar". */
  freteReserva: number;
  caixa?: Caixa;
}): Promise<ResultadoFrete> {
  const destino = await consultarCep(params.cepDestino);

  if (!destino) {
    return { opcoes: [], destino: null, aviso: 'CEP não encontrado. Confira o número.' };
  }

  const comReserva = (motivo: string): ResultadoFrete => {
    if (!(params.freteReserva > 0)) {
      return {
        destino,
        opcoes: [],
        aviso: `${motivo} Vamos combinar o valor do frete com você antes de enviar.`,
      };
    }
    return {
      destino,
      aviso: `${motivo} Aplicamos o frete padrão da loja.`,
      opcoes: [
        {
          servico: 'Frete padrão',
          transportadora: 'Glow Make',
          valor: Number(params.freteReserva.toFixed(2)),
          prazoDias: null,
          gratis: false,
        },
      ],
    };
  };

  if (!melhorEnvioConfigurado()) {
    return comReserva('A cotação automática não está ligada.');
  }

  try {
    const opcoes = await cotarMelhorEnvio({
      cepOrigem: params.cepOrigem,
      cepDestino: destino.cep,
      pesoKg: params.pesoKg,
      valorSegurado: params.valorSegurado,
      caixa: params.caixa,
    });

    if (!opcoes.length) return comReserva('Nenhuma transportadora cotou para esse CEP.');
    return { destino, opcoes };
  } catch (e) {
    // Transportadora fora do ar não derruba a venda, mas também não vira
    // frete grátis: entra o frete padrão e o aviso fica registrado.
    console.error('[frete] cotação falhou:', e);
    return comReserva('Não consegui cotar o frete agora.');
  }
}
