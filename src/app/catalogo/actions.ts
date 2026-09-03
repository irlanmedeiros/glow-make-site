'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { podeVerCatalogo, sessao } from '@/lib/auth';
import { devolverEstoque } from '@/lib/estoque';
import {
  registrarVenda,
  cancelarVenda as cancelar,
  caixaAberto,
  resumoDoCaixa,
  confirmarPagamentoVenda,
  type FormaPagamento,
} from '@/lib/pdv';

export type QrPix = { payload: string; imagemBase64: string };

export type Resultado = {
  ok?: string;
  erro?: string;
  id?: string;
  qtd?: number;
  numero?: number;
  total?: number;
  pix?: QrPix | null;
  aviso?: string;
  pago?: boolean;
};

async function exigirSessao() {
  if (!(await podeVerCatalogo())) return false;
  return true;
}

/* ============================================================
   Venda no balcão
   ============================================================ */

/**
 * Fecha a venda do PDV.
 *
 * Recebe o carrinho montado na tela, mas recalcula tudo no servidor: preço,
 * subtotal e total. O que vem do navegador é só quais produtos e quantas
 * unidades.
 */
export async function fecharVenda(
  _estado: Resultado | null,
  fd: FormData
): Promise<Resultado> {
  if (!(await exigirSessao())) return { erro: 'Sessão expirada. Entre novamente.' };

  let itens: { kitId: string; qtd: number }[];
  try {
    itens = JSON.parse(String(fd.get('itens') ?? '[]'));
  } catch {
    return { erro: 'Não consegui ler os itens da venda.' };
  }
  if (!Array.isArray(itens) || !itens.length) return { erro: 'Adicione pelo menos um produto.' };

  const desconto = Number(String(fd.get('desconto') ?? '0').replace(',', '.')) || 0;

  const r = await registrarVenda({
    itens,
    vendedora: String(fd.get('vendedora') ?? ''),
    formaPagamento: String(fd.get('formaPagamento') ?? 'DINHEIRO') as FormaPagamento,
    desconto,
    observacao: String(fd.get('observacao') ?? ''),
    // A tela pede o QR marcando este campo. Sem ele o PIX continua sendo só
    // rótulo, cobrado pela chave da loja como sempre foi.
    gerarQrPix: fd.get('gerarQrPix') === 'sim',
  });

  if (!r.ok) return { erro: r.erro };

  revalidatePath('/');
  revalidatePath('/catalogo');
  revalidatePath('/admin');

  const valor = r.total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  return {
    ok: r.pix
      ? `Venda #${r.numero} — ${valor}. Mostre o QR para a cliente.`
      : `Venda #${r.numero} registrada — ${valor}.`,
    numero: r.numero,
    id: r.id,
    total: r.total,
    pix: r.pix ?? null,
    aviso: r.aviso,
  };
}

/** "A cliente já pagou?" — a tela do balcão pergunta enquanto o QR está aberto. */
export async function conferirPagamentoVenda(
  _estado: Resultado | null,
  fd: FormData
): Promise<Resultado> {
  if (!(await exigirSessao())) return { erro: 'Sessão expirada. Entre novamente.' };

  const id = String(fd.get('id') ?? '');
  if (!id) return { erro: 'Venda não informada.' };

  const r = await confirmarPagamentoVenda(id);
  if (r.erro) return { erro: r.erro };
  if (!r.pago) return { pago: false };

  revalidatePath('/catalogo');
  revalidatePath('/admin');
  return { ok: 'Pagamento confirmado.', pago: true };
}

export async function cancelarVendaLoja(
  _estado: Resultado | null,
  fd: FormData
): Promise<Resultado> {
  if (!(await exigirSessao())) return { erro: 'Sessão expirada. Entre novamente.' };

  const r = await cancelar(String(fd.get('id') ?? ''), String(fd.get('motivo') ?? ''));
  if (!r.ok) return { erro: r.erro ?? 'Não consegui cancelar.' };

  revalidatePath('/');
  revalidatePath('/catalogo');
  revalidatePath('/admin');
  return { ok: 'Venda cancelada e estoque devolvido.' };
}

/* ============================================================
   Caixa
   ============================================================ */

export async function abrirCaixa(_estado: Resultado | null, fd: FormData): Promise<Resultado> {
  if (!(await exigirSessao())) return { erro: 'Sessão expirada. Entre novamente.' };

  if (await caixaAberto()) return { erro: 'Já existe um caixa aberto.' };

  const troco = Number(String(fd.get('trocoInicial') ?? '0').replace(',', '.')) || 0;
  if (troco < 0) return { erro: 'O troco inicial não pode ser negativo.' };

  await prisma.caixa.create({
    data: {
      abertoPor: String(fd.get('abertoPor') ?? '').trim().slice(0, 60) || 'Não informado',
      trocoInicial: troco.toFixed(2),
    },
  });

  revalidatePath('/catalogo');
  return { ok: 'Caixa aberto. Boas vendas.' };
}

