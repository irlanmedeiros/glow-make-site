import { describe, it, expect } from 'vitest';
import ExcelJS from 'exceljs';
import { lerNumero, lerPlanilha, gerarModelo } from './planilha';

/**
 * A importação de planilha reescreve o catálogo inteiro. Uma vírgula lida
 * errado muda o preço de todos os produtos de uma vez (docs/DECISOES.md #12),
 * por isso o parser tem teste próprio.
 */

const csv = (texto: string): ArrayBuffer => {
  const b = Buffer.from(texto, 'utf-8');
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
};

describe('lerNumero — preço digitado por gente', () => {
  it('lê o formato brasileiro', () => {
    expect(lerNumero('39,90')).toBe(39.9);
    expect(lerNumero('0,50')).toBe(0.5);
  });

  it('lê o formato com ponto decimal', () => {
    expect(lerNumero('39.90')).toBe(39.9);
  });

  it('lê com símbolo de moeda e espaços', () => {
    expect(lerNumero('R$ 44,90')).toBe(44.9);
    expect(lerNumero('  r$44,90 ')).toBe(44.9);
  });

  it('trata ponto como separador de milhar quando há vírgula decimal', () => {
    expect(lerNumero('1.299,90')).toBe(1299.9);
    expect(lerNumero('12.345,67')).toBe(12345.67);
  });

  it('aceita número que já veio como número da célula do Excel', () => {
    expect(lerNumero(39.9)).toBe(39.9);
    expect(lerNumero(0)).toBe(0);
  });

  it('devolve null para vazio — vazio significa "não mexe", não zero', () => {
    expect(lerNumero('')).toBe(null);
    expect(lerNumero(null)).toBe(null);
    expect(lerNumero(undefined)).toBe(null);
  });

  it('devolve null para texto que não é número', () => {
    // Antes isto devolvia 0: a limpeza deixava a string vazia e `Number('')`
    // é 0. Na coluna de estoque, "esgotado" zerava o produto sem apontar erro.
    expect(lerNumero('a combinar')).toBe(null);
    expect(lerNumero('esgotado')).toBe(null);
    expect(lerNumero('R$')).toBe(null);
    expect(lerNumero('-')).toBe(null);
    expect(lerNumero('?')).toBe(null);
  });
});

describe('lerPlanilha — texto na coluna de número não pode virar zero', () => {
  it('não zera o estoque quando a célula tem texto', async () => {
    const r = await lerPlanilha(
      csv('sku;nome;estoque\nGM-A;Kit A;esgotado\nGM-B;Kit B;sem estoque'),
      'p.csv'
    );
    // null = "não mexe no estoque". 0 mandaria a importação gravar um ajuste
    // zerando o saldo do produto.
    expect(r.linhas[0].estoque).toBe(null);
    expect(r.linhas[1].estoque).toBe(null);
  });

  it('não zera o preço quando a célula tem texto', async () => {
    const r = await lerPlanilha(csv('sku;nome;preco\nGM-A;Kit A;a combinar'), 'p.csv');
    expect(r.linhas[0].preco).toBe(null);
  });

  it('continua lendo o zero escrito de propósito', async () => {
    const r = await lerPlanilha(csv('sku;nome;estoque\nGM-A;Kit A;0'), 'p.csv');
    expect(r.linhas[0].estoque).toBe(0);
  });
});

