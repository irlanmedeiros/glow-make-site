import { prisma } from '@/lib/prisma';
import { real, num } from '@/lib/format';
import { PRECO_MINIMO_INDIVIDUAL, ROTULO_TIPO, TIPOS_EDITAVEIS, type TipoProduto } from '@/lib/produto';
import { salvarKit, alternarKit, excluirKit } from '../../actions';
import { Aviso, Cabecalho, Painel, Pill, mensagens } from '@/components/admin/Ui';
import CampoImagem from '@/components/admin/CampoImagem';

export const dynamic = 'force-dynamic';

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

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
            Produto individual: mínimo R$ {PRECO_MINIMO_INDIVIDUAL},00. Kit pode custar menos.
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
  const produtos = await prisma.kit.findMany({
    orderBy: [{ tipo: 'asc' }, { ordem: 'asc' }],
    include: { _count: { select: { itensPedido: true } } },
  });

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

    </>
  );
}
