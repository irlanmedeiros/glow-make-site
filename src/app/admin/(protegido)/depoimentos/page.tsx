import { prisma } from '@/lib/prisma';
import { salvarDepoimento, excluirDepoimento, ocultarDepoimentosDeExemplo } from '../../actions';
import { ehDepoimentoDeExemplo, iniciais } from '@/lib/conteudo';
import { Aviso, Cabecalho, Painel, Pill, mensagens } from '@/components/admin/Ui';

export const dynamic = 'force-dynamic';

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

type Campos = {
  id?: string;
  nome?: string;
  cidade?: string;
  tempo?: string;
  texto?: string;
  avatar?: string;
  nota?: number;
  ordem?: number;
  ativo?: boolean;
};

function Formulario({ d, novo = false }: { d: Campos; novo?: boolean }) {
  return (
    <form action={salvarDepoimento}>
      {d.id && <input type="hidden" name="id" value={d.id} />}
      <div className="row3">
        <div className="field">
          <label>Nome</label>
          <input name="nome" defaultValue={d.nome ?? ''} required maxLength={80} />
        </div>
        <div className="field">
          <label>Cidade</label>
          <input name="cidade" defaultValue={d.cidade ?? ''} maxLength={80} placeholder="Recife, PE" />
        </div>
        <div className="field">
          <label>Há quanto tempo é cliente (opcional)</label>
          <input name="tempo" defaultValue={d.tempo ?? ''} maxLength={80} placeholder="Cliente desde 2026" />
        </div>
      </div>
      <div className="field">
        <label>Depoimento</label>
        <textarea name="texto" defaultValue={d.texto ?? ''} required rows={3} maxLength={400} />
      </div>
      <div className="row3">
        <div className="field">
          <label>Foto (opcional)</label>
          <input name="avatar" defaultValue={d.avatar ?? ''} maxLength={300} placeholder="Endereço da imagem" />
          <small>200×200 px. Sem foto, aparecem as iniciais.</small>
        </div>
        <div className="field">
          <label>Nota</label>
          <select name="nota" defaultValue={String(d.nota ?? 5)}>
            {[5, 4, 3, 2, 1].map((n) => (
              <option key={n} value={n}>
                {n} estrela{n > 1 ? 's' : ''}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>Ordem</label>
          <input type="number" name="ordem" defaultValue={d.ordem ?? 0} />
        </div>
      </div>
      <div className="field">
        <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input type="checkbox" name="ativo" defaultChecked={d.ativo ?? true} style={{ width: 'auto' }} />
          Aparece no site
        </label>
      </div>
      <button className="btn btn-primary">{novo ? 'Criar depoimento' : 'Salvar'}</button>
    </form>
  );
}

export default async function Depoimentos({ searchParams }: Props) {
  const { ok, erro } = mensagens(await searchParams);
  const depoimentos = await prisma.depoimento.findMany({ orderBy: { ordem: 'asc' } });
  const exemplosAtivos = depoimentos.filter((d) => d.ativo && ehDepoimentoDeExemplo(d.avatar)).length;

  return (
    <>
      <Cabecalho
        titulo="Depoimentos"
        descricao="As avaliações que rodam no carrossel da página inicial"
      />
      <Aviso ok={ok} erro={erro} />

      <div className="note" style={{ marginBottom: 20 }}>
        <b>Só depoimentos reais, com autorização de quem aparece.</b> Enquanto não houver nenhum
        ativo, a seção de depoimentos não aparece no site. A foto é opcional.
      </div>

      {exemplosAtivos > 0 && (
        <div className="note erro" style={{ marginBottom: 20 }}>
          <b>
            {exemplosAtivos} depoimento{exemplosAtivos > 1 ? 's' : ''} de exemplo ainda marcado
            {exemplosAtivos > 1 ? 's' : ''} como ativo.
          </b>{' '}
          São fictícios e o site já não os exibe, mas convém ocultá-los aqui também. Ocultar não
          apaga: dá para voltar atrás.
          <form action={ocultarDepoimentosDeExemplo} style={{ marginTop: 10 }}>
            <button className="btn btn-danger btn-sm">Ocultar todos os de exemplo</button>
          </form>
        </div>
      )}

      {depoimentos.map((d) => {
        const exemplo = ehDepoimentoDeExemplo(d.avatar);
        return (
        <Painel key={d.id}>
          <div style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
            {d.avatar && !exemplo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={d.avatar}
                alt=""
                style={{ width: 48, height: 48, borderRadius: '50%', objectFit: 'cover' }}
              />
            ) : (
              <span className="dep-inicial" style={{ width: 48, height: 48 }} aria-hidden="true">
                {iniciais(d.nome)}
              </span>
            )}
            <div style={{ flex: 1, minWidth: 220 }}>
              <b>{d.nome}</b>
              <p style={{ fontSize: 13.5, color: 'var(--muted)' }}>
                {[d.cidade, d.tempo].filter(Boolean).join(' · ')}
              </p>
              <p style={{ fontSize: 13.5, marginTop: 4 }}>&ldquo;{d.texto}&rdquo;</p>
            </div>
            <Pill cor={d.ativo && !exemplo ? 'ok' : 'out'}>
              {exemplo ? 'Exemplo — fora do site' : d.ativo ? 'No site' : 'Oculto'}
            </Pill>
            <form action={excluirDepoimento}>
              <input type="hidden" name="id" value={d.id} />
              <button className="btn btn-danger btn-sm">Excluir</button>
            </form>
          </div>

          <details style={{ marginTop: 12 }}>
            <summary style={{ cursor: 'pointer', color: 'var(--rose)', fontSize: 14, fontWeight: 600 }}>
              Editar
            </summary>
            <div style={{ marginTop: 16 }}>
              <Formulario d={d} />
            </div>
          </details>
        </Painel>
        );
      })}

      <Painel titulo="Novo depoimento">
        <Formulario d={{ ativo: true, nota: 5, ordem: depoimentos.length + 1 }} novo />
      </Painel>
    </>
  );
}
