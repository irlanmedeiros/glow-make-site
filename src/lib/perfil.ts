/**
 * Perfil da assinante — o formulário que ela preenche ao assinar a Glow Box.
 *
 * Serve para montar a caixa do mês com a cara de quem vai receber: tipo de
 * pele, tons que usa, o que ama, o que não quer ver e o que não pode usar.
 *
 * Duas decisões que valem explicar:
 *
 * 1. **Nada aqui é obrigatório.** É formulário de preferência, não cadastro
 *    fiscal. Barrar a assinatura porque alguém não escolheu o subtom seria
 *    perder venda para ganhar um dado que a loja consegue perguntar depois,
 *    no WhatsApp. O que vier em branco simplesmente não aparece no admin.
 *
 * 2. **As opções são texto validado contra lista, não enum do banco.** São
 *    respostas de pesquisa: a dona vai querer acrescentar um tom de pele ou um
 *    item novo sem migração de schema. Enum aqui trocaria flexibilidade por
 *    uma garantia que a validação do servidor já dá.
 */

export const TIPOS_PELE = [
  { v: 'OLEOSA', r: 'Oleosa' },
  { v: 'MISTA', r: 'Mista' },
  { v: 'SECA', r: 'Seca' },
  { v: 'NORMAL', r: 'Normal' },
  { v: 'SENSIVEL', r: 'Sensível' },
] as const;

export const TONS_PELE = [
  { v: 'MUITO_CLARA', r: 'Muito clara' },
  { v: 'CLARA', r: 'Clara' },
  { v: 'MEDIA', r: 'Média' },
  { v: 'MORENA', r: 'Morena' },
  { v: 'NEGRA', r: 'Negra' },
] as const;

export const SUBTONS = [
  { v: 'FRIO', r: 'Frio' },
  { v: 'QUENTE', r: 'Quente' },
  { v: 'NEUTRO', r: 'Neutro' },
  { v: 'NAO_SEI', r: 'Não sei identificar' },
] as const;

export const CATEGORIAS = [
  { v: 'MAQUIAGEM', r: 'Maquiagem' },
  { v: 'SKINCARE', r: 'Skincare' },
  { v: 'ACESSORIOS', r: 'Acessórios' },
] as const;

export const ITENS = [
  { v: 'BATOM', r: 'Batom' },
  { v: 'GLOSS', r: 'Gloss' },
  { v: 'DELINEADOR', r: 'Delineador' },
  { v: 'MASCARA_CILIOS', r: 'Máscara de cílios' },
  { v: 'BLUSH', r: 'Blush' },
  { v: 'PO', r: 'Pó' },
  { v: 'BASE', r: 'Base' },
  { v: 'CORRETIVO', r: 'Corretivo' },
  { v: 'ESPONJA', r: 'Esponja' },
  { v: 'PINCEIS', r: 'Pincéis' },
  { v: 'SERUM', r: 'Sérum' },
  { v: 'HIDRATANTE_FACIAL', r: 'Hidratante facial' },
  { v: 'SABONETE_FACIAL', r: 'Sabonete facial' },
  { v: 'MASCARA_FACIAL', r: 'Máscara facial' },
  { v: 'PROTETOR_LABIAL', r: 'Protetor labial' },
  { v: 'FAIXA_CABELO', r: 'Faixa de cabelo' },
  { v: 'NECESSAIRE', r: 'Necessaire' },
  { v: 'PRESILHAS', r: 'Presilhas' },
] as const;

export const CORES = [
  { v: 'NUDE', r: 'Nude' },
  { v: 'ROSA', r: 'Rosa' },
  { v: 'VERMELHO', r: 'Vermelho' },
  { v: 'MARROM', r: 'Marrom' },
  { v: 'CORAL', r: 'Coral' },
  { v: 'ROXO', r: 'Roxo' },
  { v: 'VIBRANTES', r: 'Tons vibrantes' },
  { v: 'SEM_PREFERENCIA', r: 'Sem preferência' },
] as const;

/** Texto que a assinante lê antes de enviar. Fica aqui para a tela e o admin
 *  mostrarem exatamente a mesma coisa. */
