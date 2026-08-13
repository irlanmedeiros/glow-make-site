'use server';

import { revalidatePath } from 'next/cache';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { ehAdmin } from '@/lib/auth';
import { lerPlanilha, type LinhaPlanilha } from '@/lib/planilha';

/**
 * Importação em dois passos: primeiro a gente MOSTRA o que vai acontecer,
 * só depois aplica.
 *
 * Importação de planilha que grava direto é como se perde catálogo: basta
 * uma coluna trocada para todos os preços virarem outra coisa, sem ninguém
 * ver antes. O passo de conferência existe para isso.
 */

export type Plano = {
  criar: LinhaPlanilha[];
  atualizar: (LinhaPlanilha & { antes: Resumo })[];
  comErro: LinhaPlanilha[];
  intocados: Resumo[];
  colunas: string[];
  aviso?: string;
};

type Resumo = { sku: string; nome: string; preco: number; saldo: number; ativo: boolean };

export type EstadoPreview = { plano?: Plano; erro?: string };
export type EstadoAplicar = { ok?: string; erro?: string; detalhe?: string[] };

const LIMITE_ARQUIVO = 4 * 1024 * 1024; // 4 MB

export async function analisarPlanilha(
  _estado: EstadoPreview | null,
  fd: FormData
): Promise<EstadoPreview> {
  if (!(await ehAdmin())) return { erro: 'Sessão expirada. Entre novamente.' };

  const arquivo = fd.get('arquivo');
  if (!(arquivo instanceof File) || arquivo.size === 0) {
    return { erro: 'Escolha um arquivo .xlsx, .xls ou .csv.' };
  }
  if (arquivo.size > LIMITE_ARQUIVO) {
    return { erro: 'Arquivo muito grande. O limite é 4 MB.' };
  }
  if (!/\.(xlsx|xls|csv)$/i.test(arquivo.name)) {
    return { erro: 'Formato não aceito. Use .xlsx, .xls ou .csv.' };
  }

  let leitura;
  try {
    leitura = await lerPlanilha(await arquivo.arrayBuffer(), arquivo.name);
  } catch (e) {
    console.error('[importar] falha ao ler', e);
    return { erro: 'Não consegui abrir a planilha. Confira se o arquivo não está corrompido.' };
  }

  if (leitura.aviso) return { erro: leitura.aviso };
  if (!leitura.linhas.length) return { erro: 'Não encontrei nenhum produto na planilha.' };

  const existentes = await prisma.kit.findMany();
  const porSku = new Map(existentes.map((k) => [k.sku, k]));

  const plano: Plano = {
    criar: [],
    atualizar: [],
    comErro: [],
    intocados: [],
    colunas: leitura.colunasReconhecidas,
  };

  for (const l of leitura.linhas) {
    if (l.erros.length) {
      plano.comErro.push(l);
      continue;
    }
    const atual = porSku.get(l.sku);
    if (atual) {
      plano.atualizar.push({
        ...l,
        antes: {
          sku: atual.sku,
          nome: atual.nome,
          preco: Number(atual.preco.toString()),
          saldo: atual.entradas - atual.saidas,
          ativo: atual.ativo,
        },
      });
    } else {
      if (!l.preco) l.erros.push('produto novo precisa de preço');
      if (l.erros.length) plano.comErro.push(l);
      else plano.criar.push(l);
    }
  }

  // Produtos que existem no site mas não vieram na planilha. Nunca apagamos —
  // só avisamos, porque apagar catálogo por omissão seria destrutivo demais.
  const skusDaPlanilha = new Set(leitura.linhas.map((l) => l.sku));
  plano.intocados = existentes
    .filter((k) => !skusDaPlanilha.has(k.sku))
    .map((k) => ({
      sku: k.sku,
      nome: k.nome,
      preco: Number(k.preco.toString()),
      saldo: k.entradas - k.saidas,
      ativo: k.ativo,
    }));

  return { plano };
}

