import { prisma } from '@/lib/prisma';
import { real, dataHora, num } from '@/lib/format';
import { marcarLeadContatado, excluirLead } from '../../actions';
import { Aviso, Cabecalho, Painel, Pill, Vazio, mensagens } from '@/components/admin/Ui';

export const dynamic = 'force-dynamic';

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

type ItemLead = { sku: string; nome: string; qtd: number; preco: number };

function whatsapp(telefone: string, nome: string) {
  const num = telefone.replace(/\D/g, '');
  const numeroCompleto = num.length <= 11 ? `55${num}` : num;
  const texto = encodeURIComponent(
    `Oi ${nome.split(' ')[0] || ''}! Vi que você começou uma compra na Glow Make e não finalizou. Posso te ajudar com alguma dúvida?`
  );
  return `https://wa.me/${numeroCompleto}?text=${texto}`;
}

export default async function Leads({ searchParams }: Props) {
  const sp = await searchParams;
  const { ok, erro } = mensagens(sp);
  const aba = typeof sp.aba === 'string' ? sp.aba : 'abertos';

  const where =
    aba === 'convertidos'
      ? { convertido: true }
      : aba === 'contatados'
        ? { convertido: false, contatado: true }
        : { convertido: false, contatado: false };

  const [leads, todos] = await Promise.all([
    prisma.lead.findMany({ where, orderBy: { atualizadoEm: 'desc' }, take: 200 }),
    prisma.lead.findMany({ select: { convertido: true, contatado: true, valorEstimado: true, consentiuContato: true } }),
  ]);

  const abertos = todos.filter((l) => !l.convertido && !l.contatado);
  const perdido = abertos.reduce((s, l) => s + num(l.valorEstimado), 0);
  const semConsentimento = abertos.filter((l) => !l.consentiuContato).length;

  return (
    <>
      <Cabecalho
        titulo="Carrinhos abandonados"
        descricao="Quem começou a comprar, deixou o contato e não finalizou"
      />
      <Aviso ok={ok} erro={erro} />

      <div className="kpis">
        <div className="kpi alert">
          <span>Para recuperar</span>
          <b>{abertos.length}</b>
          <small>ainda não contatados</small>
        </div>
        <div className="kpi">
          <span>Valor parado</span>
          <b>{real(perdido)}</b>
          <small>soma do que estava nos carrinhos</small>
        </div>
        <div className="kpi">
          <span>Já contatados</span>
          <b>{todos.filter((l) => !l.convertido && l.contatado).length}</b>
        </div>
        <div className="kpi good">
          <span>Viraram venda</span>
          <b>{todos.filter((l) => l.convertido).length}</b>
        </div>
      </div>

      {semConsentimento > 0 && (
        <div className="note alerta" style={{ marginBottom: 18 }}>
          <b>{semConsentimento} pessoa(s) não autorizaram contato comercial.</b> Elas aparecem na
          lista para você ver o que travou a venda, mas <b>sem os botões de WhatsApp e e-mail</b>.
          Mandar mensagem publicitária para quem recusou é uso indevido de dado pessoal pela LGPD —
          a tela não oferece o atalho de propósito.
        </div>
      )}

      <div className="chips" style={{ marginBottom: 18 }}>
        {[
          { c: 'abertos', r: 'A recuperar' },
          { c: 'contatados', r: 'Já contatados' },
          { c: 'convertidos', r: 'Viraram venda' },
        ].map((t) => (
          <a
            key={t.c}
            className="btn btn-sm"
            href={`/admin/leads?aba=${t.c}`}
            style={{ background: aba === t.c ? 'var(--rose-100)' : 'var(--rose-50)' }}
          >
            {t.r}
          </a>
        ))}
      </div>

      {!leads.length ? (
        <Painel>
          <Vazio
            titulo="Nada nesta lista"
            texto="Quando alguém preencher o e-mail no checkout e não concluir, aparece aqui."
          />
        </Painel>
      ) : (
        leads.map((l) => {
          const itens = (l.itens as unknown as ItemLead[]) ?? [];
          return (
            <Painel key={l.id}>
              <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', alignItems: 'flex-start' }}>
                <div style={{ flex: '1 1 230px' }}>
                  <div style={{ display: 'flex', gap: 9, alignItems: 'center', marginBottom: 6, flexWrap: 'wrap' }}>
                    <b style={{ fontSize: 15 }}>{l.nome || 'Sem nome'}</b>
                    {l.queriaAssinar && <Pill cor="info">Queria assinar</Pill>}
                    {l.convertido ? (
                      <Pill cor="ok">Comprou</Pill>
                    ) : l.consentiuContato ? (
                      <Pill cor="ok">Autorizou contato</Pill>
                    ) : (
                      <Pill cor="out">Sem autorização</Pill>
                    )}
                    {l.afiliadoCodigo && <Pill cor="info">via {l.afiliadoCodigo}</Pill>}
                  </div>
                  <div style={{ fontSize: 13.5, color: 'var(--muted)', lineHeight: 1.6 }}>
                    {l.email}
                    {l.telefone && (
                      <>
                        <br />
                        {l.telefone}
                      </>
                    )}
                    {l.cep && (
                      <>
                        <br />
                        CEP {l.cep}
                      </>
                    )}
                    <br />
                    Última tentativa em {dataHora(l.atualizadoEm)}
                  </div>
                </div>

                <div style={{ flex: '1 1 200px' }}>
                  <div style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '.6px', color: 'var(--muted)', marginBottom: 6 }}>
                    Estava levando
                  </div>
                  {itens.length ? (
                    itens.map((i, n) => (
                      <div key={n} style={{ fontSize: 14, padding: '3px 0' }}>
                        <b>{i.qtd}×</b> {i.nome}
                      </div>
                    ))
                  ) : (
                    <div style={{ fontSize: 13.5, color: 'var(--muted)' }}>carrinho não registrado</div>
                  )}
                  <div style={{ marginTop: 8, fontSize: 14 }}>
                    Total estimado <b style={{ color: 'var(--rose)' }}>{real(l.valorEstimado)}</b>
                  </div>
                </div>

                <div style={{ flex: '0 0 210px' }}>
                  {!l.convertido && l.consentiuContato && (
                    <>
                      {l.telefone && (
                        <a
                          className="btn btn-primary btn-sm btn-block"
                          href={whatsapp(l.telefone, l.nome)}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Chamar no WhatsApp
                        </a>
                      )}
                      <a
                        className="btn btn-ghost btn-sm btn-block"
                        style={{ marginTop: 8 }}
                        href={`mailto:${l.email}?subject=${encodeURIComponent('Sua compra na Glow Make')}`}
                      >
                        Enviar e-mail
                      </a>
                    </>
                  )}

                  {!l.convertido && (
                    <form action={marcarLeadContatado} style={{ marginTop: 8 }}>
                      <input type="hidden" name="id" value={l.id} />
                      <div className="field" style={{ marginBottom: 6 }}>
                        <input name="anotacao" defaultValue={l.anotacao ?? ''} placeholder="O que ela disse" maxLength={300} />
                      </div>
                      <button className="btn btn-soft btn-sm btn-block">Marcar como contatada</button>
                    </form>
                  )}

                  <form action={excluirLead} style={{ marginTop: 8 }}>
                    <input type="hidden" name="id" value={l.id} />
                    <button className="btn btn-danger btn-sm btn-block">Excluir dados</button>
                  </form>
                </div>
              </div>

              {l.anotacao && (
                <div className="note" style={{ marginTop: 12 }}>
                  <b>Anotação:</b> {l.anotacao}
                </div>
              )}
            </Painel>
          );
        })
      )}

      <div className="note" style={{ marginTop: 8 }}>
        <b>Sobre a LGPD.</b> O botão <b>Excluir dados</b> existe para atender pedido de remoção, que
        é direito de qualquer pessoa na base. Guarde o registro só enquanto ele tiver uso comercial
        — lista de lead antiga é passivo, não patrimônio.
      </div>
    </>
  );
}
