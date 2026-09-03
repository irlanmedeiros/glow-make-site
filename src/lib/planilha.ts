import 'server-only';
import ExcelJS from 'exceljs';

/**
 * Leitura da planilha de produtos.
 *
 * Aceita .xlsx, .xls e .csv. A ideia é que a pessoa exporte do Excel e suba
 * sem preparar nada: os cabeçalhos são reconhecidos sem acento, sem
 * maiúscula e com sinônimos, porque ninguém digita "descricao" duas vezes
 * igual.
 */

export type LinhaPlanilha = {
  linha: number;
  sku: string;
  nome: string;
  descricao: string;
  preco: number | null;
  itens: string[];
  imagem: string;
  estoque: number | null;
  estoqueBaixo: number | null;
  ordem: number | null;
  ativo: boolean | null;
  codigoBarras: string;
  erros: string[];
};

/** Cabeçalhos aceitos para cada campo. Sem acento e em minúsculo. */
const COLUNAS: Record<string, string[]> = {
  sku: ['sku', 'codigo', 'cod', 'referencia', 'ref'],
  nome: ['nome', 'produto', 'titulo', 'descricao curta'],
  descricao: ['descricao', 'desc', 'detalhe', 'resumo'],
  preco: ['preco', 'valor', 'preco de venda', 'preco venda'],
  itens: ['itens', 'conteudo', 'composicao', 'o que vem'],
  imagem: ['imagem', 'foto', 'url da imagem', 'url'],
  estoque: ['estoque', 'saldo', 'quantidade', 'qtd', 'qtde'],
  estoqueBaixo: ['estoque minimo', 'estoque baixo', 'minimo', 'alerta'],
  ordem: ['ordem', 'posicao'],
  ativo: ['ativo', 'publicado', 'visivel', 'no site'],
  codigoBarras: ['codigo de barras', 'ean', 'codigo barras', 'barras'],
};

