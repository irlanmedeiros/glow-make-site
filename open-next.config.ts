import { defineCloudflareConfig } from '@opennextjs/cloudflare';

/**
 * Adaptacao do Next.js para o Cloudflare Workers.
 *
 * O app nasceu na Vercel e continua rodando la. Esta configuracao existe para
 * o mesmo codigo rodar tambem no Workers, sem fork: o que muda e so o
 * empacotamento.
 */
export default defineCloudflareConfig();
