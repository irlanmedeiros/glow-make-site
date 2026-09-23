import 'server-only';
import ExcelJS from 'exceljs';
import { celula, lerNumero, normalizar } from './planilha';

/**
 * Leitura do extrato da maquininha (PagBank).
 *
 * A Moderninha não conversa com o site (docs/DECISOES.md #8B), então o
 * caminho é a dona baixar o extrato no painel da PagBank e subir aqui. O
 * arquivo muda de nome de coluna conforme o relatório escolhido e conforme a
 * PagBank mexe no painel — por isso os cabeçalhos são reconhecidos por
 * sinônimos, sem acento e sem maiúscula, e a tela diz quais colunas achou.
 * Coluna não reconhecida vira aviso, nunca linha silenciosamente ignorada.
 */

export type LinhaExtrato = {
  linha: number;
  quando: string | null; // ISO; o fuso é o do arquivo, que é o da loja
  codigo: string;
  tipo: string;
  bandeira: string;
  bruto: number | null;
  liquido: number | null;
  taxa: number | null;
  status: string;
  cancelada: boolean;
};

const COLUNAS: Record<string, string[]> = {
  data: ['data', 'data da transacao', 'data da venda', 'data venda', 'data hora', 'data e hora', 'dia'],
  hora: ['hora', 'horario', 'hora da venda'],
  codigo: [
    'nsu', 'nsu host', 'codigo da transacao', 'codigo transacao', 'codigo da venda',
    'codigo de autorizacao', 'autorizacao', 'id da transacao', 'transacao', 'codigo',
  ],
  tipo: ['tipo', 'tipo de pagamento', 'forma de pagamento', 'meio de pagamento', 'modalidade', 'tipo de transacao'],
  bandeira: ['bandeira', 'bandeira do cartao', 'cartao'],
  bruto: ['valor bruto', 'valor da venda', 'valor total', 'valor', 'bruto'],
  liquido: ['valor liquido', 'liquido', 'valor a receber', 'valor recebido'],
  taxa: ['taxa', 'taxas', 'tarifa', 'valor da taxa', 'desconto', 'custo'],
  status: ['status', 'situacao', 'situacao da transacao'],
};

export type LeituraExtrato = {
  linhas: LinhaExtrato[];
  colunasReconhecidas: string[];
  aviso?: string;
};

/** "12/03/2026" + "14:35" → ISO local. Aceita também data já com hora. */
export function lerDataHora(data: unknown, hora: unknown): string | null {
  if (data instanceof Date) {
    const d = new Date(data);
    const h = String(hora ?? '').match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/);
    if (h) d.setHours(Number(h[1]), Number(h[2]), Number(h[3] ?? 0), 0);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }

  const texto = String(data ?? '').trim();
  if (!texto) return null;

  const dm = texto.match(/(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/);
  const iso = texto.match(/(\d{4})-(\d{2})-(\d{2})/);
  let ano: number, mes: number, dia: number;
  if (dm) {
    dia = Number(dm[1]);
    mes = Number(dm[2]);
    ano = Number(dm[3].length === 2 ? `20${dm[3]}` : dm[3]);
  } else if (iso) {
    ano = Number(iso[1]);
    mes = Number(iso[2]);
    dia = Number(iso[3]);
  } else {
    return null;
  }

  // A hora pode vir na própria célula da data ("12/03/2026 14:35") ou na coluna ao lado.
  const h = (String(hora ?? '').match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/) ??
    texto.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/)) as RegExpMatchArray | null;

  const d = new Date(ano, mes - 1, dia, h ? Number(h[1]) : 0, h ? Number(h[2]) : 0, h?.[3] ? Number(h[3]) : 0);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** Comprovante sem pontuação, para o mesmo número não entrar de dois jeitos. */
export function limparCodigo(bruto: unknown): string {
  return String(bruto ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 30);
}

const CANCELADA = /cancel|estorn|recus|negad|nao aprovad|desfeit/;

export async function lerExtrato(buffer: ArrayBuffer, nomeArquivo: string): Promise<LeituraExtrato> {
  const wb = new ExcelJS.Workbook();

  if (nomeArquivo.toLowerCase().endsWith('.csv')) {
    const texto = new TextDecoder('utf-8').decode(buffer);
    const ws = wb.addWorksheet('csv');
    const primeira = texto.split(/\r?\n/)[0] ?? '';
    const sep = (primeira.match(/;/g)?.length ?? 0) > (primeira.match(/,/g)?.length ?? 0) ? ';' : ',';
    texto.split(/\r?\n/).forEach((l) => {
      if (l.trim()) ws.addRow(l.split(sep).map((c) => c.replace(/^"|"$/g, '').trim()));
    });
  } else {
    await wb.xlsx.load(buffer);
  }

  const ws = wb.worksheets[0];
  if (!ws || ws.rowCount < 2) {
    return { linhas: [], colunasReconhecidas: [], aviso: 'O arquivo está vazio ou só tem cabeçalho.' };
  }

  const mapa: Record<string, number> = {};
  const reconhecidas: string[] = [];
  ws.getRow(1).eachCell((cel, col) => {
    const titulo = normalizar(celula(cel.value));
    for (const [campo, apelidos] of Object.entries(COLUNAS)) {
      if (mapa[campo] === undefined && apelidos.includes(titulo)) {
        mapa[campo] = col;
        reconhecidas.push(campo);
      }
    }
  });

  if (mapa.bruto === undefined) {
    return {
      linhas: [],
      colunasReconhecidas: reconhecidas,
      aviso:
        'Não encontrei a coluna de valor no arquivo. Exporte o extrato de vendas da PagBank, ou me mande o arquivo para eu reconhecer o formato dele.',
    };
  }

  const pega = (linha: ExcelJS.Row, campo: string): unknown =>
    mapa[campo] === undefined ? '' : linha.getCell(mapa[campo]).value;

  const linhas: LinhaExtrato[] = [];
  for (let i = 2; i <= ws.rowCount; i++) {
    const row = ws.getRow(i);
    const bruto = lerNumero(celula(pega(row, 'bruto')));
    const codigo = limparCodigo(celula(pega(row, 'codigo')));
    // Linha sem valor e sem código é rodapé de total ou linha em branco.
    if (bruto === null && !codigo) continue;

    const status = celula(pega(row, 'status'));
    const taxa = lerNumero(celula(pega(row, 'taxa')));
    const liquido = lerNumero(celula(pega(row, 'liquido')));

    linhas.push({
      linha: i,
      quando: lerDataHora(pega(row, 'data'), pega(row, 'hora')),
      codigo,
      tipo: celula(pega(row, 'tipo')),
      bandeira: celula(pega(row, 'bandeira')),
      bruto,
      // A taxa costuma vir negativa no extrato; o que interessa é o quanto foi.
      taxa: taxa === null ? (bruto !== null && liquido !== null ? Number((bruto - liquido).toFixed(2)) : null) : Math.abs(taxa),
      liquido,
      status,
      cancelada: CANCELADA.test(normalizar(status)),
    });
  }

  return { linhas, colunasReconhecidas: reconhecidas };
}
