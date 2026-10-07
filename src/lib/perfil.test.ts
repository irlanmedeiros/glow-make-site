import { describe, it, expect } from 'vitest';
import { validarPerfil, perfilVazio, rotulo, rotulos, TIPOS_PELE, ITENS, CATEGORIAS } from './perfil';

/**
 * O formulário nunca pode recusar uma assinatura: é preferência, não cadastro
 * fiscal. Tudo que chega torto vira campo vazio, e o pior caso é uma caixa
 * menos personalizada — não uma venda perdida.
 */

describe('validarPerfil — aceita o que é válido', () => {
  it('normaliza as escolhas para maiúsculas', () => {
    const p = validarPerfil({ tipoPele: 'oleosa', tomPele: 'clara', subtom: 'frio' });
    expect(p.tipoPele).toBe('OLEOSA');
    expect(p.tomPele).toBe('CLARA');
    expect(p.subtom).toBe('FRIO');
  });

  it('guarda a ordem de preferência das categorias', () => {
    const p = validarPerfil({ preferenciaCategorias: ['SKINCARE', 'MAQUIAGEM', 'ACESSORIOS'] });
    expect(p.preferenciaCategorias).toEqual(['SKINCARE', 'MAQUIAGEM', 'ACESSORIOS']);
  });

  it('aceita vários itens e várias cores', () => {
    const p = validarPerfil({ itensFavoritos: ['BATOM', 'BLUSH'], cores: ['NUDE', 'ROSA'] });
    expect(p.itensFavoritos).toEqual(['BATOM', 'BLUSH']);
    expect(p.cores).toEqual(['NUDE', 'ROSA']);
  });
});

describe('validarPerfil — descarta o que é inválido, sem lançar', () => {
  it('ignora opção que não existe na lista', () => {
    const p = validarPerfil({ tipoPele: 'DOURADA', itensFavoritos: ['BATOM', 'CARRO', 'BLUSH'] });
    expect(p.tipoPele).toBe(null);
    expect(p.itensFavoritos).toEqual(['BATOM', 'BLUSH']);
  });

  it('não repete item marcado duas vezes', () => {
    const p = validarPerfil({ cores: ['NUDE', 'NUDE', 'ROSA'] });
    expect(p.cores).toEqual(['NUDE', 'ROSA']);
  });

  it('corta a preferência de categorias em três', () => {
    const p = validarPerfil({
      preferenciaCategorias: ['MAQUIAGEM', 'SKINCARE', 'ACESSORIOS', 'MAQUIAGEM'],
    });
    expect(p.preferenciaCategorias).toHaveLength(3);
  });

  it('corta texto longo em vez de recusar', () => {
    const p = validarPerfil({ alergias: 'a'.repeat(900) });
    expect(p.alergias).toHaveLength(400);
  });

  it('aguenta corpo nulo, vazio ou com tipo errado', () => {
    for (const bruto of [null, undefined, {}, 'texto', 42, []]) {
      expect(() => validarPerfil(bruto)).not.toThrow();
    }
    expect(validarPerfil({ itensFavoritos: 'BATOM' }).itensFavoritos).toEqual([]);
  });
});

describe('validarPerfil — data de nascimento', () => {
  it('aceita data plausível', () => {
    expect(validarPerfil({ dataNascimento: '1995-04-17' }).dataNascimento).toBe('1995-04-17');
  });

  it('recusa formato errado', () => {
    for (const d of ['17/04/1995', '1995-4-7', 'ontem', '']) {
      expect(validarPerfil({ dataNascimento: d }).dataNascimento, d).toBe(null);
    }
  });

  it('recusa futuro e idade implausível — dedo escorregando no seletor', () => {
    expect(validarPerfil({ dataNascimento: '2187-01-01' }).dataNascimento).toBe(null);
    expect(validarPerfil({ dataNascimento: '1500-01-01' }).dataNascimento).toBe(null);
  });
});

describe('perfilVazio', () => {
  it('é vazio quando nada foi respondido', () => {
    expect(perfilVazio(validarPerfil({}))).toBe(true);
    expect(perfilVazio(validarPerfil({ tipoPele: 'INVENTADA' }))).toBe(true);
  });

  it('não é vazio com uma única resposta', () => {
    expect(perfilVazio(validarPerfil({ tipoPele: 'SECA' }))).toBe(false);
    expect(perfilVazio(validarPerfil({ alergias: 'níquel' }))).toBe(false);
    expect(perfilVazio(validarPerfil({ dataNascimento: '1995-04-17' }))).toBe(false);
  });
});

describe('rótulos para o admin', () => {
  it('traduz o valor guardado', () => {
    expect(rotulo('OLEOSA', TIPOS_PELE)).toBe('Oleosa');
    expect(rotulos(['BATOM', 'BLUSH'], ITENS)).toEqual(['Batom', 'Blush']);
    expect(rotulos(['SKINCARE'], CATEGORIAS)).toEqual(['Skincare']);
  });

  it('não quebra com valor desconhecido ou nulo', () => {
    expect(rotulo(null, TIPOS_PELE)).toBe('');
    expect(rotulo('ANTIGA', TIPOS_PELE)).toBe('ANTIGA');
  });
});
