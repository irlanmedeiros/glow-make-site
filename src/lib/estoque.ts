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

    /* RETURNING devolve a linha JÁ atualizada na MESMA ida ao banco. Antes
       eram duas: o UPDATE e uma leitura logo depois para montar a
       movimentação. Numa transação que fala com um banco em sa-east-1, cada
       ida custa caro — no teste de carga com 30 compras simultâneas isso
       estourava o tempo da transação e metade dos checkouts voltava erro.

       A garantia continua idêntica, e até melhor: a checagem e a escrita
       seguem na MESMA instrução (`WHERE entradas - saidas >= qtd`), e agora o
       saldo que vai para o histórico é o de depois da escrita, lido
       atomicamente — não uma releitura que outra transação poderia ter mudado
       no meio. */
    const linhas = await tx.$queryRaw<{ sku: string; nome: string; saldo: number }[]>`
      UPDATE "Kit"
         SET "saidas" = "saidas" + ${item.qtd}
       WHERE "id" = ${item.kitId}
         AND "entradas" - "saidas" >= ${item.qtd}
      RETURNING "sku", "nome", "entradas" - "saidas" AS "saldo"
    `;

    if (linhas.length === 0) {
      const kit = await tx.kit.findUnique({ where: { id: item.kitId } });
      throw new EstoqueInsuficiente(kit?.nome ?? 'produto', kit ? kit.entradas - kit.saidas : 0);
    }

    const kit = linhas[0];
    await tx.movimentacao.create({
      data: {
        sku: kit.sku,
        nome: kit.nome,
        tipo: 'SAIDA',
        qtd: item.qtd,
        origem,
        // `saldo` vem do Postgres como inteiro; Number() protege de bigint.
        saldoApos: Number(kit.saldo),
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
