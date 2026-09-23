import type { Metadata } from 'next';
import { assinaturaAtiva } from '@/lib/recursos';
import { SITE_URL } from '@/lib/site';
import './globals.css';

// Titulo e descricao vao para o Google e para a previa de link no WhatsApp:
// com a assinatura oculta, nao podem continuar anunciando a Glow Box.
export async function generateMetadata(): Promise<Metadata> {
  const comAssinatura = await assinaturaAtiva();
  const description = comAssinatura
    ? 'Kits de maquiagem selecionados e a Glow Box mensal entregue na sua casa. Compre avulso ou assine sem fidelidade.'
    : 'Kits de maquiagem selecionados, montados um a um e prontos para presentear.';
  return {
    // Endereco canonico: sem ele, glowmake10.com, www e o endereco antigo da
    // Vercel concorreriam entre si no Google como se fossem sites diferentes.
    metadataBase: new URL(SITE_URL),
    alternates: { canonical: '/' },
    title: comAssinatura
      ? 'Glow Make — Kits de Maquiagem e Assinatura Mensal'
      : 'Glow Make — Kits de Maquiagem para Presentear',
    description,
    icons: { icon: '/assets/logo.png' },
    openGraph: { title: 'Glow Make', description, type: 'website', url: SITE_URL, siteName: 'Glow Make', locale: 'pt_BR' },
  };
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@500;600;700&family=Inter:wght@400;500;600;700&family=Parisienne&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
