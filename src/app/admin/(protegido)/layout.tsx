import { redirect } from 'next/navigation';
import Link from 'next/link';
import { ehAdmin } from '@/lib/auth';
import { sair } from '../actions';
import {
  IcPainel,
  IcEstoque,
  IcKits,
  IcPedidos,
  IcAssinantes,
  IcBanners,
  IcDepoimentos,
  IcConfig,
  IcSair,
  IcSite,
  IcCatalogo,
  IcEntregas,
  IcImportar,
} from '@/components/Icones';

export const dynamic = 'force-dynamic';

const MENU = [
  { href: '/admin', rotulo: 'Painel', Icone: IcPainel },
  { href: '/admin/estoque', rotulo: 'Estoque', Icone: IcEstoque },
  { href: '/catalogo', rotulo: 'Catálogo da loja', Icone: IcCatalogo },
  { href: '/admin/kits', rotulo: 'Kits e produtos', Icone: IcKits },
  { href: '/admin/pedidos', rotulo: 'Pedidos', Icone: IcPedidos },
  { href: '/admin/entregas', rotulo: 'Entregas', Icone: IcEntregas },
  { href: '/admin/assinantes', rotulo: 'Assinantes', Icone: IcAssinantes },
  { href: '/admin/banners', rotulo: 'Banners', Icone: IcBanners },
  { href: '/admin/depoimentos', rotulo: 'Depoimentos', Icone: IcDepoimentos },
  { href: '/admin/importar', rotulo: 'Importar planilha', Icone: IcImportar },
  { href: '/admin/config', rotulo: 'Configurações', Icone: IcConfig },
];

/* Este layout cobre o grupo (protegido), que contém todas as telas do admin.
   A tela de login mora fora do grupo, em /admin/login, e por isso não passa
   pela verificação abaixo — senão ninguém conseguiria chegar nela. */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  // Aqui é a checagem que vale: valida assinatura, validade e PAPEL do token
  // em Node. O middleware só faz o redirecionamento rápido de quem nem cookie
  // tem — e não sabe distinguir admin de vendedora, porque roda no Edge.
  if (!(await ehAdmin())) redirect('/admin/login');

  return (
    <div className="adm">
      <aside className="adm-side">
        <div className="brand">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/assets/logo.png" alt="Glow Make" />
          <span>Admin</span>
        </div>

        {MENU.map(({ href, rotulo, Icone }) => (
          <Link className="adm-nav" href={href} key={href}>
            <Icone />
            {rotulo}
          </Link>
        ))}

        <div className="sep">
          <Link className="adm-nav" href="/" target="_blank">
            <IcSite />
            Ver o site
          </Link>
          <form action={sair}>
            <button className="adm-nav" style={{ width: '100%' }} type="submit">
              <IcSair />
              Sair
            </button>
          </form>
        </div>
      </aside>

      <main className="adm-main">{children}</main>
    </div>
  );
}