describe('lerPlanilha — CSV', () => {
  it('lê as colunas essenciais e o código de barras', async () => {
    const r = await lerPlanilha(
      csv(
        [
          'sku;nome;preco;estoque;itens;codigo de barras;ativo',
          'GM-P01;Kit Puro Leite;40,00;12;Sabonete|Hidratante;7891111000015;sim',
          'GM-P02;Kit Presente;R$ 35,00;7;Porta joia|Brinco;7892222000022;sim',
        ].join('\n')
      ),
      'produtos.csv'
    );

    expect(r.linhas).toHaveLength(2);
    expect(r.colunasReconhecidas).toEqual(
      expect.arrayContaining(['sku', 'nome', 'preco', 'estoque', 'itens', 'codigoBarras', 'ativo'])
    );

    const [a, b] = r.linhas;
    expect(a).toMatchObject({
      sku: 'GM-P01',
      nome: 'Kit Puro Leite',
      preco: 40,
      estoque: 12,
      codigoBarras: '7891111000015',
      ativo: true,
      erros: [],
    });
    expect(a.itens).toEqual(['Sabonete', 'Hidratante']);
    expect(b.preco).toBe(35);
  });

  it('detecta separador vírgula, não só ponto e vírgula', async () => {
    const r = await lerPlanilha(csv('sku,nome,preco\nGM-A,Kit A,10.00'), 'p.csv');
    expect(r.linhas[0]).toMatchObject({ sku: 'GM-A', nome: 'Kit A', preco: 10 });
  });

  it('normaliza o SKU para maiúsculas', async () => {
    const r = await lerPlanilha(csv('sku;nome\ngm-min;Kit'), 'p.csv');
    expect(r.linhas[0].sku).toBe('GM-MIN');
  });

  it('pula linha em branco no meio da planilha', async () => {
    const r = await lerPlanilha(csv('sku;nome\nGM-A;Kit A\n;\nGM-B;Kit B'), 'p.csv');
    expect(r.linhas.map((l) => l.sku)).toEqual(['GM-A', 'GM-B']);
  });
});

describe('lerPlanilha — sinônimos de cabeçalho', () => {
  const sinonimos: [string, string][] = [
    ['codigo', 'sku'],
    ['referencia', 'sku'],
    ['produto', 'nome'],
    ['valor', 'preco'],
    ['quantidade', 'estoque'],
    ['qtd', 'estoque'],
    ['ean', 'codigoBarras'],
    ['barras', 'codigoBarras'],
    ['conteudo', 'itens'],
    ['foto', 'imagem'],
  ];

  for (const [cabecalho, campo] of sinonimos) {
    it(`reconhece "${cabecalho}" como ${campo}`, async () => {
      const r = await lerPlanilha(csv(`sku;nome;${cabecalho}\nGM-A;Kit A;123`), 'p.csv');
      expect(r.colunasReconhecidas).toContain(campo);
    });
  }

  it('ignora acento e caixa no cabeçalho', async () => {
    const r = await lerPlanilha(csv('SKU;Nome;PREÇO;Descrição\nGM-A;Kit A;10,00;x'), 'p.csv');
    expect(r.colunasReconhecidas).toEqual(expect.arrayContaining(['sku', 'nome', 'preco', 'descricao']));
  });
});

describe('lerPlanilha — erros apontados antes de gravar', () => {
  it('marca linha sem SKU e sem nome como erro, não como produto', async () => {
    const r = await lerPlanilha(csv('sku;nome;preco\n;Kit sem sku;10,00\nGM-B;;20,00'), 'p.csv');
    expect(r.linhas[0].erros).toContain('sem SKU');
    expect(r.linhas[1].erros).toContain('sem nome');
  });

  it('recusa preço zero ou negativo', async () => {
    const r = await lerPlanilha(csv('sku;nome;preco\nGM-A;Kit A;0\nGM-B;Kit B;-5'), 'p.csv');
    expect(r.linhas[0].erros.join()).toContain('maior que zero');
    expect(r.linhas[1].erros.join()).toContain('maior que zero');
  });

  it('recusa estoque fracionado ou negativo', async () => {
    const r = await lerPlanilha(csv('sku;nome;estoque\nGM-A;Kit A;1,5\nGM-B;Kit B;-3'), 'p.csv');
    expect(r.linhas[0].erros.join()).toContain('inteiro');
    expect(r.linhas[1].erros.join()).toContain('inteiro');
  });

  it('aponta SKU repetido — senão a última linha venceria em silêncio', async () => {
    const r = await lerPlanilha(csv('sku;nome\nGM-A;Kit A\nGM-A;Kit A de novo'), 'p.csv');
    expect(r.linhas[1].erros.join()).toContain('repetido');
    expect(r.linhas[1].erros.join()).toContain('linha 2');
  });

  it('avisa quando não acha as colunas, em vez de importar lixo', async () => {
    const r = await lerPlanilha(csv('coluna a;coluna b\n1;2'), 'p.csv');
    expect(r.linhas).toHaveLength(0);
    expect(r.aviso).toContain('Não encontrei as colunas');
  });

  it('avisa quando a planilha só tem cabeçalho', async () => {
    const r = await lerPlanilha(csv('sku;nome'), 'p.csv');
    expect(r.aviso).toBeTruthy();
  });
});

