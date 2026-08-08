/** Formatos que atravessam a fronteira servidor → cliente.
 *  Decimal do Prisma não é serializável, então preço sempre vira number aqui. */

export type KitPublico = {
  id: string;
  sku: string;
  nome: string;
  descricao: string;
  itens: string[];
  preco: number;
  imagem: string;
  saldo: number;
  estoqueBaixo: number;
};

export type BannerPublico = {
  id: string;
  tag: string;
  titulo: string;
  subtitulo: string;
  imagem: string;
  ctaTexto: string;
  ctaLink: string;
};

export type DepoimentoPublico = {
  id: string;
  nome: string;
  cidade: string;
  tempo: string;
  texto: string;
  avatar: string;
  nota: number;
};

export type ConfigPublica = {
  freteValor: number;
  freteGratisAcima: number;
  cidadeFreteGratis: string;
  contratoTexto: string;
  contratoVersao: string;
  metaPixelId: string;
  avisos: string[];
  whatsapp: string;
  email: string;
  instagram: string;
  cnpj: string;
};
