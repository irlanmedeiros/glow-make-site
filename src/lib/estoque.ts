import { Prisma } from '@prisma/client';
import { prisma } from './prisma';

export type ItemBaixa = { kitId: string; qtd: number };

export class EstoqueInsuficiente extends Error {
  constructor(public nome: string, public disponivel: number) {
    super(`Estoque insuficiente para ${nome}. Disponível: ${disponivel}.`);
    this.name = 'EstoqueInsuficiente';
  }
}

/**
 * Dá baixa no estoque de vários kits de uma vez.
 *
 * O ponto delicado: se a gente lesse o saldo, conferisse em JavaScript e só
 * depois gravasse, dois pedidos simultâneos poderiam ler "resta 1" ao mesmo
 * tempo e ambos vender essa unidade. Por isso a checagem e a escrita acontecem
 * na MESMA instrução SQL — `WHERE entradas - saidas >= qtd`. Se o UPDATE não
 * afetar nenhuma linha, é porque o estoque acabou no meio do caminho, e a
 * transação inteira volta atrás.
 */
export async function baixarEstoque(
  tx: Prisma.TransactionClient,
  itens: ItemBaixa[],
  origem: string
) {
  for (const item of itens) {
    if (!Number.isInteger(item.qtd) || item.qtd < 1) {
      throw new Error('Quantidade inválida no pedido.');
    }

    const afetadas = await tx.$executeRaw`
      UPDATE "Kit"
         SET "saidas" = "saidas" + ${item.qtd}
       WHERE "id" = ${item.kitId}
         AND "entradas" - "saidas" >= ${item.qtd}
    `;

    if (afetadas === 0) {
      const kit = await tx.kit.findUnique({ where: { id: item.kitId } });
      throw new EstoqueInsuficiente(kit?.nome ?? 'produto', kit ? kit.entradas - kit.saidas : 0);
    }

    const kit = await tx.kit.findUniqueOrThrow({ where: { id: item.kitId } });
    await tx.movimentacao.create({
      data: {
        sku: kit.sku,
        nome: kit.nome,
        tipo: 'SAIDA',
        qtd: item.qtd,
        origem,
        saldoApos: kit.entradas - kit.saidas,
      },
    });
  }
}

/** Devolve unidades ao estoque — usado quando um pedido é cancelado. */
export async function devolverEstoque(
  tx: Prisma.TransactionClient,
  itens: ItemBaixa[],
  origem: string
) {
  for (const item of itens) {
    const kit = await tx.kit.update({
      where: { id: item.kitId },
      // Devolução abate as saídas em vez de inflar as entradas: assim o total
      // de "entradas" continua significando o que realmente entrou no estoque.
      data: { saidas: { decrement: item.qtd } },
    });
    await tx.movimentacao.create({
      data: {
        sku: kit.sku,
        nome: kit.nome,
        tipo: 'ENTRADA',
        qtd: item.qtd,
        origem,
        saldoApos: kit.entradas - kit.saidas,
      },
    });
  }
}

export function saldo(kit: { entradas: number; saidas: number }): number {
  return kit.entradas - kit.saidas;
}

export type StatusEstoque = { cls: 'ok' | 'low' | 'out'; texto: string; rotulo: string };

export function statusEstoque(n: number, limite = 10): StatusEstoque {
  if (n <= 0) return { cls: 'out', texto: 'Esgotado', rotulo: 'Esgotado' };
  if (n <= limite)
    return { cls: 'low', texto: `Últimas ${n} unidades`, rotulo: 'Estoque baixo' };
  return { cls: 'ok', texto: `${n} em estoque`, rotulo: 'Disponível' };
}
