'use server';

import { revalidatePath } from 'next/cache';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { ehAdmin } from '@/lib/auth';
import { lerExtrato } from '@/lib/extrato';
import { conferir, type Conferencia, type VendaParaConferir } from '@/lib/conciliacao';
import { ehCartao, type FormaPagamento } from '@/lib/pdv';

/**
 * Conferência em dois passos, pelo mesmo motivo da importação de planilha
 * (docs/DECISOES.md #12): primeiro MOSTRA o que casou com o quê, só depois
 * grava. Casamento por valor e horário é palpite fundamentado — gravar direto
 * carimbaria taxa e comprovante na venda errada sem ninguém ver.
 */

export type EstadoPreview = {
  conferencia?: Conferencia;
  colunas?: string[];
  periodo?: { de: string; ate: string };
  erro?: string;
  aviso?: string;
};
export type EstadoAplicar = { ok?: string; erro?: string };

const LIMITE_ARQUIVO = 4 * 1024 * 1024;

export async function analisarExtrato(
  _estado: EstadoPreview | null,
  fd: FormData
): Promise<EstadoPreview> {
  if (!(await ehAdmin())) return { erro: 'Sessão expirada. Entre novamente.' };

  const arquivo = fd.get('arquivo');
  if (!(arquivo instanceof File) || arquivo.size === 0) {
    return { erro: 'Escolha o arquivo do extrato (.csv, .xlsx ou .xls).' };
  }
  if (arquivo.size > LIMITE_ARQUIVO) return { erro: 'Arquivo muito grande. O limite é 4 MB.' };
  if (!/\.(xlsx|xls|csv)$/i.test(arquivo.name)) {
    return { erro: 'Formato não aceito. Use .csv, .xlsx ou .xls.' };
  }

  let leitura;
  try {
    leitura = await lerExtrato(await arquivo.arrayBuffer(), arquivo.name);
  } catch (e) {
    console.error('[conferencia] falha ao ler o extrato', e);
    return { erro: 'Não consegui abrir o arquivo. Confira se ele não está corrompido.' };
  }
  if (leitura.aviso) return { erro: leitura.aviso, colunas: leitura.colunasReconhecidas };
  if (!leitura.linhas.length) return { erro: 'Não encontrei nenhuma transação no arquivo.' };

  /* O período sai do próprio extrato: comparar o arquivo de um dia com as
     vendas do mês inteiro encheria a tela de sobras que não são sobras. */
  const datas = leitura.linhas.map((l) => l.quando).filter((d): d is string => Boolean(d));
  const de = datas.length ? new Date(Math.min(...datas.map((d) => +new Date(d)))) : null;
  const ate = datas.length ? new Date(Math.max(...datas.map((d) => +new Date(d)))) : null;
  if (de) de.setHours(0, 0, 0, 0);
  if (ate) ate.setHours(23, 59, 59, 999);

  const vendasDb = await prisma.vendaLoja.findMany({
    where: {
      cancelada: false,
      formaPagamento: { in: ['DEBITO', 'CREDITO'] },
      ...(de && ate ? { criadoEm: { gte: de, lte: ate } } : {}),
    },
    orderBy: { criadoEm: 'asc' },
  });

  const vendas: VendaParaConferir[] = vendasDb
    .filter((v) => ehCartao(v.formaPagamento as FormaPagamento))
    .map((v) => ({
      id: v.id,
      numero: v.numero,
      criadoEm: v.criadoEm.toISOString(),
      total: Number(v.total.toString()),
      codigoMaquineta: v.codigoMaquineta,
    }));

  return {
    conferencia: conferir(vendas, leitura.linhas),
    colunas: leitura.colunasReconhecidas,
    periodo: de && ate ? { de: de.toISOString(), ate: ate.toISOString() } : undefined,
    aviso: datas.length
      ? undefined
      : 'O arquivo não trouxe data em nenhuma linha, então comparei com todas as vendas no cartão. Confira os pares com atenção.',
  };
}

export async function aplicarConferencia(
  _estado: EstadoAplicar | null,
  fd: FormData
): Promise<EstadoAplicar> {
  if (!(await ehAdmin())) return { erro: 'Sessão expirada. Entre novamente.' };

  let conferencia: Conferencia;
  try {
    conferencia = JSON.parse(String(fd.get('conferencia') ?? ''));
  } catch {
    return { erro: 'Não consegui recuperar a conferência. Envie o extrato de novo.' };
  }

  let gravadas = 0;
  for (const par of conferencia.pares ?? []) {
    const { transacao, venda } = par;
    await prisma.vendaLoja.update({
      where: { id: venda.id },
      data: {
        conferidaEm: new Date(),
        // O comprovante da venda só é preenchido quando falta: o que a equipe
        // digitou no balcão vale mais que o palpite por valor e horário.
        ...(transacao.codigo && !venda.codigoMaquineta ? { codigoMaquineta: transacao.codigo } : {}),
        ...(transacao.taxa !== null ? { taxaMaquineta: new Prisma.Decimal(transacao.taxa.toFixed(2)) } : {}),
        ...(transacao.liquido !== null
          ? { liquidoMaquineta: new Prisma.Decimal(transacao.liquido.toFixed(2)) }
          : {}),
      },
    });
    gravadas += 1;
  }

  revalidatePath('/admin/vendas');
  revalidatePath('/admin/conferencia');
  return {
    ok: `${gravadas} venda(s) marcada(s) como conferida(s), com a taxa da maquininha registrada.`,
  };
}
