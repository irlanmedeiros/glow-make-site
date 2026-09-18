'use client';

import { useRef, useState } from 'react';
import { upload } from '@vercel/blob/client';
import {
  LADO_MAXIMO,
  TIPOS_IMAGEM,
  dimensoesReduzidas,
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
      const r = await upload(nomeDoArquivo(pasta, arquivo.name, corpo.type), corpo, {
        access: 'public',
        handleUploadUrl: '/api/admin/imagem',
        onUploadProgress: (p) => setProgresso(Math.round(p.percentage)),
      });
      setUrl(r.url);
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
      {url ? (
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
 * Reduz no navegador ao tamanho que a vitrine usa. Sem cortar: so escala.
 * PNG continua PNG, porque pode ter transparencia; o resto vira JPEG.
 */
async function reduzir(arquivo: File, ladoMaximo: number): Promise<Blob> {
  const bitmap = await createImageBitmap(arquivo);
  const alvo = dimensoesReduzidas(bitmap.width, bitmap.height, ladoMaximo);
  const jaCabe = alvo.largura === bitmap.width && arquivo.size <= 1_500_000;
  if (jaCabe) {
    bitmap.close();
    return arquivo;
  }

  const canvas = document.createElement('canvas');
  canvas.width = alvo.largura;
  canvas.height = alvo.altura;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Navegador sem suporte a imagem.');
  const png = arquivo.type === 'image/png';
  if (!png) {
    // JPEG nao tem transparencia: fundo branco em vez de preto.
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, alvo.largura, alvo.altura);
  }
  ctx.drawImage(bitmap, 0, 0, alvo.largura, alvo.altura);
  bitmap.close();

  return new Promise((ok, falha) =>
    canvas.toBlob(
      (b) => (b ? ok(b) : falha(new Error('Não consegui preparar a foto.'))),
      png ? 'image/png' : 'image/jpeg',
      0.86
    )
  );
}
