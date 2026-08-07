import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Glow Make — Kits de Maquiagem e Assinatura Mensal',
  description:
    'Kits de maquiagem selecionados e a Glow Box mensal entregue na sua casa. Compre avulso ou assine sem fidelidade.',
  icons: { icon: '/assets/logo.png' },
  openGraph: {
    title: 'Glow Make',
    description: 'Kits de maquiagem e a Glow Box mensal entregue na sua casa.',
    type: 'website',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@500;600;700&family=Inter:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
