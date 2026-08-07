'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { ConfigPublica, KitPublico } from './tipos';
import { Busca, Carrinho, Check, Menu, Seta } from './Icones';

/* ============================================================
   Contexto do carrinho
   ============================================================ */

type ItemCarrinho = { id: string; qtd: number };
type Modo = 'carrinho' | 'assinatura';

type Ctx = {
  kits: KitPublico[];
  box: KitPublico | null;
  config: ConfigPublica;
  itens: ItemCarrinho[];
  qtdTotal: number;
  subtotal: number;
  frete: number;
  total: number;
  adicionar: (id: string) => void;
  mudarQtd: (id: string, delta: number) => void;
  remover: (id: string) => void;
  abrirCarrinho: () => void;
  abrirCheckout: (modo: Modo) => void;
  fechar: () => void;
  avisar: (msg: string) => void;
  kitPorId: (id: string) => KitPublico | undefined;
  pulso: boolean;
};

const LojaCtx = createContext<Ctx | null>(null);
const useLoja = () => {
  const c = useContext(LojaCtx);
  if (!c) throw new Error('useLoja precisa estar dentro de <Loja>');
  return c;
};

const CHAVE = 'glowmake_carrinho';

export function Loja({
  kits,
  box,
  config,
  children,
}: {
  kits: KitPublico[];
  box: KitPublico | null;
  config: ConfigPublica;
  children: React.ReactNode;
}) {
  const [itens, setItens] = useState<ItemCarrinho[]>([]);
  const [gaveta, setGaveta] = useState(false);
  const [checkout, setCheckout] = useState<Modo | null>(null);
  const [aviso, setAviso] = useState('');
  const [pulso, setPulso] = useState(false);
  const timerAviso = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Só o carrinho vive no navegador. Preço, estoque e catálogo vêm sempre do
  // servidor — se ficassem salvos aqui, uma mudança de preço no admin não
  // valeria para quem já tivesse aberto o site.
  useEffect(() => {
    try {
      const bruto = localStorage.getItem(CHAVE);
      if (!bruto) return;
      const salvos: ItemCarrinho[] = JSON.parse(bruto);
      setItens(salvos.filter((i) => kits.some((k) => k.id === i.id)));
    } catch {
      /* carrinho corrompido: começa vazio */
    }
  }, [kits]);

  useEffect(() => {
    localStorage.setItem(CHAVE, JSON.stringify(itens));
  }, [itens]);

  const kitPorId = useCallback((id: string) => kits.find((k) => k.id === id), [kits]);

  const avisar = useCallback((msg: string) => {
    setAviso(msg);
    if (timerAviso.current) clearTimeout(timerAviso.current);
    timerAviso.current = setTimeout(() => setAviso(''), 3400);
  }, []);

  /* As decisões (avisar, pulsar, abrir a gaveta) ficam FORA do setItens.
     O atualizador precisa ser função pura: o React pode executá-lo duas vezes
     em desenvolvimento, e efeito colateral lá dentro dispara duplicado. */
  const adicionar = useCallback(
    (id: string) => {
      const kit = kitPorId(id);
      if (!kit) return;
      const nova = (itens.find((i) => i.id === id)?.qtd ?? 0) + 1;

      if (nova > kit.saldo) {
        avisar(`Só temos ${kit.saldo} unidade(s) de ${kit.nome}`);
        return;
      }

      setItens((atual) =>
        atual.some((i) => i.id === id)
          ? atual.map((i) => (i.id === id ? { ...i, qtd: nova } : i))
          : [...atual, { id, qtd: 1 }]
      );
      avisar(`${kit.nome} adicionado ao carrinho`);
      setGaveta(true);
      setPulso(true);
      setTimeout(() => setPulso(false), 500);
    },
    [itens, kitPorId, avisar]
  );

  const mudarQtd = useCallback(
    (id: string, delta: number) => {
      const kit = kitPorId(id);
      const item = itens.find((i) => i.id === id);
      if (!kit || !item) return;

      const nova = item.qtd + delta;
      if (nova > kit.saldo) {
        avisar(`Estoque máximo: ${kit.saldo} unidade(s)`);
        return;
      }
      setItens((atual) =>
        nova <= 0
          ? atual.filter((i) => i.id !== id)
          : atual.map((i) => (i.id === id ? { ...i, qtd: nova } : i))
      );
    },
    [itens, kitPorId, avisar]
  );

  const remover = useCallback((id: string) => {
    setItens((atual) => atual.filter((i) => i.id !== id));
  }, []);

  const subtotal = useMemo(
    () => itens.reduce((s, i) => s + (kitPorId(i.id)?.preco ?? 0) * i.qtd, 0),
    [itens, kitPorId]
  );
  const frete = itens.length === 0 || subtotal >= config.freteGratisAcima ? 0 : config.freteValor;
  const qtdTotal = itens.reduce((s, i) => s + i.qtd, 0);

  const valor: Ctx = {
    kits,
    box,
    config,
    itens,
    qtdTotal,
    subtotal,
    frete,
    total: subtotal + frete,
    adicionar,
    mudarQtd,
    remover,
    abrirCarrinho: () => setGaveta(true),
    abrirCheckout: (m) => {
      setGaveta(false);
      setCheckout(m);
    },
    fechar: () => {
      setGaveta(false);
      setCheckout(null);
    },
    avisar,
    kitPorId,
    pulso,
  };

  return (
    <LojaCtx.Provider value={valor}>
      {children}
      <Gaveta aberta={gaveta} />
      <Checkout modo={checkout} aoLimpar={() => setItens([])} />
      <div className={`toast${aviso ? ' on' : ''}`}>{aviso}</div>
    </LojaCtx.Provider>
  );
}

