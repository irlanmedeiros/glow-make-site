import { Prisma } from '@prisma/client';

/** Decimal do Prisma nunca deve virar float antes de formatar — vira string. */
export type Dinheiro = Prisma.Decimal | number | string;

export function num(v: Dinheiro): number {
  return typeof v === 'number' ? v : Number(v.toString());
}

export function real(v: Dinheiro): string {
  return num(v).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
  });
}

export function dataHora(d: Date | string): string {
  return new Date(d).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function data(d: Date | string): string {
  return new Date(d).toLocaleDateString('pt-BR');
}

export const ROTULO_PEDIDO: Record<string, string> = {
  AGUARDANDO_PAGAMENTO: 'Aguardando pagamento',
  PAGO: 'Pago',
  EM_SEPARACAO: 'Em separação',
  ENVIADO: 'Enviado',
  ENTREGUE: 'Entregue',
  CANCELADO: 'Cancelado',
};

export const ROTULO_ASSINANTE: Record<string, string> = {
  AGUARDANDO_PAGAMENTO: 'Aguardando pagamento',
  ATIVA: 'Ativa',
  ATRASADA: 'Atrasada',
  CANCELADA: 'Cancelada',
};

export const ROTULO_PAGAMENTO: Record<string, string> = {
  UNDEFINED: 'A escolher',
  PIX: 'PIX',
  BOLETO: 'Boleto',
  CREDIT_CARD: 'Cartão de crédito',
};

/** Cor da tarja de status, reaproveitando as classes .pill do CSS. */
export function corPedido(status: string): 'ok' | 'low' | 'out' | 'info' {
  if (status === 'ENTREGUE' || status === 'PAGO') return 'ok';
  if (status === 'CANCELADO') return 'out';
  if (status === 'AGUARDANDO_PAGAMENTO') return 'low';
  return 'info';
}

export function corAssinante(status: string): 'ok' | 'low' | 'out' | 'info' {
  if (status === 'ATIVA') return 'ok';
  if (status === 'ATRASADA') return 'low';
  if (status === 'CANCELADA') return 'out';
  return 'info';
}
