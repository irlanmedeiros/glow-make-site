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
import { evento } from './Consentimento';

/** Lê o código do afiliado que o middleware guardou no cookie. */
function refDoCookie(): string {
  if (typeof document === 'undefined') return '';
  return document.cookie.match(/(?:^|;\s*)glowmake_ref=([^;]*)/)?.[1] ?? '';
}

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
  /* O frete deixou de ser calculado aqui: agora vem cotado do servidor no
     checkout, porque depende do CEP e da transportadora. Na gaveta do
     carrinho mostramos "calculado no checkout" em vez de um número que
     poderia mudar no passo seguinte. */
  const frete = 0;
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
        {/* Assinatura saiu do menu de propósito: ela é apresentada pelos
            banners do topo, não como mais um item de navegação. */}
        <nav className="main">
          <a href="#kits">Kits</a>
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
              <div style={{ fontSize: 12.5, color: 'var(--muted)', marginBottom: 10 }}>
                Entrega <b style={{ color: 'var(--rose) '}}>grátis em João Pessoa</b>. Para outras
                cidades, o valor é calculado pelo CEP no próximo passo.
              </div>
              <div className="tot">
                <span>Subtotal</span>
                <span>{real(subtotal)}</span>
              </div>
              <div className="tot">
                <span>Frete</span>
                <span style={{ color: 'var(--muted)' }}>calculado no checkout</span>
              </div>
              <div className="tot big">
                <span>Subtotal</span>
                <span>{real(subtotal)}</span>
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

type OpcaoFrete = {
  servico: string;
  transportadora: string;
  valor: number;
  prazoDias: number | null;
  gratis: boolean;
};

type DadosPagamento = {
  pedido?: number;
  pedidoId?: string;
  total?: number;
  invoiceUrl?: string;
  pix?: { payload: string; imagemBase64: string; expiraEm: string | null } | null;
};

/* De quanto em quanto tempo a tela pergunta se o PIX caiu. Três segundos é
   rápido o bastante para parecer instantâneo e devagar o bastante para não
   martelar a API enquanto a pessoa procura o celular. */
const INTERVALO_CONFERE_PIX = 3000;

/* ============================================================
   Checkout

   Compra avulsa: dados → pagamento.
   Assinatura:    dados → contrato → pagamento.

   O contrato é uma etapa própria de propósito. Enfiar "li e aceito" no meio
   de um formulário longo é como o aceite perde valor: ninguém lê, e depois
   ninguém sustenta que leu.
   ============================================================ */