export const DECLARACAO =
  'As preferências acima servem como referência para personalizar a sua caixinha ' +
  'Glow. Fazemos o possível para atender, mas elas não garantem o envio de itens ' +
  'específicos — cada edição depende do que está disponível no mês.';

export type Perfil = {
  dataNascimento: string | null;
  tipoPele: string | null;
  tomPele: string | null;
  subtom: string | null;
  preferenciaCategorias: string[];
  itensFavoritos: string[];
  itensOutros: string;
  cores: string[];
  naoEnviar: string;
  alergias: string;
  sonhoCaixa: string;
};

const valores = (lista: readonly { v: string }[]) => lista.map((o) => o.v);

const texto = (v: unknown, max: number) =>
  typeof v === 'string' ? v.trim().slice(0, max) : '';

/** Uma opção da lista, ou null. Qualquer coisa fora da lista vira null. */
function umaDe(v: unknown, lista: readonly { v: string }[]): string | null {
  const t = texto(v, 40).toUpperCase();
  return valores(lista).includes(t) ? t : null;
}

/** Várias opções da lista, sem repetir e na ordem em que vieram. */
function variasDe(v: unknown, lista: readonly { v: string }[]): string[] {
  if (!Array.isArray(v)) return [];
  const permitidas = valores(lista);
  const vistas = new Set<string>();
  const saida: string[] = [];
  for (const item of v.slice(0, 50)) {
    const t = texto(item, 40).toUpperCase();
    if (permitidas.includes(t) && !vistas.has(t)) {
      vistas.add(t);
      saida.push(t);
    }
  }
  return saida;
}

/**
 * Data de nascimento em ISO (AAAA-MM-DD), ou null.
 *
 * Recusa data no futuro e idade implausível em vez de gravar: nascimento em
 * 2187 não é preferência, é dedo escorregando no seletor — e depois vira
 * aniversário errado no relatório da dona.
 */
function nascimento(v: unknown): string | null {
  const t = texto(v, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) return null;
  const d = new Date(`${t}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  const agora = new Date();
  const anos = (agora.getTime() - d.getTime()) / (365.25 * 24 * 3600 * 1000);
  if (anos < 0 || anos > 120) return null;
  return t;
}

/**
 * Normaliza o que veio da tela. Nunca lança e nunca recusa a assinatura: o
 * pior caso é um perfil vazio, e perfil vazio é melhor do que venda perdida.
 */
export function validarPerfil(bruto: unknown): Perfil {
  const c = (bruto ?? {}) as Record<string, unknown>;
  return {
    dataNascimento: nascimento(c.dataNascimento),
    tipoPele: umaDe(c.tipoPele, TIPOS_PELE),
    tomPele: umaDe(c.tomPele, TONS_PELE),
    subtom: umaDe(c.subtom, SUBTONS),
    // Ordem importa: é o 1º, 2º e 3º lugar da preferência.
    preferenciaCategorias: variasDe(c.preferenciaCategorias, CATEGORIAS).slice(0, 3),
    itensFavoritos: variasDe(c.itensFavoritos, ITENS),
    itensOutros: texto(c.itensOutros, 160),
    cores: variasDe(c.cores, CORES),
    naoEnviar: texto(c.naoEnviar, 400),
    alergias: texto(c.alergias, 400),
    sonhoCaixa: texto(c.sonhoCaixa, 600),
  };
}

/** Perfil sem nenhuma resposta não precisa virar linha no banco. */
export function perfilVazio(p: Perfil): boolean {
  return (
    !p.dataNascimento &&
    !p.tipoPele &&
    !p.tomPele &&
    !p.subtom &&
    !p.preferenciaCategorias.length &&
    !p.itensFavoritos.length &&
    !p.itensOutros &&
    !p.cores.length &&
    !p.naoEnviar &&
    !p.alergias &&
    !p.sonhoCaixa
  );
}

/** Rótulo de exibição de um valor guardado. Usado no admin. */
export function rotulo(valor: string | null, lista: readonly { v: string; r: string }[]): string {
  if (!valor) return '';
  return lista.find((o) => o.v === valor)?.r ?? valor;
}

export function rotulos(valores: string[], lista: readonly { v: string; r: string }[]): string[] {
  return valores.map((v) => rotulo(v, lista)).filter(Boolean);
}
