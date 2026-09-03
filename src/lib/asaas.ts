/**
 * Integração com o Asaas.
 *
 * Tudo aqui roda SÓ no servidor. A ASAAS_API_KEY nunca é importada por um
 * componente de cliente — se fosse, qualquer visitante leria a chave no
 * bundle e poderia emitir cobranças na conta da Glow Make.
 *
 * Sem a chave configurada, o site entra em MODO DEMO: pedidos e assinaturas
 * são gravados normalmente no banco (o estoque baixa de verdade), só não
 * existe cobrança nem link de pagamento. Serve para apresentar sem precisar
 * de conta no Asaas.
 */

import 'server-only';

const BASES = {
  sandbox: 'https://api-sandbox.asaas.com/v3',
  producao: 'https://api.asaas.com/v3',
} as const;

export function asaasConfigurado(): boolean {
  return Boolean(process.env.ASAAS_API_KEY);
}

function base(): string {
  return process.env.ASAAS_ENV === 'producao' ? BASES.producao : BASES.sandbox;
}

async function chamar<T>(caminho: string, init: RequestInit): Promise<T> {
  const chave = process.env.ASAAS_API_KEY;
  if (!chave) throw new Error('ASAAS_API_KEY não configurada.');

  const resposta = await fetch(`${base()}${caminho}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      access_token: chave,
      ...(init.headers ?? {}),
    },
    cache: 'no-store',
  });

  const corpo = await resposta.json().catch(() => null);

  if (!resposta.ok) {
    const detalhe =
      corpo?.errors?.map((e: { description: string }) => e.description).join('; ') ??
      `HTTP ${resposta.status}`;
    throw new Error(`Asaas: ${detalhe}`);
  }
  return corpo as T;
}

export type Cliente = {
  nome: string;
  email: string;
  documento: string;
  telefone: string;
  cep: string;
};

type AsaasCustomer = { id: string };

/** Reaproveita o cliente se o CPF/CNPJ já existir na conta, senão cria. */
export async function criarOuBuscarCliente(c: Cliente): Promise<string> {
  const doc = c.documento.replace(/\D/g, '');

  const existentes = await chamar<{ data: AsaasCustomer[] }>(
    `/customers?cpfCnpj=${encodeURIComponent(doc)}`,
    { method: 'GET' }
  );
  if (existentes.data?.length) return existentes.data[0].id;

  const novo = await chamar<AsaasCustomer>('/customers', {
    method: 'POST',
    body: JSON.stringify({
      name: c.nome,
      email: c.email,
      cpfCnpj: doc,
      mobilePhone: c.telefone.replace(/\D/g, ''),
      postalCode: c.cep.replace(/\D/g, ''),
    }),
  });
  return novo.id;
}

export type Cobranca = { id: string; invoiceUrl: string };

/** Cobrança avulsa — usada na compra de kits. */
export async function criarCobranca(params: {
  customerId: string;
  valor: number;
  descricao: string;
  formaPagamento: string;
  referenciaExterna: string;
}): Promise<Cobranca> {
  const vencimento = new Date();
  vencimento.setDate(vencimento.getDate() + 3);

  return chamar<Cobranca>('/payments', {
    method: 'POST',
    body: JSON.stringify({
      customer: params.customerId,
      billingType: params.formaPagamento || 'UNDEFINED',
      value: Number(params.valor.toFixed(2)),
      dueDate: vencimento.toISOString().slice(0, 10),
      description: params.descricao,
      externalReference: params.referenciaExterna,
    }),
  });
}

export type QrCodePix = { payload: string; imagemBase64: string; expiraEm: string | null };

/**
 * QR Code de uma cobrança PIX.
 *
 * O Asaas já devolve a imagem pronta em base64 — não precisa de biblioteca de
 * QR code no projeto. `payload` é o copia-e-cola, que em celular costuma ser
 * mais prático do que apontar a câmera para a própria tela.
 *
 * Devolve null em vez de lançar: a cobrança já existe e o pedido está
 * gravado. Perder o QR é contornável (o cliente ainda tem o link do Asaas);
 * derrubar a compra por causa disso não é.
 */
export async function buscarQrCodePix(pagamentoId: string): Promise<QrCodePix | null> {
  try {
    const r = await chamar<{ success?: boolean; payload?: string; encodedImage?: string; expirationDate?: string }>(
      `/payments/${pagamentoId}/pixQrCode`,
      { method: 'GET' }
    );
    if (!r.payload || !r.encodedImage) return null;
    return { payload: r.payload, imagemBase64: r.encodedImage, expiraEm: r.expirationDate ?? null };
  } catch (e) {
    console.error('[asaas] QR do PIX falhou:', e);
    return null;
  }
}

/** Status de uma cobrança, para a tela perguntar "já caiu?". */
export async function consultarPagamento(
  pagamentoId: string
): Promise<{ status: string; pago: boolean } | null> {
  try {
    const r = await chamar<{ status?: string }>(`/payments/${pagamentoId}`, { method: 'GET' });
    const status = r.status ?? 'UNKNOWN';
    // RECEIVED e CONFIRMED são os dois estados em que o dinheiro entrou.
    return { status, pago: status === 'RECEIVED' || status === 'CONFIRMED' };
  } catch (e) {
    console.error('[asaas] consulta de pagamento falhou:', e);
    return null;
  }
}

export type Assinatura = { id: string };

/** Assinatura mensal recorrente — usada na Glow Box. */
export async function criarAssinatura(params: {
  customerId: string;
  valor: number;
  descricao: string;
  formaPagamento: string;
  referenciaExterna: string;
}): Promise<{ id: string; invoiceUrl: string | null }> {
  const proximo = new Date();
  proximo.setDate(proximo.getDate() + 1);

  const assinatura = await chamar<Assinatura>('/subscriptions', {
    method: 'POST',
    body: JSON.stringify({
      customer: params.customerId,
      billingType: params.formaPagamento || 'UNDEFINED',
      value: Number(params.valor.toFixed(2)),
      nextDueDate: proximo.toISOString().slice(0, 10),
      cycle: 'MONTHLY',
      description: params.descricao,
      externalReference: params.referenciaExterna,
    }),
  });

  // A assinatura em si não traz link de pagamento; quem tem é a primeira
  // cobrança gerada por ela.
  const cobrancas = await chamar<{ data: { invoiceUrl: string }[] }>(
    `/subscriptions/${assinatura.id}/payments`,
    { method: 'GET' }
  ).catch(() => ({ data: [] as { invoiceUrl: string }[] }));

  return { id: assinatura.id, invoiceUrl: cobrancas.data?.[0]?.invoiceUrl ?? null };
}

export async function cancelarAssinatura(id: string): Promise<void> {
  await chamar(`/subscriptions/${id}`, { method: 'DELETE' });
}
