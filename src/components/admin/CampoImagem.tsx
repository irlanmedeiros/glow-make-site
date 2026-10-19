'use client';

import { useRef, useState } from 'react';
import {
  LADO_MAXIMO,
  TIPOS_IMAGEM,
  dimensoesReduzidas,
  fotoIndisponivel,
  nomeDoArquivo,
  type Pasta,
} from '@/lib/imagem';

type Props = {
  name: string;
  valorInicial?: string;
  pasta: Pasta;
  /** false quando o Blob nao esta ligado: sobra so colar o endereco. */
  uploadDisponivel: boolean;
  obrigatorio?: boolean;
  dica?: string;
  formato?: 'quadrado' | 'banner' | 'avatar';
};

/**
 * Campo de foto do admin: previa, envio do arquivo e, como alternativa,
 * colar um endereco. O valor que vai no formulario e sempre o endereco final,
 * entao a action que salva nao precisa saber como a foto chegou.
 */
export default function CampoImagem({
  name,
  valorInicial,
  pasta,
  uploadDisponivel,
  obrigatorio = false,
  dica,
  formato = 'quadrado',
}: Props) {
  const [url, setUrl] = useState(valorInicial ?? '');
  const [estado, setEstado] = useState<'parado' | 'preparando' | 'enviando'>('parado');
  const [progresso, setProgresso] = useState(0);
  const [erro, setErro] = useState('');
  const seletor = useRef<HTMLInputElement>(null);

  async function aoEscolher(e: React.ChangeEvent<HTMLInputElement>) {
    const arquivo = e.target.files?.[0];
    e.target.value = '';
    if (!arquivo) return;
    setErro('');
    if (!TIPOS_IMAGEM.includes(arquivo.type)) {
      setErro('Use uma foto JPG, PNG ou WebP.');
      return;
    }
    try {
      setEstado('preparando');
      const corpo = await reduzir(arquivo, LADO_MAXIMO[pasta]);
      setEstado('enviando');
      setProgresso(0);
      const endereco = await enviar(
        nomeDoArquivo(pasta, arquivo.name, corpo.type),
        corpo,
        setProgresso
      );
      setUrl(endereco);
    } catch (falha) {
      const msg = falha instanceof Error ? falha.message : '';
      setErro(
        /Sess[aã]o/.test(msg)
          ? 'Sua sessão expirou. Entre de novo no admin e tente outra vez.'
          : 'Não consegui enviar a foto. Tente de novo ou cole o endereço da imagem.'
      );
    }
    setEstado('parado');
  }

  const ocupado = estado !== 'parado';

  return (
    <div className="campo-imagem">
      {/* Previa de endereco que nao carrega mais mostrava um quadro quebrado,
          e a pessoa nao tinha como saber que o problema era a foto antiga. */}
      {fotoIndisponivel(url) ? (
        <div className={`campo-imagem-previa ${formato} vazia`}>
          Foto antiga indisponível — envie outra
        </div>
      ) : url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img className={`campo-imagem-previa ${formato}`} src={url} alt="Prévia" />
      ) : (
        <div className={`campo-imagem-previa ${formato} vazia`}>Sem foto</div>
      )}

      {uploadDisponivel ? (
        <div className="campo-imagem-acoes">
          <button
            type="button"
            className="btn btn-soft btn-sm"
            onClick={() => seletor.current?.click()}
            disabled={ocupado}
          >
            {estado === 'preparando'
              ? 'Preparando...'
              : estado === 'enviando'
                ? `Enviando ${progresso}%`
                : url
                  ? 'Trocar foto'
                  : 'Enviar foto'}
          </button>
          <input
            ref={seletor}
            type="file"
            accept={TIPOS_IMAGEM.join(',')}
            onChange={aoEscolher}
            hidden
          />
        </div>
      ) : (
        <small>O envio de fotos ainda não está ligado. Cole o endereço da imagem abaixo.</small>
      )}

      {estado === 'enviando' && (
        <div className="campo-imagem-barra" aria-hidden="true">
          <span style={{ width: `${progresso}%` }} />
        </div>
      )}

      <input
        name={name}
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        required={obrigatorio}
        maxLength={300}
        placeholder="ou cole o endereço da imagem (https://...)"
        aria-label="Endereço da imagem"
      />
      {dica && <small>{dica}</small>}
      {erro && (
        <small className="campo-imagem-erro" role="alert">
          {erro}
        </small>
      )}
    </div>
  );
}

