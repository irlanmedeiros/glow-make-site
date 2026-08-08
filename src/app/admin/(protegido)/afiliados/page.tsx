import { prisma } from '@/lib/prisma';
import { real, dataHora, num } from '@/lib/format';
import { salvarAfiliado, pagarComissoes } from '../../actions';
import { Aviso, Cabecalho, Painel, Pill, Vazio, mensagens } from '@/components/admin/Ui';
import CopiarEndereco from '@/components/admin/CopiarEndereco';

export const dynamic = 'force-dynamic';

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

const ROTULO: Record<string, string> = {
  PENDENTE: 'Aguardando pagamento do cliente',
  APROVADA: 'A pagar',
  PAGA: 'Paga',
  CANCELADA: 'Cancelada',
};

type Campos = {
  id?: string;
  nome?: string;
  codigo?: string;
  email?: string;
  telefone?: string;
  instagram?: string;
  documento?: string;
  chavePix?: string;
  percentual?: number;
  recorrente?: boolean;
  ativo?: boolean;
};

function Formulario({ a, novo = false }: { a: Campos; novo?: boolean }) {
  return (
    <form action={salvarAfiliado}>
      {a.id && <input type="hidden" name="id" value={a.id} />}
      <div className="row2">
        <div className="field">
          <label>Nome</label>
          <input name="nome" defaultValue={a.nome ?? ''} required maxLength={120} />
        </div>
        <div className="field">
          <label>Código do link</label>
          <input name="codigo" defaultValue={a.codigo ?? ''} required maxLength={40} placeholder="MARIA" />
          <small>Só letras e números. Vira o ?ref= do link.</small>
        </div>
      </div>
      <div className="row2">
        <div className="field">
          <label>E-mail</label>
          <input name="email" defaultValue={a.email ?? ''} maxLength={120} />
        </div>
        <div className="field">
          <label>WhatsApp</label>
          <input name="telefone" defaultValue={a.telefone ?? ''} maxLength={20} />
        </div>
      </div>
      <div className="row2">
        <div className="field">
          <label>Instagram</label>
          <input name="instagram" defaultValue={a.instagram ?? ''} maxLength={60} placeholder="@perfil" />
        </div>
        <div className="field">
          <label>CPF ou CNPJ</label>
          <input name="documento" defaultValue={a.documento ?? ''} maxLength={20} />
        </div>
      </div>
      <div className="row2">
        <div className="field">
          <label>Chave PIX para pagamento</label>
          <input name="chavePix" defaultValue={a.chavePix ?? ''} maxLength={120} />
        </div>
        <div className="field">
          <label>Comissão (%)</label>
          <input
            name="percentual"
            defaultValue={(a.percentual ?? 50).toFixed(2).replace('.', ',')}
            required
          />
          <small>Sobre o valor dos produtos, sem o frete.</small>
        </div>
      </div>
      <div className="field">
        <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input type="checkbox" name="recorrente" defaultChecked={a.recorrente ?? true} style={{ width: 'auto' }} />
          Ganha comissão em todo mês da assinatura
        </label>
        <small>
          Desmarcado, recebe só pela adesão. Marcado, recebe todo mês enquanto a pessoa assinar.
        </small>
      </div>
      <div className="field">
        <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input type="checkbox" name="ativo" defaultChecked={a.ativo ?? true} style={{ width: 'auto' }} />
          Link ativo
        </label>
      </div>
      <button className="btn btn-primary">{novo ? 'Criar afiliado' : 'Salvar'}</button>
    </form>
  );
}

