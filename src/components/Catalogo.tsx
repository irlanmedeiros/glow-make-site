'use client';

import { useActionState, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { registrarVendaLoja, desfazerVendaLoja, type Resultado } from '@/app/catalogo/actions';
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
};

/* De quanto em quanto tempo o catálogo se atualiza sozinho.
   10s dá sensação de tempo real sem torrar a franquia de dados de quem
   fica com a tela aberta o dia inteiro. */
const INTERVALO_MS = 10_000;

const real = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

function situacao(p: ProdutoCatalogo) {
  if (!p.ativo) return { cls: 'out' as const, texto: 'Fora do site' };
  if (p.saldo <= 0) return { cls: 'out' as const, texto: 'Esgotado' };
  if (p.saldo <= p.estoqueBaixo) return { cls: 'low' as const, texto: 'Acabando' };
  return { cls: 'ok' as const, texto: 'Disponível' };
}

export default function Catalogo({ inicial }: { inicial: ProdutoCatalogo[] }) {
  const [produtos, setProdutos] = useState(inicial);
  const [atualizadoEm, setAtualizadoEm] = useState<Date>(new Date());
  const [buscando, setBuscando] = useState(false);
  const [offline, setOffline] = useState(false);
  const [busca, setBusca] = useState('');
  const [soAcabando, setSoAcabando] = useState(false);
  const [selecionado, setSelecionado] = useState<ProdutoCatalogo | null>(null);
  const [piscando, setPiscando] = useState<Set<string>>(new Set());

  const saldosAnteriores = useRef<Map<string, number>>(
    new Map(inicial.map((p) => [p.id, p.saldo]))
  );

  const buscarEstoque = useCallback(async () => {
    setBuscando(true);
    try {
      const r = await fetch('/api/estoque', { cache: 'no-store' });
      if (!r.ok) throw new Error(String(r.status));
      const dados = await r.json();
      const novos: ProdutoCatalogo[] = dados.produtos;

      // Marca quem mudou desde a última leitura, para a tela mostrar o que
      // acabou de mexer em vez de trocar os números em silêncio.
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
      // Sinal de conexão ruim é informação útil no balcão: a vendedora precisa
      // saber que o número na tela pode estar velho antes de prometer a peça.
      setOffline(true);
    } finally {
      setBuscando(false);
    }
  }, []);

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;

    const ligar = () => {
      if (timer) return;
      timer = setInterval(buscarEstoque, INTERVALO_MS);
    };
    const desligar = () => {
      if (timer) clearInterval(timer);
      timer = null;
    };

    // Com a aba escondida não adianta consultar: gasta bateria e dados sem
    // ninguém olhando. Ao voltar, atualiza na hora.
    const aoTrocarVisibilidade = () => {
      if (document.hidden) desligar();
      else {
        buscarEstoque();
        ligar();
      }
    };

    ligar();
    document.addEventListener('visibilitychange', aoTrocarVisibilidade);
    window.addEventListener('focus', buscarEstoque);
    window.addEventListener('online', buscarEstoque);
    return () => {
      desligar();
      document.removeEventListener('visibilitychange', aoTrocarVisibilidade);
      window.removeEventListener('focus', buscarEstoque);
      window.removeEventListener('online', buscarEstoque);
    };
  }, [buscarEstoque]);

  const lista = useMemo(() => {
    const t = busca.toLowerCase().trim();
    return produtos
      .filter((p) => !t || p.nome.toLowerCase().includes(t) || p.sku.toLowerCase().includes(t))
      .filter((p) => !soAcabando || p.saldo <= p.estoqueBaixo);
  }, [produtos, busca, soAcabando]);

  const acabando = produtos.filter((p) => p.saldo > 0 && p.saldo <= p.estoqueBaixo).length;
  const esgotados = produtos.filter((p) => p.saldo <= 0).length;
  const total = produtos.reduce((s, p) => s + p.saldo, 0);

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
            aria-label="Buscar produto"
          />
        </div>
        <button
          className={`btn btn-sm ${soAcabando ? 'btn-soft' : 'btn-ghost'}`}
          onClick={() => setSoAcabando((v) => !v)}
        >
          {soAcabando ? 'Vendo só os críticos' : 'Só o que está acabando'}
        </button>
      </div>

      <div className={`cat-status${offline ? ' offline' : ''}`}>
        <span className={`ponto${buscando ? ' ativo' : ''}`} />
        {offline ? (
          <>Sem conexão. Os números podem estar desatualizados.</>
        ) : (
          <>
            Atualiza sozinho a cada 10 segundos · última leitura às{' '}
            {atualizadoEm.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </>
        )}
        <button className="cat-refresh" onClick={buscarEstoque}>
          Atualizar agora
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
          aoMudarEstoque={buscarEstoque}
        />
      )}
    </>
  );
}

