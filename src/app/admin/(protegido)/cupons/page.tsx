import { prisma } from '@/lib/prisma';
import { real, dataHora, num, ROTULO_PEDIDO, corPedido } from '@/lib/format';
import { descricaoDesconto } from '@/lib/cupom';
import { salvarCupom, alternarCupom, excluirCupom } from '../../actions';
import { Aviso, Cabecalho, Painel, Pill, Vazio, mensagens } from '@/components/admin/Ui';

export const dynamic = 'force-dynamic';

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

type Campos = {
  id?: string;
  codigo?: string;
  tipo?: string;
  valor?: number;
  indicadorNome?: string;
  indicadorEmail?: string;
  indicadorDocumento?: string;
  indicadorTelefone?: string;
  primeiraCompra?: boolean;
  validoAte?: Date | null;
  ativo?: boolean;
  observacao?: string | null;
};

// A data do input vem e vai no dia de Joao Pessoa, nao no de Greenwich.
const diaLocal = (d?: Date | null) =>
  d ? new Date(d.getTime() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10) : '';

function Formulario({ c, novo = false }: { c: Campos; novo?: boolean }) {
  return (
    <form action={salvarCupom}>
      {c.id && <input type="hidden" name="id" value={c.id} />}
      <div className="row2">
        <div className="field">
          <label>Quem indica</label>
          <input name="indicadorNome" defaultValue={c.indicadorNome ?? ''} required maxLength={120} />
        </div>
        <div className="field">
          <label>Telefone (opcional)</label>
          <input name="indicadorTelefone" defaultValue={c.indicadorTelefone ?? ''} maxLength={30} />
        </div>
      </div>
      <div className="row2">
        <div className="field">
          <label>E-mail (opcional)</label>
          <input type="email" name="indicadorEmail" defaultValue={c.indicadorEmail ?? ''} maxLength={160} />
        </div>
        <div className="field">
          <label>CPF ou CNPJ (opcional)</label>
          <input name="indicadorDocumento" defaultValue={c.indicadorDocumento ?? ''} maxLength={20} />
        </div>
      </div>
      <small style={{ display: 'block', color: 'var(--muted)', margin: '-6px 0 14px' }}>
        E-mail e CPF servem só para impedir que quem indica use o próprio cupom.
      </small>

      <div className="row3">
        <div className="field">
          <label>Código</label>
          <input
            name="codigo"
            defaultValue={c.codigo ?? ''}
            maxLength={30}
            placeholder={novo ? 'Vazio = gerar' : ''}
            style={{ textTransform: 'uppercase' }}
          />
        </div>
        <div className="field">
          <label>Tipo de desconto</label>
          <select name="tipo" defaultValue={c.tipo ?? 'PERCENTUAL'}>
            <option value="PERCENTUAL">Percentual (%)</option>
            <option value="VALOR">Valor fixo (R$)</option>
          </select>
        </div>
        <div className="field">
          <label>Desconto</label>
          <input
            name="valor"
            defaultValue={c.valor != null ? String(c.valor).replace('.', ',') : ''}
            required
            placeholder="10 ou 15,00"
          />
        </div>
      </div>

      <div className="row2">
        <div className="field">
          <label>Válido até (opcional)</label>
          <input type="date" name="validoAte" defaultValue={diaLocal(c.validoAte)} />
        </div>
        <div className="field">
          <label>Observação interna (opcional)</label>
          <input name="observacao" defaultValue={c.observacao ?? ''} maxLength={300} />
        </div>
      </div>

      <div className="field" style={{ display: 'flex', gap: 18, flexWrap: 'wrap' }}>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input
            type="checkbox"
            name="primeiraCompra"
            defaultChecked={c.primeiraCompra ?? true}
            style={{ width: 'auto' }}
          />
          Só na primeira compra
        </label>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input type="checkbox" name="ativo" defaultChecked={c.ativo ?? true} style={{ width: 'auto' }} />
          Ativo
        </label>
      </div>

      <button className="btn btn-primary">{novo ? 'Criar cupom' : 'Salvar'}</button>
    </form>
  );
}

