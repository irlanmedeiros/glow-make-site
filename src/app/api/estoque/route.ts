import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { podeVerCatalogo } from '@/lib/auth';
import { num } from '@/lib/format';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Estoque ao vivo para o catálogo das vendedoras.
 *
 * Resposta enxuta de propósito: a tela chama isso a cada poucos segundos, no
 * celular delas, muitas vezes em 4G. Devolver o catálogo inteiro a cada
 * consulta gastaria franquia à toa — aqui vai só o que muda.
 *
 * Exige sessão. Saldo de estoque é informação interna: diz quanto a loja
 * vende e o que está encalhado.
 */
export async function GET() {
  if (!(await podeVerCatalogo())) {
    return NextResponse.json({ erro: 'Não autorizado.' }, { status: 401 });
  }

  const produtos = await prisma.kit.findMany({
    orderBy: [{ tipo: 'asc' }, { ordem: 'asc' }],
    select: {
      id: true,
      sku: true,
      nome: true,
      preco: true,
      imagem: true,
      tipo: true,
      entradas: true,
      saidas: true,
      estoqueBaixo: true,
      codigoBarras: true,
      ativo: true,
    },
  });

  return NextResponse.json(
    {
      atualizadoEm: new Date().toISOString(),
      produtos: produtos.map((p) => ({
        id: p.id,
        sku: p.sku,
        nome: p.nome,
        preco: num(p.preco),
        imagem: p.imagem,
        tipo: p.tipo,
        saldo: p.entradas - p.saidas,
        vendidos: p.saidas,
        estoqueBaixo: p.estoqueBaixo,
        codigoBarras: p.codigoBarras,
        ativo: p.ativo,
      })),
    },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