/**
 * Envia a foto para /api/admin/imagem, que grava no R2.
 *
 * XMLHttpRequest em vez de fetch porque o fetch nao reporta progresso de
 * ENVIO, e sem barra de progresso quem usa o admin acha que travou.
 */
function enviar(
  caminho: string,
  corpo: Blob,
  aoProgredir: (pct: number) => void
): Promise<string> {
  const form = new FormData();
  form.append('caminho', caminho);
  form.append('arquivo', corpo);

  return new Promise((ok, falha) => {
    const req = new XMLHttpRequest();
    req.open('POST', '/api/admin/imagem');
    req.upload.onprogress = (e) => {
      if (e.lengthComputable) aoProgredir(Math.round((e.loaded / e.total) * 100));
    };
    req.onerror = () => falha(new Error('Sem conexão com o servidor.'));
    req.onload = () => {
      let corpoResposta: { url?: string; erro?: string } = {};
      try {
        corpoResposta = JSON.parse(req.responseText);
      } catch {
        /* resposta sem JSON: cai na mensagem genérica abaixo */
      }
      if (req.status >= 200 && req.status < 300 && corpoResposta.url) {
        ok(corpoResposta.url);
      } else {
        falha(new Error(corpoResposta.erro ?? `Falha ao enviar (${req.status}).`));
      }
    };
    req.send(form);
  });
}

/**
 * Reduz no navegador ao tamanho que a vitrine usa. Sem cortar: so escala.
 *
 * Sai SEMPRE em WebP, e isso nao e preferencia de formato: antes, PNG
 * continuava PNG, e PNG e sem perdas — o parametro de qualidade do toBlob e
 * ignorado. Foto de WhatsApp e print de tela chegam em PNG, entao um banner de
 * 2400px virava um arquivo de varios MB. Com 77 fotos assim, o store passou de
 * 120 MB e estourou a cota de transferencia, derrubando TODAS as imagens do
 * site com 403. WebP tem transparencia igual ao PNG e pesa de 10 a 20 vezes
 * menos numa foto.
 *
 * Nao volte a gravar PNG aqui.
 */
async function reduzir(arquivo: File, ladoMaximo: number): Promise<Blob> {
  const bitmap = await createImageBitmap(arquivo);
  const alvo = dimensoesReduzidas(bitmap.width, bitmap.height, ladoMaximo);

  // Passagem direta so quando ja chega no formato certo, no tamanho certo e
  // leve. Antes, qualquer PNG de até 1,5 MB passava intacto.
  if (arquivo.type === 'image/webp' && alvo.largura === bitmap.width && arquivo.size <= 600_000) {
    bitmap.close();
    return arquivo;
  }

  const canvas = document.createElement('canvas');
  canvas.width = alvo.largura;
  canvas.height = alvo.altura;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Navegador sem suporte a imagem.');
  ctx.drawImage(bitmap, 0, 0, alvo.largura, alvo.altura);
  bitmap.close();

  const webp = await codificar(canvas, 'image/webp', 0.82);
  if (webp?.type === 'image/webp') return webp;

  // Navegador sem WebP cai para JPEG. O toBlob, nesse caso, devolve PNG em vez
  // de erro, por isso a checagem acima e pelo tipo e nao por null.
  // destination-over pinta o branco ATRAS do que ja foi desenhado, porque
  // JPEG nao tem transparencia.
  ctx.globalCompositeOperation = 'destination-over';
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, alvo.largura, alvo.altura);
  const jpeg = await codificar(canvas, 'image/jpeg', 0.86);
  if (!jpeg) throw new Error('Não consegui preparar a foto.');
  return jpeg;
}

function codificar(
  canvas: HTMLCanvasElement,
  tipo: string,
  qualidade: number
): Promise<Blob | null> {
  return new Promise((ok) => canvas.toBlob(ok, tipo, qualidade));
}
