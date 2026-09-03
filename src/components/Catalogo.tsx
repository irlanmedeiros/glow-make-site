'use client';

import { useActionState, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  fecharVenda,
  cancelarVendaLoja,
  abrirCaixa,
  fecharCaixa,
  registrarPerda,
  desfazerPerda,
  type Resultado,
} from '@/app/catalogo/actions';
import { Busca } from './Icones';

export type ProdutoCatalogo = {
  id: string;
  sku: string;
  nome: string;
  preco: number;
  imagem: string;
  tipo: string;
  saldo: number;
  vendidos: number;
  estoqueBaixo: number;
  ativo: boolean;
  codigoBarras: string | null;
};

export type CaixaAtual = {
  id: string;
  abertoPor: string;
  abertoEm: string;
  trocoInicial: number;
  totalVendas: number;
  quantidade: number;
  esperadoNaGaveta: number;
  porForma: { forma: string; rotulo: string; quantidade: number; total: number }[];
} | null;

export type VendaResumo = {
  id: string;
  numero: number;
  vendedora: string;
  formaPagamento: string;
  total: number;
  cancelada: boolean;
  criadoEm: string;
  itens: { nome: string; qtd: number }[];
};

const INTERVALO_MS = 10_000;
const real = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const FORMAS = [
  { v: 'DINHEIRO', r: 'Dinheiro' },
  { v: 'PIX', r: 'PIX' },
  { v: 'DEBITO', r: 'Débito' },
  { v: 'CREDITO', r: 'Crédito' },
];

function situacao(p: ProdutoCatalogo) {
  if (!p.ativo) return { cls: 'out' as const, texto: 'Fora do site' };
  if (p.saldo <= 0) return { cls: 'out' as const, texto: 'Esgotado' };
  if (p.saldo <= p.estoqueBaixo) return { cls: 'low' as const, texto: 'Acabando' };
  return { cls: 'ok' as const, texto: 'Disponível' };
}

/* ============================================================
   Tela da loja: vender no balcão e acompanhar o estoque
   ============================================================ */

