/**
 * Fotos enviadas pelo admin (produtos, banners, depoimentos).
 *
 * O arquivo vai do navegador direto para o Vercel Blob: a funcao da Vercel
 * aceita no maximo 4,5 MB por requisicao, e foto de celular passa disso. O
 * servidor so autoriza o envio (src/app/api/admin/imagem), depois de conferir
 * que quem pede e o admin.
 *
 * Antes de subir, a foto e reduzida no proprio navegador ao tamanho que a
 * vitrine usa, sem cortar: o banner tem preco desenhado na borda
 * (docs/DECISOES.md #10).
 */

export const TIPOS_IMAGEM = ['image/jpeg', 'image/png', 'image/webp'];

/** Teto do arquivo ja reduzido. Com a reducao, uma foto comum fica bem abaixo. */
export const TAMANHO_MAXIMO_IMAGEM = 8 * 1024 * 1024;

export const PASTAS = ['produtos', 'banners', 'depoimentos'] as const;
export type Pasta = (typeof PASTAS)[number];

/** Maior lado, em pixels, depois de reduzida. */
export const LADO_MAXIMO: Record<Pasta, number> = {
  produtos: 1400,
  banners: 2400,
  depoimentos: 400,
};

/** Imagem de produto sem foto: neutra, em vez de foto de banco de outra marca. */
export const IMAGEM_PADRAO_PRODUTO = '/assets/kits/sem-foto.svg';

/**
 * Fotos que ficaram para tras no Vercel Blob.
 *
 * As fotos moravam la antes da mudanca para o R2 (docs/DECISOES.md). A store
 * foi bloqueada depois, e desde entao TODO endereco de la responde 403 "Your
 * store is blocked" — a vitrine ficou com card vazio, sem nem o espaco neutro,
 * porque o navegador nao tem o que desenhar quando a imagem nao carrega.
 *
 * Enquanto a foto nova nao e enviada, o site mostra a imagem neutra e o admin
 * aponta quem precisa ser reenviado. O endereco antigo continua gravado de
 * proposito: apagar em massa jogaria fora a unica pista de onde a foto estava,
 * caso a store volte.
 */
/**
 * Rede de seguranca no navegador: foto que nao carrega vira a imagem neutra.
 *
 * O servidor ja troca os enderecos que sabemos estarem fora do ar, mas um
 * arquivo pode sumir do R2 depois, e card vazio nao explica nada para quem
 * esta comprando. Troca uma vez so — se a propria imagem neutra falhar, nao
 * entra em laco.
 */
export function aoFalharFoto(e: { currentTarget: HTMLImageElement }): void {
  const img = e.currentTarget;
  if (img.dataset.fotoNeutra) return;
  img.dataset.fotoNeutra = '1';
  img.src = IMAGEM_PADRAO_PRODUTO;
}

/** Pedaco do endereco antigo, para o admin achar no banco quem precisa de foto nova. */
export const MARCA_FOTO_INDISPONIVEL = 'blob.vercel-storage.com';

export function fotoIndisponivel(endereco: string | null | undefined): boolean {
  return /\.blob\.vercel-storage\.com\//i.test(endereco ?? '');
}

/** O que a vitrine deve mostrar: a foto, ou a imagem neutra quando nao da. */
export function fotoDoProduto(endereco: string | null | undefined): string {
  const e = (endereco ?? '').trim();
  return !e || fotoIndisponivel(e) ? IMAGEM_PADRAO_PRODUTO : e;
}

const EXTENSAO: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

/** Nome limpo e previsivel; o servidor ainda soma um sufixo aleatorio. */
export function nomeDoArquivo(pasta: Pasta, original: string, tipo: string): string {
  const base =
    original
      .replace(/\.[^.]+$/, '')
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 50) || 'foto';
  return `${pasta}/${base}.${EXTENSAO[tipo] ?? 'jpg'}`;
}

/** So pastas conhecidas e nomes que o proprio site gera. */
export function caminhoPermitido(caminho: string): boolean {
  return /^(produtos|banners|depoimentos)\/[a-z0-9-]{1,60}\.(jpg|png|webp)$/.test(caminho);
}

/**
 * Soma um sufixo aleatorio ao nome, no servidor.
 *
 * Duas fotos com o mesmo nome nao podem se sobrescrever, e o endereco final
 * precisa ser imutavel para poder ser cacheado para sempre (lib/r2). O Vercel
 * Blob fazia isso sozinho com addRandomSuffix; no R2 e por nossa conta.
 *
 * O sufixo tem 8 caracteres de a-z0-9, entao o caminho continua passando por
 * caminhoPermitido: nomeDoArquivo ja corta a base em 50.
 */
export function comSufixoAleatorio(caminho: string): string {
  const bytes = new Uint8Array(8);
  globalThis.crypto.getRandomValues(bytes);
  const sufixo = Array.from(bytes, (b) => (b % 36).toString(36)).join('');
  return caminho.replace(/\.([a-z]+)$/, `-${sufixo}.$1`);
}

/** Mantem a proporcao e nunca aumenta a foto. */
export function dimensoesReduzidas(
  largura: number,
  altura: number,
  ladoMaximo: number
): { largura: number; altura: number } {
  const maior = Math.max(largura, altura);
  if (maior <= ladoMaximo || maior <= 0) return { largura, altura };
  const escala = ladoMaximo / maior;
  return { largura: Math.round(largura * escala), altura: Math.round(altura * escala) };
}

/**
 * O que o admin pode gravar como endereco de imagem: um arquivo do proprio
 * site (/assets/...) ou um https. Qualquer outra coisa (javascript:, data:,
 * http sem s) nao entra no catalogo.
 */
export function enderecoDeImagemValido(endereco: string): boolean {
  const e = endereco.trim();
  if (!e) return false;
  if (/^\/assets\/[A-Za-z0-9/_.-]+$/.test(e)) return !e.includes('..');
  return /^https:\/\/[^\s"'<>]+$/.test(e);
}
