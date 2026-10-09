import { linkWhatsapp } from './acompanhamento';

/**
 * Mensagem pronta de WhatsApp para o pedido que sai com entrega a combinar.
 *
 * Motoboy é a única entrega cujo valor não sai do site: a cliente paga os
 * produtos e o valor da corrida é combinado depois (ver lib/frete.ts, regra 3).
 * Até aqui esse "depois" era só uma frase na tela — quem fechava a compra
 * ficava sem saber para onde ir, e a loja descobria o pedido no painel sem
 * endereço na mão para passar ao motoboy. Este módulo fecha esse buraco.
 *
 * Sem módulo `server-only` de propósito: a mensagem é montada no NAVEGADOR, com
 * os dados que a cliente acabou de digitar. É por isso que o endereço completo
 * aparece aqui sem aparecer em `PedidoDaCliente` — aquele formato sai por uma
 * rota aberta e omite endereço de propósito. Aqui nada trafega: o texto nasce
 * e morre na aba de quem comprou.
 */

/**
 * Número da loja que recebe os pedidos a combinar.
 *
 * O valor que vale é o de Configurações (`Config.whatsapp`), para a dona
 * trocar o número sem publicar de novo. Esta constante é só a rede de
 * segurança: o banco nasce com o placeholder "(00) 00000-0000", que
 * `linkWhatsapp` recusa de propósito, e sem ela o botão não apareceria
 * justamente no pedido de motoboy, que é o que mais precisa da conversa.
 */
export const WHATSAPP_LOJA = '83988187878';

export type ItemDaMensagem = { nome: string; qtd: number; preco: number };

export type PedidoDaMensagem = {
  numero: number;
  itens: ItemDaMensagem[];
  /** O que a cliente paga agora: produtos, já sem o frete que falta combinar. */
  total: number;
  nome: string;
  cep: string;
  endereco: string;
  enderecoNumero: string;
  complemento: string;
  bairro: string;
  cidade: string;
  uf: string;
};

/* Formatação própria, sem `lib/format.ts`: aquele arquivo importa
   `@prisma/client` e arrastaria o Prisma para o pacote do navegador. */
const real = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }).replace(/ /g, ' ');

const cepBonito = (cep: string) => {
  const d = cep.replace(/\D/g, '');
  return d.length === 8 ? `${d.slice(0, 5)}-${d.slice(5)}` : cep.trim();
};

/** Junta só o que foi preenchido, para não sobrar " — " solto na mensagem. */
const juntar = (partes: (string | undefined)[], cola: string) =>
  partes.map((p) => (p ?? '').trim()).filter(Boolean).join(cola);

/**
 * Texto que a cliente manda para a loja. Vai em asteriscos porque o WhatsApp
 * usa isso como negrito — não é enfeite: é o que faz o número do pedido e o
 * endereço saltarem na conversa de quem vai despachar o motoboy.
 */
export function mensagemPedido(p: PedidoDaMensagem): string {
  const linhas: string[] = [];

  linhas.push(`Olá! Acabei de fazer o pedido *#${p.numero}* no site da Glow Make.`);
  linhas.push('Quero combinar a entrega por motoboy.');
  linhas.push('');

  linhas.push(`*Pedido #${p.numero}*`);
  for (const i of p.itens) {
    linhas.push(`${i.qtd}x ${i.nome} — ${real(i.preco * i.qtd)}`);
  }
  linhas.push(`Total dos produtos: ${real(p.total)}`);
  linhas.push('');

  linhas.push('*Endereço de entrega*');
  const rua = juntar([juntar([p.endereco, p.enderecoNumero], ', '), p.complemento], ' — ');
  if (rua) linhas.push(rua);
  if (p.bairro.trim()) linhas.push(p.bairro.trim());
  const cidadeUf = juntar([p.cidade, p.uf], '/');
  if (cidadeUf) linhas.push(cidadeUf);
  if (p.cep.trim()) linhas.push(`CEP ${cepBonito(p.cep)}`);
  linhas.push('');

  if (p.nome.trim()) linhas.push(`Em nome de ${p.nome.trim()}`);

  return linhas.join('\n').trim();
}

/**
 * Link que abre a conversa com a mensagem já escrita. `numeroConfigurado` é o
 * de Configurações; vazio ou placeholder cai no número da loja.
 *
 * Devolve null só se nem a constante servir — assim a tela sabe esconder o
 * botão em vez de mostrar um link que não abre nada.
 */
export function linkPedidoWhatsapp(
  numeroConfigurado: string,
  pedido: PedidoDaMensagem
): string | null {
  const base = linkWhatsapp(numeroConfigurado) ?? linkWhatsapp(WHATSAPP_LOJA);
  if (!base) return null;
  return `${base}?text=${encodeURIComponent(mensagemPedido(pedido))}`;
}
