import type { NextConfig } from 'next';

/**
 * Host publico do bucket R2, lido de R2_PUBLIC_URL.
 *
 * remotePatterns e configuracao estatica, mas este arquivo roda em Node na
 * hora do build, entao da para derivar o host da mesma variavel que o resto
 * do codigo usa — em vez de deixar o endereco escrito em dois lugares e um
 * deles ficar para tras no dia em que o dominio mudar.
 */
function hostDoR2(): string | null {
  try {
    return new URL(process.env.R2_PUBLIC_URL ?? '').hostname || null;
  } catch {
    return null;
  }
}

const r2 = hostDoR2();

const nextConfig: NextConfig = {
  images: {
    // Libera fotos hospedadas fora do projeto.
    remotePatterns: [
      { protocol: 'https', hostname: 'images.unsplash.com' },
      // Fotos antigas, de quando o armazenamento era o Vercel Blob. Mantido
      // para os enderecos ja gravados no banco nao quebrarem.
      { protocol: 'https', hostname: '**.public.blob.vercel-storage.com' },
      ...(r2 ? [{ protocol: 'https' as const, hostname: r2 }] : []),
    ],
  },
};

export default nextConfig;
