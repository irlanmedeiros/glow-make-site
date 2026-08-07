import { prisma } from '@/lib/prisma';
import { num } from '@/lib/format';
import Catalogo, { type ProdutoCatalogo } from '@/components/Catalogo';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Catálogo da loja — Glow Make',
  // Página interna: não faz sentido aparecer em busca.
  robots: { index: false, follow: false },
};

export default async function PaginaCatalogo() {
  const produtos = await prisma.kit.findMany({
    orderBy: [{ tipo: 'asc' }, { ordem: 'asc' }],
  });

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
  }));

  return (
    <>
      <div className="cat-cabecalho">
        <h1>Estoque ao vivo</h1>
        <p>Toque em um produto para ver os detalhes ou dar baixa de uma venda feita na loja.</p>
      </div>
      <Catalogo inicial={inicial} />
    </>
  );
}
