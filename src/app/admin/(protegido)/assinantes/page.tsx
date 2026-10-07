import { Fragment } from 'react';
import { prisma } from '@/lib/prisma';
import { real, dataHora, num, ROTULO_ASSINANTE, corAssinante } from '@/lib/format';
import { cancelarAssinante, reativarAssinante } from '../../actions';
import { Aviso, Cabecalho, Painel, Pill, Vazio, mensagens } from '@/components/admin/Ui';
import {
  TIPOS_PELE, TONS_PELE, SUBTONS, CATEGORIAS, ITENS, CORES, rotulo, rotulos,
} from '@/lib/perfil';
import { data } from '@/lib/format';

export const dynamic = 'force-dynamic';

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function Assinantes({ searchParams }: Props) {
  const { ok, erro } = mensagens(await searchParams);

  const [assinantes, box] = await Promise.all([
    prisma.assinante.findMany({ orderBy: { criadoEm: 'desc' }, take: 200, include: { perfil: true } }),
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
                  <Fragment key={a.id}>
                  <tr>
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
                      {a.status === 'CANCELADA' && a.canceladaEm && (
                        <small style={{ display: 'block', color: 'var(--muted)', marginTop: 4 }}>
                          {a.canceladaPor === 'CLIENTE'
                            ? `pela assinante em ${dataHora(a.canceladaEm)} (contrato ${a.cancelamentoContratoVersao ?? '?'})`
                            : a.canceladaPor === 'ADMIN'
                              ? `pelo admin em ${dataHora(a.canceladaEm)}`
                              : `em ${dataHora(a.canceladaEm)}`}
                        </small>
                      )}
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
                  {a.perfil && <LinhaPerfil perfil={a.perfil} />}
                  </Fragment>
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

/* ============================================================
   Perfil da assinante, numa linha que abre

   Fica fechado por padrão: a lista existe para acompanhar cobrança, e o
   perfil só interessa na hora de montar a caixa daquela pessoa. Aberto por
   padrão, empurraria todo o resto para fora da tela.
   ============================================================ */

function LinhaPerfil({
  perfil,
}: {
  perfil: {
    dataNascimento: Date | null;
    tipoPele: string | null;
    tomPele: string | null;
    subtom: string | null;
    preferenciaCategorias: string[];
    itensFavoritos: string[];
    itensOutros: string;
    cores: string[];
    naoEnviar: string;
    alergias: string;
    sonhoCaixa: string;
  };
}) {
  const linhas: [string, string][] = [];
  const por = (r: string, v: string) => v && linhas.push([r, v]);

  if (perfil.dataNascimento) por('Nascimento', data(perfil.dataNascimento));
  por('Pele', rotulo(perfil.tipoPele, TIPOS_PELE));
  por('Tom', rotulo(perfil.tomPele, TONS_PELE));
  por('Subtom', rotulo(perfil.subtom, SUBTONS));
  por(
    'Prefere',
    rotulos(perfil.preferenciaCategorias, CATEGORIAS)
      .map((r, i) => `${i + 1}º ${r}`)
      .join(' · ')
  );
  por(
    'Ama',
    [...rotulos(perfil.itensFavoritos, ITENS), perfil.itensOutros].filter(Boolean).join(', ')
  );
  por('Cores', rotulos(perfil.cores, CORES).join(', '));
  por('Não enviar', perfil.naoEnviar);
  por('Sonha receber', perfil.sonhoCaixa);

  return (
    <tr>
      <td colSpan={7} style={{ padding: 0, borderTop: 0 }}>
        <details style={{ padding: '0 14px 12px' }}>
          <summary
            style={{ cursor: 'pointer', color: 'var(--rose)', fontSize: 13, fontWeight: 600 }}
          >
            Perfil para montar a caixa
          </summary>

          {/* Alergia é dado de saúde: fica em destaque e separado do resto,
              porque errar nela não é "caixa menos personalizada", é mandar
              algo que faz mal. */}
          {perfil.alergias && (
            <div className="note alerta" style={{ marginTop: 10 }}>
              <b>Alergia ou sensibilidade:</b> {perfil.alergias}
            </div>
          )}

          <dl className="perfil-adm">
            {linhas.map(([r, v]) => (
              <Fragment key={r}>
                <dt>{r}</dt>
                <dd>{v}</dd>
              </Fragment>
            ))}
          </dl>

          {!linhas.length && !perfil.alergias && (
            <p style={{ color: 'var(--muted)', fontSize: 13, marginTop: 8 }}>
              Ela não respondeu nenhuma preferência.
            </p>
          )}
        </details>
      </td>
    </tr>
  );
}
