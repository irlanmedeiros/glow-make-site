import { prisma } from '@/lib/prisma';
import { real, dataHora, ROTULO_PEDIDO, corPedido } from '@/lib/format';
import { marcarSeparado, marcarEnviado, marcarEntregue, salvarRastreio } from '../../actions';
import { Aviso, Cabecalho, Painel, Pill, Vazio, mensagens } from '@/components/admin/Ui';
import CopiarEndereco from '@/components/admin/CopiarEndereco';

export const dynamic = 'force-dynamic';

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

/* A fila de expedição. Pedido só entra depois de pago — separar antes do
   dinheiro entrar é como a loja perde mercadoria. */
const FILA = ['PAGO', 'EM_SEPARACAO', 'ENVIADO'] as const;

const ABAS = [
  { chave: 'fila', rotulo: 'Fila de entrega' },
  { chave: 'PAGO', rotulo: 'A separar' },
  { chave: 'EM_SEPARACAO', rotulo: 'A despachar' },
  { chave: 'ENVIADO', rotulo: 'Em trânsito' },
  { chave: 'ENTREGUE', rotulo: 'Entregues' },
] as const;

function enderecoCompleto(p: {
  endereco: string; enderecoNumero: string; complemento: string;
  bairro: string; cidade: string; uf: string; cep: string;
}) {
  const linha1 = [p.endereco, p.enderecoNumero].filter(Boolean).join(', ');
  const linha2 = [p.complemento, p.bairro].filter(Boolean).join(' · ');
  const linha3 = [p.cidade && p.uf ? `${p.cidade} - ${p.uf}` : p.cidade || p.uf, p.cep]
    .filter(Boolean)
    .join(' · ');
  return [linha1, linha2, linha3].filter(Boolean);
}

