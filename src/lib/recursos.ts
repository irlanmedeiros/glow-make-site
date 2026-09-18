/**
 * Recursos prontos no codigo e desligados para o publico.
 *
 * Assinatura: a Glow Box existe inteira (contrato, recorrencia, cancelamento,
 * admin), mas so e oferecida quando SUBSCRIPTION_ENABLED=true. Sem a variavel
 * fica desligada: o padrao seguro e nao vender o que ainda nao foi lancado.
 *
 * Desligada NAO apaga nada. Quem ja assina continua vendo e cancelando a
 * assinatura em Meus pedidos, e o admin de assinantes segue igual.
 */
export function assinaturaAtiva(): boolean {
  return process.env.SUBSCRIPTION_ENABLED?.trim().toLowerCase() === 'true';
}
