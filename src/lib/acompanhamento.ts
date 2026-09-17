import { documentoValido } from './validacao';

/**
 * Regras de "Meus pedidos" que nao dependem de banco.
 *
 * Ficam separadas do que grava (lib/cancelamento.ts) por dois motivos: a
 * pagina importa os tipos daqui sem arrastar Prisma para o navegador, e as
 * regras dao para testar sem banco.
 */

export function soDigitos(v: string): string {
  return v.replace(/\D/g, '');
}

/**
 * O documento e gravado do jeito que a cliente digitou, com ou sem pontos.
 * Comparar a string crua faria "123.456.789-09" nao achar "12345678909".
 */
export function mesmoDocumento(a: string, b: string): boolean {
  const x = soDigitos(a);
  return x.length >= 11 && x === soDigitos(b);
}

export type Credenciais = { email: string; documento: string };

/** Mesmo formato do checkout: e-mail em minusculas e CPF/CNPJ valido. */
export function validarCredenciais(bruto: unknown): Credenciais | { erro: string } {
  const c = (bruto ?? {}) as Record<string, unknown>;
  const email = typeof c.email === 'string' ? c.email.trim().toLowerCase().slice(0, 160) : '';
  const documento = typeof c.documento === 'string' ? c.documento.trim().slice(0, 20) : '';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
    return { erro: 'Informe o e-mail usado na compra.' };
  }
  if (!documentoValido(documento)) return { erro: 'Informe o CPF ou CNPJ usado na compra.' };
  return { email, documento };
}

/* ---------- pedido ---------- */

/** Etapas em ordem para a linha do tempo. Cancelado fica fora: e desvio, nao etapa. */
export const ETAPAS_PEDIDO = [
  'AGUARDANDO_PAGAMENTO',
  'PAGO',
  'EM_SEPARACAO',
  'ENVIADO',
  'ENTREGUE',
] as const;

export function etapaDoPedido(status: string): number {
  return ETAPAS_PEDIDO.indexOf(status as (typeof ETAPAS_PEDIDO)[number]);
}

/**
 * Ate sair para entrega a cliente pode PEDIR o cancelamento. Depois disso o
 * caminho e devolucao, que depende de o produto voltar: nao da para devolver
 * ao estoque uma caixa que ainda esta com a transportadora.
 */
export const STATUS_QUE_ACEITAM_CANCELAMENTO = ['AGUARDANDO_PAGAMENTO', 'PAGO', 'EM_SEPARACAO'];

export type SituacaoCancelamento =
  | { tipo: 'pode-solicitar' }
  | { tipo: 'pendente'; solicitadoEm: string }
  | { tipo: 'recusado'; resposta: string | null }
  | { tipo: 'cancelado' }
  | { tipo: 'ja-enviado' };

type CamposCancelamento = {
  status: string;
  cancelamentoSolicitadoEm: Date | string | null;
  cancelamentoRespondidoEm: Date | string | null;
  cancelamentoResposta: string | null;
};

export function situacaoCancelamento(p: CamposCancelamento): SituacaoCancelamento {
  if (p.status === 'CANCELADO') return { tipo: 'cancelado' };
  if (p.cancelamentoSolicitadoEm && !p.cancelamentoRespondidoEm) {
    return { tipo: 'pendente', solicitadoEm: new Date(p.cancelamentoSolicitadoEm).toISOString() };
  }
  // Respondido e o pedido segue de pe: foi recusado. O site nao abre uma nova
  // solicitacao, porque depois de um "nao" a conversa segue com uma pessoa.
  if (p.cancelamentoRespondidoEm) return { tipo: 'recusado', resposta: p.cancelamentoResposta };
  if (!STATUS_QUE_ACEITAM_CANCELAMENTO.includes(p.status)) return { tipo: 'ja-enviado' };
  return { tipo: 'pode-solicitar' };
}

