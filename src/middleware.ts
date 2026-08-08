import { NextResponse, type NextRequest } from 'next/server';

const COOKIE_AFILIADO = 'glowmake_ref';
const DIAS_ATRIBUICAO = 30;

/**
 * Duas coisas acontecem aqui.
 *
 * 1. Link de afiliado (?ref=CODIGO): o código vai para um cookie de 30 dias.
 *    Quem chega pelo link do influencer e compra duas semanas depois continua
 *    contando para ele — sem isso, só a compra no mesmo minuto seria atribuída
 *    e o programa não pagaria quase ninguém.
 *
 *    O middleware só GUARDA o código; quem confere se ele existe e está ativo
 *    é o servidor, na hora do pedido. Um cookie inventado não vira comissão.
 *
 * 2. Áreas internas: redireciona para o login quem nem cookie de sessão tem.
 *    Isso roda no Edge, sem o `crypto` do Node, então não sabe distinguir
 *    admin de vendedora — a validação de verdade está no layout de cada área
 *    e em cada server action.
 */
export function middleware(req: NextRequest) {
  const { pathname, searchParams } = req.nextUrl;

  const protegida = pathname.startsWith('/admin') || pathname.startsWith('/catalogo');
  const ehLogin = pathname.startsWith('/admin/login');

  let resposta: NextResponse;
  if (protegida && !ehLogin && !req.cookies.get('glowmake_sessao')) {
    const url = req.nextUrl.clone();
    url.pathname = '/admin/login';
    url.search = '';
    resposta = NextResponse.redirect(url);
  } else {
    resposta = NextResponse.next();
  }

  const ref = searchParams.get('ref');
  if (ref) {
    resposta.cookies.set(COOKIE_AFILIADO, ref.trim().toUpperCase().slice(0, 40), {
      maxAge: DIAS_ATRIBUICAO * 24 * 60 * 60,
      sameSite: 'lax',
      path: '/',
      httpOnly: false, // o Pixel e o front precisam ler para marcar a origem
    });
  }

  return resposta;
}

export const config = {
  // Passa por tudo que é página, menos arquivos estáticos e imagens.
  matcher: ['/((?!_next/static|_next/image|assets|favicon.ico).*)'],
};