function normalizar(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')  // tira acentos
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Aceita 129,90 / 129.90 / R$ 129,90 / 1.299,90 */
export function lerNumero(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;

  let t = String(v).trim().replace(/r\$/i, '').trim();
  if (!t) return null;

  const temVirgula = t.includes(',');
  const temPonto = t.includes('.');
  if (temVirgula && temPonto) {
    // 1.299,90 → o ponto é separador de milhar
    t = t.replace(/\./g, '').replace(',', '.');
  } else if (temVirgula) {
    t = t.replace(',', '.');
  }
  t = t.replace(/[^\d.-]/g, '');

  // Texto sem dígito nenhum ("esgotado", "a combinar") sobra vazio depois da
  // limpeza, e `Number('')` é 0 — não NaN. Sem esta guarda, uma célula assim
  // na coluna de estoque virava "saldo 0" e a importação zerava o produto sem
  // apontar erro nenhum. Vazio de verdade já saiu antes, no começo da função.
  if (!/\d/.test(t)) return null;

  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

function lerBooleano(v: unknown): boolean | null {
  if (v === null || v === undefined || v === '') return null;
  const t = normalizar(String(v));
  if (['sim', 's', 'true', 'verdadeiro', '1', 'x', 'ativo'].includes(t)) return true;
  if (['nao', 'n', 'false', 'falso', '0', 'inativo'].includes(t)) return false;
  return null;
}

function celula(v: unknown): string {
  if (v === null || v === undefined) return '';
  // Célula com fórmula ou rich text vem como objeto no ExcelJS.
  if (typeof v === 'object') {
    const o = v as { result?: unknown; text?: string; richText?: { text: string }[] };
    if (o.richText) return o.richText.map((r) => r.text).join('');
    if (o.text) return o.text;
    if (o.result !== undefined) return String(o.result);
    return '';
  }
  return String(v).trim();
}

export type Leitura = { linhas: LinhaPlanilha[]; colunasReconhecidas: string[]; aviso?: string };

export async function lerPlanilha(buffer: ArrayBuffer, nomeArquivo: string): Promise<Leitura> {
  const wb = new ExcelJS.Workbook();
  const ehCsv = nomeArquivo.toLowerCase().endsWith('.csv');

  if (ehCsv) {
    const texto = new TextDecoder('utf-8').decode(buffer);
    const ws = wb.addWorksheet('csv');
    // Detecta o separador: Excel brasileiro exporta com ponto e vírgula.
    const primeira = texto.split(/\r?\n/)[0] ?? '';
    const sep = (primeira.match(/;/g)?.length ?? 0) > (primeira.match(/,/g)?.length ?? 0) ? ';' : ',';
    texto.split(/\r?\n/).forEach((l) => {
      if (l.trim()) ws.addRow(l.split(sep).map((c) => c.replace(/^"|"$/g, '')));
    });
  } else {
    await wb.xlsx.load(buffer);
  }

  const ws = wb.worksheets[0];
  if (!ws || ws.rowCount < 2) {
    return { linhas: [], colunasReconhecidas: [], aviso: 'A planilha está vazia ou só tem cabeçalho.' };
  }

  // --- mapa de colunas a partir do cabeçalho ---
  const mapa: Record<string, number> = {};
  const reconhecidas: string[] = [];
  const cabecalho = ws.getRow(1);
  cabecalho.eachCell((cel, col) => {
    const titulo = normalizar(celula(cel.value));
    for (const [campo, apelidos] of Object.entries(COLUNAS)) {
      if (mapa[campo] === undefined && apelidos.includes(titulo)) {
        mapa[campo] = col;
        reconhecidas.push(campo);
      }
    }
  });

  if (mapa.sku === undefined && mapa.nome === undefined) {
    return {
      linhas: [],
      colunasReconhecidas: [],
      aviso:
        'Não encontrei as colunas. A primeira linha precisa ser o cabeçalho, com pelo menos "sku" e "nome".',
    };
  }

  // --- linhas ---
  const linhas: LinhaPlanilha[] = [];
  for (let n = 2; n <= ws.rowCount; n++) {
    const r = ws.getRow(n);
    const pega = (campo: string) => (mapa[campo] ? celula(r.getCell(mapa[campo]).value) : '');

    const sku = pega('sku').toUpperCase();
    const nome = pega('nome');
    if (!sku && !nome) continue; // linha em branco no meio da planilha

    const erros: string[] = [];
    if (!sku) erros.push('sem SKU');
    if (!nome) erros.push('sem nome');

    const preco = lerNumero(pega('preco'));
    if (preco !== null && preco <= 0) erros.push('preço precisa ser maior que zero');

    const estoque = lerNumero(pega('estoque'));
    if (estoque !== null && (estoque < 0 || !Number.isInteger(estoque))) {
      erros.push('estoque precisa ser inteiro e não negativo');
    }

    linhas.push({
      linha: n,
      sku,
      nome,
      descricao: pega('descricao'),
      preco,
      // Itens separados por quebra de linha, ponto e vírgula ou barra.
      itens: pega('itens')
        .split(/[\n;|]/)
        .map((i) => i.trim())
        .filter(Boolean),
      imagem: pega('imagem'),
      estoque,
      estoqueBaixo: lerNumero(pega('estoqueBaixo')),
      ordem: lerNumero(pega('ordem')),
      ativo: lerBooleano(pega('ativo')),
      codigoBarras: pega('codigoBarras'),
      erros,
    });
  }

  // SKU repetido dentro da própria planilha: a última linha venceria em
  // silêncio, então é melhor apontar.
  const vistos = new Map<string, number>();
  for (const l of linhas) {
    if (!l.sku) continue;
    const antes = vistos.get(l.sku);
    if (antes) l.erros.push(`SKU repetido (já aparece na linha ${antes})`);
    else vistos.set(l.sku, l.linha);
  }

  return { linhas, colunasReconhecidas: reconhecidas };
}

/** Planilha modelo para o lojista preencher. */
export async function gerarModelo(): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Produtos');

  ws.columns = [
    { header: 'sku', key: 'sku', width: 14 },
    { header: 'nome', key: 'nome', width: 30 },
    { header: 'descricao', key: 'descricao', width: 42 },
    { header: 'preco', key: 'preco', width: 12 },
    { header: 'estoque', key: 'estoque', width: 10 },
    { header: 'itens', key: 'itens', width: 52 },
    { header: 'imagem', key: 'imagem', width: 30 },
    { header: 'estoque minimo', key: 'estoqueBaixo', width: 15 },
    { header: 'ordem', key: 'ordem', width: 8 },
    { header: 'ativo', key: 'ativo', width: 8 },
    { header: 'codigo de barras', key: 'codigoBarras', width: 18 },
  ];
  ws.getRow(1).font = { bold: true };
  ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFE4EC' } };

  ws.addRow({
    sku: 'GM-EXEMPLO',
    nome: 'Kit de Exemplo',
    descricao: 'Apague esta linha e ponha os seus produtos.',
    preco: '99,90',
    estoque: 10,
    itens: 'Primeiro item; Segundo item; Terceiro item',
    imagem: '/assets/kits/kit-1.jpg',
    estoqueBaixo: 5,
    ordem: 1,
    ativo: 'sim',
    codigoBarras: '7891234567890',
  });

  const ajuda = wb.addWorksheet('Como preencher');
  ajuda.columns = [
    { header: 'Coluna', key: 'c', width: 18 },
    { header: 'Obrigatória', key: 'o', width: 12 },
    { header: 'O que colocar', key: 'd', width: 78 },
  ];
  ajuda.getRow(1).font = { bold: true };
  [
    ['sku', 'sim', 'Código único do produto. É por ele que o sistema sabe se cria ou atualiza.'],
    ['nome', 'sim', 'Nome que aparece no site.'],
    ['descricao', 'não', 'Frase curta abaixo do nome no card.'],
    ['preco', 'não', 'Aceita 99,90 ou 99.90 ou R$ 99,90. Em branco mantém o preço atual.'],
    ['estoque', 'não', 'Saldo que o produto DEVE ficar. Em branco não mexe no estoque. A diferença vira um ajuste no histórico.'],
    ['itens', 'não', 'O que vem no kit, separado por ponto e vírgula.'],
    ['imagem', 'não', 'Caminho como /assets/kits/kit-1.jpg ou uma URL completa.'],
    ['estoque minimo', 'não', 'A partir de quanto o sistema avisa que está acabando. Padrão 10.'],
    ['ordem', 'não', 'Posição na vitrine. Menor aparece primeiro.'],
    ['ativo', 'não', 'sim ou nao. Em branco mantém como está.'],
    ['codigo de barras', 'não', 'EAN da embalagem. É o que o leitor do balcão lê para achar o produto na hora da venda.'],
  ].forEach(([c, o, d]) => ajuda.addRow({ c, o, d }));

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}
