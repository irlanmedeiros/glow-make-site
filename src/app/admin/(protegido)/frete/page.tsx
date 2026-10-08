import { prisma } from '@/lib/prisma';
import { num, real } from '@/lib/format';
import { calcularFrete, melhorEnvioConfigurado } from '@/lib/frete';
import { Cabecalho, Painel, Pill, Vazio } from '@/components/admin/Ui';
import { TIPOS_NA_VITRINE } from '@/lib/produto';

export const dynamic = 'force-dynamic';

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

/**
 * Simulador de frete.
 *
 * Chama exatamente o mesmo `calcularFrete` do checkout e da API de cotação —
 * e esse é o ponto. Um simulador com conta própria responderia bonito e
 * mentiria: a cliente veria outro valor na hora de comprar, que é justamente
 * o que a dona quer descobrir ANTES.
 *
 * Por isso também lê peso, CEP de origem e caixa de Configurações, em vez de
 * pedir na tela: o que se quer simular é a loja como ela está configurada
 * hoje, não um cenário hipotético.
 *
 * Formulário em GET, sem mutação: o endereço resultante pode ser recarregado
 * ou mandado para alguém conferir.
 */
export default async function SimuladorFrete({ searchParams }: Props) {
  const sp = await searchParams;
  const umSo = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? '';

  const cep = umSo(sp.cep).replace(/\D/g, '').slice(0, 8);
  const kitId = umSo(sp.kit);
  const qtd = Math.min(50, Math.max(1, Number(umSo(sp.qtd)) || 1));

  const [config, produtos] = await Promise.all([
    prisma.config.findUnique({ where: { id: 'config' } }),
    prisma.kit.findMany({
      where: { ativo: true, tipo: { in: TIPOS_NA_VITRINE } },
      orderBy: [{ tipo: 'asc' }, { ordem: 'asc' }],
      select: { id: true, nome: true, sku: true, preco: true },
    }),
  ]);

  const escolhido = produtos.find((p) => p.id === kitId) ?? produtos[0];
  const pesoUnitario = num(config?.pesoPadraoKit ?? 0.7);
  const cepOrigem = config?.cepOrigem ?? '58000-000';

  const simular = cep.length === 8 && Boolean(escolhido);
  const r = simular
    ? await calcularFrete({
        cepDestino: cep,
        cepOrigem,
        pesoKg: pesoUnitario * qtd,
        valorSegurado: num(escolhido!.preco) * qtd,
        freteReserva: num(config?.freteValor ?? 0),
        caixa: {
          alturaCm: config?.caixaAlturaCm ?? 11,
          larguraCm: config?.caixaLarguraCm ?? 20,
          comprimentoCm: config?.caixaComprimentoCm ?? 25,
        },
      })
    : null;

  return (
    <>
      <Cabecalho
        titulo="Simulador de frete"
        descricao="Mesma cotação que a cliente vê no checkout, para conferir antes de vender"
      />

      <Painel titulo="Simular">
        <form method="get" className="frete-sim">
          <div className="field">
            <label htmlFor="cep">CEP de destino</label>
            <input id="cep" name="cep" defaultValue={cep} placeholder="00000-000" inputMode="numeric" />
          </div>
          <div className="field">
            <label htmlFor="kit">Produto</label>
            <select id="kit" name="kit" defaultValue={escolhido?.id ?? ''}>
              {produtos.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome} ({p.sku})
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="qtd">Quantidade</label>
            <input id="qtd" name="qtd" type="number" min={1} max={50} defaultValue={qtd} />
          </div>
          <button className="btn btn-primary">Simular</button>
        </form>

        <div className="note" style={{ marginTop: 14 }}>
          Sai de <b>{cepOrigem}</b>, com <b>{pesoUnitario.toFixed(3).replace('.', ',')} kg</b> por
          unidade e caixa de{' '}
          <b>
            {config?.caixaAlturaCm ?? 11} × {config?.caixaLarguraCm ?? 20} ×{' '}
            {config?.caixaComprimentoCm ?? 25} cm
          </b>
          . Frete padrão de reserva: <b>{real(num(config?.freteValor ?? 0))}</b>. Tudo vem de
          Configurações — mude lá para simular outro cenário.
        </div>

        {!melhorEnvioConfigurado() && (
          <div className="note alerta" style={{ marginTop: 10 }}>
            <b>Melhor Envio sem token.</b> A cotação automática não roda: entra o frete padrão de{' '}
            {real(num(config?.freteValor ?? 0))}, ou &ldquo;a combinar&rdquo; se ele estiver zerado.
            É exatamente o que a cliente vê no site agora.
          </div>
        )}
      </Painel>

      {simular && r && (
        <Painel
          titulo="Resultado"
          descricao={
            r.destino
              ? `${r.destino.cidade}/${r.destino.uf} · ${qtd}× ${escolhido!.nome} · ${(pesoUnitario * qtd).toFixed(3).replace('.', ',')} kg`
              : undefined
          }
          flush
        >
          {r.aviso && (
            <div className="note alerta" style={{ margin: 16 }}>
              {r.aviso}
            </div>
          )}

          {r.opcoes.length === 0 ? (
            <Vazio
              titulo="Sem opção de entrega"
              texto="Nenhuma transportadora cotou para esse CEP com esse peso."
            />
          ) : (
            <div className="tbl-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Transportadora</th>
                    <th>Serviço</th>
                    <th>Prazo</th>
                    <th className="num">Valor</th>
                  </tr>
                </thead>
                <tbody>
                  {r.opcoes.map((o) => (
                    <tr key={`${o.transportadora}-${o.servico}`}>
                      <td>{o.transportadora || '—'}</td>
                      <td>
                        {o.servico}{' '}
                        {o.gratis && <Pill cor="ok">Grátis</Pill>}
                      </td>
                      <td>{o.prazoDias === null ? '—' : `${o.prazoDias} dia(s) úteis`}</td>
                      <td className="num">
                        <b>{o.valor === 0 ? 'Grátis' : real(o.valor)}</b>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Painel>
      )}

      {!simular && (
        <Vazio titulo="Informe um CEP" texto="Digite o CEP de destino e escolha o produto para ver a cotação." />
      )}
    </>
  );
}
