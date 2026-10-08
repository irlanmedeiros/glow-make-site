import { prisma } from '@/lib/prisma';
import { real, num } from '@/lib/format';
import { MINIMO_CARRINHO_INDIVIDUAIS, ROTULO_TIPO, TIPOS_EDITAVEIS, type TipoProduto, tipoValido } from '@/lib/produto';
import { salvarKit, alternarKit, excluirKit, excluirKitsEmMassa } from '../../actions';
import { Aviso, Cabecalho, Painel, Pill, mensagens } from '@/components/admin/Ui';
import CampoImagem from '@/components/admin/CampoImagem';

export const dynamic = 'force-dynamic';

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

/* 20 por página: o cartão de produto é alto (foto, pílulas, formulário que
   abre), e mais do que isso vira rolagem infinita no celular da dona. */
const POR_PAGINA = 20;

type Campos = {
  id?: string;
  sku?: string;
  nome?: string;
  descricao?: string;
  itens?: string[];
  preco?: number;
  imagem?: string;
  estoqueBaixo?: number;
  ordem?: number;
  ativo?: boolean;
  tipo?: TipoProduto;
  codigoBarras?: string | null;
};

function Formulario({
  k,
  novo = false,
  uploadDisponivel,
}: {
  k: Campos;
  novo?: boolean;
  uploadDisponivel: boolean;
}) {
  return (
    <form action={salvarKit}>
      {k.id && <input type="hidden" name="id" value={k.id} />}
      {k.tipo === 'BOX' ? (
        <div className="note" style={{ marginBottom: 14 }}>
          Esta é a caixa da assinatura. O tipo dela não muda por aqui.
        </div>
      ) : (
        <div className="field">
          <label>Tipo</label>
          <select name="tipo" defaultValue={k.tipo ?? 'KIT'}>
            {TIPOS_EDITAVEIS.map((t) => (
              <option key={t} value={t}>
                {ROTULO_TIPO[t]}
              </option>
            ))}
          </select>
        </div>
      )}
      <div className="row2">
        <div className="field">
          <label>Nome</label>
          <input name="nome" defaultValue={k.nome ?? ''} required maxLength={120} />
        </div>
        <div className="field">
          <label>SKU</label>
          <input name="sku" defaultValue={k.sku ?? ''} required maxLength={30} />
          <small>Código interno, único. Ex.: GM-ESS</small>
        </div>
      </div>

      <div className="field">
        <label>Descrição curta</label>
        <input name="descricao" defaultValue={k.descricao ?? ''} maxLength={300} />
      </div>

      <div className="field">
        <label>Itens do kit</label>
        <textarea name="itens" defaultValue={(k.itens ?? []).join('\n')} rows={6} />
        <small>Um item por linha. O card do site mostra os quatro primeiros.</small>
      </div>

      <div className="row3">
        <div className="field">
          <label>Preço</label>
          <input name="preco" defaultValue={k.preco != null ? k.preco.toFixed(2).replace('.', ',') : ''} required />
          <small>
            Qualquer valor. No site, a compra só de produtos avulsos fecha a partir de R${' '}
            {MINIMO_CARRINHO_INDIVIDUAIS},00; com kit no carrinho não há mínimo.
          </small>
          <small>Use vírgula: 129,90</small>
        </div>
        <div className="field">
          <label>Alerta de estoque baixo</label>
          <input type="number" name="estoqueBaixo" min={0} defaultValue={k.estoqueBaixo ?? 10} />
          <small>Avisa quando o saldo chega aqui</small>
        </div>
        <div className="field">
          <label>Ordem no site</label>
          <input type="number" name="ordem" defaultValue={k.ordem ?? 0} />
        </div>
      </div>

      <div className="field">
        <label>Código de barras</label>
        <input name="codigoBarras" defaultValue={k.codigoBarras ?? ''} maxLength={60} placeholder="EAN da embalagem" />
        <small>Usado pelo leitor no balcão. Em branco, a vendedora busca pelo nome ou SKU.</small>
      </div>

      <div className="field">
        <label>Foto</label>
        <CampoImagem
          name="imagem"
          valorInicial={k.imagem ?? ''}
          pasta="produtos"
          uploadDisponivel={uploadDisponivel}
          dica="Foto quadrada fica melhor no card. Sem foto, o site mostra uma imagem neutra."
        />
      </div>

      <div className="field">
        <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input type="checkbox" name="ativo" defaultChecked={k.ativo ?? true} style={{ width: 'auto' }} />
          Aparece no site
        </label>
      </div>

      <button className="btn btn-primary">{novo ? 'Criar produto' : 'Salvar alterações'}</button>
    </form>
  );
}

