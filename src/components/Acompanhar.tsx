'use client';

import { useState } from 'react';
import {
  ETAPAS_PEDIDO,
  etapaDoPedido,
  type AssinaturaDaCliente,
  type PedidoDaCliente,
  type ResultadoConsulta,
} from '@/lib/acompanhamento';
import { ehMotoboy } from '@/lib/entrega';

/* format.ts importa o Prisma; num componente de cliente isso arrastaria a
   biblioteca para o navegador. Os dois formatadores sao pequenos o bastante
   para morar aqui. */
const real = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const dia = (d: string | null) => (d ? new Date(d).toLocaleDateString('pt-BR') : '');

const ROTULO_ETAPA: Record<string, string> = {
  AGUARDANDO_PAGAMENTO: 'Pedido feito',
  PAGO: 'Pagamento confirmado',
  EM_SEPARACAO: 'Em separação',
  ENVIADO: 'Enviado',
  ENTREGUE: 'Entregue',
};

type Props = {
  whatsapp: string;
  linkWhatsapp: string | null;
  contratoVersaoAtual: string;
  clausulaCancelamento: string | null;
  contratoTexto: string;
};

export default function Acompanhar(props: Props) {
  const [email, setEmail] = useState('');
  const [documento, setDocumento] = useState('');
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState('');
  const [resultado, setResultado] = useState<ResultadoConsulta | null>(null);

  /* As credenciais ficam so na memoria da pagina, nunca em localStorage:
     num celular emprestado, a proxima pessoa veria os pedidos. */
  async function chamar(rota: string, extra: Record<string, unknown> = {}): Promise<string | null> {
    const r = await fetch(rota, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, documento, ...extra }),
    });
    const corpo = await r.json().catch(() => ({ erro: 'Resposta inesperada.' }));
    if (!r.ok) return corpo.erro ?? 'Não consegui concluir agora.';
    setResultado(corpo);
    return null;
  }

  async function consultar(e: React.FormEvent) {
    e.preventDefault();
    setErro('');
    setCarregando(true);
    try {
      const falhou = await chamar('/api/meus-pedidos');
      if (falhou) {
        setResultado(null);
        setErro(falhou);
      }
    } catch {
      setErro('Falha de conexão. Verifique sua internet e tente de novo.');
    }
    setCarregando(false);
  }

  return (
    <main className="acomp">
      <section className="acomp-busca">
        <h1>Meus pedidos</h1>
        <p>Informe o e-mail e o CPF ou CNPJ usados na compra para ver o andamento e o rastreio.</p>
        <form className="acomp-campos" onSubmit={consultar}>
          <div className="field">
            <label htmlFor="mp-email">E-mail</label>
            <input
              id="mp-email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="seu@email.com"
            />
          </div>
          <div className="field">
            <label htmlFor="mp-doc">CPF ou CNPJ</label>
            <input
              id="mp-doc"
              inputMode="numeric"
              required
              value={documento}
              onChange={(e) => setDocumento(e.target.value)}
              placeholder="000.000.000-00"
            />
          </div>
          <button className="btn btn-primary" disabled={carregando}>
            {carregando ? 'Buscando...' : 'Consultar'}
          </button>
        </form>
        {erro && (
          <div className="note erro" role="alert">
            {erro}
          </div>
        )}
      </section>

      {resultado && (
        <>
          {resultado.assinaturas.length > 0 && (
            <>
              <h2 className="acomp-titulo">Assinatura</h2>
              {resultado.assinaturas.map((a) => (
                <CardAssinatura key={a.id} a={a} chamar={chamar} {...props} />
              ))}
            </>
          )}

          {resultado.pedidos.length > 0 && (
            <>
              <h2 className="acomp-titulo">Pedidos</h2>
              {resultado.pedidos.map((p) => (
                <CardPedido key={p.id} p={p} chamar={chamar} {...props} />
              ))}
            </>
          )}
        </>
      )}
    </main>
  );
}