export default async function Cupons({ searchParams }: Props) {
  const { ok, erro } = mensagens(await searchParams);
  const cupons = await prisma.cupom.findMany({
    orderBy: { criadoEm: 'desc' },
    include: {
      pedidos: {
        orderBy: { criadoEm: 'desc' },
        select: { id: true, numero: true, nome: true, status: true, total: true, desconto: true, criadoEm: true },
      },
    },
  });
  const agora = Date.now();

  return (
    <>
      <Cabecalho
        titulo="Cupons de indicação"
        descricao="Cada pessoa que indica tem um código. Quem usa é a amiga indicada."
      />
      <Aviso ok={ok} erro={erro} />

      <div className="note" style={{ marginBottom: 20 }}>
        O desconto é calculado no servidor e nunca passa do valor dos produtos. O brinde de quem
        indicou <b>não é automático</b>: acompanhe aqui quais pedidos usaram cada código e combine a
        entrega.
      </div>

      <Painel titulo="Novo cupom">
        <Formulario c={{ tipo: 'PERCENTUAL', primeiraCompra: true, ativo: true }} novo />
      </Painel>

      {!cupons.length ? (
        <Painel>
          <Vazio titulo="Nenhum cupom ainda" texto="Crie o primeiro no formulário acima." />
        </Painel>
      ) : (
        cupons.map((c) => {
          const vencido = Boolean(c.validoAte && c.validoAte.getTime() < agora);
          const pagos = c.pedidos.filter((p) => p.status !== 'AGUARDANDO_PAGAMENTO' && p.status !== 'CANCELADO');
          return (
            <Painel key={c.id}>
              <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                <div style={{ flex: '1 1 240px', minWidth: 0 }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <b style={{ fontFamily: 'var(--serif)', fontSize: 20, letterSpacing: 0.5 }}>{c.codigo}</b>
                    <Pill cor={!c.ativo ? 'out' : vencido ? 'low' : 'ok'}>
                      {!c.ativo ? 'Inativo' : vencido ? 'Vencido' : 'Ativo'}
                    </Pill>
                    {c.primeiraCompra && <Pill cor="info">Primeira compra</Pill>}
                  </div>
                  <p style={{ fontSize: 13.5, marginTop: 4 }}>
                    {descricaoDesconto(c.tipo, c.valor)}
                    {c.validoAte && ` · até ${dataHora(c.validoAte)}`}
                  </p>
                  <p style={{ fontSize: 13, color: 'var(--muted)' }}>
                    Indicado por <b>{c.indicadorNome}</b>
                    {[c.indicadorTelefone, c.indicadorEmail].filter(Boolean).map((x) => ` · ${x}`)}
                  </p>
                  <p style={{ fontSize: 13, color: 'var(--muted)' }}>
                    {c.pedidos.length} pedido{c.pedidos.length === 1 ? '' : 's'} com o código ·{' '}
                    <b style={{ color: 'var(--ink)' }}>{pagos.length} pago{pagos.length === 1 ? '' : 's'}</b>
                  </p>
                </div>
                <div className="adm-acoes">
                  <form action={alternarCupom}>
                    <input type="hidden" name="id" value={c.id} />
                    <button className="btn btn-ghost btn-sm">{c.ativo ? 'Desativar' : 'Ativar'}</button>
                  </form>
                  {c.pedidos.length === 0 && (
                    <form action={excluirCupom}>
                      <input type="hidden" name="id" value={c.id} />
                      <button className="btn btn-danger btn-sm">Excluir</button>
                    </form>
                  )}
                </div>
              </div>

              {c.pedidos.length > 0 && (
                <details style={{ marginTop: 12 }}>
                  <summary style={{ cursor: 'pointer', color: 'var(--rose)', fontSize: 14, fontWeight: 600 }}>
                    Pedidos com este cupom
                  </summary>
                  <div className="tbl-scroll" style={{ marginTop: 10 }}>
                    <table>
                      <thead>
                        <tr>
                          <th>Pedido</th>
                          <th>Cliente</th>
                          <th>Data</th>
                          <th>Status</th>
                          <th className="num">Desconto</th>
                          <th className="num">Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {c.pedidos.map((p) => (
                          <tr key={p.id}>
                            <td>#{p.numero}</td>
                            <td>{p.nome}</td>
                            <td style={{ whiteSpace: 'nowrap' }}>{dataHora(p.criadoEm)}</td>
                            <td>
                              <Pill cor={corPedido(p.status)}>{ROTULO_PEDIDO[p.status]}</Pill>
                            </td>
                            <td className="num">{real(p.desconto)}</td>
                            <td className="num">{real(p.total)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </details>
              )}

              <details style={{ marginTop: 12 }}>
                <summary style={{ cursor: 'pointer', color: 'var(--rose)', fontSize: 14, fontWeight: 600 }}>
                  Editar
                </summary>
                <div style={{ marginTop: 16 }}>
                  <Formulario
                    c={{
                      id: c.id,
                      codigo: c.codigo,
                      tipo: c.tipo,
                      valor: num(c.valor),
                      indicadorNome: c.indicadorNome,
                      indicadorEmail: c.indicadorEmail,
                      indicadorDocumento: c.indicadorDocumento,
                      indicadorTelefone: c.indicadorTelefone,
                      primeiraCompra: c.primeiraCompra,
                      validoAte: c.validoAte,
                      ativo: c.ativo,
                      observacao: c.observacao,
                    }}
                  />
                </div>
              </details>
            </Painel>
          );
        })
      )}
    </>
  );
}
