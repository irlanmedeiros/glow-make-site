import { NextResponse } from 'next/server';
import { ehAdmin } from '@/lib/auth';
import { gerarModelo } from '@/lib/planilha';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Planilha modelo para o lojista preencher e importar. */
export async function GET() {
  if (!(await ehAdmin())) {
    return NextResponse.json({ erro: 'Não autorizado.' }, { status: 401 });
  }

  const arquivo = await gerarModelo();

  return new NextResponse(new Uint8Array(arquivo), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="modelo-produtos-glow-make.xlsx"',
      'Cache-Control': 'no-store',
    },
  });
}