/* ============================================================
   Ficha do produto — consulta e baixa de venda no balcão
   ============================================================ */

function FichaProduto({
  produto,
  aoFechar,
  aoMudarEstoque,
}: {
  produto: ProdutoCatalogo;
  aoFechar: () => void;
  aoMudarEstoque: () => void;
}) {
  const [qtd, setQtd] = useState(1);
  const [vendedora, setVendedora] = useState('');

  const [venda, venderAcao, vendendo] = useActionState(registrarVendaLoja, null as Resultado | null);
  const [desfazer, desfazerAcao, desfazendo] = useActionState(
    desfazerVendaLoja,
    null as Resultado | null
  );

  // O nome fica salvo no aparelho: cada vendedora digita uma vez só, e o
  // histórico do estoque passa a dizer quem deu a baixa.
  useEffect(() => {
    setVendedora(localStorage.getItem('glowmake_vendedora') ?? '');
  }, []);
  useEffect(() => {
    if (vendedora) localStorage.setItem('glowmake_vendedora', vendedora);
  }, [vendedora]);

  // Só depende de `venda`: se `qtd` entrasse aqui, o setQtd(1) abaixo
  // dispararia o efeito de novo e a quantidade a desfazer sairia errada.
  useEffect(() => {
    if (venda?.ok) {
      setQtd(1);
      aoMudarEstoque();
    }
  }, [venda, aoMudarEstoque]);

  useEffect(() => {
    if (desfazer?.ok) aoMudarEstoque();
  }, [desfazer, aoMudarEstoque]);

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
              <small>já vendidos</small>
            </div>
            <div>
              <strong>{real(produto.preco)}</strong>
              <small>preço</small>
            </div>
          </div>

          <hr className="cat-hr" />

          <h3 className="cat-titulo">Vendeu aqui na loja?</h3>
          <p className="cat-ajuda">
            Registre a saída para o site não vender uma peça que já saiu da prateleira.
          </p>

          <form action={venderAcao}>
            <input type="hidden" name="id" value={produto.id} />
            <input type="hidden" name="qtd" value={qtd} />
            <input type="hidden" name="vendedora" value={vendedora} />

            <div className="cat-linha">
              <div className="stepper">
                <button type="button" onClick={() => setQtd((q) => Math.max(1, q - 1))}>
                  −
                </button>
                <span>{qtd}</span>
                <button
                  type="button"
                  onClick={() => setQtd((q) => Math.min(maximo || 1, q + 1))}
                  disabled={qtd >= maximo}
                >
                  +
                </button>
              </div>
              <button className="btn btn-primary" style={{ flex: 1 }} disabled={vendendo || maximo < 1}>
                {vendendo ? 'Registrando...' : maximo < 1 ? 'Sem estoque' : `Dar baixa de ${qtd}`}
              </button>
            </div>

            <div className="field" style={{ marginTop: 12, marginBottom: 0 }}>
              <label htmlFor="vend">Quem está vendendo</label>
              <input
                id="vend"
                value={vendedora}
                onChange={(e) => setVendedora(e.target.value)}
                placeholder="Seu nome"
                maxLength={60}
              />
              <small>Fica salvo neste aparelho e aparece no histórico do estoque.</small>
            </div>
          </form>

          {venda?.erro && <div className="note erro" style={{ marginTop: 12 }}>{venda.erro}</div>}
          {venda?.ok && (
            <div className="note ok" style={{ marginTop: 12 }}>
              {venda.ok}
              {venda.id && venda.qtd && !desfazer?.ok && (
                <form action={desfazerAcao} style={{ marginTop: 10 }}>
                  <input type="hidden" name="id" value={venda.id} />
                  <input type="hidden" name="qtd" value={venda.qtd} />
                  <button className="btn btn-ghost btn-sm" disabled={desfazendo}>
                    {desfazendo ? 'Desfazendo...' : 'Lancei errado, desfazer'}
                  </button>
                </form>
              )}
            </div>
          )}
          {desfazer?.ok && <div className="note ok" style={{ marginTop: 12 }}>{desfazer.ok}</div>}
          {desfazer?.erro && <div className="note erro" style={{ marginTop: 12 }}>{desfazer.erro}</div>}

          <button className="btn btn-ghost btn-block" style={{ marginTop: 18 }} onClick={aoFechar}>
            Fechar
          </button>
        </div>
      </div>
    </>
  );
}
