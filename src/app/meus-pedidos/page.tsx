import { prisma } from '@/lib/prisma';
import { linkWhatsapp, trechoCancelamento } from '@/lib/acompanhamento';
import Acompanhar from '@/components/Acompanhar';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Meus pedidos — Glow Make',
  description: 'Acompanhe seus pedidos, o rastreio da entrega e a sua assinatura.',
  // Pagina de consulta pessoal: nada aqui interessa a buscador.
  robots: { index: false, follow: false },
};

export default async function MeusPedidos() {
  const config = await prisma.config.findUnique({ where: { id: 'config' } });
  const contratoTexto = config?.contratoTexto ?? '';
  const whatsapp = config?.whatsapp ?? '';

  return (
    <div className="legal">
      <div className="legal-topo">
        <a href="/" className="logo">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/assets/logo.png" alt="Glow Make" />
        </a>
        <a className="btn btn-ghost btn-sm" href="/">
          Voltar à loja
        </a>
      </div>

      <Acompanhar
        whatsapp={linkWhatsapp(whatsapp) ? whatsapp : ''}
        linkWhatsapp={linkWhatsapp(whatsapp)}
        contratoVersaoAtual={config?.contratoVersao ?? 'v1'}
        clausulaCancelamento={trechoCancelamento(contratoTexto)}
        contratoTexto={contratoTexto}
      />
    </div>
  );
}
