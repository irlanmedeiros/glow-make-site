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
import { erroDoCarrinho } from '@/lib/produto';
import { ehMotoboy } from '@/lib/entrega';
import { linkPedidoWhatsapp } from '@/lib/whatsapp';
import type { ConfigPublica, KitPublico } from './tipos';
import { Busca, Carrinho, Check, Menu, Seta, Whatsapp } from './Icones';
import { evento } from './Consentimento';
import {
  TIPOS_PELE, TONS_PELE, SUBTONS, CATEGORIAS, ITENS, CORES, DECLARACAO,
} from '@/lib/perfil';

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
      {/* Fica sempre montado de propósito: região viva só é anunciada pelo
          leitor de tela se já existir no DOM quando o texto muda. Vazio, não
          anuncia nada — e o CSS garante que também não apareça. */}
      <div className={`toast${aviso ? ' on' : ''}`} role="status" aria-live="polite">
        {aviso}
      </div>
    </LojaCtx.Provider>
  );
}

/* ============================================================
   Formulário da assinante

   Serve para a caixa do mês sair com a cara de quem vai receber. Nada aqui é
   obrigatório de propósito: barrar a assinatura porque alguém não escolheu o
   subtom seria perder venda para ganhar um dado que dá para perguntar depois.
   Por isso o botão diz "Continuar" e não "Salvar", e não existe validação que
   impeça seguir.
   ============================================================ */

function FormularioPerfil({
  perfil,
  mudar,
  aoVoltar,
  aoSeguir,
}: {
  perfil: PerfilForm;
  mudar: (p: PerfilForm) => void;
  aoVoltar: () => void;
  aoSeguir: () => void;
}) {
  const campo = <K extends keyof PerfilForm>(k: K, v: PerfilForm[K]) =>
    mudar({ ...perfil, [k]: v });

  /* Alterna um item de lista múltipla mantendo a ordem de clique — é ela que
     vira a ordem de preferência das categorias. */
  const alternar = (k: 'preferenciaCategorias' | 'itensFavoritos' | 'cores', v: string, limite = 99) => {
    const atual = perfil[k];
    if (atual.includes(v)) return campo(k, atual.filter((x) => x !== v));
    if (atual.length >= limite) return;
    campo(k, [...atual, v]);
  };

  return (
    <div className="perfil">
      <p className="perfil-intro">
        Quanto mais a gente souber de você, mais a sua caixinha tem a sua cara.
        <b> Responda só o que quiser</b> — nada aqui é obrigatório.
      </p>

      <div className="field">
        <label htmlFor="nasc">Data de nascimento</label>
        <input
          id="nasc"
          type="date"
          value={perfil.dataNascimento}
          onChange={(e) => campo('dataNascimento', e.target.value)}
        />
        <small>Para a gente lembrar de você no seu mês.</small>
      </div>

      <Escolha
        titulo="Como você define sua pele?"
        opcoes={TIPOS_PELE}
        valor={perfil.tipoPele}
        aoEscolher={(v) => campo('tipoPele', perfil.tipoPele === v ? '' : v)}
      />
      <Escolha
        titulo="Qual o seu tom de pele?"
        opcoes={TONS_PELE}
        valor={perfil.tomPele}
        aoEscolher={(v) => campo('tomPele', perfil.tomPele === v ? '' : v)}
      />
      <Escolha
        titulo="Qual o seu subtom?"
        opcoes={SUBTONS}
        valor={perfil.subtom}
        aoEscolher={(v) => campo('subtom', perfil.subtom === v ? '' : v)}
      />

      <fieldset className="perfil-bloco">
        <legend>O que você prefere receber</legend>
        <p className="perfil-ajuda">
          Toque na ordem da sua preferência. A primeira que você tocar vira a 1ª.
        </p>
        <div className="perfil-opcoes">
          {CATEGORIAS.map((o) => {
            const pos = perfil.preferenciaCategorias.indexOf(o.v);
            return (
              <button
                key={o.v}
                type="button"
                className={`perfil-chip${pos >= 0 ? ' on' : ''}`}
                aria-pressed={pos >= 0}
                onClick={() => alternar('preferenciaCategorias', o.v, 3)}
              >
                {pos >= 0 && <span className="perfil-ordem">{pos + 1}º</span>}
                {o.r}
              </button>
            );
          })}
        </div>
      </fieldset>

      <Marcacao
        titulo="Quais itens você mais ama?"
        ajuda="Marque quantos quiser."
        opcoes={ITENS}
        marcados={perfil.itensFavoritos}
        aoMarcar={(v) => alternar('itensFavoritos', v)}
      />

      <div className="field">
        <label htmlFor="outros">Outro item que você ama</label>
        <input
          id="outros"
          value={perfil.itensOutros}
          onChange={(e) => campo('itensOutros', e.target.value)}
          maxLength={160}
          placeholder="Que não está na lista acima"
        />
      </div>

      <Marcacao
        titulo="Cores que você mais usa"
        opcoes={CORES}
        marcados={perfil.cores}
        aoMarcar={(v) => alternar('cores', v)}
      />

      <div className="field">
        <label htmlFor="nao">Tem algum produto que você NÃO quer receber?</label>
        <textarea
          id="nao"
          rows={2}
          value={perfil.naoEnviar}
          onChange={(e) => campo('naoEnviar', e.target.value)}
          maxLength={400}
        />
      </div>

      <div className="field">
        <label htmlFor="alergia">Tem alguma alergia ou sensibilidade?</label>
        <textarea
          id="alergia"
          rows={2}
          value={perfil.alergias}
          onChange={(e) => campo('alergias', e.target.value)}
          maxLength={400}
        />
        <small>
          Só usamos para não te mandar algo que te faça mal. Pode deixar em branco.
        </small>
      </div>

      <div className="field">
        <label htmlFor="sonho">Conte o que você sonha receber na sua caixinha</label>
        <textarea
          id="sonho"
          rows={3}
          value={perfil.sonhoCaixa}
          onChange={(e) => campo('sonhoCaixa', e.target.value)}
          maxLength={600}
        />
      </div>

      <div className="note">{DECLARACAO}</div>

      <div className="row-end">
        <button className="btn btn-ghost" type="button" onClick={aoVoltar}>
          Voltar
        </button>
        <button className="btn btn-primary" type="button" onClick={aoSeguir}>
          Continuar
        </button>
      </div>
    </div>
  );
}

