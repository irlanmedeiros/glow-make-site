import { prisma } from '@/lib/prisma';
import { dataHora } from '@/lib/format';
import { lancarEntrada, ajustarSaldo } from '../../actions';
import { Aviso, Cabecalho, Painel, Pill, Vazio, mensagens } from '@/components/admin/Ui';

export const dynamic = 'force-dynamic';

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function Estoque({ searchParams }: Props) {
  const { ok, erro } = mensagens(await searchParams);

  const [produtos, movimentacoes] = await Promise.all([
    prisma.kit.findMany({ orderBy: [{ tipo: 'asc' }, { ordem: 'asc' }] }),
    prisma.movimentacao.findMany({ orderBy: { criadoEm: 'desc' }, take: 60 }),
  ]);

  const comSaldo = produtos.map((p) => ({ ...p, saldo: p.entradas - p.saidas }));
  const totalSaldo = comSaldo.reduce((s, p) => s + p.saldo, 0);
  const totalSaidas = comSaldo.reduce((s, p) => s + p.saidas, 0);
  const baixos = comSaldo.filter((p) => p.saldo > 0 && p.saldo <= p.estoqueBaixo).length;
  const esgotados = comSaldo.filter((p) => p.saldo <= 0).length;

  return (
    <>
      <Cabecalho
        titulo="Controle de estoque"
        descricao="Quanto entrou, quanto saiu e quanto resta de cada produto"
      />
      <Aviso ok={ok} erro={erro} />

      <div className="kpis">
        <div className="kpi">
          <span>Unidades em estoque</span>
          <b>{totalSaldo}</b>
          <small>somando todos os produtos</small>
        </div>
        <div className="kpi">
          <span>Saíram (vendidos)</span>
          <b>{totalSaidas}</b>
          <small>desde o início</small>
        </div>
        <div className={`kpi${baixos ? ' alert' : ''}`}>
          <span>Em nível baixo</span>
          <b>{baixos}</b>
          <small>abaixo do limite de alerta</small>
        </div>
        <div className={`kpi${esgotados ? ' bad' : ''}`}>
          <span>Esgotados</span>
          <b>{esgotados}</b>
          <small>fora de venda no site</small>
        </div>
      </div>

      <Painel
        titulo="Produtos"
        descricao="O saldo é sempre entradas menos saídas. Saldo zero tira o produto de venda automaticamente."
        flush
      >
        <div className="tbl-scroll">
          <table>
            <thead>
              <tr>
                <th>Produto</th>
                <th className="num">Entradas</th>
                <th className="num">Saíram</th>
                <th className="num">Saldo</th>
                <th>Situação</th>
                <th>Lançar entrada</th>
                <th>Corrigir saldo</th>
              </tr>
            </thead>
            <tbody>
              {comSaldo.map((p) => (
                <tr key={p.id}>
                  <td>
                    <div className="linha-prod">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={p.imagem} alt="" />
                      <div>
                        <b>{p.nome}</b>
                        <span>
                          {p.sku} · {p.tipo === 'BOX' ? 'Assinatura' : 'Kit avulso'}
                        </span>
                      </div>
                    </div>
                  </td>
                  <td className="num">{p.entradas}</td>
                  <td className="num">{p.saidas}</td>
                  <td className="num">
                    <b
                      className={`saldo${p.saldo <= 0 ? ' zero' : p.saldo <= p.estoqueBaixo ? ' baixo' : ''}`}
                    >
                      {p.saldo}
                    </b>
                  </td>
                  <td>
                    <Pill cor={p.saldo <= 0 ? 'out' : p.saldo <= p.estoqueBaixo ? 'low' : 'ok'}>
                      {p.saldo <= 0
                        ? 'Esgotado'
                        : p.saldo <= p.estoqueBaixo
                          ? 'Estoque baixo'
                          : 'Disponível'}
                    </Pill>
                  </td>
                  <td>
                    <form action={lancarEntrada} className="inline-form">
                      <input type="hidden" name="id" value={p.id} />
                      <input
                        className="mini"
                        type="number"
                        name="qtd"
                        min={1}
                        defaultValue={10}
                        aria-label={`Quantidade a lançar em ${p.nome}`}
                      />
                      <button className="btn btn-soft btn-sm">Entrada</button>
                    </form>
                  </td>
                  <td>
                    <form action={ajustarSaldo} className="inline-form">
                      <input type="hidden" name="id" value={p.id} />
                      <input
                        className="mini"
                        type="number"
                        name="saldo"
                        min={0}
                        defaultValue={p.saldo}
                        aria-label={`Novo saldo de ${p.nome}`}
                      />
                      <button className="btn btn-ghost btn-sm">Ajustar</button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Painel>

      <Painel
        titulo="Histórico de movimentações"
        descricao="Nada muda o saldo sem deixar rastro aqui — últimos 60 lançamentos"
        flush
      >
        {!movimentacoes.length ? (
          <Vazio titulo="Sem movimentações" texto="Entradas, vendas e ajustes aparecem nesta lista." />
        ) : (
          <div className="tbl-scroll">
            <table>
              <thead>
                <tr>
                  <th>Quando</th>
                  <th>Produto</th>
                  <th>SKU</th>
                  <th>Tipo</th>
                  <th className="num">Qtd</th>
                  <th className="num">Saldo depois</th>
                  <th>Origem</th>
                </tr>
              </thead>
              <tbody>
                {movimentacoes.map((m) => (
                  <tr key={m.id}>
                    <td style={{ color: 'var(--muted)', fontSize: 13, whiteSpace: 'nowrap' }}>
                      {dataHora(m.criadoEm)}
                    </td>
                    <td>{m.nome}</td>
                    <td style={{ color: 'var(--muted)' }}>{m.sku}</td>
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
