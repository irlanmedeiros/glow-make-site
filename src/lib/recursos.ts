import { prisma } from '@/lib/prisma';

/**
 * Recursos prontos no codigo e desligados para o publico.
 *
 * Assinatura: a Glow Box existe inteira (contrato, recorrencia, cancelamento,
 * admin), mas so e oferecida quando a chave esta ligada em Configuracoes. O
 * padrao seguro e nao vender o que ainda nao foi lancado.
 *
 * Quem decide e o banco (Config.assinaturaAtiva), para a dona lancar sozinha,
 * na hora que quiser, sem publicacao. SUBSCRIPTION_ENABLED sobrou como valor
 * inicial para o caso de ainda nao existir linha de Config.
 *
 * Desligada NAO apaga nada. Quem ja assina continua vendo e cancelando a
 * assinatura em Meus pedidos, e o admin de assinantes segue igual.
 */
export async function assinaturaAtiva(): Promise<boolean> {
  const config = await prisma.config.findUnique({
    where: { id: 'config' },
    select: { assinaturaAtiva: true },
  });
  if (config) return config.assinaturaAtiva;
  return process.env.SUBSCRIPTION_ENABLED?.trim().toLowerCase() === 'true';
}
