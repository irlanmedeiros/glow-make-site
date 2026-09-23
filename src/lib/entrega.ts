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
