'use client';

import { useActionState, useState } from 'react';
import {
  analisarExtrato,
  aplicarConferencia,
  type EstadoAplicar,
  type EstadoPreview,
} from '@/app/admin/(protegido)/conferencia/acoes';

const real = (v: number | null | undefined) =>
  v === null || v === undefined ? '—' : v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const quando = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—';

export default function Conferidor() {
  const [nomeArquivo, setNomeArquivo] = useState('');
  const [previa, analisarAcao, analisando] = useActionState(
    analisarExtrato,
    null as EstadoPreview | null
  );
  const [resultado, aplicarAcao, aplicando] = useActionState(
    aplicarConferencia,
    null as EstadoAplicar | null
  );

  const c = previa?.conferencia;
  const jaGravou = Boolean(resultado?.ok);

  return (
    <>
      <section className="painel">
        <div className="painel-hd">
          <div>
            <h2>Enviar o extrato</h2>
            <p>O arquivo que você baixa no painel da PagBank. Aceita .csv, .xlsx e .xls, até 4 MB</p>
          </div>
        </div>
        <div className="painel-body">
          <form action={analisarAcao}>
            <label className="dropzone">
              <input
                type="file"
                name="arquivo"
                accept=".xlsx,.xls,.csv"
                required
                onChange={(e) => setNomeArquivo(e.target.files?.[0]?.name ?? '')}
              />
              <b>{nomeArquivo || 'Escolher arquivo'}</b>
              <span>{nomeArquivo ? 'Clique para trocar' : 'Extrato de vendas exportado da PagBank'}</span>
            </label>

            <button className="btn btn-primary" style={{ marginTop: 14 }} disabled={analisando}>
              {analisando ? 'Lendo o extrato...' : 'Conferir com as vendas'}
            </button>
          </form>

          {previa?.erro && (
            <div className="note erro" style={{ marginTop: 14 }}>
              {previa.erro}
              {previa.colunas?.length ? (
                <>
                  <br />
                  Colunas que reconheci: {previa.colunas.join(', ')}.
                </>
              ) : null}
            </div>
          )}
        </div>
      </section>

      {c && !jaGravou && (
        <>
          <section className="painel">
            <div className="painel-hd">
              <div>
                <h2>Resultado da conferência</h2>
                <p>
                  {previa?.periodo
                    ? `Extrato de ${quando(previa.periodo.de)} a ${quando(previa.periodo.ate)}`
                    : 'Período não identificado no arquivo'}
                </p>
              </div>
            </div>
            <div className="painel-body">
              {previa?.aviso && <div className="note alerta" style={{ marginBottom: 14 }}>{previa.aviso}</div>}

              <div className="kpis" style={{ marginBottom: 6 }}>
                <div className="kpi good">
                  <span>Bateu</span>
                  <b>{c.pares.length}</b>
                  <small>venda(s) casada(s) com o extrato</small>
                </div>
                <div className={`kpi${c.transacoesSemVenda.length ? ' bad' : ''}`}>
                  <span>Passou o cartão e não registrou</span>
                  <b>{c.transacoesSemVenda.length}</b>
                  <small>transação(ões) sem venda no sistema</small>
                </div>
                <div className={`kpi${c.vendasSemTransacao.length ? ' alert' : ''}`}>
                  <span>Registrou e não achei no extrato</span>
                  <b>{c.vendasSemTransacao.length}</b>
                  <small>venda(s) sem transação</small>
                </div>
                <div className="kpi">
                  <span>Taxa da maquininha</span>
                  <b>{real(c.totais.taxa)}</b>
                  <small>
                    {real(c.totais.extratoBruto)} bruto · {real(c.totais.extratoLiquido)} líquido
                  </small>
                </div>
              </div>
            </div>
          </section>

          {c.transacoesSemVenda.length > 0 && (
            <section className="painel">
              <div className="painel-hd">
                <div>
                  <h2>Passou na maquininha e não está no sistema</h2>
                  <p>O estoque dessas vendas não baixou — o site ainda pode estar vendendo a peça</p>
                </div>
              </div>
              <div className="painel-body flush">
                <div className="tbl-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Quando</th>
                        <th>Comprovante</th>
                        <th>Tipo</th>
                        <th className="num">Valor</th>
                      </tr>
                    </thead>
                    <tbody>
                      {c.transacoesSemVenda.map((t) => (
                        <tr key={`${t.linha}-${t.codigo}`}>
                          <td style={{ whiteSpace: 'nowrap' }}>{quando(t.quando)}</td>
                          <td><code>{t.codigo || '—'}</code></td>
                          <td>{[t.tipo, t.bandeira].filter(Boolean).join(' · ') || '—'}</td>
                          <td className="num"><b>{real(t.bruto)}</b></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              <div className="painel-body">
                <div className="note alerta">
                  Registre essas vendas no catálogo da loja para o estoque ficar certo. Se alguma
                  foi paga em outra maquininha ou é de outro negócio, ignore.
                </div>
              </div>
            </section>
          )}

          {c.vendasSemTransacao.length > 0 && (
            <section className="painel">
              <div className="painel-hd">
                <div>
                  <h2>Está no sistema e não achei no extrato</h2>
                  <p>Valor digitado diferente, venda cancelada na máquina, ou cartão de outra maquininha</p>
                </div>
              </div>
              <div className="painel-body flush">
                <div className="tbl-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Venda</th>
                        <th>Quando</th>
                        <th>Comprovante</th>
                        <th className="num">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {c.vendasSemTransacao.map((v) => (
                        <tr key={v.id}>
                          <td><b>#{v.numero}</b></td>
                          <td style={{ whiteSpace: 'nowrap' }}>{quando(v.criadoEm)}</td>
                          <td><code>{v.codigoMaquineta || '—'}</code></td>
                          <td className="num"><b>{real(v.total)}</b></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </section>
          )}

          <section className="painel">
            <div className="painel-hd">
              <div>
                <h2>O que bateu</h2>
                <p>Casado pelo comprovante, ou por valor e horário próximo</p>
              </div>
            </div>
            <div className="painel-body flush">
              {!c.pares.length ? (
                <div className="vazio">
                  <b>Nada casou</b>
                  Confira se o extrato é do mesmo período das vendas.
                </div>
              ) : (
                <div className="tbl-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Venda</th>
                        <th>Comprovante</th>
                        <th>Como casou</th>
                        <th className="num">Valor</th>
                        <th className="num">Taxa</th>
                        <th className="num">Líquido</th>
                      </tr>
                    </thead>
                    <tbody>
                      {c.pares.map((p) => (
                        <tr key={p.venda.id}>
                          <td><b>#{p.venda.numero}</b></td>
                          <td><code>{p.transacao.codigo || '—'}</code></td>
                          <td style={{ fontSize: 13 }}>
                            {p.como === 'comprovante' ? (
                              <span className="pill ok">Comprovante</span>
                            ) : (
                              <span className="pill low">
                                Valor e horário
                                {p.distanciaMin !== null ? ` · ${p.distanciaMin} min` : ''}
                              </span>
                            )}
                          </td>
                          <td className="num">{real(p.venda.total)}</td>
                          <td className="num">{real(p.transacao.taxa)}</td>
                          <td className="num"><b>{real(p.transacao.liquido)}</b></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {c.pares.length > 0 && (
              <div className="painel-body">
                <div className="note" style={{ marginBottom: 14 }}>
                  Gravar marca essas vendas como <b>conferidas</b> e guarda a taxa e o valor líquido
                  de cada uma. O comprovante só é preenchido onde está faltando — o que a equipe
                  digitou no balcão não é sobrescrito. Estoque, faturamento e caixa não mudam.
                </div>
                <form action={aplicarAcao}>
                  <input type="hidden" name="conferencia" value={JSON.stringify(c)} />
                  <button className="btn btn-primary" disabled={aplicando}>
                    {aplicando ? 'Gravando...' : `Gravar conferência de ${c.pares.length} venda(s)`}
                  </button>
                </form>
              </div>
            )}
          </section>
        </>
      )}

      {c && c.canceladas.length > 0 && !jaGravou && (
        <div className="note" style={{ marginBottom: 20 }}>
          {c.canceladas.length} linha(s) do extrato são de transações canceladas ou recusadas.
          Ficaram de fora da conferência de propósito: casariam com uma venda boa de mesmo valor.
        </div>
      )}

      {resultado?.erro && <div className="note erro">{resultado.erro}</div>}
      {resultado?.ok && (
        <section className="painel">
          <div className="painel-body">
            <div className="note ok">{resultado.ok}</div>
          </div>
        </section>
      )}
    </>
  );
}