type Chamar = (rota: string, extra?: Record<string, unknown>) => Promise<string | null>;

function Contato({ whatsapp, linkWhatsapp }: { whatsapp: string; linkWhatsapp: string | null }) {
  if (!linkWhatsapp) return <>pelos nossos canais de atendimento</>;
  return (
    <>
      pelo{' '}
      <a href={linkWhatsapp} target="_blank" rel="noopener noreferrer">
        WhatsApp {whatsapp}
      </a>
    </>
  );
}

/* ============================================================
   Pedido
   ============================================================ */

function CardPedido({ p, chamar, ...props }: { p: PedidoDaCliente; chamar: Chamar } & Props) {
  const etapa = etapaDoPedido(p.status);
  const datas: Record<string, string | null> = {
    AGUARDANDO_PAGAMENTO: p.criadoEm,
    EM_SEPARACAO: p.separadoEm,
    ENVIADO: p.enviadoEm,
    ENTREGUE: p.entregueEm,
  };

  return (
    <article className="acomp-card">
      <div className="acomp-card-topo">
        <b>Pedido #{p.numero}</b>
        <span className={`pill ${p.status === 'CANCELADO' ? 'out' : p.status === 'AGUARDANDO_PAGAMENTO' ? 'low' : 'ok'}`}>
          {p.rotulo}
        </span>
      </div>
      <div className="acomp-sub">
        Feito em {dia(p.criadoEm)}
        {p.cidade && ` · entrega em ${p.cidade}/${p.uf}`}
      </div>

      {p.status !== 'CANCELADO' && (
        <ol className="linha-tempo" aria-label="Andamento do pedido">
          {ETAPAS_PEDIDO.map((s, i) => (
            <li key={s} className={`${i <= etapa ? 'feita' : ''}${i === etapa ? ' atual' : ''}`}>
              <span>
                <b>{ROTULO_ETAPA[s]}</b>
                {i <= etapa && datas[s] && <small>{dia(datas[s])}</small>}
              </span>
            </li>
          ))}
        </ol>
      )}

      {p.codigoRastreio && <Rastreio p={p} />}

      {/* Motoboy: a entrega e o valor da corrida se combinam por fora do site,
          entao o lugar de continuar a conversa fica dentro do pedido. */}
      {ehMotoboy(p.freteServico) && p.status !== 'CANCELADO' && (
        <div className="note" style={{ marginTop: 12 }}>
          <b>Entrega por motoboy.</b> Combine o valor da corrida e o horário com a loja
          {props.linkWhatsapp ? (
            <>
              {' '}
              no{' '}
              <a
                href={`${props.linkWhatsapp}?text=${encodeURIComponent(`Olá! Sou do pedido #${p.numero} e quero combinar a entrega por motoboy.`)}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                WhatsApp {props.whatsapp}
              </a>
              .
            </>
          ) : (
            ' pelos nossos canais de atendimento.'
          )}
        </div>
      )}

      {p.invoiceUrl && (
        <div className="note alerta" style={{ marginTop: 12 }}>
          Ainda não recebemos o pagamento.{' '}
          <a href={p.invoiceUrl} target="_blank" rel="noopener noreferrer">
            Pagar agora
          </a>
        </div>
      )}

      <ul className="acomp-itens">
        {p.itens.map((i, n) => (
          <li key={n}>
            <span>
              {i.qtd}× {i.nome}
            </span>
            <span>{real(i.preco * i.qtd)}</span>
          </li>
        ))}
        {p.desconto > 0 && (
          <li>
            <span>Cupom {p.cupomCodigo}</span>
            <span>− {real(p.desconto)}</span>
          </li>
        )}
        <li>
          <span>Frete{p.freteServico ? ` (${p.freteServico})` : ''}</span>
          <span>{p.frete === 0 ? 'Grátis' : real(p.frete)}</span>
        </li>
        <li className="total">
          <span>Total</span>
          <span>{real(p.total)}</span>
        </li>
      </ul>

      <CancelamentoPedido p={p} chamar={chamar} {...props} />
    </article>
  );
}

function Rastreio({ p }: { p: PedidoDaCliente }) {
  const [copiado, setCopiado] = useState(false);
  return (
    <div className="acomp-rastreio">
      <div>
        <div className="acomp-sub">Código de rastreio{p.transportadora ? ` · ${p.transportadora}` : ''}</div>
        <code>{p.codigoRastreio}</code>
      </div>
      <div className="acomp-rastreio-acoes">
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={async () => {
            await navigator.clipboard?.writeText(p.codigoRastreio ?? '').catch(() => {});
            setCopiado(true);
          }}
        >
          {copiado ? 'Copiado' : 'Copiar código'}
        </button>
        {p.linkRastreio && (
          <a className="btn btn-primary btn-sm" href={p.linkRastreio} target="_blank" rel="noopener noreferrer">
            Rastrear
          </a>
        )}
      </div>
    </div>
  );
}

function CancelamentoPedido({ p, chamar, ...props }: { p: PedidoDaCliente; chamar: Chamar } & Props) {
  const [aberto, setAberto] = useState(false);
  const [motivo, setMotivo] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState('');
  const c = p.cancelamento;

  if (c.tipo === 'cancelado') return null;

  if (c.tipo === 'pendente') {
    return (
      <div className="acomp-acao">
        <div className="note" role="status">
          <b>Cancelamento em análise.</b> Recebemos seu pedido em {dia(c.solicitadoEm)}. A equipe
          responde por aqui mesmo: é só consultar de novo.
        </div>
      </div>
    );
  }

  if (c.tipo === 'recusado') {
    return (
      <div className="acomp-acao">
        <div className="note erro">
          <b>O cancelamento não foi aprovado.</b>
          {c.resposta && <> {c.resposta}</>} Se quiser conversar, fale com a gente{' '}
          <Contato whatsapp={props.whatsapp} linkWhatsapp={props.linkWhatsapp} />.
        </div>
      </div>
    );
  }

  if (c.tipo === 'ja-enviado') {
    return (
      <div className="acomp-acao">
        <p className="acomp-sub">
          Precisa devolver? Compras pela internet podem ser desistidas em até 7 dias do recebimento.
          Fale com a gente <Contato whatsapp={props.whatsapp} linkWhatsapp={props.linkWhatsapp} />.
        </p>
      </div>
    );
  }

  const pago = p.status !== 'AGUARDANDO_PAGAMENTO';

  async function solicitar() {
    setErro('');
    setEnviando(true);
    try {
      const falhou = await chamar('/api/meus-pedidos/cancelar-pedido', { pedidoId: p.id, motivo });
      if (falhou) setErro(falhou);
    } catch {
      setErro('Falha de conexão. Tente de novo.');
    }
    setEnviando(false);
  }

  return (
    <div className="acomp-acao">
      {!aberto ? (
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setAberto(true)}>
          Solicitar cancelamento
        </button>
      ) : (
        <>
          <div className="note">
            O pedido não é cancelado na hora: a equipe analisa e responde por esta página.
            {pago && ' Como o pagamento já foi feito, se o cancelamento for aprovado nós entramos em contato para devolver o valor.'}
          </div>
          <div className="field" style={{ marginTop: 12 }}>
            <label htmlFor={`motivo-${p.id}`}>Motivo (opcional)</label>
            <textarea
              id={`motivo-${p.id}`}
              maxLength={500}
              rows={3}
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Conte o que aconteceu"
            />
          </div>
          {erro && <div className="note erro">{erro}</div>}
          <div className="acomp-botoes">
            <button type="button" className="btn btn-danger" onClick={solicitar} disabled={enviando}>
              {enviando ? 'Enviando...' : 'Enviar pedido de cancelamento'}
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => setAberto(false)} disabled={enviando}>
              Voltar
            </button>
          </div>
        </>
      )}
    </div>
  );
}

