/**
 * Nome do serviço de motoboy, num módulo sem `server-only`.
 *
 * O cálculo de frete mora em frete.ts, que é só do servidor (guarda o token do
 * Melhor Envio). Mas a tela do checkout e a de Meus pedidos precisam
 * reconhecer o motoboy para mostrar "a combinar" e o botão do WhatsApp — daí
 * a constante viver aqui, onde os dois lados podem importar.
 */
export const SERVICO_MOTOBOY = 'Motoboy — entrega no mesmo dia';

export function ehMotoboy(servico: string | null | undefined): boolean {
  return (servico ?? '').startsWith('Motoboy');
}

/**
 * A cotacao que chegou e mesmo do CEP que esta na tela?
 *
 * A pessoa digita um CEP, corrige para outro, e as duas cotacoes voltam fora
 * de ordem — a primeira chegando por ultimo repoe as opcoes do CEP ERRADO. Na
 * regiao da loja isso punha o motoboy na tela de quem mora longe. O destino
 * volta na resposta justamente para poder conferir aqui.
 *
 * Resposta sem destino (CEP nao encontrado, ViaCEP fora do ar) e aceita: ela
 * nao afirma cidade nenhuma, e nao traz opcao de entrega junto.
 */
export function cotacaoEhDoCep(
  resposta: { destino?: { cep?: string } | null } | null | undefined,
  cep: string
): boolean {
  const pedido = (cep ?? '').replace(/\D/g, '');
  if (pedido.length !== 8) return false;
  const veio = (resposta?.destino?.cep ?? '').replace(/\D/g, '');
  return !veio || veio === pedido;
}