export const real = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

/* ============================================================
   Topo
   ============================================================ */

export function Topbar({ avisos }: { avisos: string[] }) {
  const [i, setI] = useState(0);
  useEffect(() => {
    if (avisos.length < 2) return;
    const t = setInterval(() => setI((x) => (x + 1) % avisos.length), 4200);
    return () => clearInterval(t);
  }, [avisos.length]);
  if (!avisos.length) return null;
  return (
    <div className="topbar">
      {avisos.map((a, n) => (
        <div className={`tick${n === i ? ' on' : ''}`} key={a}>
          {a}
        </div>
      ))}
    </div>
  );
}

export function Cabecalho() {
  const { qtdTotal, abrirCarrinho, pulso } = useLoja();
  const [grudado, setGrudado] = useState(false);
  const [busca, setBusca] = useState('');

  useEffect(() => {
    const rolar = () => setGrudado(window.scrollY > 20);
    window.addEventListener('scroll', rolar, { passive: true });
    return () => window.removeEventListener('scroll', rolar);
  }, []);

  // A busca filtra a grade emitindo um evento — evita recriar todo o contexto
  // por causa de um campo de texto.
  useEffect(() => {
    window.dispatchEvent(new CustomEvent('glow:busca', { detail: busca }));
  }, [busca]);

  return (
    <header className={`site${grudado ? ' stuck' : ''}`}>
      <div className="wrap hd">
        <a href="#" className="logo">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/assets/logo.png" alt="Glow Make" />
        </a>
        <nav className="main">
          <a href="#kits">Kits</a>
          <a href="#assinatura">Assinatura</a>
          <a href="#como">Como funciona</a>
          <a href="#depo">Avaliações</a>
        </nav>
        <div className="hd-right">
          <div className="search">
            <Busca />
            <input
              type="search"
              placeholder="Buscar kits..."
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              aria-label="Buscar kits"
            />
          </div>
          <button
            className="icon-btn burger"
            onClick={() => document.getElementById('kits')?.scrollIntoView()}
            aria-label="Ir para os kits"
          >
            <Menu />
          </button>
          <button className="icon-btn" onClick={abrirCarrinho} aria-label="Abrir carrinho">
            <Carrinho />
            <span className={`badge${pulso ? ' pop' : ''}`}>{qtdTotal}</span>
          </button>
        </div>
      </div>
    </header>
  );
}

