import { linkWhatsapp } from './acompanhamento';
import { WHATSAPP_LOJA } from './whatsapp';
import { ROTULO_PAGAMENTO, ROTULO_PEDIDO, dataHora, real } from './format';

/**
 * Mensagens de WhatsApp que o ADMIN dispara a partir de um pedido.
 *
 * Arquivo separado de `lib/whatsapp.ts` de proposito: aquele e montado no
 * navegador da cliente e nao pode importar `lib/format.ts`, que traz
 * `@prisma/client` junto. Este so roda no servidor, na pagina do admin, entao
 * reusa os formatadores que o resto do painel ja usa em vez de repeti-los.
 *
 * O que estes links FAZEM: abrem a conversa com o texto escrito. Nao enviam.
 * Envio sem ninguem apertar o botao exige API oficial (Meta Cloud API, Twilio,
 * Z-API) — todas pagas e com cadastro de template aprovado. Enquanto isso nao
 * existir, um clique e um "enviar" e o caminho mais curto possivel, e tem a
 * vantagem de a dona reler antes de mandar.
 */

export type PedidoParaMensagem = {
  numero: number;
  status: string;
  criadoEm: Date | string;
  pagamento: string;
  nome: string;
  email: string;
  documento: string;
  telefone: string;
  cep: string;
  endereco: string;
  enderecoNumero: string;
  complemento: string;
  bairro: string;
  cidade: string;
  uf: string;
  itens: { nome: string; qtd: number; preco: number }[];
  subtotal: number;
  frete: number;
  total: number;
  desconto: number;
  cupomCodigo: string | null;
  freteServico: string | null;
  transportadora: string | null;
  codigoRastreio: string | null;
  observacao: string | null;
  invoiceUrl: string | null;
};

/* `real()` separa "R$" do valor com espaco nao-separavel (U+00A0). Na tela
   isso e certo; num texto que vai ser copiado, colado e procurado, vira um
   caractere invisivel que nao casa com a busca. A mensagem do checkout ja
   normaliza — as duas precisam sair iguais. */
const dinheiro = (v: number) => real(v).replace(/\u00a0/g, ' ');

const cepBonito = (cep: string) => {
  const d = cep.replace(/\D/g, '');
  return d.length === 8 ? `${d.slice(0, 5)}-${d.slice(5)}` : cep.trim();
};

const juntar = (partes: (string | null | undefined)[], cola: string) =>
  partes.map((p) => (p ?? '').trim()).filter(Boolean).join(cola);

/** So as linhas preenchidas, para endereco incompleto nao virar linha vazia. */
function blocoEndereco(p: PedidoParaMensagem): string[] {
  const linhas: string[] = [];
  const rua = juntar([juntar([p.endereco, p.enderecoNumero], ', '), p.complemento], ' — ');
  if (rua) linhas.push(rua);
  const local = juntar([p.bairro, juntar([p.cidade, p.uf], '/')], ' — ');
  if (local) linhas.push(local);
  if (p.cep.trim()) linhas.push(`CEP ${cepBonito(p.cep)}`);
  return linhas;
}

function blocoItens(p: PedidoParaMensagem): string[] {
  const linhas = p.itens.map((i) => `${i.qtd}x ${i.nome} — ${dinheiro(i.preco * i.qtd)}`);
  linhas.push(`Produtos: ${dinheiro(p.subtotal)}`);
  if (p.desconto > 0) {
    linhas.push(`Cupom ${p.cupomCodigo ?? ''}: − ${dinheiro(p.desconto)}`.replace('  ', ' '));
  }
  /* Frete zero num pedido de motoboy nao e gratis, e "ainda nao cobrado" —
     dizer "Grátis" aqui prometeria entrega de graca que a loja nao banca. */
  const combinar = (p.freteServico ?? '').startsWith('Motoboy') || p.freteServico === 'A combinar';
  linhas.push(
    `Frete${p.freteServico ? ` (${p.freteServico})` : ''}: ${
      combinar && p.frete === 0 ? 'a combinar' : p.frete === 0 ? 'grátis' : dinheiro(p.frete)
    }`
  );
  linhas.push(`*Total: ${dinheiro(p.total)}*`);
  return linhas;
}

/**
 * Para a cliente. O texto muda com o status porque o botao serve do "paguei?"
 * ao "cadê meu pedido?" — mandar sempre "compra confirmada" para quem ainda
 * nao pagou seria pior do que nao mandar nada.
 */