/** Mesmo link que o admin usa em Entregas. Outra transportadora: so o codigo. */
export function linkRastreio(codigo: string | null, transportadora: string | null): string | null {
  if (!codigo) return null;
  if (transportadora && !/correio/i.test(transportadora)) return null;
  return `https://rastreamento.correios.com.br/app/index.php?objetos=${encodeURIComponent(codigo)}`;
}

/* ---------- assinatura ---------- */

export type EfeitoCancelamentoAssinatura = { podeCancelar: boolean; devolveCaixa: boolean };

/**
 * A caixa e reservada UMA vez, quando a pessoa assina. So volta ao estoque se
 * a assinatura nunca foi paga, e portanto a caixa nunca saiu.
 *
 * ATRASADA fica de fora de proposito: pode ser a primeira mensalidade vencida
 * (caixa ainda aqui) ou a quinta (caixa entregue meses atras), e o banco nao
 * distingue as duas. Devolver sem saber cria estoque que nao existe e deixa
 * vender o que nao ha; nao devolver so pede um ajuste manual.
 */
export function efeitoCancelamentoAssinatura(status: string): EfeitoCancelamentoAssinatura {
  if (status === 'CANCELADA') return { podeCancelar: false, devolveCaixa: false };
  return { podeCancelar: true, devolveCaixa: status === 'AGUARDANDO_PAGAMENTO' };
}

/**
 * Recorta a clausula de cancelamento do contrato ("4. CANCELAMENTO" ate a
 * proxima clausula numerada). O texto e livre e editado no admin: se o formato
 * nao bater, devolve null e a tela mostra o contrato inteiro em vez de adivinhar.
 */
export function trechoCancelamento(texto: string): string | null {
  const linhas = texto.split('\n');
  const inicio = linhas.findIndex((l) => /^\s*\d+[.)]\s*CANCELAMENTO\b/i.test(l));
  if (inicio < 0) return null;
  let fim = linhas.length;
  for (let i = inicio + 1; i < linhas.length; i++) {
    if (/^\s*\d+[.)]\s+\S/.test(linhas[i])) {
      fim = i;
      break;
    }
  }
  return linhas.slice(inicio, fim).join('\n').trim();
}

/** wa.me so com numero de verdade: o padrao do banco e "(00) 00000-0000". */
export function linkWhatsapp(numero: string): string | null {
  let d = soDigitos(numero);
  if (d.length < 10 || /^0+$/.test(d)) return null;
  if (!d.startsWith('55')) d = `55${d}`;
  return `https://wa.me/${d}`;
}

/* ---------- o que a pagina recebe ---------- */

/* Formato publico: so o que a cliente precisa ver. Endereco completo,
   telefone e documento ficam de fora, porque essa resposta sai numa rota
   aberta e basta errar a guarda uma vez para vazar. */
export type PedidoDaCliente = {
  id: string;
  numero: number;
  status: string;
  rotulo: string;
  criadoEm: string;
  itens: { nome: string; qtd: number; preco: number }[];
  subtotal: number;
  frete: number;
  total: number;
  desconto: number;
  cupomCodigo: string | null;
  freteServico: string | null;
  cidade: string;
  uf: string;
  transportadora: string | null;
  codigoRastreio: string | null;
  linkRastreio: string | null;
  separadoEm: string | null;
  enviadoEm: string | null;
  entregueEm: string | null;
  invoiceUrl: string | null;
  cancelamento: SituacaoCancelamento;
};

export type AssinaturaDaCliente = {
  id: string;
  status: string;
  rotulo: string;
  valor: number;
  criadoEm: string;
  canceladaEm: string | null;
  canceladaPor: string | null;
  contratoVersao: string | null;
  contratoAceitoEm: string | null;
  invoiceUrl: string | null;
  efeito: EfeitoCancelamentoAssinatura;
};

export type ResultadoConsulta = {
  pedidos: PedidoDaCliente[];
  assinaturas: AssinaturaDaCliente[];
};
