import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { ehAdmin } from '@/lib/auth';
import { gerarExportacao } from '@/lib/planilha';
import { num } from '@/lib/format';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Planilha com os produtos de hoje, para o lojista baixar sozinho.
 *
 * Vem TUDO: o que está no site e o que está oculto, na mesma lista, com a
 * coluna `ativo` separando os dois. Era o que faltava — para saber o que está
 * no ar ele dependia de alguém mandar.
 */
export async function GET() {
  if (!(await ehAdmin())) {
    return NextResponse.json({ erro: 'Não autorizado.' }, { status: 401 });
  }

  const produtos = await prisma.kit.findMany({ orderBy: [{ ativo: 'desc' }, { tipo: 'asc' }, { ordem: 'asc' }] });

  const arquivo = await gerarExportacao(
    produtos.map((p) => ({
      sku: p.sku,
      nome: p.nome,
      descricao: p.descricao,
      itens: p.itens,
      preco: num(p.preco),
      imagem: p.imagem,
      saldo: p.entradas - p.saidas,
      estoqueBaixo: p.estoqueBaixo,
      ordem: p.ordem,
      ativo: p.ativo,
      codigoBarras: p.codigoBarras,
      tipo: p.tipo,
      categoria: p.categoria,
    }))
  );

  const dia = new Date().toISOString().slice(0, 10);
  return new NextResponse(new Uint8Array(arquivo), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="produtos-glow-make-${dia}.xlsx"`,
      'Cache-Control': 'no-store',
    },
  });
}
