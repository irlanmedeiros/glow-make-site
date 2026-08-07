'use client';

import { useActionState, useState } from 'react';
import {
  analisarPlanilha,
  aplicarPlanilha,
  type EstadoAplicar,
  type EstadoPreview,
} from '@/app/admin/(protegido)/importar/acoes';

const real = (v: number | null) =>
  v === null ? '—' : v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export default function Importador() {
  const [nomeArquivo, setNomeArquivo] = useState('');
  const [previa, analisarAcao, analisando] = useActionState(
    analisarPlanilha,
    null as EstadoPreview | null
  );
  const [resultado, aplicarAcao, aplicando] = useActionState(
    aplicarPlanilha,
    null as EstadoAplicar | null
  );

  const plano = previa?.plano;
  const jaAplicou = Boolean(resultado?.ok);
  const nadaAFazer = plano && plano.criar.length === 0 && plano.atualizar.length === 0;

  return (
    <>
      <section className="painel">
        <div className="painel-hd">
          <div>
            <h2>Enviar planilha</h2>
            <p>Aceita .xlsx, .xls e .csv, até 4 MB</p>
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
              <span>{nomeArquivo ? 'Clique para trocar' : 'Excel ou CSV exportado da sua planilha'}</span>
            </label>

            <button className="btn btn-primary" style={{ marginTop: 14 }} disabled={analisando}>
              {analisando ? 'Lendo a planilha...' : 'Conferir antes de aplicar'}
            </button>
          </form>

          {previa?.erro && (
            <div className="note erro" style={{ marginTop: 14 }}>
              {previa.erro}
            </div>
          )}
        </div>
      </section>

      {plano && !jaAplicou && (
        <section className="painel">
          <div className="painel-hd">
            <div>
              <h2>Confira antes de gravar</h2>
              <p>
                Colunas reconhecidas: {plano.colunas.length ? plano.colunas.join(', ') : 'nenhuma'}
              </p>
            </div>
          </div>

          <div className="painel-body">
            <div className="kpis" style={{ marginBottom: 18 }}>
              <div className="kpi good">
                <span>Serão criados</span>
                <b>{plano.criar.length}</b>
              </div>
              <div className="kpi">
                <span>Serão atualizados</span>
                <b>{plano.atualizar.length}</b>
              </div>
              <div className={`kpi${plano.comErro.length ? ' bad' : ''}`}>
                <span>Com erro</span>
                <b>{plano.comErro.length}</b>
                <small>serão ignorados</small>
              </div>
              <div className="kpi">
                <span>Não vieram na planilha</span>
                <b>{plano.intocados.length}</b>
                <small>ficam como estão</small>
              </div>
            </div>

            {plano.comErro.length > 0 && (
              <div className="note erro" style={{ marginBottom: 16 }}>
                <b>Estas linhas serão puladas:</b>
                <ul style={{ margin: '8px 0 0 18px' }}>
                  {plano.comErro.map((l) => (
                    <li key={l.linha}>
                      Linha {l.linha} {l.sku && `(${l.sku})`} — {l.erros.join('; ')}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {plano.criar.length > 0 && (
              <>
                <h3 className="cat-titulo" style={{ marginBottom: 8 }}>Produtos novos</h3>
                <div className="tbl-scroll" style={{ marginBottom: 20 }}>
                  <table>
                    <thead>
                      <tr>
                        <th>SKU</th>
                        <th>Nome</th>
                        <th className="num">Preço</th>
                        <th className="num">Estoque</th>
                      </tr>
                    </thead>
                    <tbody>
                      {plano.criar.map((l) => (
                        <tr key={l.sku}>
                          <td>{l.sku}</td>
                          <td>
                            <b>{l.nome}</b>
                          </td>
                          <td className="num">{real(l.preco)}</td>
                          <td className="num">{l.estoque ?? 0}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            {plano.atualizar.length > 0 && (
              <>
                <h3 className="cat-titulo" style={{ marginBottom: 8 }}>O que muda nos existentes</h3>
                <div className="tbl-scroll" style={{ marginBottom: 20 }}>
                  <table>
                    <thead>
                      <tr>
                        <th>SKU</th>
                        <th>Nome</th>
                        <th>Preço</th>
                        <th>Estoque</th>
                      </tr>
                    </thead>
                    <tbody>
                      {plano.atualizar.map((l) => {
                        const mudouPreco = l.preco !== null && l.preco !== l.antes.preco;
                        const mudouEstoque = l.estoque !== null && l.estoque !== l.antes.saldo;
                        const mudouNome = l.nome !== l.antes.nome;
                        return (
                          <tr key={l.sku}>
                            <td>{l.sku}</td>
                            <td>
                              {mudouNome ? (
                                <>
                                  <span className="de">{l.antes.nome}</span> <b>{l.nome}</b>
                                </>
                              ) : (
                                l.nome
                              )}
                            </td>
                            <td>
                              {mudouPreco ? (
                                <>
                                  <span className="de">{real(l.antes.preco)}</span>{' '}
                                  <b style={{ color: 'var(--rose)' }}>{real(l.preco)}</b>
                                </>
                              ) : (
                                <span style={{ color: 'var(--muted)' }}>{real(l.antes.preco)}</span>
                              )}
                            </td>
                            <td>
                              {mudouEstoque ? (
                                <>
                                  <span className="de">{l.antes.saldo}</span>{' '}
                                  <b style={{ color: 'var(--rose)' }}>{l.estoque}</b>
                                </>
                              ) : (
                                <span style={{ color: 'var(--muted)' }}>{l.antes.saldo}</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            {plano.intocados.length > 0 && (
              <div className="note" style={{ marginBottom: 16 }}>
                <b>Continuam no site sem alteração:</b>{' '}
                {plano.intocados.map((k) => k.sku).join(', ')}. Se quis tirá-los do ar, use a coluna{' '}
                <code>ativo</code> com &ldquo;nao&rdquo; — a importação nunca apaga produto.
              </div>
            )}

            {nadaAFazer ? (
              <div className="note">
                Nenhuma linha válida para aplicar. Corrija os erros acima e envie de novo.
              </div>
            ) : (
              <form action={aplicarAcao}>
                <input type="hidden" name="plano" value={JSON.stringify(plano)} />
                <button className="btn btn-primary" disabled={aplicando}>
                  {aplicando
                    ? 'Gravando...'
                    : `Confirmar e aplicar (${plano.criar.length + plano.atualizar.length} produto(s))`}
                </button>
              </form>
            )}
          </div>
        </section>
      )}

      {resultado && (
        <section className="painel">
          <div className="painel-body">
            <div className={`toast-srv ${resultado.erro ? 'erro' : 'ok'}`}>
              {resultado.erro ?? resultado.ok}
            </div>
            {resultado.detalhe && resultado.detalhe.length > 0 && (
              <ul style={{ margin: '4px 0 0 18px', fontSize: 13.5, color: 'var(--muted)' }}>
                {resultado.detalhe.map((d, i) => (
                  <li key={i}>{d}</li>
                ))}
              </ul>
            )}
            {resultado.ok && (
              <a className="btn btn-ghost btn-sm" style={{ marginTop: 14 }} href="/admin/kits">
                Ver o catálogo
              </a>
            )}
          </div>
        </section>
      )}
    </>
  );
}