export default function Catalogo({
  inicial,
  caixa,
  vendas,
}: {
  inicial: ProdutoCatalogo[];
  caixa: CaixaAtual;
  vendas: VendaResumo[];
}) {
  const [aba, setAba] = useState<'vender' | 'estoque' | 'caixa'>('vender');
  const [produtos, setProdutos] = useState(inicial);
  // Começa nulo: `new Date()` no servidor e no cliente dá horas diferentes e
  // quebrava a hidratação. O relógio só aparece depois que o componente monta.
  const [atualizadoEm, setAtualizadoEm] = useState<Date | null>(null);
  const [offline, setOffline] = useState(false);
  const [piscando, setPiscando] = useState<Set<string>>(new Set());

  const saldosAnteriores = useRef<Map<string, number>>(
    new Map(inicial.map((p) => [p.id, p.saldo]))
  );

  const buscarEstoque = useCallback(async () => {
    try {
      const r = await fetch('/api/estoque', { cache: 'no-store' });
      if (!r.ok) throw new Error(String(r.status));
      const dados = await r.json();
      const novos: ProdutoCatalogo[] = dados.produtos;

      const mudaram = new Set<string>();
      for (const p of novos) {
        const antes = saldosAnteriores.current.get(p.id);
        if (antes !== undefined && antes !== p.saldo) mudaram.add(p.id);
        saldosAnteriores.current.set(p.id, p.saldo);
      }

      setProdutos(novos);
      setAtualizadoEm(new Date(dados.atualizadoEm));
      setOffline(false);

      if (mudaram.size) {
        setPiscando(mudaram);
        setTimeout(() => setPiscando(new Set()), 2200);
      }
    } catch {
      // No balcão, saber que o número pode estar velho vale mais do que
      // mostrar um número errado com cara de certo.
      setOffline(true);
    }
  }, []);

  useEffect(() => {
    // Marca a primeira leitura assim que monta, no relógio do próprio balcão.
    setAtualizadoEm(new Date());
    let timer: ReturnType<typeof setInterval> | null = null;
    const ligar = () => {
      if (!timer) timer = setInterval(buscarEstoque, INTERVALO_MS);
    };
    const desligar = () => {
      if (timer) clearInterval(timer);
      timer = null;
    };
    const aoTrocar = () => {
      if (document.hidden) desligar();
      else {
        buscarEstoque();
        ligar();
      }
    };
    ligar();
    document.addEventListener('visibilitychange', aoTrocar);
    window.addEventListener('focus', buscarEstoque);
    window.addEventListener('online', buscarEstoque);
    return () => {
      desligar();
      document.removeEventListener('visibilitychange', aoTrocar);
      window.removeEventListener('focus', buscarEstoque);
      window.removeEventListener('online', buscarEstoque);
    };
  }, [buscarEstoque]);

  return (
    <>
      <div className="pdv-abas">
        <button className={aba === 'vender' ? 'on' : ''} onClick={() => setAba('vender')}>
          Vender
        </button>
        <button className={aba === 'estoque' ? 'on' : ''} onClick={() => setAba('estoque')}>
          Estoque
        </button>
        <button className={aba === 'caixa' ? 'on' : ''} onClick={() => setAba('caixa')}>
          Caixa
        </button>
      </div>

      <div className={`cat-status${offline ? ' offline' : ''}`}>
        <span className="ponto" />
        {offline ? (
          <>Sem conexão. Os números podem estar desatualizados.</>
        ) : (
          <>
            Estoque ao vivo
            {atualizadoEm && (
              <>
                {' · última leitura às '}
                {atualizadoEm.toLocaleTimeString('pt-BR', {
                  hour: '2-digit',
                  minute: '2-digit',
                  second: '2-digit',
                })}
              </>
            )}
          </>
        )}
        <button className="cat-refresh" onClick={buscarEstoque}>
          Atualizar
        </button>
      </div>

      {aba === 'vender' && (
        <AbaVender produtos={produtos} caixa={caixa} aoVender={buscarEstoque} vendas={vendas} />
      )}
      {aba === 'estoque' && (
        <AbaEstoque produtos={produtos} piscando={piscando} aoMudar={buscarEstoque} />
      )}
      {aba === 'caixa' && <AbaCaixa caixa={caixa} vendas={vendas} />}
    </>
  );
}

/* ============================================================
   Aba: vender (o PDV)
   ============================================================ */

type ItemCarrinho = { id: string; qtd: number };

