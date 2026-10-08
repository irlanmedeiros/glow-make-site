import { prisma } from '@/lib/prisma';
import { num } from '@/lib/format';
import { Loja, Topbar, Cabecalho, Grade } from '@/components/Loja';
import Consentimento from '@/components/Consentimento';
import { CATEGORIAS, TIPOS_NA_VITRINE, categoriaValida, rotuloCategoria } from '@/lib/produto';
import { avisosPublicaveis } from '@/lib/conteudo';
import { assinaturaAtiva } from '@/lib/recursos';
import type { ConfigPublica, KitPublico } from '@/components/tipos';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Produtos — Glow Make',
  description: 'Todos os produtos da Glow Make: kits prontos e itens avulsos.',
};

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

/* 12 por página: três linhas de quatro no desktop, e no celular dá uma
   rolagem que termina — mais do que isso cansa antes de chegar no rodapé. */
const POR_PAGINA = 12;

export default async function Produtos({ searchParams }: Props) {
  const sp = await searchParams;
  const umSo = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? '';

  const categoria = categoriaValida(umSo(sp.categoria));
  const busca = umSo(sp.q).trim().slice(0, 60);
  const soKits = umSo(sp.tipo) === 'KIT';
  const soAvulsos = umSo(sp.tipo) === 'INDIVIDUAL';
  const pagina = Math.max(1, Number(umSo(sp.p)) || 1);

  const where = {
    ativo: true,
    tipo: soKits ? ('KIT' as const) : soAvulsos ? ('INDIVIDUAL' as const) : { in: TIPOS_NA_VITRINE },
    ...(categoria ? { categoria } : {}),
    ...(busca
      ? {
          OR: [
            { nome: { contains: busca, mode: 'insensitive' as const } },
            { descricao: { contains: busca, mode: 'insensitive' as const } },
          ],
        }
      : {}),
  };

  const [configDb, total, comAssinatura] = await Promise.all([
    prisma.config.findUnique({ where: { id: 'config' } }),
    prisma.kit.count({ where }),
    assinaturaAtiva(),
  ]);

  const paginas = Math.max(1, Math.ceil(total / POR_PAGINA));
  /* Limita ANTES de consultar. Pedir a página 2 de um filtro que só tem uma
     devolveria lista vazia com "12 produto(s)" no topo — a cliente acharia que
     a loja quebrou. Trocar de categoria com a página alta na URL é justamente
     como se cai nesse caso. */
  const atual = Math.min(pagina, paginas);

  const produtosDb = await prisma.kit.findMany({
    where,
    // Kit primeiro aqui também: é a mesma hierarquia da home.
    orderBy: [{ tipo: 'asc' }, { ordem: 'asc' }],
    skip: (atual - 1) * POR_PAGINA,
    take: POR_PAGINA,
  });

  const paraPublico = (k: (typeof produtosDb)[number]): KitPublico => ({
    id: k.id,
    sku: k.sku,
    tipo: k.tipo,
    nome: k.nome,
    descricao: k.descricao,
    itens: k.itens,
    preco: num(k.preco),
    imagem: k.imagem,
    saldo: k.entradas - k.saidas,
    estoqueBaixo: k.estoqueBaixo,
  });

  const produtos = produtosDb.map(paraPublico);

  const config: ConfigPublica = {
    // Contrato só vai para o cliente quando a assinatura está sendo vendida —
    // mesma regra da home.
    contratoTexto: comAssinatura ? (configDb?.contratoTexto ?? '') : '',
    contratoVersao: configDb?.contratoVersao ?? 'v1',
    metaPixelId: configDb?.metaPixelId ?? '',
    avisos: avisosPublicaveis(configDb?.avisos ?? [], { assinaturaAtiva: comAssinatura }),
    whatsapp: configDb?.whatsapp ?? '',
    email: configDb?.email ?? '',
    instagram: configDb?.instagram ?? '',
    cnpj: configDb?.cnpj ?? '',
  };

  /* Filtro e página vivem na URL: é o que os faz funcionarem juntos e deixa o
     endereço do "só batom, página 2" ser recarregado ou compartilhado. */
  const liga = (mudanca: Record<string, string | number>) => {
    const u = new URLSearchParams();
    if (busca) u.set('q', busca);
    if (categoria) u.set('categoria', categoria);
    if (soKits) u.set('tipo', 'KIT');
    if (soAvulsos) u.set('tipo', 'INDIVIDUAL');
    for (const [k, v] of Object.entries(mudanca)) {
      if (v === '' || v === 0) u.delete(k);
      else u.set(k, String(v));
    }
    const qs = u.toString();
    return qs ? `/produtos?${qs}` : '/produtos';
  };

  return (
    <Loja kits={produtos} box={null} config={config}>
      <Topbar avisos={config.avisos} />
      <Cabecalho />
      <Consentimento pixelId={config.metaPixelId} />

      <section className="wrap prod-pagina">
        <header className="prod-cabeca">
          <h1>{categoria ? rotuloCategoria(categoria) : 'Todos os produtos'}</h1>
          <p>
            {total === 0
              ? 'Nada encontrado com esse filtro.'
              : `${total} produto(s)${paginas > 1 ? ` · página ${atual} de ${paginas}` : ''}`}
          </p>
        </header>

        <form method="get" className="prod-filtros">
          <input name="q" defaultValue={busca} placeholder="Buscar produto" aria-label="Buscar" />
          <select name="tipo" defaultValue={soKits ? 'KIT' : soAvulsos ? 'INDIVIDUAL' : ''} aria-label="Tipo">
            <option value="">Kits e avulsos</option>
            <option value="KIT">Só kits</option>
            <option value="INDIVIDUAL">Só avulsos</option>
          </select>
          <button className="btn btn-primary btn-sm">Filtrar</button>
        </form>

        <nav className="prod-cats" aria-label="Categorias">
          <a className={`prod-cat${!categoria ? ' on' : ''}`} href={liga({ categoria: '', p: '' })}>
            Todas
          </a>
          {CATEGORIAS.map((c) => (
            <a
              key={c.v}
              className={`prod-cat${categoria === c.v ? ' on' : ''}`}
              href={liga({ categoria: c.v, p: '' })}
            >
              {c.r}
            </a>
          ))}
        </nav>

        {produtos.length === 0 ? (
          <div className="empty">Nenhum produto com esse filtro. Tente outra categoria.</div>
        ) : (
          <Grade produtos={produtos} />
        )}

        {paginas > 1 && (
          <nav className="prod-paginas" aria-label="Páginas">
            {atual > 1 && (
              <a className="btn btn-ghost btn-sm" href={liga({ p: atual - 1 })}>
                Anterior
              </a>
            )}
            <span>
              Página {atual} de {paginas}
            </span>
            {atual < paginas && (
              <a className="btn btn-ghost btn-sm" href={liga({ p: atual + 1 })}>
                Próxima
              </a>
            )}
          </nav>
        )}
      </section>
    </Loja>
  );
}
