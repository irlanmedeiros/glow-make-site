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
