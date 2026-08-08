import 'server-only';
import { Prisma } from '@prisma/client';
import { prisma } from './prisma';

/**
 * Captura de quem começou a comprar e não terminou.
 *
 * O registro acontece no momento em que a pessoa digita um e-mail válido no
 * checkout — antes disso não há a quem escrever. Se ela concluir a compra, o
 * lead é marcado como convertido e sai da lista de remarketing; do contrário
 * fica lá com o que tinha no carrinho.
 *
 * O aceite de contato é gravado junto. Sem ele, o lead entra na base mas NÃO
 * pode receber WhatsApp nem e-mail de remarketing — a LGPD trata contato
 * publicitário sem consentimento como uso indevido, e a tela do admin respeita
 * isso escondendo o botão.
 */

export type ItemLead = { sku: string; nome: string; qtd: number; preco: number };

export async function registrarLead(dados: {
  email: string;
  nome?: string;
  telefone?: string;
  cep?: string;
  itens: ItemLead[];
  valorEstimado: number;
  queriaAssinar?: boolean;
  consentiuContato?: boolean;
  afiliadoCodigo?: string | null;
  etapa?: 'CARRINHO' | 'DADOS' | 'CONTRATO';
}) {
  const email = dados.email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return null;

  const comum = {
    nome: dados.nome?.trim().slice(0, 120) ?? '',
    telefone: dados.telefone?.trim().slice(0, 20) ?? '',
    cep: dados.cep?.trim().slice(0, 12) ?? '',
    itens: dados.itens as unknown as Prisma.InputJsonValue,
    valorEstimado: new Prisma.Decimal(dados.valorEstimado.toFixed(2)),
    queriaAssinar: dados.queriaAssinar ?? false,
    afiliadoCodigo: dados.afiliadoCodigo ?? null,
    etapa: dados.etapa ?? 'DADOS',
    ...(dados.consentiuContato
      ? { consentiuContato: true, consentidoEm: new Date() }
      : {}),
  };

  try {
    return await prisma.lead.upsert({
      where: { email },
      // Quem volta e desiste de novo atualiza o próprio registro em vez de
      // virar uma segunda linha na lista.
      update: comum,
      create: { email, ...comum },
    });
  } catch (e) {
    console.error('[lead] falha ao registrar', e);
    return null;
  }
}

/** Marca como convertido quando a compra sai. Some da fila de remarketing. */
export async function marcarConvertido(email: string) {
  try {
    await prisma.lead.updateMany({
      where: { email: email.trim().toLowerCase(), convertido: false },
      data: { convertido: true, convertidoEm: new Date() },
    });
  } catch (e) {
    console.error('[lead] falha ao marcar convertido', e);
  }
}