describe('lerPlanilha — ativo', () => {
  const verdadeiros = ['sim', 'SIM', 's', 'true', '1', 'x', 'ativo'];
  const falsos = ['nao', 'não', 'n', 'false', '0', 'inativo'];

  it('entende as formas de "sim"', async () => {
    for (const v of verdadeiros) {
      const r = await lerPlanilha(csv(`sku;nome;ativo\nGM-A;Kit A;${v}`), 'p.csv');
      expect(r.linhas[0].ativo, v).toBe(true);
    }
  });

  it('entende as formas de "não"', async () => {
    for (const v of falsos) {
      const r = await lerPlanilha(csv(`sku;nome;ativo\nGM-A;Kit A;${v}`), 'p.csv');
      expect(r.linhas[0].ativo, v).toBe(false);
    }
  });

  it('deixa null quando em branco — em branco é "mantém como está"', async () => {
    const r = await lerPlanilha(csv('sku;nome;ativo\nGM-A;Kit A;'), 'p.csv');
    expect(r.linhas[0].ativo).toBe(null);
  });
});

describe('lerPlanilha — XLSX de verdade', () => {
  it('lê um arquivo .xlsx binário', async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Produtos');
    ws.addRow(['sku', 'nome', 'preco', 'estoque', 'codigo de barras']);
    ws.addRow(['GM-X1', 'Kit do Excel', 45.5, 9, '7893333000033']);
    const buf = await wb.xlsx.writeBuffer();

    const r = await lerPlanilha(buf as ArrayBuffer, 'produtos.xlsx');
    expect(r.linhas[0]).toMatchObject({
      sku: 'GM-X1',
      nome: 'Kit do Excel',
      preco: 45.5,
      estoque: 9,
      codigoBarras: '7893333000033',
      erros: [],
    });
  });
});

describe('gerarModelo — a planilha que o lojista baixa', () => {
  it('traz os cabeçalhos que o próprio parser reconhece', async () => {
    const buf = await gerarModelo();
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf as unknown as ArrayBuffer);

    const ws = wb.getWorksheet('Produtos')!;
    const cabecalhos = (ws.getRow(1).values as unknown[]).filter(Boolean).map(String);
    expect(cabecalhos).toEqual(
      expect.arrayContaining(['sku', 'nome', 'preco', 'estoque', 'codigo de barras'])
    );

    // O modelo precisa ser legível pelo parser, senão o lojista baixa,
    // preenche e a importação recusa o próprio modelo.
    const relido = await lerPlanilha(buf as unknown as ArrayBuffer, 'modelo.xlsx');
    expect(relido.aviso).toBeUndefined();
    expect(relido.colunasReconhecidas).toEqual(
      expect.arrayContaining(['sku', 'nome', 'preco', 'estoque', 'codigoBarras'])
    );
  });

  it('tem a aba de ajuda explicando cada coluna', async () => {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load((await gerarModelo()) as unknown as ArrayBuffer);
    expect(wb.getWorksheet('Como preencher')).toBeDefined();
  });
});