/* ============================================================
   Grade de kits
   ============================================================ */

function tagEstoque(saldo: number, limite: number) {
  if (saldo <= 0) return { cls: 'out', texto: 'Esgotado' };
  if (saldo <= limite) return { cls: 'low', texto: `Últimas ${saldo} unidades` };
  return { cls: 'ok', texto: `${saldo} em estoque` };
}

export function GradeKits() {
  const { kits, itens, adicionar, mudarQtd, abrirCarrinho } = useLoja();
  const [busca, setBusca] = useState('');

  useEffect(() => {
    const ouvir = (e: Event) => setBusca((e as CustomEvent<string>).detail.toLowerCase().trim());
    window.addEventListener('glow:busca', ouvir);
    return () => window.removeEventListener('glow:busca', ouvir);
  }, []);

  const lista = kits.filter(
    (k) =>
      !busca ||
      k.nome.toLowerCase().includes(busca) ||
      k.descricao.toLowerCase().includes(busca)
  );

  if (!lista.length) {
    return <div className="empty">Nenhum kit encontrado com esse nome.</div>;
  }

  return (
    <div className="grid-kits">
      {lista.map((k) => {
        const tag = tagEstoque(k.saldo, k.estoqueBaixo);
        const noCarrinho = itens.find((i) => i.id === k.id)?.qtd ?? 0;
        return (
          <article className="card" key={k.id}>
            <div className="card-img">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={k.imagem} alt={k.nome} loading="lazy" />
              <span className={`stock-tag ${tag.cls}`}>{tag.texto}</span>
            </div>
            <div className="card-body">
              <h3>{k.nome}</h3>
              <p className="card-desc">{k.descricao}</p>
              <ul>
                {k.itens.slice(0, 4).map((i) => (
                  <li key={i}>
                    <span>{i}</span>
                  </li>
                ))}
                {k.itens.length > 4 && (
                  <li>
                    <span>e mais {k.itens.length - 4} itens</span>
                  </li>
                )}
              </ul>
              <div className="price">
                <b>{real(k.preco)}</b>
                <small>ou 6x de {real(k.preco / 6)} sem juros</small>
              </div>
              {k.saldo <= 0 ? (
                <button className="btn btn-primary btn-block" disabled>
                  Esgotado
                </button>
              ) : (
                <div className="qty-line">
                  {noCarrinho > 0 && (
                    <div className="stepper">
                      <button onClick={() => mudarQtd(k.id, -1)} aria-label="Diminuir">
                        −
                      </button>
                      <span>{noCarrinho}</span>
                      <button onClick={() => mudarQtd(k.id, 1)} aria-label="Aumentar">
                        +
                      </button>
                    </div>
                  )}
                  <button
                    className={`btn ${noCarrinho ? 'btn-soft' : 'btn-primary'}`}
                    style={{ flex: 1 }}
                    onClick={() => (noCarrinho ? abrirCarrinho() : adicionar(k.id))}
                  >
                    {noCarrinho ? 'Ver carrinho' : 'Adicionar ao carrinho'}
                  </button>
                </div>
              )}
            </div>
          </article>
        );
      })}
    </div>
  );
}

/* ============================================================
   Bloco da assinatura
   ============================================================ */

export function BlocoAssinatura() {
  const { box, abrirCheckout } = useLoja();
  if (!box) return null;

  const esgotado = box.saldo <= 0;
  const pouco = box.saldo > 0 && box.saldo <= box.estoqueBaixo;

  return (
    <>
      <div className="sub-price">
        <b>{real(box.preco)}</b>
        <span>por mês</span>
      </div>
      <div style={{ fontSize: 13, marginBottom: 18 }}>
        {esgotado ? (
          <span className="pill out">Vagas esgotadas para esta edição</span>
        ) : pouco ? (
          <span className="pill low">Restam {box.saldo} caixas desta edição</span>
        ) : (
          <span className="pill ok">{box.saldo} caixas disponíveis nesta edição</span>
        )}
      </div>
      <button
        className="btn btn-primary btn-block"
        disabled={esgotado}
        onClick={() => abrirCheckout('assinatura')}
      >
        {esgotado ? 'Lista de espera em breve' : 'Quero assinar a Glow Box'}
      </button>
    </>
  );
}