/** Uma escolha só, em cápsulas. Tocar de novo na escolhida desmarca. */
function Escolha({
  titulo,
  opcoes,
  valor,
  aoEscolher,
}: {
  titulo: string;
  opcoes: readonly { v: string; r: string }[];
  valor: string;
  aoEscolher: (v: string) => void;
}) {
  return (
    <fieldset className="perfil-bloco">
      <legend>{titulo}</legend>
      <div className="perfil-opcoes">
        {opcoes.map((o) => (
          <button
            key={o.v}
            type="button"
            className={`perfil-chip${valor === o.v ? ' on' : ''}`}
            aria-pressed={valor === o.v}
            onClick={() => aoEscolher(o.v)}
          >
            {o.r}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

/** Várias escolhas. Caixa de marcar de verdade, para leitor de tela anunciar. */
function Marcacao({
  titulo,
  ajuda,
  opcoes,
  marcados,
  aoMarcar,
}: {
  titulo: string;
  ajuda?: string;
  opcoes: readonly { v: string; r: string }[];
  marcados: string[];
  aoMarcar: (v: string) => void;
}) {
  return (
    <fieldset className="perfil-bloco">
      <legend>{titulo}</legend>
      {ajuda && <p className="perfil-ajuda">{ajuda}</p>}
      <div className="perfil-marcar">
        {opcoes.map((o) => (
          <label key={o.v} className={`perfil-marca${marcados.includes(o.v) ? ' on' : ''}`}>
            <input
              type="checkbox"
              checked={marcados.includes(o.v)}
              onChange={() => aoMarcar(o.v)}
            />
            <span>{o.r}</span>
          </label>
        ))}
      </div>
    </fieldset>
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

// Sem depoimento real cadastrado a secao nao existe, e o link para ela tambem nao.
export function Cabecalho({
  temDepoimentos = false,
  mostrarComoFunciona = true,
}: {
  temDepoimentos?: boolean;
  // "Como funciona" explica a assinatura; com ela oculta, o link some junto.
  mostrarComoFunciona?: boolean;
}) {
  const { qtdTotal, abrirCarrinho, pulso } = useLoja();
  const [grudado, setGrudado] = useState(false);
  const [busca, setBusca] = useState('');
  const [menuAberto, setMenuAberto] = useState(false);

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

  // O menu só existe abaixo de 1000px. Sem isto ele continuaria "aberto" ao
  // girar o aparelho ou alargar a janela, escondendo o topo do site.
  useEffect(() => {
    if (!menuAberto) return;
    const fechar = () => setMenuAberto(false);
    const mq = window.matchMedia('(min-width:1001px)');
    const porTecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape') fechar();
    };
    mq.addEventListener('change', fechar);
    window.addEventListener('keydown', porTecla);
    return () => {
      mq.removeEventListener('change', fechar);
      window.removeEventListener('keydown', porTecla);
    };
  }, [menuAberto]);

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
          {mostrarComoFunciona && <a href="#como">Como funciona</a>}
          {temDepoimentos && <a href="#depo">Avaliações</a>}
          <a href="/meus-pedidos">Meus pedidos</a>
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
            onClick={() => setMenuAberto((a) => !a)}
            aria-label={menuAberto ? 'Fechar menu' : 'Abrir menu'}
            aria-expanded={menuAberto}
            aria-controls="menu-mobile"
          >
            <Menu />
          </button>
          <button className="icon-btn" onClick={abrirCarrinho} aria-label="Abrir carrinho">
            <Carrinho />
            <span className={`badge${pulso ? ' pop' : ''}`}>{qtdTotal}</span>
          </button>
        </div>
      </div>

      {/* Abaixo de 1000px a navegação e a busca do topo somem. Sem este painel
          a busca simplesmente não existiria no celular, que é de onde vem a
          maior parte do acesso. */}
      <div className="menu-mob" id="menu-mobile" hidden={!menuAberto}>
        <div className="wrap">
          <div className="search menu-mob-busca">
            <Busca />
            <input
              type="search"
              placeholder="Buscar kits..."
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              onKeyDown={(e) => {
                // Enter leva aos resultados: eles ficam atrás do painel.
                if (e.key !== 'Enter') return;
                e.preventDefault();
                setMenuAberto(false);
                document.getElementById('kits')?.scrollIntoView();
              }}
              aria-label="Buscar kits"
            />
          </div>
          <nav className="menu-mob-links" onClick={() => setMenuAberto(false)}>
            <a href="#kits">Kits</a>
            {mostrarComoFunciona && <a href="#como">Como funciona</a>}
            {temDepoimentos && <a href="#depo">Avaliações</a>}
            <a href="/meus-pedidos">Meus pedidos</a>
          </nav>
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

  /* Kit primeiro, avulso depois — e em formatos diferentes de propósito. O kit
     é o que a loja quer vender: ocupa a grade inteira. O avulso é complemento,
     e num carrossel ele convida a passear sem empurrar o kit para fora da
     primeira tela. */
  const kitsDaVez = lista.filter((k) => k.tipo !== 'INDIVIDUAL');
  const individuais = lista.filter((k) => k.tipo === 'INDIVIDUAL');

  if (!lista.length) {
    return <div className="empty">Nenhum produto encontrado com esse nome.</div>;
  }

  return (
    <>
      {kitsDaVez.length > 0 && <Grade produtos={kitsDaVez} />}
      {individuais.length > 0 && <CarrosselProdutos produtos={individuais} />}
    </>
  );
}

/* ============================================================
  Carrossel de produtos avulsos — 6 por vez

   Paginado em vez de rolagem livre: com rolagem, quem está no celular não
   descobre que existe mais coisa à direita. Com páginas e pontinhos, o
   próprio controle conta quantos faltam.
   ============================================================ */

function CarrosselProdutos({ produtos }: { produtos: KitPublico[] }) {
  const POR_VEZ = 6;
  const [pagina, setPagina] = useState(0);
  const paginas = Math.ceil(produtos.length / POR_VEZ);
  const atual = Math.min(pagina, paginas - 1);
  const visiveis = produtos.slice(atual * POR_VEZ, atual * POR_VEZ + POR_VEZ);

  return (
    <section className="avulsos">
      <div className="avulsos-topo">
        <div>
          <h3>Produtos individuais</h3>
          <p>Para completar o kit, ou levar só o que faltou.</p>
        </div>
        <div className="avulsos-nav">
          {paginas > 1 && (
            <>
              <button
                type="button"
                className="avulsos-seta"
                onClick={() => setPagina(atual - 1)}
                disabled={atual === 0}
                aria-label="Produtos anteriores"
              >
                ‹
              </button>
              <button
                type="button"
                className="avulsos-seta"
                onClick={() => setPagina(atual + 1)}
                disabled={atual >= paginas - 1}
                aria-label="Próximos produtos"
              >
                ›
              </button>
            </>
          )}
          <a className="btn btn-ghost btn-sm" href="/produtos">
            Ver todos
          </a>
        </div>
      </div>

      <Grade produtos={visiveis} />

      {paginas > 1 && (
        <div className="avulsos-pontos" role="tablist" aria-label="Páginas de produtos">
          {Array.from({ length: paginas }, (_, i) => (
            <button
              key={i}
              type="button"
              role="tab"
              aria-selected={i === atual}
              aria-label={`Página ${i + 1} de ${paginas}`}
              className={i === atual ? 'on' : ''}
              onClick={() => setPagina(i)}
            />
          ))}
        </div>
      )}
    </section>
  );
}

/** A grade de cartões, usada pelos kits e pelo carrossel. */
export function Grade({ produtos }: { produtos: KitPublico[] }) {
  const { itens, adicionar, mudarQtd, abrirCarrinho } = useLoja();
  return (
    <div className="grid-kits">
      {produtos.map((k) => {
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

  // Mesma regra que o servidor refaz no checkout: compra só de produtos
  // avulsos tem mínimo. Aqui ela aparece antes, para ninguém preencher o
  // endereço inteiro e só então descobrir que falta produto.
  const bloqueio = erroDoCarrinho(
    itens.map((i) => ({ tipo: kitPorId(i.id)?.tipo ?? 'KIT', qtd: i.qtd })),
    subtotal
  );

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
                O frete é calculado pelo CEP no próximo passo.
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
              {itens.length > 0 && bloqueio && <div className="note alerta">{bloqueio}</div>}
              <button
                className="btn btn-primary btn-block"
                onClick={() => abrirCheckout('carrinho')}
                disabled={Boolean(bloqueio)}
              >
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
  combinar?: boolean;
};

type PerfilForm = {
  dataNascimento: string;
  tipoPele: string;
  tomPele: string;
  subtom: string;
  preferenciaCategorias: string[];
  itensFavoritos: string[];
  itensOutros: string;
  cores: string[];
  naoEnviar: string;
  alergias: string;
  sonhoCaixa: string;
};

const PERFIL_VAZIO: PerfilForm = {
  dataNascimento: '',
  tipoPele: '',
  tomPele: '',
  subtom: '',
  preferenciaCategorias: [],
  itensFavoritos: [],
  itensOutros: '',
  cores: [],
  naoEnviar: '',
  alergias: '',
  sonhoCaixa: '',
};

type DadosPagamento = {
  pedido?: number;
  pedidoId?: string;
  total?: number;
  invoiceUrl?: string;
  pix?: { payload: string; imagemBase64: string; expiraEm: string | null } | null;
  /* Link do WhatsApp com a mensagem pronta, montado no sucesso da compra e
     guardado aqui porque `aoLimpar()` esvazia o carrinho antes desta tela
     renderizar — depois dele não haveria mais itens para listar. */
  whatsapp?: string | null;
};

/* De quanto em quanto tempo a tela pergunta se o PIX caiu. Três segundos é
   rápido o bastante para parecer instantâneo e devagar o bastante para não
   martelar a API enquanto a pessoa procura o celular. */
const INTERVALO_CONFERE_PIX = 3000;

/**
 * Botão que leva a conversa da entrega a combinar para o WhatsApp da loja.
 *
 * No motoboy o site não cobrou a corrida: falta combinar valor e horário, e
 * esse passo não tem como ser automático. O que dá para automatizar é não
 * fazer a cliente digitar de novo o que ela já preencheu — a mensagem vai
 * pronta, com o número do pedido e o endereço, que é exatamente o que a loja
 * precisa ter na mão para despachar.
 */
function CombinarEntrega({ link, destaque }: { link: string; destaque?: boolean }) {
  return (
    <div className="combinar">
      <p>
        Falta <b>combinar a entrega</b>. Toque no botão: a mensagem já vai com o seu pedido e o
        endereço preenchidos.
      </p>
      <a
        className={`btn ${destaque ? 'btn-primary' : 'btn-ghost'} combinar-btn`}
        href={link}
        target="_blank"
        rel="noopener noreferrer"
      >
        <Whatsapp /> Combinar entrega no WhatsApp
      </a>
    </div>
  );
}

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

  const [etapa, setEtapa] = useState<'dados' | 'perfil' | 'contrato' | 'pagamento'>('dados');
  const [perfil, setPerfil] = useState<PerfilForm>(PERFIL_VAZIO);
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

  // Cupom de indicacao. O valor mostrado aqui e so previa: quem decide e o
  // servidor, no fechamento.
  const [cupomTexto, setCupomTexto] = useState('');
  const [cupom, setCupom] = useState<{
    codigo: string;
    desconto: number;
    descricao: string;
    primeiraCompra: boolean;
  } | null>(null);
  const [cupomErro, setCupomErro] = useState('');
  const [validandoCupom, setValidandoCupom] = useState(false);

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
    setPerfil(PERFIL_VAZIO);
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
  const descontoCupom = !assinatura && cupom ? cupom.desconto : 0;
  const totalFinal = (assinatura ? (box?.preco ?? 0) : subtotal) - descontoCupom + valorFrete;

  async function aplicarCupom() {
    if (!cupomTexto.trim()) return;
    setCupomErro('');
    setValidandoCupom(true);
    try {
      const r = await fetch('/api/cupom', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          codigo: cupomTexto,
          itens: itens.map((i) => ({ kitId: i.id, qtd: i.qtd })),
        }),
      });
      const resposta = await r.json();
      if (r.ok) setCupom(resposta);
      else {
        setCupom(null);
        setCupomErro(resposta.erro ?? 'Cupom inválido.');
      }
    } catch {
      setCupomErro('Falha de conexão. Tente de novo.');
    }
    setValidandoCupom(false);
  }

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
      setEtapa('perfil');
      return;
    }
    concluir({ ...campos });
  }

  async function concluir(campos: Record<string, string>) {
    setErro('');
    setEnviando(true);

    const rota = assinatura ? '/api/assinatura' : '/api/checkout';
    const corpo = assinatura
      ? { cliente: campos, aceitouContrato: true, ref: refDoCookie(), perfil }
      : {
          cliente: campos,
          itens: itens.map((i) => ({ kitId: i.id, qtd: i.qtd })),
          freteServico: opcaoAtual?.servico,
          ref: refDoCookie(),
          cupom: cupom?.codigo,
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
        if (resposta.campo === 'cupom') {
          setCupom(null);
          setCupomErro(resposta.erro);
        }
        setEnviando(false);
        if (assinatura) setEtapa('dados');
        return;
      }

      evento('Purchase', { value: totalFinal, currency: 'BRL' });

      /* Montado AQUI, antes de `aoLimpar()`: depois dele `itens` está vazio e
         não haveria mais o que listar na mensagem. Quem manda se a entrega é a
         combinar é a resposta do servidor, não a opção marcada na tela — a
         cotação pode ter mudado entre uma coisa e outra. */
      const linkCombinar =
        !assinatura && ehMotoboy(resposta.freteServico)
          ? linkPedidoWhatsapp(config.whatsapp, {
              numero: resposta.pedido ?? 0,
              itens: itens.map((i) => {
                const k = kitPorId(i.id);
                return { nome: k?.nome ?? '', qtd: i.qtd, preco: k?.preco ?? 0 };
              }),
              total: resposta.total ?? totalFinal,
              nome: campos.nome ?? '',
              cep: campos.cep ?? '',
              endereco: campos.endereco ?? '',
              enderecoNumero: campos.enderecoNumero ?? '',
              complemento: campos.complemento ?? '',
              bairro: campos.bairro ?? '',
              cidade: campos.cidade ?? '',
              uf: campos.uf ?? '',
            })
          : null;

      if (!assinatura) aoLimpar();

      const paraTela: DadosPagamento = { ...resposta, whatsapp: linkCombinar };

      /* PIX termina AQUI DENTRO: o QR vai na própria tela. Mandar a cliente
         para a página do Asaas no último passo é onde se perde venda — ela sai
         do site, estranha o domínio e desiste. Para boleto e cartão o link do
         Asaas continua sendo o caminho, porque ali a página dele faz mais do
         que a nossa faria. */
      if (resposta.pix?.payload) {
        setPagamento(paraTela);
        setEtapa('pagamento');
        setEnviando(false);
        return;
      }

      /* Entrega a combinar é a exceção ao parágrafo acima: no motoboy o site
         não cobrou a corrida, então a compra só chega de verdade depois da
         conversa no WhatsApp. Redirecionar para o Asaas aqui tiraria a cliente
         da tela justamente antes do passo que falta. O link de pagamento
         continua à mão, como botão principal da nossa própria tela. */
      if (linkCombinar) {
        setPagamento(paraTela);
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
          ? 'Pedido registrado! Vamos entrar em contato. Acompanhe em Meus pedidos.'
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
                  : pagamento?.pix?.payload
                    ? 'Pague com PIX'
                    : 'Pedido registrado'
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
                <span className={etapa === 'dados' ? 'on' : 'feito'}>1. Dados</span>
                <span className={etapa === 'perfil' ? 'on' : etapa === 'dados' ? '' : 'feito'}>
                  2. Seu perfil
                </span>
                <span className={etapa === 'contrato' ? 'on' : etapa === 'pagamento' ? 'feito' : ''}>
                  3. Contrato
                </span>
                <span className={etapa === 'pagamento' ? 'on' : ''}>4. Pagamento</span>
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
                    {/* Pago e com motoboy, combinar a entrega passa a ser o
                        proximo passo real da compra — vem antes do resto. */}
                    {pagamento?.whatsapp && <CombinarEntrega link={pagamento.whatsapp} destaque />}

                    {/* O site ainda nao manda e-mail: sem este link, fechar a tela
                        era perder o caminho de volta para o pedido. */}
                    <a className="btn btn-ghost" href="/meus-pedidos">
                      Acompanhar pedido
                    </a>
                    <button className="btn btn-primary" onClick={fechar}>
                      Fechar
                    </button>
                  </div>
                ) : pagamento?.pix?.payload ? (
                  <>
                    <p className="pix-valor">
                      {/* No motoboy o valor na tela e so dos produtos: dizer isso
                          aqui evita a cliente achar que a corrida ja esta paga. */}
                      <span>
                        Pedido #{pagamento?.pedido}
                        {pagamento?.whatsapp ? ' — produtos (frete a combinar)' : ''}
                      </span>
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

                    {pagamento?.whatsapp && <CombinarEntrega link={pagamento.whatsapp} />}
                  </>
                ) : (
                  /* Sem QR na tela: ou a cliente escolheu boleto/cartão, ou o
                     Asaas não está ligado. Antes isso virava redirect ou toast
                     e a tela sumia; com entrega a combinar ela precisa ficar,
                     porque é aqui que está o botão do WhatsApp. */
                  <>
                    <p className="pix-valor">
                      {/* No motoboy o valor na tela e so dos produtos: dizer isso
                          aqui evita a cliente achar que a corrida ja esta paga. */}
                      <span>
                        Pedido #{pagamento?.pedido}
                        {pagamento?.whatsapp ? ' — produtos (frete a combinar)' : ''}
                      </span>
                      <b>{real(pagamento?.total ?? 0)}</b>
                    </p>

                    {erro && <div className="note erro">{erro}</div>}

                    {pagamento?.invoiceUrl ? (
                      <>
                        <p className="pix-instrucao">
                          Pedido registrado. Falta o pagamento dos produtos — o link abre boleto,
                          cartão e PIX.
                        </p>
                        <a
                          className="btn btn-primary pix-copiar"
                          href={pagamento.invoiceUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          Ir para o pagamento
                        </a>
                      </>
                    ) : (
                      <p className="pix-instrucao">
                        Pedido registrado. Vamos falar com você para combinar o pagamento.
                      </p>
                    )}

                    {pagamento?.whatsapp && (
                      <CombinarEntrega
                        link={pagamento.whatsapp}
                        destaque={!pagamento.invoiceUrl}
                      />
                    )}

                    <a className="btn btn-ghost" href="/meus-pedidos">
                      Acompanhar pedido
                    </a>
                  </>
                )}
              </div>
            ) : etapa === 'perfil' ? (
              <FormularioPerfil
                perfil={perfil}
                mudar={setPerfil}
                aoVoltar={() => setEtapa('dados')}
                aoSeguir={() => setEtapa('contrato')}
              />
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
                      {cupom && (
                        <div className="tot">
                          <span>Cupom {cupom.codigo}</span>
                          <span className="tot-desconto">− {real(cupom.desconto)}</span>
                        </div>
                      )}
                      <div className="tot">
                        <span>Frete</span>
                        <span>
                          {cotando
                            ? 'calculando...'
                            : opcaoAtual
                              ? opcaoAtual.combinar
                                ? 'a combinar'
                                : opcaoAtual.gratis
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

                {!assinatura && (
                  <div className="cupom">
                    <label htmlFor="ck-cupom">Cupom de indicação</label>
                    <div className="cupom-linha">
                      <input
                        id="ck-cupom"
                        value={cupomTexto}
                        onChange={(e) => {
                          setCupomTexto(e.target.value);
                          setCupomErro('');
                        }}
                        onKeyDown={(e) => {
                          if (e.key !== 'Enter') return;
                          e.preventDefault();
                          aplicarCupom();
                        }}
                        placeholder="Código"
                        autoCapitalize="characters"
                        autoComplete="off"
                        disabled={Boolean(cupom)}
                      />
                      {cupom ? (
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          onClick={() => {
                            setCupom(null);
                            setCupomTexto('');
                          }}
                        >
                          Remover
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="btn btn-soft btn-sm"
                          onClick={aplicarCupom}
                          disabled={validandoCupom || !cupomTexto.trim()}
                        >
                          {validandoCupom ? 'Conferindo...' : 'Aplicar'}
                        </button>
                      )}
                    </div>
                    {cupom && (
                      <small className="cupom-ok">
                        {cupom.descricao}
                        {cupom.primeiraCompra ? ' · válido na primeira compra' : ''}
                      </small>
                    )}
                    {cupomErro && (
                      <small className="cupom-erro" role="alert">
                        {cupomErro}
                      </small>
                    )}
                  </div>
                )}

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
                            {f.combinar ? (
                              <small>você combina valor e horário pelo WhatsApp</small>
                            ) : f.prazoDias ? (
                              <small>até {f.prazoDias} dias úteis</small>
                            ) : null}
                          </span>
                          <b className="of-valor">
                            {f.combinar ? 'a combinar' : f.gratis ? 'Grátis' : real(f.valor)}
                          </b>
                        </label>
                      ))}
                    </div>
                  )}

                  {opcaoAtual?.combinar && (
                    <div className="note">
                      Você paga agora só os produtos. Assim que o pedido entrar, falamos com você no
                      WhatsApp para combinar o valor da corrida e o horário da entrega.
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
