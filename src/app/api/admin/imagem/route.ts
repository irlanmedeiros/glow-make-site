import { NextResponse } from 'next/server';
import { ehAdmin } from '@/lib/auth';
import { TIPOS_IMAGEM, caminhoPermitido, comSufixoAleatorio } from '@/lib/imagem';
import { enviarParaR2, r2Configurado } from '@/lib/r2';

export const runtime = 'nodejs';

/**
 * Recebe uma foto do admin e grava no Cloudflare R2.
 *
 * Aqui o arquivo PASSA pela funcao, diferente da versao com Vercel Blob, que
 * usava token de envio direto do navegador. Pode passar porque o navegador ja
 * reduz e converte para WebP antes de enviar (CampoImagem.reduzir): uma foto
 * de banner sai em torno de 300 KB, bem abaixo do limite de 4,5 MB por
 * requisicao da Vercel. O teto abaixo existe para isso nunca ser surpresa.
 *
 * E uma rota publica na internet, como qualquer server action: sem sessao de
 * admin valida, nada e gravado (docs/DECISOES.md #3).
 */

/** Teto do que a funcao aceita receber. A Vercel corta em 4,5 MB. */
const TETO_REQUISICAO = 4 * 1024 * 1024;

export async function POST(req: Request) {
  if (!(await ehAdmin())) {
    return NextResponse.json({ erro: 'Sessão expirada. Entre de novo no admin.' }, { status: 401 });
  }
  if (!r2Configurado()) {
    return NextResponse.json({ erro: 'Envio de fotos não configurado.' }, { status: 503 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ erro: 'Requisição inválida.' }, { status: 400 });
  }

  const arquivo = form.get('arquivo');
  const caminho = form.get('caminho');

  if (!(arquivo instanceof File) || typeof caminho !== 'string') {
    return NextResponse.json({ erro: 'Envie o arquivo e o destino.' }, { status: 400 });
  }
  if (!caminhoPermitido(caminho)) {
    return NextResponse.json({ erro: 'Destino da foto inválido.' }, { status: 400 });
  }
  if (!TIPOS_IMAGEM.includes(arquivo.type)) {
    return NextResponse.json({ erro: 'Use uma foto JPG, PNG ou WebP.' }, { status: 400 });
  }
  if (arquivo.size > TETO_REQUISICAO) {
    return NextResponse.json({ erro: 'Foto muito grande. Tente outra.' }, { status: 413 });
  }

  try {
    // Duas fotos com o mesmo nome nao se sobrescrevem, e o endereco final
    // nunca muda de conteudo — por isso o cache eterno em lib/r2.
    const destino = comSufixoAleatorio(caminho);
    const bytes = new Uint8Array(await arquivo.arrayBuffer());
    const url = await enviarParaR2(destino, bytes, arquivo.type);
    return NextResponse.json({ url });
  } catch (e) {
    console.error('falha ao gravar foto no R2', e);
    return NextResponse.json({ erro: 'Não consegui salvar a foto.' }, { status: 502 });
  }
}
