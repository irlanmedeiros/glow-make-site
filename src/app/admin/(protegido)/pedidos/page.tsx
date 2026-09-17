import { prisma } from '@/lib/prisma';
import { real, dataHora, ROTULO_PEDIDO, ROTULO_PAGAMENTO, corPedido, num } from '@/lib/format';
import { mudarStatusPedido, anotarPedido, aprovarCancelamento, recusarCancelamento } from '../../actions';
import { Aviso, Cabecalho, Painel, Pill, Vazio, mensagens } from '@/components/admin/Ui';

export const dynamic = 'force-dynamic';

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

const STATUS = [
  'AGUARDANDO_PAGAMENTO',
  'PAGO',
  'EM_SEPARACAO',
  'ENVIADO',
  'ENTREGUE',
  'CANCELADO',
] as const;

export default async function Pedidos({ searchParams }: Props) {
  const sp = await searchParams;
  const { ok, erro } = mensagens(sp);
  const filtro = typeof sp.status === 'string' ? sp.status : '';
  const soPendentes = sp.cancelamento === 'pendente';

  // Mesma condicao de "pendente" usada na pagina da cliente.
  const pendente = {
    cancelamentoSolicitadoEm: { not: null },
    cancelamentoRespondidoEm: null,
    status: { not: 'CANCELADO' as const },
  };

  const pedidos = await prisma.pedido.findMany({
    where: soPendentes
      ? pendente
      : STATUS.includes(filtro as (typeof STATUS)[number])
        ? { status: filtro as (typeof STATUS)[number] }
        : undefined,
    orderBy: { criadoEm: 'desc' },
    take: 100,
    include: { itens: true },
  });

  const [todos, pendentes] = await Promise.all([
    prisma.pedido.findMany({ select: { status: true, total: true } }),
    prisma.pedido.count({ where: pendente }),
  ]);
  const faturado = todos
    .filter((p) => p.status !== 'CANCELADO')
    .reduce((s, p) => s + num(p.total), 0);

  return (
    <>
      <Cabecalho titulo="Pedidos" descricao="Compras avulsas de kits, com baixa de estoque já aplicada" />
      <Aviso ok={ok} erro={erro} />

      {pendentes > 0 && !soPendentes && (
        <div className="note alerta" style={{ marginBottom: 18 }}>
          <b>
            {pendentes} {pendentes === 1 ? 'cliente pediu' : 'clientes pediram'} cancelamento.
          </b>{' '}
          Ninguém é avisado sozinho: a cliente só vê a resposta quando consulta Meus pedidos.{' '}
          <a href="/admin/pedidos?cancelamento=pendente">Ver pedidos</a>
        </div>
      )}

      <div className="kpis">
        <div className="kpi">
          <span>Total de pedidos</span>
          <b>{todos.length}</b>
        </div>
        <div className="kpi good">
          <span>Faturado</span>
          <b>{real(faturado)}</b>
          <small>sem os cancelados</small>
        </div>
        <div className="kpi alert">
          <span>Aguardando pagamento</span>
          <b>{todos.filter((p) => p.status === 'AGUARDANDO_PAGAMENTO').length}</b>
        </div>
        <div className="kpi">
          <span>Entregues</span>
          <b>{todos.filter((p) => p.status === 'ENTREGUE').length}</b>
        </div>
      </div>

      <div className="chips" style={{ marginBottom: 18 }}>
        <a className="btn btn-sm" href="/admin/pedidos" style={{ background: !filtro && !soPendentes ? 'var(--rose-100)' : 'var(--rose-50)' }}>
          Todos
        </a>
        <a
          className="btn btn-sm"
          href="/admin/pedidos?cancelamento=pendente"
          style={{ background: soPendentes ? 'var(--rose-100)' : 'var(--rose-50)' }}
        >
          Cancelamento pedido ({pendentes})
        </a>
        {STATUS.map((s) => (
          <a
            key={s}
            className="btn btn-sm"
            href={`/admin/pedidos?status=${s}`}
            style={{ background: filtro === s ? 'var(--rose-100)' : 'var(--rose-50)' }}
          >
            {ROTULO_PEDIDO[s]}
          </a>
        ))}
      </div>

      {!pedidos.length ? (
        <Painel>
          <Vazio
            titulo="Nenhum pedido nessa lista"
            texto="Quando entrar uma compra pelo site, ela aparece aqui automaticamente."
          />
        </Painel>
      ) : (
        pedidos.map((p) => (
          <Painel key={p.id}>
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-start' }}>
              <div style={{ flex: '1 1 260px' }}>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 8 }}>
                  <b style={{ fontFamily: 'var(--serif)', fontSize: 19 }}>#{p.numero}</b>
                  <Pill cor={corPedido(p.status)}>{ROTULO_PEDIDO[p.status]}</Pill>
                  {p.estoqueDevolvido && <Pill cor="info">Estoque devolvido</Pill>}
                  {p.cancelamentoSolicitadoEm && !p.cancelamentoRespondidoEm && p.status !== 'CANCELADO' && (
                    <Pill cor="low">Cancelamento pedido</Pill>
                  )}
                </div>
                <div style={{ fontSize: 14 }}>
                  <b>{p.nome}</b>
                  <br />
                  <span style={{ color: 'var(--muted)' }}>
                    {p.email} · {p.telefone}
                    <br />
                    CPF/CNPJ {p.documento} · CEP {p.cep}
                    <br />
                    {dataHora(p.criadoEm)} · {ROTULO_PAGAMENTO[p.pagamento] ?? p.pagamento}
                  </span>
                </div>
              </div>

              <div style={{ flex: '1 1 240px' }}>
                <table style={{ fontSize: 13.5 }}>
                  <tbody>
                    {p.itens.map((i) => (
                      <tr key={i.id}>
                        <td style={{ padding: '5px 0', border: 'none' }}>
                          {i.qtd}× {i.nome}
                        </td>
                        <td className="num" style={{ padding: '5px 0', border: 'none' }}>
                          {real(num(i.preco) * i.qtd)}
                        </td>
                      </tr>
                    ))}
                    {num(p.desconto) > 0 && (
                      <tr>
                        <td style={{ padding: '5px 0', border: 'none', color: 'var(--muted)' }}>
                          Cupom {p.cupomCodigo}
                        </td>
                        <td className="num" style={{ padding: '5px 0', border: 'none', color: 'var(--ok)' }}>
                          − {real(p.desconto)}
                        </td>
                      </tr>
                    )}
                    <tr>
                      <td style={{ padding: '5px 0', border: 'none', color: 'var(--muted)' }}>Frete</td>
                      <td className="num" style={{ padding: '5px 0', border: 'none' }}>
                        {num(p.frete) === 0 ? 'Grátis' : real(p.frete)}
                      </td>
                    </tr>
                    <tr>
                      <td style={{ padding: '7px 0 0', border: 'none', fontWeight: 700 }}>Total</td>
                      <td
                        className="num"
                        style={{ padding: '7px 0 0', border: 'none', fontWeight: 700, color: 'var(--rose)' }}
                      >
                        {real(p.total)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div style={{ flex: '0 0 210px' }}>
                <form action={mudarStatusPedido}>
                  <input type="hidden" name="id" value={p.id} />
                  <div className="field" style={{ marginBottom: 8 }}>
                    <label>Mudar status</label>
                    <select name="status" defaultValue={p.status}>
                      {STATUS.map((s) => (
                        <option key={s} value={s}>
                          {ROTULO_PEDIDO[s]}
                        </option>
                      ))}
                    </select>
                  </div>
                  <button className="btn btn-soft btn-sm btn-block">Aplicar</button>
                </form>
                {p.invoiceUrl && (
                  <a
                    className="btn btn-ghost btn-sm btn-block"
                    style={{ marginTop: 8 }}
                    href={p.invoiceUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Abrir cobrança
                  </a>
                )}
              </div>
            </div>

            {p.cancelamentoSolicitadoEm && !p.cancelamentoRespondidoEm && p.status !== 'CANCELADO' && (
              <div className="note alerta" style={{ marginTop: 14 }}>
                <b>A cliente pediu cancelamento em {dataHora(p.cancelamentoSolicitadoEm)}.</b>
                <br />
                {p.cancelamentoMotivo ? <>Motivo: {p.cancelamentoMotivo}</> : 'Sem motivo informado.'}
                {p.status !== 'AGUARDANDO_PAGAMENTO' && (
                  <>
                    <br />
                    O pagamento já entrou. Aprovar devolve o estoque e cancela a comissão, mas{' '}
                    <b>o estorno é feito à mão no painel do Asaas</b>.
                  </>
                )}
                <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 12 }}>
                  <form action={aprovarCancelamento} style={{ flex: '1 1 220px' }}>
                    <input type="hidden" name="id" value={p.id} />
                    <div className="field" style={{ marginBottom: 8 }}>
                      <label>Mensagem para a cliente (opcional)</label>
                      <textarea name="resposta" rows={2} maxLength={500} placeholder="Cancelamento aprovado." />
                    </div>
                    <button className="btn btn-danger btn-sm">Aprovar e cancelar</button>
                  </form>
                  <form action={recusarCancelamento} style={{ flex: '1 1 220px' }}>
                    <input type="hidden" name="id" value={p.id} />
                    <div className="field" style={{ marginBottom: 8 }}>
                      <label>Motivo da recusa (a cliente vê)</label>
                      <textarea name="resposta" rows={2} maxLength={500} required minLength={5} />
                    </div>
                    <button className="btn btn-ghost btn-sm">Recusar</button>
                  </form>
                </div>
              </div>
            )}

            {p.cancelamentoRespondidoEm && p.status !== 'CANCELADO' && (
              <div className="note" style={{ marginTop: 14 }}>
                Cancelamento recusado em {dataHora(p.cancelamentoRespondidoEm)}
                {p.cancelamentoResposta && <>: {p.cancelamentoResposta}</>}
              </div>
            )}

            <details style={{ marginTop: 14 }}>
              <summary style={{ cursor: 'pointer', color: 'var(--rose)', fontSize: 13.5, fontWeight: 600 }}>
                Observação interna
              </summary>
              <form action={anotarPedido} style={{ marginTop: 12 }}>
                <input type="hidden" name="id" value={p.id} />
                <div className="field">
                  <textarea
                    name="observacao"
                    defaultValue={p.observacao ?? ''}
                    rows={2}
                    placeholder="Código de rastreio, combinado com a cliente, etc."
                  />
                </div>
                <button className="btn btn-ghost btn-sm">Salvar observação</button>
              </form>
            </details>

            {p.status !== 'CANCELADO' && (
              <div className="note" style={{ marginTop: 12 }}>
                Cancelar este pedido devolve {p.itens.reduce((s, i) => s + i.qtd, 0)} unidade(s) ao
                estoque, uma única vez
                {p.status === 'AGUARDANDO_PAGAMENTO' && p.asaasPaymentId
                  ? ', e apaga a cobrança em aberto no Asaas.'
                  : '.'}
              </div>
            )}
          </Painel>
        ))
      )}
    </>
  );
}