function Checkout({ modo, aoLimpar }: { modo: Modo | null; aoLimpar: () => void }) {
  const { itens, kitPorId, subtotal, box, fechar, avisar, config } = useLoja();

  const [etapa, setEtapa] = useState<'dados' | 'contrato' | 'pagamento'>('dados');
  const [pagamento, setPagamento] = useState<DadosPagamento | null>(null);
  const [copiado, setCopiado] = useState(false);
  const [pago, setPago] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState('');
  const [dados, setDados] = useState<Record<string, string>>({});

  const [cep, setCep] = useState('');
  const [buscandoCep, setBuscandoCep] = useState(false);
  const [end, setEnd] = useState({ endereco: '', bairro: '', cidade: '', uf: '' });

  const [fretes, setFretes] = useState<OpcaoFrete[]>([]);
  const [freteEscolhido, setFreteEscolhido] = useState('');
  const [avisoFrete, setAvisoFrete] = useState('');
  const [cotando, setCotando] = useState(false);

  const [aceitouContrato, setAceitouContrato] = useState(false);
  const assinatura = modo === 'assinatura';

  /* Só quando o checkout ABRE.
     `subtotal` não pode entrar nas dependências: ao concluir a compra o
     carrinho é esvaziado, o subtotal muda, e o efeito rodaria de novo jogando
     a cliente de volta para o formulário — apagando o QR do PIX que ela está
     olhando. O valor lido aqui é o do momento da abertura, que é justamente o
     que o evento de analytics quer. */
  useEffect(() => {
    if (!modo) return;
    setEtapa('dados');
    setErro('');
    setAceitouContrato(false);
    setPagamento(null);
    setPago(false);
    setCopiado(false);
    evento('InitiateCheckout', {
      value: assinatura ? (box?.preco ?? 0) : subtotal,
      currency: 'BRL',
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modo]);

  /* Enquanto o QR está na tela, pergunta ao servidor se o PIX caiu. Sem isto a
     pessoa paga e fica olhando para um código, sem saber se deu certo — e é aí
     que ela paga de novo ou liga para a loja. */
  const pedidoEmAberto = etapa === 'pagamento' && !pago ? pagamento?.pedidoId : undefined;
  useEffect(() => {
    if (!pedidoEmAberto) return;
    let vivo = true;

    async function conferir() {
      try {
        const r = await fetch(`/api/pedido/${pedidoEmAberto}/pagamento`, { cache: 'no-store' });
        if (!r.ok) return;
        const j = await r.json();
        if (vivo && j.pago) setPago(true);
      } catch {
        /* Sem rede a gente só tenta de novo no próximo ciclo. */
      }
    }

    const t = setInterval(conferir, INTERVALO_CONFERE_PIX);
    // Voltar para a aba é o momento mais provável de já ter pago.
    const aoVoltar = () => !document.hidden && conferir();
    document.addEventListener('visibilitychange', aoVoltar);
    return () => {
      vivo = false;
      clearInterval(t);
      document.removeEventListener('visibilitychange', aoVoltar);
    };
  }, [pedidoEmAberto]);

  async function copiarPix() {
    if (!pagamento?.pix) return;
    try {
      await navigator.clipboard.writeText(pagamento.pix.payload);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2500);
    } catch {
      setErro('Não consegui copiar. Selecione o código e copie à mão.');
    }
  }

  if (!modo) return null;

  const opcaoAtual = fretes.find((f) => f.servico === freteEscolhido) ?? fretes[0];
  const valorFrete = opcaoAtual?.valor ?? 0;
  const totalFinal = (assinatura ? (box?.preco ?? 0) : subtotal) + valorFrete;

  /* Busca endereço e cotação de uma vez: os dois dependem do mesmo CEP, e
     pedir para a pessoa clicar em "calcular frete" só adiciona um passo. */
  async function aoDigitarCep(valor: string) {
    setCep(valor);
    const limpo = valor.replace(/\D/g, '');
    if (limpo.length !== 8) {
      setFretes([]);
      setAvisoFrete('');
      return;
    }

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
      /* sem ViaCEP a pessoa preenche à mão */
    }
    setBuscandoCep(false);

    setCotando(true);
    try {
      const r = await fetch('/api/frete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cep: limpo,
          itens: assinatura ? [] : itens.map((i) => ({ kitId: i.id, qtd: i.qtd })),
        }),
      });
      const d = await r.json();
      setFretes(d.opcoes ?? []);
      setFreteEscolhido(d.opcoes?.[0]?.servico ?? '');
      setAvisoFrete(d.aviso ?? '');
    } catch {
      setFretes([]);
      setAvisoFrete('Não consegui calcular o frete agora. Seguimos e confirmamos com você.');
    }
    setCotando(false);
  }

  /* Guarda o lead assim que houver um e-mail válido. É o que permite falar
     depois com quem chegou até aqui e desistiu — sem isso, a pessoa some. */
  async function guardarLead(campos: Record<string, string>, consentiu: boolean) {
    if (!campos.email || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(campos.email)) return;
    try {
      await fetch('/api/lead', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: campos.email,
          nome: campos.nome,
          telefone: campos.telefone,
          cep: campos.cep,
          consentiuContato: consentiu,
          queriaAssinar: assinatura,
          ref: refDoCookie(),
          valorEstimado: assinatura ? (box?.preco ?? 0) : subtotal,
          itens: assinatura
            ? [{ sku: 'GM-BOX', nome: box?.nome ?? 'Glow Box', qtd: 1, preco: box?.preco ?? 0 }]
            : itens.map((i) => {
                const k = kitPorId(i.id);
                return { sku: k?.sku ?? '', nome: k?.nome ?? '', qtd: i.qtd, preco: k?.preco ?? 0 };
              }),
        }),
      });
    } catch {
      /* o lead é um bônus: se falhar, a compra não pode parar por isso */
    }
  }

  function aoSubmeterDados(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const campos = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;
    const consentiu = campos.consentiuContato === 'on';
    setDados({ ...campos, consentiuContato: consentiu ? 'sim' : 'nao' });
    guardarLead(campos, consentiu);

    if (assinatura) {
      setEtapa('contrato');
      return;
    }
    concluir({ ...campos });
  }

  async function concluir(campos: Record<string, string>) {
    setErro('');
    setEnviando(true);

    const rota = assinatura ? '/api/assinatura' : '/api/checkout';
    const corpo = assinatura
      ? { cliente: campos, aceitouContrato: true, ref: refDoCookie() }
      : {
          cliente: campos,
          itens: itens.map((i) => ({ kitId: i.id, qtd: i.qtd })),
          freteServico: opcaoAtual?.servico,
          ref: refDoCookie(),
        };

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
        if (assinatura) setEtapa('dados');
        return;
      }

      evento('Purchase', { value: totalFinal, currency: 'BRL' });
      if (!assinatura) aoLimpar();

      /* PIX termina AQUI DENTRO: o QR vai na própria tela. Mandar a cliente
         para a página do Asaas no último passo é onde se perde venda — ela sai
         do site, estranha o domínio e desiste. Para boleto e cartão o link do
         Asaas continua sendo o caminho, porque ali a página dele faz mais do
         que a nossa faria. */
      if (resposta.pix?.payload) {
        setPagamento(resposta);
        setEtapa('pagamento');
        setEnviando(false);
        return;
      }

      if (resposta.invoiceUrl) {
        window.location.href = resposta.invoiceUrl;
        return;
      }

      fechar();
      /* Nunca contar problema interno para o cliente. "O Asaas não está
         configurado" é recado para o lojista, não para quem acabou de
         comprar — e some do site assim que a cobrança estiver ligada. */
      avisar(
        resposta.demo
          ? 'Pedido registrado! Vamos entrar em contato para combinar o pagamento e a entrega.'
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
            <h3>
              {etapa === 'pagamento'
                ? pago
                  ? 'Pagamento confirmado'
                  : 'Pague com PIX'
                : assinatura
                  ? etapa === 'contrato'
                    ? 'Contrato da assinatura'
                    : 'Assinar a Glow Box'
                  : 'Finalizar compra'}
            </h3>
            <button className="close" onClick={fechar} aria-label="Fechar">
              ×
            </button>
          </div>

          <div className="modal-body">
            {assinatura && (
              <div className="passos">
                <span className={etapa === 'dados' ? 'on' : 'feito'}>1. Seus dados</span>
                <span className={etapa === 'contrato' ? 'on' : ''}>2. Contrato</span>
                <span>3. Pagamento</span>
              </div>
            )}

            {etapa === 'pagamento' ? (
              <div className="pix">
                {pago ? (
                  <div className="pix-ok">
                    <div className="pix-ok-marca" aria-hidden="true">
                      <svg viewBox="0 0 24 24" width="34" height="34" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M20 6 9 17l-5-5" />
                      </svg>
                    </div>
                    <h4>Pagamento confirmado</h4>
                    <p>
                      Recebemos o seu PIX do pedido <b>#{pagamento?.pedido}</b>. Já estamos
                      separando tudo para enviar.
                    </p>
                    <button className="btn btn-primary" onClick={fechar}>
                      Fechar
                    </button>
                  </div>
                ) : (
                  <>
                    <p className="pix-valor">
                      <span>Pedido #{pagamento?.pedido}</span>
                      <b>{real(pagamento?.total ?? 0)}</b>
                    </p>

                    {pagamento?.pix?.imagemBase64 && (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img
                        className="pix-qr"
                        src={`data:image/png;base64,${pagamento.pix.imagemBase64}`}
                        alt="QR Code para pagar com PIX"
                        width={220}
                        height={220}
                      />
                    )}

                    <p className="pix-instrucao">
                      Abra o app do seu banco, escolha <b>PIX</b> e aponte a câmera para o código.
                      No celular, use o botão abaixo.
                    </p>

                    <button className="btn btn-primary pix-copiar" onClick={copiarPix} type="button">
                      {copiado ? 'Código copiado' : 'Copiar código PIX'}
                    </button>

                    <code className="pix-codigo">{pagamento?.pix?.payload}</code>

                    <p className="pix-esperando" role="status">
                      <span className="pix-ponto" aria-hidden="true" />
                      Aguardando o pagamento. A tela avisa sozinha quando cair.
                    </p>

                    {erro && <div className="note erro">{erro}</div>}

                    {pagamento?.invoiceUrl && (
                      <p className="pix-alternativa">
                        Prefere boleto ou cartão?{' '}
                        <a href={pagamento.invoiceUrl} target="_blank" rel="noopener noreferrer">
                          Abrir outras formas de pagamento
                        </a>
                      </p>
                    )}
                  </>
                )}
              </div>
            ) : etapa === 'contrato' ? (
              <>
                <div className="contrato" tabIndex={0}>
                  {config.contratoTexto || 'O contrato ainda não foi cadastrado.'}
                </div>

                <label className="aceite">
                  <input
                    type="checkbox"
                    checked={aceitouContrato}
                    onChange={(e) => setAceitouContrato(e.target.checked)}
                  />
                  <span>
                    Li e aceito o contrato de assinatura {config.contratoVersao}. Entendo que a
                    cobrança se repete todo mês até eu cancelar.
                  </span>
                </label>

                {erro && <div className="note erro">{erro}</div>}

                <div className="row2" style={{ marginTop: 14 }}>
                  <button className="btn btn-ghost" onClick={() => setEtapa('dados')} type="button">
                    Voltar
                  </button>
                  <button
                    className="btn btn-primary"
                    disabled={!aceitouContrato || enviando}
                    onClick={() => concluir(dados)}
                  >
                    {enviando ? 'Processando...' : 'Aceitar e ir para o pagamento'}
                  </button>
                </div>
              </>
            ) : (
              <>
                <div style={{ marginBottom: 18 }}>
                  {assinatura && box ? (
                    <div className="resumo-box">
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
                    <div className="resumo-box" style={{ display: 'block' }}>
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
                        <span>
                          {cotando
                            ? 'calculando...'
                            : opcaoAtual
                              ? opcaoAtual.gratis
                                ? 'Grátis'
                                : real(opcaoAtual.valor)
                              : 'informe o CEP'}
                        </span>
                      </div>
                      <div className="tot big" style={{ marginBottom: 0 }}>
                        <span>Total</span>
                        <span>{real(totalFinal)}</span>
                      </div>
                    </div>
                  )}
                </div>

                <form onSubmit={aoSubmeterDados}>
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
                      onChange={(e) => aoDigitarCep(e.target.value)}
                    />
                    <small>
                      {buscandoCep ? 'Buscando endereço...' : 'O endereço é preenchido sozinho.'}
                    </small>
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
                        placeholder="PB"
                        value={end.uf}
                        onChange={(e) => setEnd({ ...end, uf: e.target.value.toUpperCase() })}
                      />
                    </div>
                  </div>

                  {fretes.length > 0 && (
                    <div className="field">
                      <label>Entrega</label>
                      {fretes.map((f) => (
                        <label key={f.servico} className="opcao-frete">
                          <input
                            type="radio"
                            name="freteServico"
                            value={f.servico}
                            checked={(opcaoAtual?.servico ?? '') === f.servico}
                            onChange={() => setFreteEscolhido(f.servico)}
                          />
                          <span className="of-nome">
                            <b>{f.servico}</b>
                            {f.prazoDias ? <small>até {f.prazoDias} dias úteis</small> : null}
                          </span>
                          <b className="of-valor">{f.gratis ? 'Grátis' : real(f.valor)}</b>
                        </label>
                      ))}
                    </div>
                  )}

                  {avisoFrete && <div className="note alerta">{avisoFrete}</div>}

                  <div className="field">
                    <label htmlFor="ck-pag">Forma de pagamento</label>
                    <select id="ck-pag" name="pagamento" defaultValue="UNDEFINED">
                      <option value="UNDEFINED">Escolher na hora de pagar</option>
                      <option value="PIX">PIX</option>
                      <option value="BOLETO">Boleto</option>
                      <option value="CREDIT_CARD">Cartão de crédito</option>
                    </select>
                  </div>

                  <label className="aceite">
                    <input type="checkbox" name="consentiuContato" defaultChecked />
                    <span>
                      Aceito receber novidades e ofertas da Glow Make por e-mail e WhatsApp. Você
                      pode sair quando quiser — desmarcar aqui não impede a compra.
                    </span>
                  </label>

                  {erro && <div className="note erro">{erro}</div>}

                  <button className="btn btn-primary btn-block" style={{ marginTop: 8 }} disabled={enviando}>
                    {enviando
                      ? 'Processando...'
                      : assinatura
                        ? 'Continuar para o contrato'
                        : 'Continuar para o pagamento'}
                    {!enviando && <Seta />}
                  </button>

                  <div className="note">
                    {assinatura
                      ? 'No próximo passo você lê o contrato completo antes de qualquer cobrança.'
                      : 'O estoque é reservado no momento da confirmação.'}
                  </div>
                </form>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