/* ============================================================
   Assinatura
   ============================================================ */

function CardAssinatura({ a, chamar, ...props }: { a: AssinaturaDaCliente; chamar: Chamar } & Props) {
  const [aberto, setAberto] = useState(false);
  const [confirmou, setConfirmou] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState('');

  const versaoDiferente = a.contratoVersao && a.contratoVersao !== props.contratoVersaoAtual;

  async function cancelar() {
    setErro('');
    setEnviando(true);
    try {
      const falhou = await chamar('/api/meus-pedidos/cancelar-assinatura', { assinanteId: a.id, confirmou });
      if (falhou) setErro(falhou);
    } catch {
      setErro('Falha de conexão. Tente de novo.');
    }
    setEnviando(false);
  }

  return (
    <article className="acomp-card">
      <div className="acomp-card-topo">
        <b>Glow Box mensal</b>
        <span className={`pill ${a.status === 'ATIVA' ? 'ok' : a.status === 'CANCELADA' ? 'out' : 'low'}`}>
          {a.rotulo}
        </span>
      </div>
      <div className="acomp-sub">
        {real(a.valor)} por mês · desde {dia(a.criadoEm)}
        {a.contratoVersao && ` · contrato ${a.contratoVersao} aceito em ${dia(a.contratoAceitoEm)}`}
      </div>

      {a.status === 'CANCELADA' && (
        <div className="note" style={{ marginTop: 12 }}>
          Assinatura cancelada em {dia(a.canceladaEm)}. Nenhuma nova mensalidade será cobrada.
        </div>
      )}

      {a.invoiceUrl && (
        <div className="note alerta" style={{ marginTop: 12 }}>
          O primeiro pagamento ainda não foi feito.{' '}
          <a href={a.invoiceUrl} target="_blank" rel="noopener noreferrer">
            Pagar agora
          </a>
        </div>
      )}

      {a.efeito.podeCancelar && (
        <div className="acomp-acao">
          {!aberto ? (
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setAberto(true)}>
              Cancelar assinatura
            </button>
          ) : (
            <>
              <div className="note">
                {a.efeito.devolveCaixa
                  ? 'Como o primeiro pagamento ainda não foi feito, a assinatura é encerrada e nada é enviado.'
                  : 'A assinatura é encerrada e nenhuma nova mensalidade é cobrada. O que já foi pago segue o contrato que você aceitou:'}
              </div>

              <div className="contrato" tabIndex={0}>
                {props.clausulaCancelamento ?? (props.contratoTexto || 'O contrato não está disponível no momento.')}
              </div>
              {versaoDiferente && (
                <p className="acomp-sub">
                  Você aceitou a versão {a.contratoVersao} do contrato; o texto acima é o da versão{' '}
                  {props.contratoVersaoAtual}, vigente hoje. Em caso de dúvida, fale com a gente{' '}
                  <Contato whatsapp={props.whatsapp} linkWhatsapp={props.linkWhatsapp} />.
                </p>
              )}

              <label className="aceite">
                <input type="checkbox" checked={confirmou} onChange={(e) => setConfirmou(e.target.checked)} />
                <span>Li a cláusula de cancelamento e quero encerrar minha assinatura.</span>
              </label>

              {erro && <div className="note erro">{erro}</div>}
              <div className="acomp-botoes">
                <button type="button" className="btn btn-danger" onClick={cancelar} disabled={!confirmou || enviando}>
                  {enviando ? 'Cancelando...' : 'Confirmar cancelamento'}
                </button>
                <button type="button" className="btn btn-ghost" onClick={() => setAberto(false)} disabled={enviando}>
                  Manter assinatura
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </article>
  );
}
