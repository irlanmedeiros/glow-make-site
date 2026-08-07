import { prisma } from '@/lib/prisma';
import { real, dataHora, num, ROTULO_ASSINANTE, corAssinante } from '@/lib/format';
import { cancelarAssinante, reativarAssinante } from '../../actions';
import { Aviso, Cabecalho, Painel, Pill, Vazio, mensagens } from '@/components/admin/Ui';

export const dynamic = 'force-dynamic';

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function Assinantes({ searchParams }: Props) {
  const { ok, erro } = mensagens(await searchParams);

  const [assinantes, box] = await Promise.all([
    prisma.assinante.findMany({ orderBy: { criadoEm: 'desc' }, take: 200 }),
    prisma.kit.findFirst({ where: { tipo: 'BOX' } }),
  ]);

  const ativos = assinantes.filter((a) => a.status === 'ATIVA');
  const mrr = ativos.reduce((s, a) => s + num(a.valor), 0);
  const saldoBox = box ? box.entradas - box.saidas : 0;

  return (
    <>
      <Cabecalho
        titulo="Assinantes"
        descricao="Quem assina a Glow Box. Cada assinatura ativa reserva uma caixa da edição."
      />
      <Aviso ok={ok} erro={erro} />

      <div className="kpis">
        <div className="kpi good">
          <span>Assinaturas ativas</span>
          <b>{ativos.length}</b>
        </div>
        <div className="kpi">
          <span>Receita recorrente</span>
          <b>{real(mrr)}</b>
          <small>por mês, das ativas</small>
        </div>
        <div className="kpi alert">
          <span>Aguardando ou atrasadas</span>
          <b>
            {assinantes.filter((a) => a.status === 'AGUARDANDO_PAGAMENTO' || a.status === 'ATRASADA').length}
          </b>
        </div>
        <div className={`kpi${saldoBox <= 0 ? ' bad' : ''}`}>
          <span>Caixas restantes</span>
          <b>{saldoBox}</b>
          <small>nesta edição</small>
        </div>
      </div>

      <Painel titulo="Lista de assinantes" flush>
        {!assinantes.length ? (
          <Vazio
            titulo="Nenhuma assinatura ainda"
            texto="Quando alguém assinar a Glow Box pelo site, aparece aqui."
          />
        ) : (
          <div className="tbl-scroll">
            <table>
              <thead>
                <tr>
                  <th>Assinante</th>
                  <th>Contato</th>
                  <th>Documento</th>
                  <th className="num">Valor</th>
                  <th>Status</th>
                  <th>Desde</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {assinantes.map((a) => (
                  <tr key={a.id}>
                    <td>
                      <b>{a.nome}</b>
                      {a.asaasSubscriptionId && (
                        <>
                          <br />
                          <small style={{ color: 'var(--muted)' }}>
                            Asaas: {a.asaasSubscriptionId}
                          </small>
                        </>
                      )}
                    </td>
                    <td style={{ fontSize: 13 }}>
                      {a.email}
                      <br />
                      <span style={{ color: 'var(--muted)' }}>{a.telefone}</span>
                    </td>
                    <td style={{ fontSize: 13 }}>{a.documento}</td>
                    <td className="num">
                      <b>{real(a.valor)}</b>
                    </td>
                    <td>
                      <Pill cor={corAssinante(a.status)}>{ROTULO_ASSINANTE[a.status]}</Pill>
                    </td>
                    <td style={{ color: 'var(--muted)', fontSize: 13, whiteSpace: 'nowrap' }}>
                      {dataHora(a.criadoEm)}
                    </td>
                    <td>
                      {a.status === 'CANCELADA' ? (
                        <form action={reativarAssinante}>
                          <input type="hidden" name="id" value={a.id} />
                          <button className="btn btn-ghost btn-sm">Reativar</button>
                        </form>
                      ) : (
                        <form action={cancelarAssinante}>
                          <input type="hidden" name="id" value={a.id} />
                          <button className="btn btn-danger btn-sm">Cancelar</button>
                        </form>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Painel>

      <div className="note">
        Cancelar aqui encerra a cobrança recorrente no Asaas <b>e</b> devolve a caixa reservada ao
        estoque da edição. Se o Asaas recusar o cancelamento, a tela avisa — nesse caso confira
        também no painel do Asaas, senão a cobrança continua rodando por lá.
      </div>
    </>
  );
}
