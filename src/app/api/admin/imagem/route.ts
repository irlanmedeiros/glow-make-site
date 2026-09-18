import { NextResponse } from 'next/server';
import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';
import { ehAdmin } from '@/lib/auth';
import { TAMANHO_MAXIMO_IMAGEM, TIPOS_IMAGEM, caminhoPermitido } from '@/lib/imagem';

export const runtime = 'nodejs';

/**
 * Autoriza o envio de uma foto do admin direto para o Vercel Blob.
 *
 * O arquivo NAO passa por aqui: a funcao da Vercel aceita no maximo 4,5 MB, e
 * foto de celular passa disso. Esta rota so entrega ao navegador um token de
 * envio de curta duracao, restrito a imagem, a pasta e ao tamanho.
 *
 * E uma rota publica na internet, como qualquer server action: sem sessao de
 * admin valida, nao sai token (docs/DECISOES.md #3).
 */
export async function POST(req: Request) {
  if (!(await ehAdmin())) {
    return NextResponse.json({ erro: 'Sessão expirada. Entre de novo no admin.' }, { status: 401 });
  }
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return NextResponse.json({ erro: 'Envio de fotos não configurado.' }, { status: 503 });
  }

  let body: HandleUploadBody;
  try {
    body = (await req.json()) as HandleUploadBody;
  } catch {
    return NextResponse.json({ erro: 'Requisição inválida.' }, { status: 400 });
  }

  try {
    const resposta = await handleUpload({
      body,
      request: req,
      onBeforeGenerateToken: async (caminho) => {
        if (!caminhoPermitido(caminho)) throw new Error('Destino da foto inválido.');
        return {
          allowedContentTypes: TIPOS_IMAGEM,
          maximumSizeInBytes: TAMANHO_MAXIMO_IMAGEM,
          // Duas fotos com o mesmo nome nao se sobrescrevem.
          addRandomSuffix: true,
        };
      },
    });
    return NextResponse.json(resposta);
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Não consegui autorizar o envio.';
    return NextResponse.json({ erro: msg }, { status: 400 });
  }
}