export default async function Entregas({ searchParams }: Props) {
  const sp = await searchParams;
  const { ok, erro } = mensagens(sp);
  const aba = (typeof sp.aba === 'string' ? sp.aba : 'fila') as string;

  const where =
    aba === 'fila'
      ? { status: { in: [...FILA] } }
      : ABAS.some((a) => a.chave === aba)
        ? { status: aba as (typeof FILA)[number] | 'ENTREGUE' }
        : { status: { in: [...FILA] } };

  const [pedidos, contagem] = await Promise.all([
    prisma.pedido.findMany({
      where,
      orderBy: { criadoEm: 'asc' }, // mais antigo primeiro: quem espera há mais tempo sai antes
      take: 100,
      include: { itens: true },
    }),
    prisma.pedido.groupBy({ by: ['status'], _count: true }),
  ]);

  const qtd = (s: string) => contagem.find((c) => c.status === s)?._count ?? 0;
  const aSeparar = qtd('PAGO');
  const aDespachar = qtd('EM_SEPARACAO');
  const emTransito = qtd('ENVIADO');
  const naoPagos = qtd('AGUARDANDO_PAGAMENTO');

  return (
    <>
      <Cabecalho
        titulo="Entregas"
        descricao="Quem comprou, o que precisa sair e onde cada encomenda está"
      />
      <Aviso ok={ok} erro={erro} />

      <div className="kpis">
        <div className={`kpi${aSeparar ? ' alert' : ''}`}>
          <span>A separar</span>
          <b>{aSeparar}</b>
          <small>pagos, esperando montagem</small>
        </div>
        <div className={`kpi${aDespachar ? ' alert' : ''}`}>
          <span>A despachar</span>
          <b>{aDespachar}</b>
          <small>montados, esperando postagem</small>
        </div>
        <div className="kpi">
          <span>Em trânsito</span>
          <b>{emTransito}</b>
          <small>a caminho do cliente</small>
        </div>
        <div className="kpi good">
          <span>Entregues</span>
          <b>{qtd('ENTREGUE')}</b>
        </div>
      </div>

      {naoPagos > 0 && (
        <div className="note alerta" style={{ marginBottom: 18 }}>
          <b>{naoPagos} pedido(s) aguardando pagamento</b> não aparecem na fila de propósito. Eles
          entram sozinhos assim que o pagamento for confirmado. Se precisar liberar antes, mude o
          status na aba Pedidos.
        </div>
      )}

      <div className="chips" style={{ marginBottom: 18 }}>
        {ABAS.map((a) => (
          <a
            key={a.chave}
            className="btn btn-sm"
            href={`/admin/entregas?aba=${a.chave}`}
            style={{ background: aba === a.chave ? 'var(--rose-100)' : 'var(--rose-50)' }}
          >
            {a.rotulo}
          </a>
        ))}
      </div>

      {!pedidos.length ? (
        <Painel>
          <Vazio
            titulo="Nada para entregar agora"
            texto="Assim que um pedido for pago, ele aparece aqui pronto para separar."
          />
        </Painel>
      ) : (
        pedidos.map((p) => {
          const linhas = enderecoCompleto(p);
          const semEndereco = !p.endereco || !p.cidade;
          const textoCopia = `${p.nome}\n${linhas.join('\n')}\nTelefone: ${p.telefone}`;

          return (
            <Painel key={p.id}>
              <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', alignItems: 'flex-start' }}>
                {/* --- destinatário --- */}
                <div style={{ flex: '1 1 250px' }}>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 8 }}>
                    <b style={{ fontFamily: 'var(--serif)', fontSize: 19 }}>#{p.numero}</b>
                    <Pill cor={corPedido(p.status)}>{ROTULO_PEDIDO[p.status]}</Pill>
                  </div>
                  <b style={{ fontSize: 14.5 }}>{p.nome}</b>

                  {semEndereco ? (
                    <div className="note erro" style={{ marginTop: 8 }}>
                      Pedido sem endereço completo. Foi feito antes de o site passar a pedir rua e
                      número — confirme com o cliente pelo telefone {p.telefone} antes de despachar.
                    </div>
                  ) : (
                    <div style={{ fontSize: 13.5, color: 'var(--muted)', marginTop: 6, lineHeight: 1.5 }}>
                      {linhas.map((l) => (
                        <div key={l}>{l}</div>
                      ))}
                      <div style={{ marginTop: 6 }}>{p.telefone}</div>
                    </div>
                  )}

                  {!semEndereco && <CopiarEndereco texto={textoCopia} />}
                </div>

                {/* --- o que separar --- */}
                <div style={{ flex: '1 1 220px' }}>
                  <div style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '.6px', color: 'var(--muted)', marginBottom: 8 }}>
                    Separar
                  </div>
                  {p.itens.map((i) => (
                    <div
                      key={i.id}
                      style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, padding: '4px 0' }}
                    >
                      <span>
                        <b>{i.qtd}×</b> {i.nome}
                      </span>
                      <span style={{ color: 'var(--muted)', fontSize: 12.5 }}>{i.sku}</span>
                    </div>
                  ))}
                  <div style={{ marginTop: 10, fontSize: 13, color: 'var(--muted)' }}>
                    Total {real(p.total)} · pedido de {dataHora(p.criadoEm)}
                  </div>
                </div>

                {/* --- ações --- */}
                <div style={{ flex: '0 0 230px' }}>
                  {p.status === 'PAGO' && (
                    <form action={marcarSeparado}>
                      <input type="hidden" name="id" value={p.id} />
                      <button className="btn btn-primary btn-sm btn-block">Iniciar separação</button>
                    </form>
                  )}

                  {(p.status === 'EM_SEPARACAO' || p.status === 'ENVIADO') && (
                    <form action={p.status === 'ENVIADO' ? salvarRastreio : marcarEnviado}>
                      <input type="hidden" name="id" value={p.id} />
                      <div className="field" style={{ marginBottom: 8 }}>
                        <label>Transportadora</label>
                        <input
                          name="transportadora"
                          defaultValue={p.transportadora ?? 'Correios'}
                          maxLength={60}
                        />
                      </div>
                      <div className="field" style={{ marginBottom: 8 }}>
                        <label>Código de rastreio</label>
                        <input
                          name="codigoRastreio"
                          defaultValue={p.codigoRastreio ?? ''}
                          placeholder="AA123456789BR"
                          maxLength={60}
                        />
                      </div>
                      <button className="btn btn-primary btn-sm btn-block">
                        {p.status === 'ENVIADO' ? 'Atualizar rastreio' : 'Marcar como enviado'}
                      </button>
                    </form>
                  )}

                  {p.status === 'ENVIADO' && (
                    <form action={marcarEntregue} style={{ marginTop: 8 }}>
                      <input type="hidden" name="id" value={p.id} />
                      <button className="btn btn-ghost btn-sm btn-block">Confirmar entrega</button>
                    </form>
                  )}

                  {p.status === 'ENTREGUE' && (
                    <div style={{ fontSize: 13, color: 'var(--muted)' }}>
                      {p.codigoRastreio && (
                        <>
                          Rastreio <b>{p.codigoRastreio}</b>
                          <br />
                        </>
                      )}
                      {p.entregueEm && <>Entregue em {dataHora(p.entregueEm)}</>}
                    </div>
                  )}

                  {p.codigoRastreio && p.status !== 'ENTREGUE' && (
                    <a
                      className="btn btn-ghost btn-sm btn-block"
                      style={{ marginTop: 8 }}
                      href={`https://rastreamento.correios.com.br/app/index.php?objetos=${encodeURIComponent(p.codigoRastreio)}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Rastrear nos Correios
                    </a>
                  )}
                </div>
              </div>

              {p.observacao && (
                <div className="note" style={{ marginTop: 12 }}>
                  <b>Observação:</b> {p.observacao}
                </div>
              )}
            </Painel>
          );
        })
      )}
    </>
  );
}