export default async function Kits({ searchParams }: Props) {
  const { ok, erro } = mensagens(await searchParams);
  // Sem a variavel do Blob, o campo de foto so aceita colar endereco.
  const uploadDisponivel = Boolean(process.env.BLOB_READ_WRITE_TOKEN);
  /* Busca, filtro e página vivem na URL, não em estado de componente. É o que
     faz os três funcionarem juntos: trocar de página mantém o filtro, e o
     endereço resultante pode ser recarregado ou mandado para outra pessoa. */
  const sp = await searchParams;
  const umSo = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? '';
  const busca = umSo(sp.q).trim().slice(0, 60);
  const tipoFiltro = tipoValido(umSo(sp.tipo));
  const pagina = Math.max(1, Number(umSo(sp.p)) || 1);

  const where = {
    ...(tipoFiltro ? { tipo: tipoFiltro } : {}),
    ...(busca
      ? {
          OR: [
            { nome: { contains: busca, mode: 'insensitive' as const } },
            { sku: { contains: busca, mode: 'insensitive' as const } },
            { codigoBarras: { contains: busca, mode: 'insensitive' as const } },
          ],
        }
      : {}),
  };

  const total = await prisma.kit.count({ where });
  const paginas = Math.max(1, Math.ceil(total / POR_PAGINA));
  // Filtrar de uma página alta pode deixar a pessoa numa página que não existe
  // mais; cair na última é melhor do que mostrar lista vazia sem explicação.
  const atual = Math.min(pagina, paginas);

  const produtos = await prisma.kit.findMany({
    where,
    // Kit primeiro, sempre: é o que a loja vende como carro-chefe. O enum
    // TipoProduto já nasce em BOX, INDIVIDUAL, KIT, então a ordem alfabética
    // não serve — a lista pede ordenação explícita.
    orderBy: [{ tipo: 'asc' }, { ordem: 'asc' }],
    include: { _count: { select: { itensPedido: true } } },
    skip: (atual - 1) * POR_PAGINA,
    take: POR_PAGINA,
  });

  const comFiltro = (mudanca: Record<string, string | number>) => {
    const u = new URLSearchParams();
    if (busca) u.set('q', busca);
    if (tipoFiltro) u.set('tipo', tipoFiltro);
    for (const [k, v] of Object.entries(mudanca)) {
      if (v === '' || v === 0) u.delete(k);
      else u.set(k, String(v));
    }
    const qs = u.toString();
    return qs ? `/admin/kits?${qs}` : '/admin/kits';
  };

  return (
    <>
      <Cabecalho
        titulo="Kits e produtos"
        descricao="Nome, preço, itens e foto de cada produto do catálogo"
      />
      <Aviso ok={ok} erro={erro} />

      {/* Criar fica em cima: e a acao mais comum de quem monta o catalogo, e
          no fim de uma lista longa ninguem acha. */}
      <Painel titulo="Novo produto ou kit" descricao="Nasce com estoque zero; lance a entrada na aba Estoque">
        <details>
          <summary style={{ cursor: 'pointer', color: 'var(--rose)', fontSize: 14, fontWeight: 600 }}>
            Abrir formulário
          </summary>
          <div style={{ marginTop: 16 }}>
            <Formulario
              uploadDisponivel={uploadDisponivel}
              k={{ ativo: true, estoqueBaixo: 10, ordem: produtos.length + 1 }}
              novo
            />
          </div>
        </details>
      </Painel>

      <Painel titulo="Encontrar" flush>
        <form method="get" className="kits-filtro">
          <input
            name="q"
            defaultValue={busca}
            placeholder="Nome, SKU ou código de barras"
            aria-label="Buscar produto"
          />
          <select name="tipo" defaultValue={tipoFiltro ?? ''} aria-label="Filtrar por tipo">
            <option value="">Todos os tipos</option>
            {TIPOS_EDITAVEIS.map((t) => (
              <option key={t} value={t}>
                {ROTULO_TIPO[t]}
              </option>
            ))}
            <option value="BOX">{ROTULO_TIPO.BOX}</option>
          </select>
          <button className="btn btn-primary btn-sm">Buscar</button>
          {(busca || tipoFiltro) && (
            <a className="btn btn-ghost btn-sm" href="/admin/kits">
              Limpar
            </a>
          )}
        </form>
        <p className="kits-contagem">
          {total === 0
            ? 'Nenhum produto com esse filtro.'
            : `${total} produto(s)${paginas > 1 ? ` · página ${atual} de ${paginas}` : ''}`}
        </p>
      </Painel>

      {/* A seleção em massa envolve a lista inteira: as caixas ficam no cartão
          de cada produto e o botão de excluir, no fim. Um formulário só, para
          a seleção não se perder ao rolar. */}
      <form action={excluirKitsEmMassa}>
      {produtos.map((p) => {
        const saldo = p.entradas - p.saidas;
        return (
          <Painel key={p.id}>
            <div
              style={{
                display: 'flex',
                gap: 14,
                alignItems: 'center',
                flexWrap: 'wrap',
                marginBottom: 4,
              }}
            >
              {/* Produto que esta em pedido nao pode ser excluido: sem caixa,
                  em vez de caixa que falha depois de marcada. */}
              {p.tipo !== 'BOX' && p._count.itensPedido === 0 && (
                <label className="kits-marca" title={`Selecionar ${p.nome}`}>
                  <input type="checkbox" name="ids" value={p.id} />
                  <span className="sr-only">Selecionar {p.nome}</span>
                </label>
              )}

              <div className="linha-prod" style={{ flex: 1, minWidth: 220 }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.imagem} alt="" />
                <div>
                  <b>{p.nome}</b>
                  <span>
                    {p.sku} · {real(p.preco)} · saldo {saldo}
                  </span>
                </div>
              </div>

              <Pill cor={p.ativo ? 'ok' : 'out'}>{p.ativo ? 'No site' : 'Oculto'}</Pill>
              {p.tipo !== 'KIT' && <Pill cor="info">{ROTULO_TIPO[p.tipo]}</Pill>}

              <div className="adm-acoes">
                <form action={alternarKit}>
                  <input type="hidden" name="id" value={p.id} />
                  <button className="btn btn-ghost btn-sm">{p.ativo ? 'Ocultar' : 'Publicar'}</button>
                </form>
                {p.tipo !== 'BOX' && p._count.itensPedido === 0 && (
                  <form action={excluirKit}>
                    <input type="hidden" name="id" value={p.id} />
                    <button className="btn btn-danger btn-sm">Excluir</button>
                  </form>
                )}
              </div>
            </div>

            <details style={{ marginTop: 10 }}>
              <summary style={{ cursor: 'pointer', color: 'var(--rose)', fontSize: 14, fontWeight: 600 }}>
                Editar este produto
              </summary>
              <div style={{ marginTop: 16 }}>
                <Formulario
                  uploadDisponivel={uploadDisponivel}
                  k={{
                    id: p.id,
                    sku: p.sku,
                    nome: p.nome,
                    descricao: p.descricao,
                    itens: p.itens,
                    preco: num(p.preco),
                    imagem: p.imagem,
                    estoqueBaixo: p.estoqueBaixo,
                    ordem: p.ordem,
                    ativo: p.ativo,
                    tipo: p.tipo,
                    codigoBarras: p.codigoBarras,
                  }}
                />
                {p._count.itensPedido > 0 && p.tipo !== 'BOX' && (
                  <div className="note" style={{ marginTop: 14 }}>
                    Este produto já aparece em {p._count.itensPedido} pedido(s), então não pode ser
                    excluído — apagá-lo quebraria o histórico de quem comprou. Use <b>Ocultar</b>{' '}
                    para tirar do site.
                  </div>
                )}
              </div>
            </details>
          </Painel>
        );
      })}

      {/* Zona de perigo no fim da lista, não no topo: quem chega aqui rolou a
          página inteira. A confirmação é um campo do formulário e é conferida
          no servidor — marcar na tela não é o que autoriza. */}
      {produtos.length > 0 && (
        <Painel titulo="Excluir selecionados" descricao="A Glow Box e produtos já vendidos não aparecem para seleção">
          <label className="aceite">
            <input type="checkbox" name="confirmo" value="sim" />
            <span>
              Confirmo que quero <b>excluir definitivamente</b> os produtos marcados acima. Isso não
              tem desfazer.
            </span>
          </label>
          <button className="btn btn-danger" style={{ marginTop: 12 }}>
            Excluir os selecionados
          </button>
        </Painel>
      )}
      </form>

      {paginas > 1 && (
        <nav className="kits-paginas" aria-label="Páginas de produtos">
          {atual > 1 && (
            <a className="btn btn-ghost btn-sm" href={comFiltro({ p: atual - 1 })}>
              Anterior
            </a>
          )}
          <span>
            Página {atual} de {paginas}
          </span>
          {atual < paginas && (
            <a className="btn btn-ghost btn-sm" href={comFiltro({ p: atual + 1 })}>
              Próxima
            </a>
          )}
        </nav>
      )}

    </>
  );
}
