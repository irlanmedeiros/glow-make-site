import { NextResponse, type NextRequest } from 'next/server';

/**
 * O middleware roda no Edge, onde não existe o `crypto` do Node — então aqui
 * ele só confere se EXISTE um cookie, para já mandar para o login quem
 * claramente não entrou. Ele NÃO sabe distinguir admin de vendedora.
 *
 * A validação de verdade (assinatura, validade e papel) acontece no layout de
 * cada área e em cada server action, que rodam em Node. Um cookie falso ou de
 * papel errado passa por aqui e é barrado lá.
 */
export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (pathname.startsWith('/admin/login')) return NextResponse.next();

  if (!req.cookies.get('glowmake_sessao')) {
    const url = req.nextUrl.clone();
    url.pathname = '/admin/login';
    url.search = '';
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = { matcher: ['/admin/:path*', '/catalogo/:path*'] };
