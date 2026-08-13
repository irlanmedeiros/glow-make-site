import { prisma } from '@/lib/prisma';
import { real, dataHora, num } from '@/lib/format';
import { ROTULO_FORMA, type FormaPagamento } from '@/lib/pdv';
import { cancelarVendaAdmin } from '../../actions';
import { Aviso, Cabecalho, Painel, Pill, Vazio, mensagens } from '@/components/admin/Ui';

export const dynamic = 'force-dynamic';

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function VendasLoja({ searchParams }: Props) {
  const { ok, erro } = mensagens(await searchParams);

  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const inicioMes = new Date();
  inicioMes.setDate(1);
  inicioMes.setHours(0, 0, 0, 0);

  const [vendas, doMes, caixas] = await Promise.all([
    prisma.vendaLoja.findMany({
      orderBy: { criadoEm: 'desc' },
      take: 120,
      include: { itens: true },
    }),
    prisma.vendaLoja.findMany({
      where: { criadoEm: { gte: inicioMes }, cancelada: false },
      select: { total: true, formaPagamento: true, criadoEm: true },
    }),
    prisma.caixa.findMany({ orderBy: { abertoEm: 'desc' }, take: 15 }),
  ]);

  const totalMes = doMes.reduce((s, v) => s + num(v.total), 0);
  const deHoje = doMes.filter((v) => v.criadoEm >= hoje);
  const totalHoje = deHoje.reduce((s, v) => s + num(v.total), 0);
  const ticket = doMes.length ? totalMes / doMes.length : 0;

  const porForma = (['DINHEIRO', 'PIX', 'DEBITO', 'CREDITO'] as FormaPagamento[]).map((f) => ({
    forma: f,
    total: doMes.filter((v) => v.formaPagamento === f).reduce((s, v) => s + num(v.total), 0),
    qtd: doMes.filter((v) => v.formaPagamento === f).length,
  }));

  return (
    <>
      <Cabecalho
        titulo="Vendas da loja"
        descricao="O que foi vendido no balcão, com valor e forma de pagamento"
      />
      <Aviso ok={ok} erro={erro} />

      <div className="kpis">
        <div className="kpi good">
          <span>Vendido hoje</span>
          <b>{real(totalHoje)}</b>
          <small>{deHoje.length} venda(s)</small>
        </div>
        <div className="kpi">
          <span>Vendido no mês</span>
          <b>{real(totalMes)}</b>
          <small>{doMes.length} venda(s), sem as canceladas</small>
        </div>
        <div className="kpi">
          <span>Ticket médio</span>
          <b>{real(ticket)}</b>
        </div>
        <div className="kpi">
          <span>Caixas registrados</span>
          <b>{caixas.length}</b>
        </div>
      </div>

      <Painel titulo="Entrada por forma de pagamento" descricao="No mês corrente" flush>
        <div className="tbl-scroll">
          <table>
            <thead>
              <tr>
                <th>Forma</th>
                <th className="num">Vendas</th>
                <th className="num">Total</th>
                <th className="num">Participação</th>
              </tr>
            </thead>
            <tbody>
              {porForma.map((f) => (
                <tr key={f.forma}>
                  <td>{ROTULO_FORMA[f.forma]}</td>
                  <td className="num">{f.qtd}</td>
                  <td className="num"><b>{real(f.total)}</b></td>
                  <td className="num" style={{ color: 'var(--muted)' }}>
                    {totalMes ? `${Math.round((f.total / totalMes) * 100)}%` : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Painel>

      <Painel titulo="Fechamentos de caixa" flush>
        {!caixas.length ? (
          <Vazio titulo="Nenhum caixa ainda" texto="A equipe abre o caixa na tela da loja." />
        ) : (
          <div className="tbl-scroll">
            <table>
              <thead>
                <tr>
                  <th>Aberto</th>
                  <th>Por</th>
                  <th className="num">Troco inicial</th>
                  <th>Fechado</th>
                  <th className="num">Contado</th>
                  <th>Situação</th>
                </tr>
              </thead>
              <tbody>
                {caixas.map((c) => (
                  <tr key={c.id}>
                    <td style={{ color: 'var(--muted)', fontSize: 13 }}>{dataHora(c.abertoEm)}</td>
                    <td>{c.abertoPor}</td>
                    <td className="num">{real(c.trocoInicial)}</td>
                    <td style={{ color: 'var(--muted)', fontSize: 13 }}>
                      {c.fechadoEm ? dataHora(c.fechadoEm) : '—'}
                    </td>
                    <td className="num">
                      {c.contadoDinheiro != null ? real(c.contadoDinheiro) : '—'}
                    </td>
                    <td>
                      <Pill cor={c.fechadoEm ? 'ok' : 'low'}>
                        {c.fechadoEm ? 'Fechado' : 'Aberto agora'}
                      </Pill>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Painel>

      <Painel titulo="Todas as vendas do balcão" flush>
        {!vendas.length ? (
          <Vazio
            titulo="Nenhuma venda no balcão ainda"
            texto="Quando a equipe registrar a primeira venda na tela da loja, ela aparece aqui."
          />
        ) : (
          <div className="tbl-scroll">
            <table>
              <thead>
                <tr>
                  <th>Venda</th>
                  <th>Itens</th>
                  <th>Quem vendeu</th>
                  <th>Pagamento</th>
                  <th className="num">Desconto</th>
                  <th className="num">Total</th>
                  <th>Quando</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {vendas.map((v) => (
                  <tr key={v.id} style={v.cancelada ? { opacity: 0.55 } : undefined}>
                    <td><b>#{v.numero}</b></td>
                    <td style={{ fontSize: 13 }}>
                      {v.itens.map((i) => `${i.qtd}× ${i.nome}`).join(', ')}
                    </td>
                    <td>{v.vendedora}</td>
                    <td>{ROTULO_FORMA[v.formaPagamento as FormaPagamento]}</td>
                    <td className="num">{num(v.desconto) > 0 ? real(v.desconto) : '—'}</td>
                    <td className="num"><b>{real(v.total)}</b></td>
                    <td style={{ color: 'var(--muted)', fontSize: 13, whiteSpace: 'nowrap' }}>
                      {dataHora(v.criadoEm)}
                    </td>
                    <td>
                      {v.cancelada ? (
                        <Pill cor="out">Cancelada</Pill>
                      ) : (
                        <form action={cancelarVendaAdmin}>
                          <input type="hidden" name="id" value={v.id} />
                          <input type="hidden" name="motivo" value="Cancelada pelo admin" />
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
        Cancelar uma venda <b>devolve as peças ao estoque</b> e tira o valor do faturamento. O
        registro continua na lista, riscado — venda cancelada some do relatório mas não do
        histórico.
      </div>
    </>
  );
}