function slugificar(s: string) {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export async function aplicarPlanilha(
  _estado: EstadoAplicar | null,
  fd: FormData
): Promise<EstadoAplicar> {
  if (!(await ehAdmin())) return { erro: 'Sessão expirada. Entre novamente.' };

  let plano: Plano;
  try {
    plano = JSON.parse(String(fd.get('plano') ?? ''));
  } catch {
    return { erro: 'Não consegui recuperar a conferência. Envie a planilha de novo.' };
  }

  const detalhe: string[] = [];
  let criados = 0;
  let atualizados = 0;
  let ajustes = 0;

  try {
    for (const l of plano.criar) {
      const criado = await prisma.kit.create({
        data: {
          sku: l.sku,
          nome: l.nome,
          slug: slugificar(l.nome) || l.sku.toLowerCase(),
          descricao: l.descricao,
          itens: l.itens,
          preco: new Prisma.Decimal((l.preco ?? 0).toFixed(2)),
          imagem: l.imagem || '/assets/kits/kit-1.jpg',
          estoqueBaixo: l.estoqueBaixo ?? 10,
          ordem: l.ordem ?? 0,
          ativo: l.ativo ?? true,
          codigoBarras: l.codigoBarras || null,
          entradas: l.estoque ?? 0,
        },
      });
      criados++;
      if (l.estoque) {
        await prisma.movimentacao.create({
          data: {
            sku: criado.sku,
            nome: criado.nome,
            tipo: 'ENTRADA',
            qtd: l.estoque,
            origem: 'Importação de planilha',
            saldoApos: l.estoque,
          },
        });
      }
      detalhe.push(`Criado ${l.sku} — ${l.nome}`);
    }

    for (const l of plano.atualizar) {
      const atual = await prisma.kit.findUnique({ where: { sku: l.sku } });
      if (!atual) continue;

      // Campo em branco na planilha significa "não mexe", não "apaga".
      const dados: Prisma.KitUpdateInput = { nome: l.nome };
      if (l.descricao) dados.descricao = l.descricao;
      if (l.itens.length) dados.itens = l.itens;
      if (l.preco !== null) dados.preco = new Prisma.Decimal(l.preco.toFixed(2));
      if (l.imagem) dados.imagem = l.imagem;
      if (l.estoqueBaixo !== null) dados.estoqueBaixo = l.estoqueBaixo;
      if (l.ordem !== null) dados.ordem = l.ordem;
      if (l.ativo !== null) dados.ativo = l.ativo;
      if (l.codigoBarras) dados.codigoBarras = l.codigoBarras;

      await prisma.kit.update({ where: { sku: l.sku }, data: dados });
      atualizados++;

      // Estoque não é sobrescrito: vira um AJUSTE, com a diferença registrada
      // no histórico. Assim nada muda de saldo sem deixar rastro.
      if (l.estoque !== null) {
        const saldoAtual = atual.entradas - atual.saidas;
        if (l.estoque !== saldoAtual) {
          const atualizado = await prisma.kit.update({
            where: { sku: l.sku },
            data: { entradas: atual.entradas + (l.estoque - saldoAtual) },
          });
          await prisma.movimentacao.create({
            data: {
              sku: atualizado.sku,
              nome: atualizado.nome,
              tipo: 'AJUSTE',
              qtd: Math.abs(l.estoque - saldoAtual),
              origem: `Importação de planilha: ${saldoAtual} para ${l.estoque}`,
              saldoApos: atualizado.entradas - atualizado.saidas,
            },
          });
          ajustes++;
          detalhe.push(`${l.sku}: estoque ${saldoAtual} → ${l.estoque}`);
        }
      }
    }
  } catch (e) {
    console.error('[importar] falha ao aplicar', e);
    const msg = e instanceof Error ? e.message : 'erro desconhecido';
    return {
      erro: `A importação parou no meio: ${msg}`,
      detalhe: [...detalhe, 'O que está listado acima já foi gravado. Corrija a planilha e envie de novo — os itens já aplicados serão apenas atualizados.'],
    };
  }

  revalidatePath('/');
  revalidatePath('/admin/kits');
  revalidatePath('/admin/estoque');
  revalidatePath('/catalogo');

  const partes = [];
  if (criados) partes.push(`${criados} produto(s) criado(s)`);
  if (atualizados) partes.push(`${atualizados} atualizado(s)`);
  if (ajustes) partes.push(`${ajustes} ajuste(s) de estoque`);

  return {
    ok: partes.length ? partes.join(', ') + '.' : 'Nada mudou — a planilha estava igual ao site.',
    detalhe,
  };
}