export function ListaBeneficios({ itens }: { itens: string[] }) {
  return (
    <ul className="sub-list">
      {itens.map((i) => (
        <li key={i}>
          <span className="check">
            <Check />
          </span>
          <span>{i}</span>
        </li>
      ))}
    </ul>
  );
}

/* ============================================================
   Gaveta do carrinho
   ============================================================ */

function Gaveta({ aberta }: { aberta: boolean }) {
  const { itens, kitPorId, mudarQtd, remover, subtotal, frete, total, fechar, abrirCheckout, config } =
    useLoja();
  const falta = config.freteGratisAcima - subtotal;

  return (
    <>
      <div className={`overlay${aberta ? ' on' : ''}`} onClick={fechar} />
      <aside className={`drawer${aberta ? ' on' : ''}`} aria-hidden={!aberta}>
        <div className="drawer-hd">
          <h3>Seu carrinho</h3>
          <button className="close" onClick={fechar} aria-label="Fechar">
            ×
          </button>
        </div>

        <div className="drawer-body">
          {!itens.length ? (
            <div className="empty">
              Seu carrinho está vazio.
              <br />
              Que tal começar pelo Kit Essencial Glow?
            </div>
          ) : (
            itens.map((i) => {
              const k = kitPorId(i.id);
              if (!k) return null;
              return (
                <div className="ci" key={i.id}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={k.imagem} alt="" />
                  <div className="ci-in">
                    <b>{k.nome}</b>
                    <span className="p">{real(k.preco * i.qtd)}</span>
                    <div className="qty-line" style={{ marginTop: 8 }}>
                      <div className="stepper">
                        <button onClick={() => mudarQtd(i.id, -1)}>−</button>
                        <span>{i.qtd}</span>
                        <button onClick={() => mudarQtd(i.id, 1)}>+</button>
                      </div>
                    </div>
                    <div className="ci-rm" onClick={() => remover(i.id)}>
                      remover
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div className="drawer-foot">
          {!itens.length ? (
            <button
              className="btn btn-ghost btn-block"
              onClick={() => {
                fechar();
                document.getElementById('kits')?.scrollIntoView();
              }}
            >
              Ver os kits
            </button>
          ) : (
            <>
              {falta > 0 && (
                <div style={{ fontSize: 12.5, color: 'var(--muted)', marginBottom: 10 }}>
                  Faltam <b style={{ color: 'var(--rose)' }}>{real(falta)}</b> para o frete grátis
                </div>
              )}
              <div className="tot">
                <span>Subtotal</span>
                <span>{real(subtotal)}</span>
              </div>
              <div className="tot">
                <span>Frete</span>
                <span>{frete === 0 ? 'Grátis' : real(frete)}</span>
              </div>
              <div className="tot big">
                <span>Total</span>
                <span>{real(total)}</span>
              </div>
              <button className="btn btn-primary btn-block" onClick={() => abrirCheckout('carrinho')}>
                Finalizar compra
              </button>
            </>
          )}
        </div>
      </aside>
    </>
  );
}

/* ============================================================
   Checkout
   ============================================================ */

function Checkout({ modo, aoLimpar }: { modo: Modo | null; aoLimpar: () => void }) {
  const { itens, kitPorId, subtotal, frete, total, box, fechar, avisar } = useLoja();
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState('');
  const [cep, setCep] = useState('');
  const [buscandoCep, setBuscandoCep] = useState(false);
  const [end, setEnd] = useState({ endereco: '', bairro: '', cidade: '', uf: '' });

  /* Busca o endereço pelo CEP no ViaCEP.
     Digitar rua, bairro e cidade à mão é onde nascem os endereços errados —
     e endereço errado só aparece quando a encomenda volta. */
  async function buscarCep(valor: string) {
    const limpo = valor.replace(/\D/g, '');
    if (limpo.length !== 8) return;
    setBuscandoCep(true);
    try {
      const r = await fetch(`https://viacep.com.br/ws/${limpo}/json/`);
      const d = await r.json();
      if (!d.erro) {
        setEnd({
          endereco: d.logradouro ?? '',
          bairro: d.bairro ?? '',
          cidade: d.localidade ?? '',
          uf: d.uf ?? '',
        });
      }
    } catch {
      // CEP não encontrado ou ViaCEP fora do ar: a pessoa preenche à mão.
    }
    setBuscandoCep(false);
  }

  const assinatura = modo === 'assinatura';
  if (!modo) return null;

  async function enviar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErro('');
    setEnviando(true);

    const dados = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;
    const rota = assinatura ? '/api/assinatura' : '/api/checkout';
    const corpo = assinatura
      ? { cliente: dados }
      : { cliente: dados, itens: itens.map((i) => ({ kitId: i.id, qtd: i.qtd })) };

    try {
      const r = await fetch(rota, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(corpo),
      });
      const resposta = await r.json();

      if (!r.ok) {
        setErro(resposta.erro ?? 'Não consegui concluir. Tente novamente.');
        setEnviando(false);
        return;
      }

      if (!assinatura) aoLimpar();

      if (resposta.invoiceUrl) {
        window.location.href = resposta.invoiceUrl;
        return;
      }

      fechar();
      avisar(
        resposta.demo
          ? 'Registrado. O Asaas ainda não está configurado, então não há cobrança.'
          : 'Tudo certo. Enviamos o link de pagamento para o seu e-mail.'
      );
    } catch {
      setErro('Falha de conexão. Verifique sua internet e tente de novo.');
    }
    setEnviando(false);
  }

  return (
    <>
      <div className="overlay on" onClick={fechar} />
      <div className="modal on" role="dialog" aria-modal="true">
        <div className="modal-card">
          <div className="modal-hd">
            <h3>{assinatura ? 'Assinar a Glow Box' : 'Finalizar compra'}</h3>
            <button className="close" onClick={fechar} aria-label="Fechar">
              ×
            </button>
          </div>

          <div className="modal-body">
            <div style={{ marginBottom: 18 }}>
              {assinatura && box ? (
                <div
                  style={{
                    background: 'var(--rose-50)',
                    borderRadius: 14,
                    padding: 16,
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: 12,
                  }}
                >
                  <div>
                    <b>{box.nome}</b>
                    <br />
                    <small style={{ color: 'var(--muted)' }}>Renova todo mês, sem fidelidade</small>
                  </div>
                  <b style={{ color: 'var(--rose)', fontSize: 20, whiteSpace: 'nowrap' }}>
                    {real(box.preco)}
                  </b>
                </div>
              ) : (
                <div style={{ background: 'var(--rose-50)', borderRadius: 14, padding: 16 }}>
                  {itens.map((i) => {
                    const k = kitPorId(i.id);
                    return k ? (
                      <div className="tot" key={i.id}>
                        <span>
                          {i.qtd}× {k.nome}
                        </span>
                        <span>{real(k.preco * i.qtd)}</span>
                      </div>
                    ) : null;
                  })}
                  <div className="tot">
                    <span>Frete</span>
                    <span>{frete === 0 ? 'Grátis' : real(frete)}</span>
                  </div>
                  <div className="tot big" style={{ marginBottom: 0 }}>
                    <span>Total</span>
                    <span>{real(subtotal + frete)}</span>
                  </div>
                </div>
              )}
            </div>

            <form onSubmit={enviar}>
              <div className="field">
                <label htmlFor="ck-nome">Nome completo</label>
                <input id="ck-nome" name="nome" required placeholder="Como no documento" />
              </div>
              <div className="field">
                <label htmlFor="ck-email">E-mail</label>
                <input id="ck-email" type="email" name="email" required placeholder="seu@email.com" />
              </div>
              <div className="row2">
                <div className="field">
                  <label htmlFor="ck-doc">CPF ou CNPJ</label>
                  <input id="ck-doc" name="documento" required placeholder="000.000.000-00" />
                </div>
                <div className="field">
                  <label htmlFor="ck-fone">Celular</label>
                  <input id="ck-fone" name="telefone" required placeholder="(00) 00000-0000" />
                </div>
              </div>
              <div className="field">
                <label htmlFor="ck-cep">CEP</label>
                <input
                  id="ck-cep"
                  name="cep"
                  required
                  placeholder="00000-000"
                  inputMode="numeric"
                  value={cep}
                  onChange={(e) => {
                    setCep(e.target.value);
                    buscarCep(e.target.value);
                  }}
                />
                <small>{buscandoCep ? 'Buscando endereço...' : 'O endereço é preenchido sozinho.'}</small>
              </div>

              <div className="row-end">
                <div className="field">
                  <label htmlFor="ck-rua">Rua ou avenida</label>
                  <input
                    id="ck-rua"
                    name="endereco"
                    required
                    value={end.endereco}
                    onChange={(e) => setEnd({ ...end, endereco: e.target.value })}
                  />
                </div>
                <div className="field">
                  <label htmlFor="ck-num">Número</label>
                  <input id="ck-num" name="enderecoNumero" required placeholder="123" />
                </div>
              </div>

              <div className="row2">
                <div className="field">
                  <label htmlFor="ck-compl">Complemento</label>
                  <input id="ck-compl" name="complemento" placeholder="Apto, bloco (opcional)" />
                </div>
                <div className="field">
                  <label htmlFor="ck-bairro">Bairro</label>
                  <input
                    id="ck-bairro"
                    name="bairro"
                    required
                    value={end.bairro}
                    onChange={(e) => setEnd({ ...end, bairro: e.target.value })}
                  />
                </div>
              </div>

              <div className="row-end">
                <div className="field">
                  <label htmlFor="ck-cidade">Cidade</label>
                  <input
                    id="ck-cidade"
                    name="cidade"
                    required
                    value={end.cidade}
                    onChange={(e) => setEnd({ ...end, cidade: e.target.value })}
                  />
                </div>
                <div className="field">
                  <label htmlFor="ck-uf">UF</label>
                  <input
                    id="ck-uf"
                    name="uf"
                    required
                    maxLength={2}
                    placeholder="SP"
                    value={end.uf}
                    onChange={(e) => setEnd({ ...end, uf: e.target.value.toUpperCase() })}
                  />
                </div>
              </div>

              <div className="field">
                <label htmlFor="ck-pag">Forma de pagamento</label>
                <select id="ck-pag" name="pagamento" defaultValue="UNDEFINED">
                  <option value="UNDEFINED">Escolher na hora de pagar</option>
                  <option value="PIX">PIX</option>
                  <option value="BOLETO">Boleto</option>
                  <option value="CREDIT_CARD">Cartão de crédito</option>
                </select>
              </div>

              {erro && <div className="note erro">{erro}</div>}

              <button
                className="btn btn-primary btn-block"
                style={{ marginTop: 8 }}
                disabled={enviando}
              >
                {enviando ? 'Processando...' : assinatura ? 'Assinar e ir para o pagamento' : 'Continuar para o pagamento'}
                {!enviando && <Seta />}
              </button>

              <div className="note">
                {assinatura
                  ? 'Seus dados vão para o nosso servidor, que cria a assinatura mensal no Asaas e devolve o link de pagamento. A chave da API fica só no servidor, nunca no seu navegador.'
                  : 'O estoque é reservado no momento da confirmação. Você recebe o link de pagamento em seguida.'}
              </div>
            </form>
          </div>
        </div>
      </div>
    </>
  );
}