export default async function Afiliados({ searchParams }: Props) {
  const { ok, erro } = mensagens(await searchParams);

  const [afiliados, comissoes, config] = await Promise.all([
    prisma.afiliado.findMany({ orderBy: { criadoEm: 'desc' } }),
    prisma.comissao.findMany({ orderBy: { criadoEm: 'desc' }, take: 200 }),
    prisma.config.findUnique({ where: { id: 'config' } }),
  ]);

  const site = 'https://glow-make-site.vercel.app';
  const soma = (id: string, status: string) =>
    comissoes.filter((c) => c.afiliadoId === id && c.status === status).reduce((s, c) => s + num(c.valor), 0);

  const totalAPagar = comissoes.filter((c) => c.status === 'APROVADA').reduce((s, c) => s + num(c.valor), 0);
  const totalPago = comissoes.filter((c) => c.status === 'PAGA').reduce((s, c) => s + num(c.valor), 0);
  const totalPendente = comissoes.filter((c) => c.status === 'PENDENTE').reduce((s, c) => s + num(c.valor), 0);

  return (
    <>
      <Cabecalho titulo="Afiliados" descricao="Influenciadores que vendem pelo link próprio" />
      <Aviso ok={ok} erro={erro} />

      <div className="kpis">
        <div className="kpi">
          <span>Afiliados ativos</span>
          <b>{afiliados.filter((a) => a.ativo).length}</b>
        </div>
        <div className="kpi alert">
          <span>A pagar</span>
          <b>{real(totalAPagar)}</b>
          <small>comissões já aprovadas</small>
        </div>
        <div className="kpi">
          <span>Aguardando</span>
          <b>{real(totalPendente)}</b>
          <small>venda feita, cliente ainda não pagou</small>
        </div>
        <div className="kpi good">
          <span>Já pago</span>
          <b>{real(totalPago)}</b>
        </div>
      </div>

      <div className="note alerta" style={{ marginBottom: 20 }}>
        <b>Confira a conta antes de escalar.</b> Com 50% recorrente sobre a assinatura de{' '}
        {real(num(config?.freteValor ?? 0) > 0 ? 99.9 : 99.9)}, sobram cerca de{' '}
        {real(49.95)} por mês para produto, embalagem, frete e imposto. Funciona para poucos
        influenciadores como investimento de lançamento; em volume, aperta. O percentual é editável
        por afiliado, então dá para ajustar sem mexer em quem já está com o combinado antigo.
      </div>

      {afiliados.map((a) => {
        const link = `${site}/?ref=${a.codigo}`;
        const minhas = comissoes.filter((c) => c.afiliadoId === a.id);
        return (
          <Painel key={a.id}>
            <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
              <div style={{ flex: '1 1 220px' }}>
                <div style={{ display: 'flex', gap: 9, alignItems: 'center', marginBottom: 4 }}>
                  <b style={{ fontFamily: 'var(--serif)', fontSize: 18 }}>{a.nome}</b>
                  <Pill cor={a.ativo ? 'ok' : 'out'}>{a.ativo ? 'Ativo' : 'Desligado'}</Pill>
                  {a.recorrente && <Pill cor="info">Recorrente</Pill>}
                </div>
                <div style={{ fontSize: 13, color: 'var(--muted)' }}>
                  {a.instagram && <>{a.instagram} · </>}
                  {num(a.percentual)}% de comissão · {a.cliques} clique(s)
                </div>
                <code
                  style={{
                    display: 'inline-block',
                    marginTop: 8,
                    fontSize: 12.5,
                    background: 'var(--rose-50)',
                    padding: '6px 11px',
                    borderRadius: 8,
                    wordBreak: 'break-all',
                  }}
                >
                  {link}
                </code>
                <CopiarEndereco texto={link} />
              </div>

              <div style={{ flex: '0 0 200px' }}>
                <div className="tot">
                  <span>A pagar</span>
                  <b style={{ color: 'var(--rose)' }}>{real(soma(a.id, 'APROVADA'))}</b>
                </div>
                <div className="tot">
                  <span>Aguardando</span>
                  <span>{real(soma(a.id, 'PENDENTE'))}</span>
                </div>
                <div className="tot">
                  <span>Já pago</span>
                  <span>{real(soma(a.id, 'PAGA'))}</span>
                </div>
                {a.chavePix && (
                  <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 6 }}>
                    PIX: {a.chavePix}
                  </div>
                )}
                <form action={pagarComissoes} style={{ marginTop: 10 }}>
                  <input type="hidden" name="afiliadoId" value={a.id} />
                  <button className="btn btn-soft btn-sm btn-block">Marcar como pago</button>
                </form>
              </div>
            </div>

            <details style={{ marginTop: 12 }}>
              <summary style={{ cursor: 'pointer', color: 'var(--rose)', fontSize: 14, fontWeight: 600 }}>
                Editar cadastro
              </summary>
              <div style={{ marginTop: 16 }}>
                <Formulario
                  a={{
                    id: a.id,
                    nome: a.nome,
                    codigo: a.codigo,
                    email: a.email,
                    telefone: a.telefone,
                    instagram: a.instagram,
                    documento: a.documento,
                    chavePix: a.chavePix,
                    percentual: num(a.percentual),
                    recorrente: a.recorrente,
                    ativo: a.ativo,
                  }}
                />
              </div>
            </details>

            {minhas.length > 0 && (
              <details style={{ marginTop: 10 }}>
                <summary style={{ cursor: 'pointer', color: 'var(--rose)', fontSize: 14, fontWeight: 600 }}>
                  Ver as {minhas.length} comissão(ões)
                </summary>
                <div className="tbl-scroll" style={{ marginTop: 12 }}>
                  <table>
                    <thead>
                      <tr>
                        <th>Origem</th>
                        <th className="num">Base</th>
                        <th className="num">%</th>
                        <th className="num">Comissão</th>
                        <th>Status</th>
                        <th>Data</th>
                      </tr>
                    </thead>
                    <tbody>
                      {minhas.map((c) => (
                        <tr key={c.id}>
                          <td>{c.origem}</td>
                          <td className="num">{real(c.valorBase)}</td>
                          <td className="num">{num(c.percentual)}%</td>
                          <td className="num">
                            <b>{real(c.valor)}</b>
                          </td>
                          <td>
                            <Pill
                              cor={
                                c.status === 'PAGA'
                                  ? 'ok'
                                  : c.status === 'APROVADA'
                                    ? 'low'
                                    : c.status === 'CANCELADA'
                                      ? 'out'
                                      : 'info'
                              }
                            >
                              {ROTULO[c.status]}
                            </Pill>
                          </td>
                          <td style={{ color: 'var(--muted)', fontSize: 13 }}>{dataHora(c.criadoEm)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            )}
          </Painel>
        );
      })}

      {!afiliados.length && (
        <Painel>
          <Vazio
            titulo="Nenhum afiliado ainda"
            texto="Cadastre o primeiro influenciador abaixo e mande o link para ele."
          />
        </Painel>
      )}

      <Painel titulo="Novo afiliado" descricao="O link fica pronto assim que você salvar">
        <Formulario a={{ ativo: true, recorrente: true, percentual: 50 }} novo />
      </Painel>
    </>
  );
}
