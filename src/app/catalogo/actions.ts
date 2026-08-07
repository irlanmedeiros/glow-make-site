'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { podeVerCatalogo, sessao } from '@/lib/auth';
import { baixarEstoque, devolverEstoque, EstoqueInsuficiente } from '@/lib/estoque';

/** `id` e `qtd` voltam preenchidos numa venda bem-sucedida: é com eles que a
 *  tela monta o "desfazer". Quem sabe o que foi baixado é o servidor — deixar
 *  a tela lembrar disso por conta própria já deu bug uma vez. */
export type Resultado = { ok?: string; erro?: string; id?: string; qtd?: number };

/**
 * Venda feita no balcão da loja.
 *
 * É isto que mantém o estoque "sempre atualizado": sem registrar a venda
 * física, o site continuaria oferecendo um kit que já saiu da prateleira, e
 * a primeira compra online daquele item viraria um pedido impossível de
 * entregar.
 *
 * Usa exatamente a mesma baixa do checkout do site — SQL condicional dentro
 * de transação — então a venda no balcão e a venda online disputam a última
 * unidade com a mesma trava. Não existe caminho "de dentro" mais frouxo.
 */
export async function registrarVendaLoja(
  _estado: Resultado | null,
  fd: FormData
): Promise<Resultado> {
  if (!(await podeVerCatalogo())) {
    return { erro: 'Sessão expirada. Entre novamente.' };
  }

  const id = String(fd.get('id') ?? '');
  const qtd = Number(fd.get('qtd') ?? 0);
  const quem = String(fd.get('vendedora') ?? '').trim().slice(0, 60);

  if (!id) return { erro: 'Produto não informado.' };
  if (!Number.isInteger(qtd) || qtd < 1 || qtd > 50) {
    return { erro: 'Quantidade inválida. Use um número de 1 a 50.' };
  }

  const papel = await sessao();
  const origem = quem
    ? `Venda na loja — ${quem}`
    : `Venda na loja (${papel === 'admin' ? 'admin' : 'equipe'})`;

  try {
    await prisma.$transaction(async (tx) => {
      await baixarEstoque(tx, [{ kitId: id, qtd }], origem);
    });
  } catch (e) {
    if (e instanceof EstoqueInsuficiente) return { erro: e.message };
    console.error('[catalogo] venda na loja falhou:', e);
    return { erro: 'Não consegui registrar a venda. Tente de novo.' };
  }

  const kit = await prisma.kit.findUnique({ where: { id } });
  revalidatePath('/');
  revalidatePath('/catalogo');

  return {
    ok: `${qtd}× ${kit?.nome ?? 'produto'} baixado. Restam ${
      kit ? kit.entradas - kit.saidas : 0
    }.`,
    id,
    qtd,
  };
}

/**
 * Desfaz uma baixa lançada por engano — devolve as unidades ao estoque.
 * Sem isso, um erro de digitação no balcão só teria conserto pelo admin,
 * e a vendedora simplesmente deixaria errado.
 */
export async function desfazerVendaLoja(
  _estado: Resultado | null,
  fd: FormData
): Promise<Resultado> {
  if (!(await podeVerCatalogo())) {
    return { erro: 'Sessão expirada. Entre novamente.' };
  }

  const id = String(fd.get('id') ?? '');
  const qtd = Number(fd.get('qtd') ?? 0);
  if (!id || !Number.isInteger(qtd) || qtd < 1 || qtd > 50) {
    return { erro: 'Não consegui identificar o lançamento.' };
  }

  const kit = await prisma.kit.findUnique({ where: { id } });
  if (!kit) return { erro: 'Produto não encontrado.' };

  // Não deixa a devolução criar estoque do nada: só dá para desfazer o que
  // realmente saiu.
  if (kit.saidas < qtd) {
    return { erro: 'Esse lançamento já foi corrigido.' };
  }

  await prisma.$transaction(async (tx) => {
    await devolverEstoque(tx, [{ kitId: id, qtd }], 'Correção de venda na loja');
  });

  revalidatePath('/');
  revalidatePath('/catalogo');
  return { ok: `Baixa desfeita. ${qtd}× ${kit.nome} voltou ao estoque.` };
}
