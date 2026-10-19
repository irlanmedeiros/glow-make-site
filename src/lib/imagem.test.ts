import { describe, it, expect } from 'vitest';
import {
  caminhoPermitido,
  dimensoesReduzidas,
  enderecoDeImagemValido,
  fotoDoProduto,
  fotoIndisponivel,
  IMAGEM_PADRAO_PRODUTO,
  nomeDoArquivo,
} from './imagem';

describe('nomeDoArquivo', () => {
  it('limpa acento, espaco e extensao, e usa a do tipo final', () => {
    expect(nomeDoArquivo('produtos', 'Kit Presente Maçã.HEIC', 'image/jpeg')).toBe('produtos/kit-presente-maca.jpg');
    expect(nomeDoArquivo('banners', 'arte final (2).png', 'image/png')).toBe('banners/arte-final-2.png');
    expect(nomeDoArquivo('depoimentos', '....jpg', 'image/webp')).toBe('depoimentos/foto.webp');
  });

  it('o nome gerado sempre passa na checagem do servidor', () => {
    for (const nome of ['Foto da Ana.jpeg', 'IMG_2031.PNG', 'çççç', 'a'.repeat(200) + '.jpg']) {
      expect(caminhoPermitido(nomeDoArquivo('produtos', nome, 'image/jpeg'))).toBe(true);
    }
  });
});

describe('caminhoPermitido', () => {
  it('recusa pasta desconhecida, subpasta, extensao estranha e ..', () => {
    expect(caminhoPermitido('produtos/kit.jpg')).toBe(true);
    expect(caminhoPermitido('outra/kit.jpg')).toBe(false);
    expect(caminhoPermitido('produtos/a/b.jpg')).toBe(false);
    expect(caminhoPermitido('produtos/kit.svg')).toBe(false);
    expect(caminhoPermitido('produtos/../x.jpg')).toBe(false);
  });
});

describe('dimensoesReduzidas', () => {
  it('reduz pelo maior lado mantendo a proporcao', () => {
    expect(dimensoesReduzidas(4000, 3000, 1400)).toEqual({ largura: 1400, altura: 1050 });
    expect(dimensoesReduzidas(3000, 4000, 1400)).toEqual({ largura: 1050, altura: 1400 });
    // arte de banner 20:9 continua 20:9
    expect(dimensoesReduzidas(4000, 1800, 2400)).toEqual({ largura: 2400, altura: 1080 });
  });

  it('nunca aumenta', () => {
    expect(dimensoesReduzidas(800, 600, 1400)).toEqual({ largura: 800, altura: 600 });
  });
});

describe('enderecoDeImagemValido', () => {
  it('aceita arquivo do site e https', () => {
    expect(enderecoDeImagemValido('/assets/kits/kit-1.jpg')).toBe(true);
    expect(enderecoDeImagemValido('https://abc.public.blob.vercel-storage.com/produtos/kit-x1.jpg')).toBe(true);
  });

  it('recusa o que nao e imagem do site', () => {
    expect(enderecoDeImagemValido('')).toBe(false);
    expect(enderecoDeImagemValido('javascript:alert(1)')).toBe(false);
    expect(enderecoDeImagemValido('data:image/png;base64,AAAA')).toBe(false);
    expect(enderecoDeImagemValido('http://inseguro.com/a.jpg')).toBe(false);
    expect(enderecoDeImagemValido('/assets/../.env')).toBe(false);
    expect(enderecoDeImagemValido('https://x.com/a.jpg" onerror="x')).toBe(false);
  });
});

/**
 * A store do Vercel Blob, onde as fotos moravam antes do R2, foi bloqueada:
 * todo endereco de la responde 403. Card vazio na vitrine nao explica nada
 * para quem esta comprando — melhor a imagem neutra.
 */
describe('foto indisponivel', () => {
  const morta =
    'https://wc94vidobsk43nja.public.blob.vercel-storage.com/produtos/779beaba-77de-4595.png';
  const viva =
    'https://pub-84b9e6fdb29f4baebd808f979660e715.r2.dev/produtos/kit-puro-leite-ab12cd34.webp';

  it('reconhece o endereco do armazenamento que saiu do ar', () => {
    expect(fotoIndisponivel(morta)).toBe(true);
    expect(fotoIndisponivel(morta.replace('https', 'http'))).toBe(true);
  });

  it('nao confunde com o armazenamento atual nem com arquivo do proprio site', () => {
    expect(fotoIndisponivel(viva)).toBe(false);
    expect(fotoIndisponivel('/assets/kits/kit-1.jpg')).toBe(false);
    expect(fotoIndisponivel('')).toBe(false);
    expect(fotoIndisponivel(null)).toBe(false);
  });

  it('a vitrine mostra a imagem neutra no lugar da foto que nao carrega', () => {
    expect(fotoDoProduto(morta)).toBe(IMAGEM_PADRAO_PRODUTO);
    expect(fotoDoProduto('')).toBe(IMAGEM_PADRAO_PRODUTO);
    expect(fotoDoProduto('   ')).toBe(IMAGEM_PADRAO_PRODUTO);
    expect(fotoDoProduto(undefined)).toBe(IMAGEM_PADRAO_PRODUTO);
  });

  it('foto boa passa intacta', () => {
    expect(fotoDoProduto(viva)).toBe(viva);
    expect(fotoDoProduto('/assets/kits/kit-1.jpg')).toBe('/assets/kits/kit-1.jpg');
  });
});