export async function fecharCaixa(_estado: Resultado | null, fd: FormData): Promise<Resultado> {
  if (!(await exigirSessao())) return { erro: 'Sessão expirada. Entre novamente.' };

  const caixa = await caixaAberto();
  if (!caixa) return { erro: 'Não há caixa aberto.' };

  const contado = Number(String(fd.get('contadoDinheiro') ?? '0').replace(',', '.')) || 0;
  const resumo = await resumoDoCaixa(caixa.id);
  const diferenca = contado - resumo.esperadoNaGaveta;

  await prisma.caixa.update({
    where: { id: caixa.id },
    data: {
      fechadoEm: new Date(),
      fechadoPor: String(fd.get('fechadoPor') ?? '').trim().slice(0, 60) || 'Não informado',
      contadoDinheiro: contado.toFixed(2),
      observacao: String(fd.get('observacao') ?? '').trim().slice(0, 300) || null,
    },
  });

  revalidatePath('/catalogo');
  revalidatePath('/admin');

  const real = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  // A diferença é dita em voz alta em vez de escondida: caixa que fecha
  // "sempre certo" é caixa que ninguém confere.
  if (Math.abs(diferenca) < 0.01) {
    return { ok: `Caixa fechado, bateu certinho. Vendas do dia: ${real(resumo.totalVendas)}.` };
  }
  return {
    ok: `Caixa fechado. Vendas: ${real(resumo.totalVendas)}. Diferença na gaveta: ${
      diferenca > 0 ? 'sobra' : 'falta'
    } de ${real(Math.abs(diferenca))}.`,
  };
}

/* ============================================================
   Ajuste de estoque sem venda — quebra, perda, devolução
   ============================================================ */

/**
 * Existe separado da venda de propósito. Antes havia só um botão de "dar
 * baixa", e quebra virava venda no relatório. Agora perda é perda e não
 * infla faturamento nenhum.
 */
export async function registrarPerda(
  _estado: Resultado | null,
  fd: FormData
): Promise<Resultado> {
  if (!(await exigirSessao())) return { erro: 'Sessão expirada. Entre novamente.' };

  const id = String(fd.get('id') ?? '');
  const qtd = Number(fd.get('qtd') ?? 0);
  const motivo = String(fd.get('motivo') ?? '').trim().slice(0, 120);

  if (!id) return { erro: 'Produto não informado.' };
  if (!Number.isInteger(qtd) || qtd < 1 || qtd > 50) return { erro: 'Quantidade inválida.' };
  if (!motivo) return { erro: 'Diga o motivo da baixa (quebra, perda, brinde...).' };

  const papel = await sessao();
  const kit = await prisma.kit.findUnique({ where: { id } });
  if (!kit) return { erro: 'Produto não encontrado.' };
  if (kit.entradas - kit.saidas < qtd) {
    return { erro: `Só há ${kit.entradas - kit.saidas} em estoque.` };
  }

  await prisma.$transaction(async (tx) => {
    const atualizado = await tx.kit.update({
      where: { id },
      data: { saidas: { increment: qtd } },
    });
    await tx.movimentacao.create({
      data: {
        sku: atualizado.sku,
        nome: atualizado.nome,
        tipo: 'SAIDA',
        qtd,
        origem: `Baixa sem venda (${motivo}) — ${papel === 'admin' ? 'admin' : 'equipe'}`,
        saldoApos: atualizado.entradas - atualizado.saidas,
      },
    });
  });

  revalidatePath('/');
  revalidatePath('/catalogo');
  return { ok: `${qtd}× ${kit.nome} baixado por ${motivo}.` };
}

/** Devolve ao estoque uma baixa lançada por engano. */
export async function desfazerPerda(
  _estado: Resultado | null,
  fd: FormData
): Promise<Resultado> {
  if (!(await exigirSessao())) return { erro: 'Sessão expirada. Entre novamente.' };

  const id = String(fd.get('id') ?? '');
  const qtd = Number(fd.get('qtd') ?? 0);
  if (!id || !Number.isInteger(qtd) || qtd < 1) return { erro: 'Lançamento não identificado.' };

  const kit = await prisma.kit.findUnique({ where: { id } });
  if (!kit) return { erro: 'Produto não encontrado.' };
  if (kit.saidas < qtd) return { erro: 'Esse lançamento já foi corrigido.' };

  await prisma.$transaction(async (tx) => {
    await devolverEstoque(tx, [{ kitId: id, qtd }], 'Correção de baixa lançada por engano');
  });

  revalidatePath('/');
  revalidatePath('/catalogo');
  return { ok: `Baixa desfeita. ${qtd}× ${kit.nome} voltou ao estoque.` };
}
