/**
 * Armazenamento das fotos no Cloudflare R2.
 *
 * Por que nao o Vercel Blob: no plano gratuito a Vercel SUSPENDE o store
 * quando a cota de transferencia estoura, e suspenso significa 403 em toda
 * imagem do site. Aconteceu em outubro de 2026. O R2 nao cobra egress, entao
 * esse modo de falha simplesmente nao existe la.
 *
 * O R2 fala o protocolo do S3, por isso o cliente aqui e o da AWS.
 *
 * Tudo roda SO no servidor: a chave do R2 da permissao de escrita no bucket.
 * Se um componente de cliente importar este arquivo, o build quebra em vez de
 * vazar a chave no bundle (docs/DECISOES.md #5).
 */

import 'server-only';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

/** Sem as quatro variaveis, o envio de fotos fica desligado e o admin mostra
 *  so o campo de colar endereco. Degradar, nao derrubar (docs/DECISOES.md #6). */
export function r2Configurado(): boolean {
  return Boolean(
    process.env.R2_ACCOUNT_ID &&
      process.env.R2_ACCESS_KEY_ID &&
      process.env.R2_SECRET_ACCESS_KEY &&
      process.env.R2_BUCKET
  );
}

let cliente: S3Client | null = null;

function s3(): S3Client {
  if (cliente) return cliente;
  const conta = process.env.R2_ACCOUNT_ID;
  const chave = process.env.R2_ACCESS_KEY_ID;
  const segredo = process.env.R2_SECRET_ACCESS_KEY;
  if (!conta || !chave || !segredo) throw new Error('R2 nao configurado.');

  cliente = new S3Client({
    // O R2 ignora regiao, mas o SDK da AWS exige uma.
    region: 'auto',
    endpoint: `https://${conta}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: chave, secretAccessKey: segredo },
  });
  return cliente;
}

/**
 * Endereco publico de um arquivo do bucket.
 *
 * Vem de R2_PUBLIC_URL porque o bucket pode ser servido pelo dominio de
 * cortesia (pub-xxxx.r2.dev) ou por um dominio proprio, e o endereco gravado
 * no banco precisa continuar valendo se isso mudar.
 */
export function enderecoPublico(caminho: string): string {
  const base = (process.env.R2_PUBLIC_URL ?? '').replace(/\/+$/, '');
  if (!base) throw new Error('R2_PUBLIC_URL nao configurada.');
  return `${base}/${caminho}`;
}

/** O host de R2_PUBLIC_URL, para liberar no next.config e validar endereco. */
export function hostPublico(): string | null {
  try {
    return new URL(process.env.R2_PUBLIC_URL ?? '').hostname || null;
  } catch {
    return null;
  }
}

/**
 * Grava a foto no bucket e devolve o endereco publico.
 *
 * `cacheSegundos` alto de proposito: o nome do arquivo ja carrega sufixo
 * aleatorio, entao a mesma URL nunca muda de conteudo e pode ser cacheada
 * para sempre pelo navegador e pela borda da Cloudflare. E isso que mantem o
 * trafego baixo.
 */
export async function enviarParaR2(
  caminho: string,
  corpo: Uint8Array,
  tipo: string
): Promise<string> {
  await s3().send(
    new PutObjectCommand({
      Bucket: process.env.R2_BUCKET,
      Key: caminho,
      Body: corpo,
      ContentType: tipo,
      CacheControl: 'public, max-age=31536000, immutable',
    })
  );
  return enderecoPublico(caminho);
}
