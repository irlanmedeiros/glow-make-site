import { prisma } from '@/lib/prisma';
import { salvarBanner, excluirBanner } from '../../actions';
import { Aviso, Cabecalho, Painel, Pill, mensagens } from '@/components/admin/Ui';

export const dynamic = 'force-dynamic';

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

type Campos = {
  id?: string;
  tag?: string;
  titulo?: string;
  subtitulo?: string;
  imagem?: string;
  ctaTexto?: string;
  ctaLink?: string;
  ordem?: number;
  ativo?: boolean;
};

function Formulario({ b, novo = false }: { b: Campos; novo?: boolean }) {
  return (
    <form action={salvarBanner}>
      {b.id && <input type="hidden" name="id" value={b.id} />}
      <div className="row2">
        <div className="field">
          <label>Tarja (canto superior)</label>
          <input name="tag" defaultValue={b.tag ?? ''} maxLength={60} placeholder="Edição de agosto" />
        </div>
        <div className="field">
          <label>Ordem</label>
          <input type="number" name="ordem" defaultValue={b.ordem ?? 0} />
        </div>
      </div>
      <div className="field">
        <label>Título</label>
        <input name="titulo" defaultValue={b.titulo ?? ''} required maxLength={120} />
      </div>
      <div className="field">
        <label>Subtítulo</label>
        <textarea name="subtitulo" defaultValue={b.subtitulo ?? ''} rows={2} maxLength={240} />
      </div>
      <div className="field">
        <label>Imagem</label>
        <input name="imagem" defaultValue={b.imagem ?? ''} required maxLength={300} />
        <small>
          1600×720 px. O assunto principal deve ficar à direita — a esquerda é onde o texto entra.
        </small>
      </div>
      <div className="row2">
        <div className="field">
          <label>Texto do botão</label>
          <input name="ctaTexto" defaultValue={b.ctaTexto ?? 'Ver os kits'} maxLength={40} />
        </div>
        <div className="field">
          <label>Link do botão</label>
          <input name="ctaLink" defaultValue={b.ctaLink ?? '#kits'} maxLength={200} />
        </div>
      </div>
      <div className="field">
        <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input type="checkbox" name="ativo" defaultChecked={b.ativo ?? true} style={{ width: 'auto' }} />
          Aparece no carrossel
        </label>
      </div>
      <button className="btn btn-primary">{novo ? 'Criar banner' : 'Salvar'}</button>
    </form>
  );
}

export default async function Banners({ searchParams }: Props) {
  const { ok, erro } = mensagens(await searchParams);
  const banners = await prisma.banner.findMany({ orderBy: { ordem: 'asc' } });

  return (
    <>
      <Cabecalho
        titulo="Banners do topo"
        descricao="Os slides do carrossel da página inicial, na ordem em que passam"
      />
      <Aviso ok={ok} erro={erro} />

      {banners.map((b) => (
        <Painel key={b.id}>
          <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={b.imagem}
              alt=""
              style={{ width: 180, aspectRatio: '20/9', objectFit: 'cover', borderRadius: 12 }}
            />
            <div style={{ flex: 1, minWidth: 200 }}>
              <b style={{ fontFamily: 'var(--serif)', fontSize: 17 }}>{b.titulo}</b>
              <p style={{ fontSize: 13.5, color: 'var(--muted)' }}>{b.subtitulo}</p>
              <div className="chips" style={{ marginTop: 8 }}>
                <span className="chip">Ordem {b.ordem}</span>
                <span className="chip">{b.tag}</span>
              </div>
            </div>
            <Pill cor={b.ativo ? 'ok' : 'out'}>{b.ativo ? 'No ar' : 'Oculto'}</Pill>
            <form action={excluirBanner}>
              <input type="hidden" name="id" value={b.id} />
              <button className="btn btn-danger btn-sm">Excluir</button>
            </form>
          </div>

          <details style={{ marginTop: 12 }}>
            <summary style={{ cursor: 'pointer', color: 'var(--rose)', fontSize: 14, fontWeight: 600 }}>
              Editar
            </summary>
            <div style={{ marginTop: 16 }}>
              <Formulario b={b} />
            </div>
          </details>
        </Painel>
      ))}

      <Painel titulo="Novo banner">
        <Formulario b={{ ativo: true, ordem: banners.length + 1 }} novo />
      </Painel>
    </>
  );
}
