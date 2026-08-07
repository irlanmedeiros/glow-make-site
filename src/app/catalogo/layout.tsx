import { redirect } from 'next/navigation';
import Link from 'next/link';
import { podeVerCatalogo, sessao } from '@/lib/auth';
import { sair } from '../admin/actions';
import { IcPainel, IcSair } from '@/components/Icones';

export const dynamic = 'force-dynamic';

export default async function CatalogoLayout({ children }: { children: React.ReactNode }) {
  // Validação real do cookie (assinatura, validade e papel) em Node.
  // Admin também entra: é o mesmo estoque, só que ele tem mais ferramentas.
  if (!(await podeVerCatalogo())) redirect('/admin/login');
  const papel = await sessao();

  return (
    <div className="cat">
      <header className="cat-topo">
        <div className="cat-topo-in">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/assets/logo.png" alt="Glow Make" />
          <span className="cat-tag">Catálogo da loja</span>

          <div className="cat-topo-acoes">
            {papel === 'admin' && (
              <Link className="btn btn-ghost btn-sm" href="/admin">
                <IcPainel />
                Painel
              </Link>
            )}
            <form action={sair}>
              <button className="btn btn-ghost btn-sm" type="submit">
                <IcSair />
                Sair
              </button>
            </form>
          </div>
        </div>
      </header>

      <main className="cat-main">{children}</main>
    </div>
  );
}
