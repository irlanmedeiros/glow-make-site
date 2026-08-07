import { NextResponse, type NextRequest } from 'next/server';

/**
 * O middleware roda no Edge, onde não existe o `crypto` do Node — então aqui
 * ele só confere se EXISTE um cookie, para já redirecionar quem claramente
 * não está logado. A validação de verdade (assinatura e validade do token)
 * acontece em src/app/admin/layout.tsx e em cada server action, que rodam em
 * Node. Um cookie falso passa por aqui e é barrado lá.
 */
export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (pathname.startsWith('/admin/login')) return NextResponse.next();

  if (!req.cookies.get('glowmake_admin')) {
    const url = req.nextUrl.clone();
    url.pathname = '/admin/login';
    url.search = '';
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = { matcher: ['/admin/:path*'] };