export function mensagemParaCliente(p: PedidoParaMensagem): string {
  const primeiro = p.nome.trim().split(/\s+/)[0] ?? '';
  const ola = primeiro ? `Oi, ${primeiro}!` : 'Oi!';

  const abertura: Record<string, string> = {
    AGUARDANDO_PAGAMENTO: `${ola} Seu pedido *#${p.numero}* está registrado, mas o pagamento ainda não entrou. Assim que cair, a gente já começa a separar.`,
    PAGO: `${ola} Seu pedido *#${p.numero}* está confirmado — recebemos o pagamento. Já vamos separar tudo.`,
    EM_SEPARACAO: `${ola} Seu pedido *#${p.numero}* já está sendo separado aqui.`,
    ENVIADO: `${ola} Seu pedido *#${p.numero}* saiu para entrega.`,
    ENTREGUE: `${ola} Seu pedido *#${p.numero}* foi entregue. Esperamos que você ame!`,
    CANCELADO: `${ola} Seu pedido *#${p.numero}* foi cancelado.`,
  };

  const linhas: string[] = [abertura[p.status] ?? `${ola} Sobre o seu pedido *#${p.numero}*:`, ''];

  linhas.push('*Seu pedido*');
  linhas.push(...blocoItens(p));
  linhas.push('');

  const endereco = blocoEndereco(p);
  if (endereco.length) {
    linhas.push('*Entrega*');
    linhas.push(...endereco);
    if (p.status === 'ENVIADO' && p.codigoRastreio) {
      linhas.push(`Rastreio${p.transportadora ? ` (${p.transportadora})` : ''}: ${p.codigoRastreio}`);
    }
    linhas.push('');
  }

  /* Quem ainda nao pagou precisa do caminho para pagar, nao so do aviso de
     que falta. O link do Asaas e o mesmo que o site mostrou no checkout. */
  if (p.status === 'AGUARDANDO_PAGAMENTO' && p.invoiceUrl) {
    linhas.push('*Para pagar*');
    linhas.push(p.invoiceUrl);
    linhas.push('');
  }

  linhas.push('Qualquer dúvida, é só responder por aqui. Glow Make');
  return linhas.join('\n').trim();
}

/**
 * Para a loja. Leva o que a dona precisa com o celular na mao: quem é, para
 * onde vai e o que separar — inclusive o que o painel mostra e o WhatsApp
 * nao teria, como documento e observacao do pedido.
 */
export function mensagemParaLoja(p: PedidoParaMensagem): string {
  const linhas: string[] = [
    `*Pedido #${p.numero} — ${ROTULO_PEDIDO[p.status] ?? p.status}*`,
    `${dataHora(p.criadoEm)} · ${ROTULO_PAGAMENTO[p.pagamento] ?? p.pagamento}`,
    '',
    '*Cliente*',
    p.nome,
    p.telefone,
    p.email,
  ];
  if (p.documento.trim()) linhas.push(`CPF/CNPJ ${p.documento}`);
  linhas.push('');

  linhas.push('*Itens*');
  linhas.push(...blocoItens(p));
  linhas.push('');

  const endereco = blocoEndereco(p);
  if (endereco.length) {
    linhas.push('*Entrega*');
    linhas.push(...endereco);
    if (p.codigoRastreio) {
      linhas.push(`Rastreio${p.transportadora ? ` (${p.transportadora})` : ''}: ${p.codigoRastreio}`);
    }
    linhas.push('');
  }

  if (p.observacao?.trim()) linhas.push(`Obs: ${p.observacao.trim()}`);
  return linhas.join('\n').trim();
}

const comTexto = (base: string | null, texto: string) =>
  base ? `${base}?text=${encodeURIComponent(texto)}` : null;

/** Conversa com a cliente. Null quando o telefone do pedido nao serve. */
export function linkClienteWhatsapp(p: PedidoParaMensagem): string | null {
  return comTexto(linkWhatsapp(p.telefone), mensagemParaCliente(p));
}

/** Conversa com a loja, para a dona guardar o pedido no proprio celular. */
export function linkLojaWhatsapp(numeroConfigurado: string, p: PedidoParaMensagem): string | null {
  const base = linkWhatsapp(numeroConfigurado) ?? linkWhatsapp(WHATSAPP_LOJA);
  return comTexto(base, mensagemParaLoja(p));
}