function AbaVender({
  produtos,
  caixa,
  aoVender,
  vendas,
}: {
  produtos: ProdutoCatalogo[];
  caixa: CaixaAtual;
  aoVender: () => void;
  vendas: VendaResumo[];
}) {
  const [carrinho, setCarrinho] = useState<ItemCarrinho[]>([]);
  const [codigo, setCodigo] = useState('');
  const [busca, setBusca] = useState('');
  const [vendedora, setVendedora] = useState('');
  const [forma, setForma] = useState('DINHEIRO');
  const [desconto, setDesconto] = useState('');
  const [aviso, setAviso] = useState('');
  const campoCodigo = useRef<HTMLInputElement>(null);

  const [resultado, acaoVender, vendendo] = useActionState(fecharVenda, null as Resultado | null);

  useEffect(() => {
    setVendedora(localStorage.getItem('glowmake_vendedora') ?? '');
  }, []);
  useEffect(() => {
    if (vendedora) localStorage.setItem('glowmake_vendedora', vendedora);
  }, [vendedora]);

  // Venda concluída: limpa o balcão para a próxima cliente.
  useEffect(() => {
    if (resultado?.ok) {
      setCarrinho([]);
      setDesconto('');
      aoVender();
      campoCodigo.current?.focus();
    }
  }, [resultado, aoVender]);

  const porId = useMemo(() => new Map(produtos.map((p) => [p.id, p])), [produtos]);

  function adicionar(p: ProdutoCatalogo) {
    const jaTem = carrinho.find((i) => i.id === p.id)?.qtd ?? 0;
    if (jaTem + 1 > p.saldo) {
      setAviso(`Só há ${p.saldo} de ${p.nome} em estoque.`);
      setTimeout(() => setAviso(''), 3000);
      return;
    }
    setCarrinho((c) =>
      c.some((i) => i.id === p.id)
        ? c.map((i) => (i.id === p.id ? { ...i, qtd: i.qtd + 1 } : i))
        : [...c, { id: p.id, qtd: 1 }]
    );
    setAviso('');
  }

  /* O leitor de código de barras se comporta como teclado: digita rápido e
     manda Enter. Por isso o campo fica em foco e trata Enter como "bipou". */
  function aoBipar(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const busca = codigo.trim();
    if (!busca) return;

    const achado = produtos.find(
      (p) =>
        p.codigoBarras === busca ||
        p.sku.toUpperCase() === busca.toUpperCase()
    );
    if (achado) {
      adicionar(achado);
      setCodigo('');
    } else {
      setAviso(`Nada encontrado para "${busca}". Confira o código ou use a busca.`);
      setCodigo('');
      setTimeout(() => setAviso(''), 3500);
    }
  }

  function mudarQtd(id: string, delta: number) {
    const p = porId.get(id);
    if (!p) return;
    setCarrinho((c) => {
      const item = c.find((i) => i.id === id);
      if (!item) return c;
      const nova = item.qtd + delta;
      if (nova > p.saldo) {
        setAviso(`Estoque máximo de ${p.nome}: ${p.saldo}.`);
        setTimeout(() => setAviso(''), 3000);
        return c;
      }
      return nova <= 0 ? c.filter((i) => i.id !== id) : c.map((i) => (i.id === id ? { ...i, qtd: nova } : i));
    });
  }

  const subtotal = carrinho.reduce((s, i) => s + (porId.get(i.id)?.preco ?? 0) * i.qtd, 0);
  const descontoNum = Math.max(0, Number(desconto.replace(',', '.')) || 0);
  const total = Math.max(0, subtotal - descontoNum);

  const lista = produtos.filter(
    (p) =>
      p.ativo &&
      p.saldo > 0 &&
      (!busca ||
        p.nome.toLowerCase().includes(busca.toLowerCase()) ||
        p.sku.toLowerCase().includes(busca.toLowerCase()))
  );

  return (
    <>
      {!caixa && (
        <div className="note alerta" style={{ marginBottom: 16 }}>
          <b>Nenhum caixa aberto.</b> Dá para vender assim mesmo, mas a venda não entra no
          fechamento do dia. Abra o caixa na aba <b>Caixa</b> antes de começar.
        </div>
      )}

      <div className="pdv">
        {/* ---------- esquerda: escolher produtos ---------- */}
        <div className="pdv-produtos">
          <div className="field" style={{ marginBottom: 10 }}>
            <label htmlFor="cod">Bipe o código de barras</label>
            <input
              id="cod"
              ref={campoCodigo}
              value={codigo}
              onChange={(e) => setCodigo(e.target.value)}
              onKeyDown={aoBipar}
              placeholder="Passe o leitor ou digite o código e tecle Enter"
              autoFocus
              autoComplete="off"
            />
            <small>Também funciona digitando o SKU, como GM-ESS.</small>
          </div>

          <div className="search" style={{ width: 'auto', marginBottom: 12 }}>
            <Busca />
            <input
              type="search"
              placeholder="Ou busque pelo nome..."
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
            />
          </div>

          {aviso && <div className="note erro" style={{ marginBottom: 12 }}>{aviso}</div>}

          <div className="pdv-grade">
            {lista.map((p) => (
              <button key={p.id} className="pdv-item" onClick={() => adicionar(p)}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.imagem} alt="" loading="lazy" />
                <span className="pdv-item-nome">{p.nome}</span>
                <span className="pdv-item-preco">{real(p.preco)}</span>
                <span className="pdv-item-saldo">{p.saldo} un.</span>
              </button>
            ))}
            {!lista.length && (
              <div className="vazio" style={{ gridColumn: '1/-1' }}>
                Nenhum produto disponível para venda.
              </div>
            )}
          </div>
        </div>

        {/* ---------- direita: o carrinho do balcão ---------- */}
        <form className="pdv-carrinho" action={acaoVender}>
          <input type="hidden" name="itens" value={JSON.stringify(carrinho.map((i) => ({ kitId: i.id, qtd: i.qtd })))} />
          <input type="hidden" name="vendedora" value={vendedora} />
          <input type="hidden" name="desconto" value={desconto || '0'} />

          <h3 className="cat-titulo">Venda</h3>

          {!carrinho.length ? (
            <p className="cat-ajuda">Bipe ou toque num produto para começar.</p>
          ) : (
            <div className="pdv-linhas">
              {carrinho.map((i) => {
                const p = porId.get(i.id);
                if (!p) return null;
                return (
                  <div className="pdv-linha" key={i.id}>
                    <div className="pdv-linha-info">
                      <b>{p.nome}</b>
                      <span>{real(p.preco)} cada</span>
                    </div>
                    <div className="stepper">
                      <button type="button" onClick={() => mudarQtd(i.id, -1)}>−</button>
                      <span>{i.qtd}</span>
                      <button type="button" onClick={() => mudarQtd(i.id, 1)}>+</button>
                    </div>
                    <b className="pdv-linha-total">{real(p.preco * i.qtd)}</b>
                  </div>
                );
              })}
            </div>
          )}

          <div className="tot" style={{ marginTop: 14 }}>
            <span>Subtotal</span>
            <span>{real(subtotal)}</span>
          </div>

          <div className="field" style={{ marginTop: 8, marginBottom: 8 }}>
            <label htmlFor="desc">Desconto (R$)</label>
            <input
              id="desc"
              inputMode="decimal"
              value={desconto}
              onChange={(e) => setDesconto(e.target.value)}
              placeholder="0,00"
            />
          </div>

          <div className="tot big">
            <span>Total</span>
            <span>{real(total)}</span>
          </div>

          <div className="field">
            <label>Forma de pagamento</label>
            <div className="pdv-formas">
              {FORMAS.map((f) => (
                <label key={f.v} className={`pdv-forma${forma === f.v ? ' on' : ''}`}>
                  <input
                    type="radio"
                    name="formaPagamento"
                    value={f.v}
                    checked={forma === f.v}
                    onChange={() => setForma(f.v)}
                  />
                  {f.r}
                </label>
              ))}
            </div>
          </div>

          <div className="field">
            <label htmlFor="vend">Quem está vendendo</label>
            <input
              id="vend"
              value={vendedora}
              onChange={(e) => setVendedora(e.target.value)}
              placeholder="Seu nome"
              maxLength={60}
            />
          </div>

          <button className="btn btn-primary btn-block" disabled={vendendo || !carrinho.length}>
            {vendendo ? 'Registrando...' : `Finalizar — ${real(total)}`}
          </button>

          {resultado?.erro && <div className="note erro" style={{ marginTop: 10 }}>{resultado.erro}</div>}
          {resultado?.ok && <div className="note ok" style={{ marginTop: 10 }}>{resultado.ok}</div>}
        </form>
      </div>

      <UltimasVendas vendas={vendas} />
    </>
  );
}

