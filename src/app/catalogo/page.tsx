import { prisma } from '@/lib/prisma';
import { num } from '@/lib/format';
import { caixaAberto, resumoDoCaixa } from '@/lib/pdv';
import Catalogo, { type ProdutoCatalogo, type CaixaAtual } from '@/components/Catalogo';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Loja — Glow Make',
  // Página interna: não faz sentido aparecer em busca.
  robots: { index: false, follow: false },
};

export default async function PaginaCatalogo() {
  const [produtos, caixa] = await Promise.all([
    prisma.kit.findMany({ orderBy: [{ tipo: 'asc' }, { ordem: 'asc' }] }),
    caixaAberto(),
  ]);

  // A primeira pintura já vem do servidor com o estoque certo. Só depois o
  // navegador assume e passa a atualizar sozinho — assim a vendedora não
  // encara uma tela vazia enquanto o celular carrega o JavaScript.
  const inicial: ProdutoCatalogo[] = produtos.map((p) => ({
    id: p.id,
    sku: p.sku,
    nome: p.nome,
    preco: num(p.preco),
    imagem: p.imagem,
    tipo: p.tipo,
    saldo: p.entradas - p.saidas,
    vendidos: p.saidas,
    estoqueBaixo: p.estoqueBaixo,
    ativo: p.ativo,
    codigoBarras: p.codigoBarras,
  }));

  let caixaAtual: CaixaAtual = null;
  if (caixa) {
    const resumo = await resumoDoCaixa(caixa.id);
    caixaAtual = {
      id: caixa.id,
      abertoPor: caixa.abertoPor,
      abertoEm: caixa.abertoEm.toISOString(),
      trocoInicial: num(caixa.trocoInicial),
      totalVendas: resumo.totalVendas,
      quantidade: resumo.quantidade,
      esperadoNaGaveta: resumo.esperadoNaGaveta,
      porForma: resumo.porForma,
    };
  }

  const vendasRecentes = await prisma.vendaLoja.findMany({
    orderBy: { criadoEm: 'desc' },
    take: 12,
    include: { itens: true },
  });

  return (
    <Catalogo
      inicial={inicial}
      caixa={caixaAtual}
      vendas={vendasRecentes.map((v) => ({
        id: v.id,
        numero: v.numero,
        vendedora: v.vendedora,
        formaPagamento: v.formaPagamento,
        total: num(v.total),
        cancelada: v.cancelada,
        criadoEm: v.criadoEm.toISOString(),
        itens: v.itens.map((i) => ({ nome: i.nome, qtd: i.qtd })),
      }))}
    />
  );
}
