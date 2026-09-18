/**
 * Conteudo que nao pode aparecer no site, mesmo que ainda esteja no banco.
 *
 * O banco de producao so e alcancavel de dentro da Vercel, entao a limpeza dos
 * registros e feita pelo admin, no tempo de quem cuida da loja. Estes filtros
 * garantem que, enquanto isso nao acontece, nada do que foi retirado volte a
 * aparecer para a cliente.
 */

/** Os depoimentos ficticios do seed usavam fotos deste caminho, e so eles. */
export const PREFIXO_AVATAR_EXEMPLO = '/assets/avatares/avatar-';

export function ehDepoimentoDeExemplo(avatar: string): boolean {
  return avatar.startsWith(PREFIXO_AVATAR_EXEMPLO);
}

// A promocao de 10% foi encerrada. Vale para qualquer lista publica de beneficios.
const PROMOCAO_ENCERRADA = [/dez\s+por\s+cento/i, /\b10\s*%/];

// Frete gratis deixou de ser regra geral. So a assinatura tem frete incluso, e
// isso e dito na secao dela, nunca nos avisos do topo.
const FRETE_GRATIS_GERAL = [/fr[eê]te\s+gr[aá]tis/i, /entrega\s+gr[aá]tis/i];

const menciona = (texto: string, padroes: RegExp[]) => padroes.some((p) => p.test(texto));

export function semPromocaoEncerrada(textos: string[]): string[] {
  return textos.filter((t) => !menciona(t, PROMOCAO_ENCERRADA));
}

// Com a assinatura oculta, aviso que a oferece tambem sai do topo.
const OFERTA_DE_ASSINATURA = [/assin/i, /glow\s*box/i];

export function avisosPublicaveis(
  avisos: string[],
  opcoes: { assinaturaAtiva?: boolean } = {}
): string[] {
  const assinaturaAtiva = opcoes.assinaturaAtiva ?? true;
  return semPromocaoEncerrada(avisos)
    .filter((t) => !menciona(t, FRETE_GRATIS_GERAL))
    .filter((t) => assinaturaAtiva || !menciona(t, OFERTA_DE_ASSINATURA));
}

/** Foto de depoimento e opcional: nem toda cliente autoriza aparecer. */
export function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  const primeira = partes[0]?.[0] ?? '';
  const ultima = partes.length > 1 ? partes[partes.length - 1][0] : '';
  return (primeira + ultima).toUpperCase();
}