/* ============================================================
   Últimas vendas, com cancelamento
   ============================================================ */

function UltimasVendas({ vendas }: { vendas: VendaResumo[] }) {
  const [resultado, acao, pendente] = useActionState(cancelarVendaLoja, null as Resultado | null);
  if (!vendas.length) return null;

  return (
    <section className="painel" style={{ marginTop: 22 }}>
      <div className="painel-hd">
        <div>
          <h2>Últimas vendas</h2>
          <p>Cancelar devolve as peças ao estoque</p>
        </div>
      </div>
      <div className="painel-body flush">
        {resultado?.ok && <div className="toast-srv ok" style={{ margin: 16 }}>{resultado.ok}</div>}
        {resultado?.erro && <div className="toast-srv erro" style={{ margin: 16 }}>{resultado.erro}</div>}
        <div className="tbl-scroll">
          <table>
            <thead>
              <tr>
                <th>Venda</th>
                <th>Itens</th>
                <th>Quem vendeu</th>
                <th>Pagamento</th>
                <th className="num">Total</th>
                <th>Hora</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {vendas.map((v) => (
                <tr key={v.id} style={v.cancelada ? { opacity: 0.5 } : undefined}>
                  <td><b>#{v.numero}</b></td>
                  <td style={{ fontSize: 13 }}>
                    {v.itens.map((i) => `${i.qtd}× ${i.nome}`).join(', ')}
                  </td>
                  <td>{v.vendedora}</td>
                  <td>{FORMAS.find((f) => f.v === v.formaPagamento)?.r ?? v.formaPagamento}</td>
                  <td className="num"><b>{real(v.total)}</b></td>
                  <td style={{ color: 'var(--muted)', fontSize: 13 }}>
                    {new Date(v.criadoEm).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                  </td>
                  <td>
                    {v.cancelada ? (
                      <span className="pill out">Cancelada</span>
                    ) : (
                      <form action={acao}>
                        <input type="hidden" name="id" value={v.id} />
                        <input type="hidden" name="motivo" value="Cancelada no balcão" />
                        <button className="btn btn-danger btn-sm" disabled={pendente}>
                          Cancelar
                        </button>
                      </form>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

/* ============================================================
   Aba: estoque (consulta + baixa sem venda)
   ============================================================ */

function AbaEstoque({
  produtos,
  piscando,
  aoMudar,
}: {
  produtos: ProdutoCatalogo[];
  piscando: Set<string>;
  aoMudar: () => void;
}) {
  const [busca, setBusca] = useState('');
  const [soAcabando, setSoAcabando] = useState(false);
  const [selecionado, setSelecionado] = useState<ProdutoCatalogo | null>(null);

  const lista = produtos
    .filter(
      (p) =>
        !busca ||
        p.nome.toLowerCase().includes(busca.toLowerCase()) ||
        p.sku.toLowerCase().includes(busca.toLowerCase())
    )
    .filter((p) => !soAcabando || p.saldo <= p.estoqueBaixo);

  const total = produtos.reduce((s, p) => s + p.saldo, 0);
  const acabando = produtos.filter((p) => p.saldo > 0 && p.saldo <= p.estoqueBaixo).length;
  const esgotados = produtos.filter((p) => p.saldo <= 0).length;

  return (
    <>
      <div className="cat-resumo">
        <div className="cat-kpi">
          <b>{total}</b>
          <span>peças no estoque</span>
        </div>
        <div className={`cat-kpi${acabando ? ' alerta' : ''}`}>
          <b>{acabando}</b>
          <span>acabando</span>
        </div>
        <div className={`cat-kpi${esgotados ? ' ruim' : ''}`}>
          <b>{esgotados}</b>
          <span>esgotados</span>
        </div>
      </div>

      <div className="cat-barra">
        <div className="search" style={{ flex: 1, width: 'auto' }}>
          <Busca />
          <input
            type="search"
            placeholder="Buscar por nome ou código..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
        </div>
        <button
          className={`btn btn-sm ${soAcabando ? 'btn-soft' : 'btn-ghost'}`}
          onClick={() => setSoAcabando((v) => !v)}
        >
          {soAcabando ? 'Vendo só os críticos' : 'Só o que está acabando'}
        </button>
      </div>

      {!lista.length ? (
        <div className="vazio">
          <b>Nada encontrado</b>
          Tente outro nome ou código.
        </div>
      ) : (
        <div className="cat-grade">
          {lista.map((p) => {
            const s = situacao(p);
            return (
              <button
                key={p.id}
                className={`cat-card${piscando.has(p.id) ? ' mudou' : ''}`}
                onClick={() => setSelecionado(p)}
              >
                <div className="cat-foto">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p.imagem} alt="" loading="lazy" />
                  <span className={`pill ${s.cls}`}>{s.texto}</span>
                </div>
                <div className="cat-info">
                  <b>{p.nome}</b>
                  <span className="cat-sku">{p.sku}</span>
                  <div className="cat-numeros">
                    <div>
                      <strong className={p.saldo <= 0 ? 'zero' : p.saldo <= p.estoqueBaixo ? 'baixo' : ''}>
                        {p.saldo}
                      </strong>
                      <small>em estoque</small>
                    </div>
                    <div>
                      <strong>{real(p.preco)}</strong>
                      <small>preço</small>
                    </div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {selecionado && (
        <FichaProduto
          produto={produtos.find((p) => p.id === selecionado.id) ?? selecionado}
          aoFechar={() => setSelecionado(null)}
          aoMudar={aoMudar}
        />
      )}
    </>
  );
}

/* ============================================================
   Ficha: baixa sem venda (quebra, perda, brinde)
   ============================================================ */

function FichaProduto({
  produto,
  aoFechar,
  aoMudar,
}: {
  produto: ProdutoCatalogo;
  aoFechar: () => void;
  aoMudar: () => void;
}) {
  const [qtd, setQtd] = useState(1);
  const [perda, acaoPerda, registrando] = useActionState(registrarPerda, null as Resultado | null);
  const [desfeito, acaoDesfazer, desfazendo] = useActionState(desfazerPerda, null as Resultado | null);

  const vendaAtual = useRef<Resultado | null>(null);
  vendaAtual.current = perda;
  const [jaDesfeita, setJaDesfeita] = useState<Resultado | null>(null);

  useEffect(() => {
    if (perda?.ok) {
      setQtd(1);
      aoMudar();
    }
  }, [perda, aoMudar]);

  useEffect(() => {
    if (desfeito?.ok) {
      setJaDesfeita(vendaAtual.current);
      aoMudar();
    }
  }, [desfeito, aoMudar]);

  const s = situacao(produto);
  const maximo = Math.max(produto.saldo, 0);

  return (
    <>
      <div className="overlay on" onClick={aoFechar} />
      <div className="cat-ficha" role="dialog" aria-modal="true">
        <div className="cat-ficha-topo">
          <button className="cat-puxador" onClick={aoFechar} aria-label="Fechar" />
        </div>

        <div className="cat-ficha-corpo">
          <div className="cat-ficha-prod">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={produto.imagem} alt="" />
            <div>
              <b>{produto.nome}</b>
              <span className="cat-sku">{produto.sku}</span>
              <div style={{ marginTop: 8 }}>
                <span className={`pill ${s.cls}`}>{s.texto}</span>
              </div>
            </div>
          </div>

          <div className="cat-ficha-nums">
            <div>
              <strong className={produto.saldo <= 0 ? 'zero' : produto.saldo <= produto.estoqueBaixo ? 'baixo' : ''}>
                {produto.saldo}
              </strong>
              <small>em estoque</small>
            </div>
            <div>
              <strong>{produto.vendidos}</strong>
              <small>já saíram</small>
            </div>
            <div>
              <strong>{real(produto.preco)}</strong>
              <small>preço</small>
            </div>
          </div>

          <hr className="cat-hr" />

          <h3 className="cat-titulo">Dar baixa sem venda</h3>
          <p className="cat-ajuda">
            Para quebra, perda, brinde ou uso interno. <b>Venda não é aqui</b> — venda entra na aba
            Vender, senão o faturamento do dia fica errado.
          </p>

          <form action={acaoPerda}>
            <input type="hidden" name="id" value={produto.id} />
            <input type="hidden" name="qtd" value={qtd} />

            <div className="field">
              <label htmlFor="motivo">Motivo</label>
              <input id="motivo" name="motivo" placeholder="Quebra, brinde, uso interno..." maxLength={120} required />
            </div>

            <div className="cat-linha">
              <div className="stepper">
                <button type="button" onClick={() => setQtd((q) => Math.max(1, q - 1))}>−</button>
                <span>{qtd}</span>
                <button type="button" onClick={() => setQtd((q) => Math.min(maximo || 1, q + 1))} disabled={qtd >= maximo}>
                  +
                </button>
              </div>
              <button className="btn btn-ghost" style={{ flex: 1 }} disabled={registrando || maximo < 1}>
                {registrando ? 'Registrando...' : maximo < 1 ? 'Sem estoque' : `Baixar ${qtd}`}
              </button>
            </div>
          </form>

          {perda?.erro && <div className="note erro" style={{ marginTop: 12 }}>{perda.erro}</div>}
          {perda?.ok && (
            <div className="note ok" style={{ marginTop: 12 }}>
              {perda.ok}
              {jaDesfeita !== perda && (
                <form action={acaoDesfazer} style={{ marginTop: 10 }}>
                  <input type="hidden" name="id" value={produto.id} />
                  <input type="hidden" name="qtd" value={qtd} />
                  <button className="btn btn-ghost btn-sm" disabled={desfazendo}>
                    {desfazendo ? 'Desfazendo...' : 'Lancei errado, desfazer'}
                  </button>
                </form>
              )}
            </div>
          )}
          {desfeito?.ok && <div className="note ok" style={{ marginTop: 12 }}>{desfeito.ok}</div>}
          {desfeito?.erro && <div className="note erro" style={{ marginTop: 12 }}>{desfeito.erro}</div>}

          <button className="btn btn-ghost btn-block" style={{ marginTop: 18 }} onClick={aoFechar}>
            Fechar
          </button>
        </div>
      </div>
    </>
  );
}

/* ============================================================
   Aba: caixa
   ============================================================ */

function AbaCaixa({ caixa, vendas }: { caixa: CaixaAtual; vendas: VendaResumo[] }) {
  const [abertura, acaoAbrir, abrindo] = useActionState(abrirCaixa, null as Resultado | null);
  const [fechamento, acaoFechar, fechando] = useActionState(fecharCaixa, null as Resultado | null);
  const [contado, setContado] = useState('');

  const diferenca =
    caixa && contado ? (Number(contado.replace(',', '.')) || 0) - caixa.esperadoNaGaveta : null;

  if (!caixa) {
    return (
      <section className="painel">
        <div className="painel-hd">
          <div>
            <h2>Abrir o caixa</h2>
            <p>Abra no começo do expediente para o fechamento do dia bater</p>
          </div>
        </div>
        <div className="painel-body">
          <form action={acaoAbrir}>
            <div className="row2">
              <div className="field">
                <label htmlFor="quem">Quem está abrindo</label>
                <input id="quem" name="abertoPor" placeholder="Seu nome" maxLength={60} required />
              </div>
              <div className="field">
                <label htmlFor="troco">Troco inicial (R$)</label>
                <input id="troco" name="trocoInicial" inputMode="decimal" placeholder="0,00" />
                <small>Dinheiro que já está na gaveta agora</small>
              </div>
            </div>
            <button className="btn btn-primary" disabled={abrindo}>
              {abrindo ? 'Abrindo...' : 'Abrir caixa'}
            </button>
            {abertura?.erro && <div className="note erro" style={{ marginTop: 12 }}>{abertura.erro}</div>}
          </form>

          {fechamento?.ok && (
            <div className="toast-srv ok" style={{ marginTop: 16 }}>{fechamento.ok}</div>
          )}
        </div>
      </section>
    );
  }

  return (
    <>
      <div className="cat-resumo">
        <div className="cat-kpi">
          <b>{real(caixa.totalVendas)}</b>
          <span>vendido no caixa</span>
        </div>
        <div className="cat-kpi">
          <b>{caixa.quantidade}</b>
          <span>vendas</span>
        </div>
        <div className="cat-kpi">
          <b>{real(caixa.esperadoNaGaveta)}</b>
          <span>esperado na gaveta</span>
        </div>
      </div>

      <section className="painel">
        <div className="painel-hd">
          <div>
            <h2>Caixa aberto</h2>
            <p>
              Por {caixa.abertoPor}, desde{' '}
              {new Date(caixa.abertoEm).toLocaleString('pt-BR', {
                day: '2-digit',
                month: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </p>
          </div>
        </div>
        <div className="painel-body">
          <div className="tbl-scroll">
            <table>
              <thead>
                <tr>
                  <th>Forma de pagamento</th>
                  <th className="num">Vendas</th>
                  <th className="num">Total</th>
                </tr>
              </thead>
              <tbody>
                {caixa.porForma.map((f) => (
                  <tr key={f.forma}>
                    <td>{f.rotulo}</td>
                    <td className="num">{f.quantidade}</td>
                    <td className="num"><b>{real(f.total)}</b></td>
                  </tr>
                ))}
                <tr>
                  <td><b>Troco inicial</b></td>
                  <td className="num">—</td>
                  <td className="num">{real(caixa.trocoInicial)}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="note" style={{ marginTop: 14 }}>
            <b>Esperado na gaveta: {real(caixa.esperadoNaGaveta)}</b> — só troco inicial mais o que
            entrou em dinheiro. PIX e cartão não passam pela gaveta, por isso não entram nessa conta.
          </div>
        </div>
      </section>

      <section className="painel">
        <div className="painel-hd">
          <div>
            <h2>Fechar o caixa</h2>
            <p>Conte o dinheiro da gaveta e informe abaixo</p>
          </div>
        </div>
        <div className="painel-body">
          <form action={acaoFechar}>
            <div className="row2">
              <div className="field">
                <label htmlFor="fquem">Quem está fechando</label>
                <input id="fquem" name="fechadoPor" placeholder="Seu nome" maxLength={60} required />
              </div>
              <div className="field">
                <label htmlFor="cont">Dinheiro contado (R$)</label>
                <input
                  id="cont"
                  name="contadoDinheiro"
                  inputMode="decimal"
                  placeholder="0,00"
                  value={contado}
                  onChange={(e) => setContado(e.target.value)}
                  required
                />
              </div>
            </div>

            {diferenca !== null && Math.abs(diferenca) >= 0.01 && (
              <div className={`note ${Math.abs(diferenca) > 5 ? 'erro' : 'alerta'}`}>
                {diferenca > 0 ? 'Sobra' : 'Falta'} de <b>{real(Math.abs(diferenca))}</b> em relação
                ao esperado. Confira antes de fechar — depois de fechado não dá para reabrir.
              </div>
            )}

            <div className="field">
              <label htmlFor="obs">Observação</label>
              <input id="obs" name="observacao" placeholder="Opcional" maxLength={300} />
            </div>

            <button className="btn btn-primary" disabled={fechando}>
              {fechando ? 'Fechando...' : 'Fechar caixa'}
            </button>
            {fechamento?.erro && <div className="note erro" style={{ marginTop: 12 }}>{fechamento.erro}</div>}
            {fechamento?.ok && <div className="note ok" style={{ marginTop: 12 }}>{fechamento.ok}</div>}
          </form>
        </div>
      </section>

      <UltimasVendas vendas={vendas} />
    </>
  );
}
