import Link from 'next/link';
import { prisma } from '@/lib/prisma';
import { real, dataHora, num, ROTULO_PEDIDO, corPedido } from '@/lib/format';
import { asaasConfigurado } from '@/lib/asaas';
import { Cabecalho, Painel, Pill, Vazio } from '@/components/admin/Ui';

export const dynamic = 'force-dynamic';

export default async function PainelAdmin() {
  const inicioMes = new Date();
  inicioMes.setDate(1);
  inicioMes.setHours(0, 0, 0, 0);

  const [
    produtos,
    pedidosMes,
    pedidosRecentes,
    assinantesAtivos,
    aguardando,
    box,
    ultimasMovimentacoes,
  ] = await Promise.all([
    prisma.kit.findMany({ orderBy: { ordem: 'asc' } }),
    prisma.pedido.findMany({
      where: { criadoEm: { gte: inicioMes }, status: { not: 'CANCELADO' } },
      select: { total: true },
    }),
    prisma.pedido.findMany({ orderBy: { criadoEm: 'desc' }, take: 6, include: { itens: true } }),
    prisma.assinante.count({ where: { status: 'ATIVA' } }),
    prisma.pedido.count({ where: { status: 'AGUARDANDO_PAGAMENTO' } }),
    prisma.kit.findFirst({ where: { tipo: 'BOX' } }),
    prisma.movimentacao.findMany({ orderBy: { criadoEm: 'desc' }, take: 8 }),
  ]);

  const faturamentoMes = pedidosMes.reduce((s, p) => s + num(p.total), 0);
  const comSaldo = produtos.map((p) => ({ ...p, saldo: p.entradas - p.saidas }));
  const baixos = comSaldo.filter((p) => p.saldo > 0 && p.saldo <= p.estoqueBaixo);
  const esgotados = comSaldo.filter((p) => p.saldo <= 0);
  const mrr = assinantesAtivos * num(box?.preco ?? 0);

  return (
    <>
      <Cabecalho
        titulo="Painel"
        descricao={`Visão geral da loja em ${new Date().toLocaleDateString('pt-BR', {
          month: 'long',
          year: 'numeric',
        })}`}
      />

      {!asaasConfigurado() && (
        <div className="note alerta" style={{ marginBottom: 20 }}>
          <b>Modo demonstração.</b> A variável <code>ASAAS_API_KEY</code> não está configurada:
          pedidos e assinaturas são gravados e o estoque baixa normalmente, mas nenhuma cobrança é
          emitida. Configure a chave para começar a receber de verdade.
        </div>
      )}

      <div className="kpis">
        <div className="kpi">
          <span>Faturamento do mês</span>
          <b>{real(faturamentoMes)}</b>
          <small>{pedidosMes.length} pedido(s), sem os cancelados</small>
        </div>
        <div className="kpi good">
          <span>Receita recorrente</span>
          <b>{real(mrr)}</b>
          <small>{assinantesAtivos} assinatura(s) ativa(s)</small>
        </div>
        <div className={`kpi${aguardando ? ' alert' : ''}`}>
          <span>Aguardando pagamento</span>
          <b>{aguardando}</b>
          <small>pedidos ainda não pagos</small>
        </div>
        <div className={`kpi${esgotados.length ? ' bad' : baixos.length ? ' alert' : ''}`}>
          <span>Alertas de estoque</span>
          <b>{esgotados.length + baixos.length}</b>
          <small>
            {esgotados.length} esgotado(s), {baixos.length} em nível baixo
          </small>
        </div>
      </div>

      {(esgotados.length > 0 || baixos.length > 0) && (
        <Painel
          titulo="Precisa de reposição"
          descricao="Produtos que podem travar uma venda a qualquer momento"
          acoes={
            <Link className="btn btn-ghost btn-sm" href="/admin/estoque">
              Ir para o estoque
            </Link>
          }
          flush
        >
          <div className="tbl-scroll">
            <table>
              <thead>
                <tr>
                  <th>Produto</th>
                  <th>SKU</th>
                  <th className="num">Saldo</th>
                  <th>Situação</th>
                </tr>
              </thead>
              <tbody>
                {[...esgotados, ...baixos].map((p) => (
                  <tr key={p.id}>
                    <td>
                      <div className="linha-prod">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={p.imagem} alt="" />
                        <div>
                          <b>{p.nome}</b>
                          <span>{p.tipo === 'BOX' ? 'Assinatura' : 'Kit avulso'}</span>
                        </div>
                      </div>
                    </td>
                    <td style={{ color: 'var(--muted)' }}>{p.sku}</td>
                    <td className="num">
                      <b className={`saldo${p.saldo <= 0 ? ' zero' : ' baixo'}`}>{p.saldo}</b>
                    </td>
                    <td>
                      <Pill cor={p.saldo <= 0 ? 'out' : 'low'}>
                        {p.saldo <= 0 ? 'Esgotado' : 'Estoque baixo'}
                      </Pill>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Painel>
      )}

      <Painel
        titulo="Últimos pedidos"
        acoes={
          <Link className="btn btn-ghost btn-sm" href="/admin/pedidos">
            Ver todos
          </Link>
        }
        flush
      >
        {!pedidosRecentes.length ? (
          <Vazio titulo="Nenhum pedido ainda" texto="Assim que a primeira venda entrar, ela aparece aqui." />
        ) : (
          <div className="tbl-scroll">
            <table>
              <thead>
                <tr>
                  <th>Pedido</th>
                  <th>Cliente</th>
                  <th>Itens</th>
                  <th className="num">Total</th>
                  <th>Status</th>
                  <th>Data</th>
                </tr>
              </thead>
              <tbody>
                {pedidosRecentes.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <b>#{p.numero}</b>
                    </td>
                    <td>
                      {p.nome}
                      <br />
                      <small style={{ color: 'var(--muted)' }}>{p.email}</small>
                    </td>
                    <td style={{ fontSize: 13 }}>
                      {p.itens.map((i) => `${i.qtd}× ${i.nome}`).join(', ')}
                    </td>
                    <td className="num">
                      <b>{real(p.total)}</b>
                    </td>
                    <td>
                      <Pill cor={corPedido(p.status)}>{ROTULO_PEDIDO[p.status]}</Pill>
                    </td>
                    <td style={{ color: 'var(--muted)', fontSize: 13 }}>{dataHora(p.criadoEm)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Painel>

      <Painel titulo="Movimentações recentes de estoque" flush>
        {!ultimasMovimentacoes.length ? (
          <Vazio titulo="Sem movimentações" texto="Entradas, saídas e ajustes aparecem aqui." />
        ) : (
          <div className="tbl-scroll">
            <table>
              <thead>
                <tr>
                  <th>Quando</th>
                  <th>Produto</th>
                  <th>Tipo</th>
                  <th className="num">Qtd</th>
                  <th className="num">Saldo depois</th>
                  <th>Origem</th>
                </tr>
              </thead>
              <tbody>
                {ultimasMovimentacoes.map((m) => (
                  <tr key={m.id}>
                    <td style={{ color: 'var(--muted)', fontSize: 13 }}>{dataHora(m.criadoEm)}</td>
                    <td>{m.nome}</td>
                    <td>
                      <Pill cor={m.tipo === 'ENTRADA' ? 'ok' : m.tipo === 'SAIDA' ? 'low' : 'info'}>
                        {m.tipo === 'ENTRADA' ? 'Entrada' : m.tipo === 'SAIDA' ? 'Saída' : 'Ajuste'}
                      </Pill>
                    </td>
                    <td className="num">
                      <b>
                        {m.tipo === 'SAIDA' ? '−' : '+'}
                        {m.qtd}
                      </b>
                    </td>
                    <td className="num">{m.saldoApos}</td>
                    <td style={{ color: 'var(--muted)', fontSize: 13 }}>{m.origem}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Painel>
    </>
  );
}
