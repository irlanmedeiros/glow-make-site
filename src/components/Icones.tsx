/** Ícones em SVG traçado. Regra da marca: nada de emoji em lugar nenhum. */

type P = { size?: number; className?: string };

export const Busca = ({ size = 16 }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#8A6A75" strokeWidth={2}>
    <circle cx="11" cy="11" r="7" />
    <path d="M20 20l-3.5-3.5" />
  </svg>
);

export const Carrinho = ({ size = 20 }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
    <path d="M6 2l1.5 4h12L18 15H8L6 2H3" />
    <circle cx="9" cy="20" r="1.6" />
    <circle cx="17" cy="20" r="1.6" />
  </svg>
);

export const Menu = ({ size = 20 }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} fill="none">
    <path d="M3 6h18M3 12h18M3 18h18" />
  </svg>
);

export const Seta = ({ size = 15 }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4}>
    <path d="M5 12h13M13 6l6 6-6 6" />
  </svg>
);

export const Anterior = ({ size = 18 }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#F53260" strokeWidth={2.4}>
    <path d="M15 5l-7 7 7 7" />
  </svg>
);

export const Proximo = ({ size = 18 }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#F53260" strokeWidth={2.4}>
    <path d="M9 5l7 7-7 7" />
  </svg>
);

export const Check = ({ size = 11 }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#D91E4A" strokeWidth={3.4}>
    <path d="M4 12.5l5.5 5.5L20 6" />
  </svg>
);

export const Estrela = ({ size = 14 }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="#F5B731">
    <path d="M12 2.2l3 6.1 6.7 1-4.9 4.7 1.2 6.7L12 17.5 6 20.7l1.2-6.7L2.3 9.3l6.7-1z" />
  </svg>
);

export const Frete = ({ size = 21 }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#F53260" strokeWidth={1.7}>
    <path d="M2 7h11v10H2zM13 10h4l3 3v4h-7z" />
    <circle cx="6" cy="18" r="2" />
    <circle cx="17" cy="18" r="2" />
  </svg>
);

export const Cartao = ({ size = 21 }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#F53260" strokeWidth={1.7}>
    <rect x="2" y="5" width="20" height="14" rx="3" />
    <path d="M2 10h20" />
  </svg>
);

export const Coracao = ({ size = 21 }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#F53260" strokeWidth={1.7}>
    <path d="M12 21s-7-4.6-7-10a4.5 4.5 0 018-2.8A4.5 4.5 0 0121 11c0 5.4-9 10-9 10z" />
  </svg>
);

/** Coração de traço fino — o elemento gráfico que se repete nas artes. */
export const CoracaoTraco = ({ size = 16 }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
    <path d="M12 20.5S4 15.9 4 10.4A4.4 4.4 0 0112 7.9a4.4 4.4 0 018 2.5c0 5.5-8 10.1-8 10.1z" />
  </svg>
);

export const Troca = ({ size = 21 }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#F53260" strokeWidth={1.7}>
    <path d="M3 12a9 9 0 0115-6.7L21 8M21 12a9 9 0 01-15 6.7L3 16" />
    <path d="M21 4v4h-4M3 20v-4h4" />
  </svg>
);

export const Instagram = ({ size = 17 }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#F53260" strokeWidth={1.8}>
    <rect x="3" y="3" width="18" height="18" rx="5" />
    <circle cx="12" cy="12" r="4" />
    <circle cx="17.5" cy="6.5" r="1" fill="#F53260" stroke="none" />
  </svg>
);

export const Whatsapp = ({ size = 17 }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#F53260" strokeWidth={1.8}>
    <path d="M21 12a9 9 0 01-13.3 7.9L3 21l1.2-4.5A9 9 0 1121 12z" />
  </svg>
);

export const Tiktok = ({ size = 17 }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#F53260" strokeWidth={1.8}>
    <path d="M14 3v11a3.5 3.5 0 11-3-3.5" />
    <path d="M14 6c.8 2 2.4 3 4.5 3" />
  </svg>
);

/* ---------- ícones do admin ---------- */
const adm = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.7 } as const;

export const IcPainel = ({ size = 17 }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...adm}>
    <rect x="3" y="3" width="7" height="9" rx="2" />
    <rect x="14" y="3" width="7" height="5" rx="2" />
    <rect x="14" y="12" width="7" height="9" rx="2" />
    <rect x="3" y="16" width="7" height="5" rx="2" />
  </svg>
);
export const IcEstoque = ({ size = 17 }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...adm}>
    <path d="M3 8l9-5 9 5v8l-9 5-9-5z" />
    <path d="M3 8l9 5 9-5M12 13v8" />
  </svg>
);
export const IcKits = ({ size = 17 }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...adm}>
    <rect x="3" y="7" width="18" height="14" rx="2" />
    <path d="M3 11h18M8 7V4h8v3" />
  </svg>
);
export const IcPedidos = ({ size = 17 }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...adm}>
    <path d="M6 3h12l1 18H5z" />
    <path d="M9 7a3 3 0 006 0" />
  </svg>
);
export const IcAssinantes = ({ size = 17 }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...adm}>
    <circle cx="9" cy="8" r="3.5" />
    <path d="M2.5 20a6.5 6.5 0 0113 0" />
    <path d="M16 6.5a3.5 3.5 0 010 7M18 20a6.6 6.6 0 00-2-4.7" />
  </svg>
);
export const IcBanners = ({ size = 17 }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...adm}>
    <rect x="2" y="5" width="20" height="14" rx="2" />
    <path d="M2 15l5-4 4 3 4-4 7 6" />
  </svg>
);
export const IcDepoimentos = ({ size = 17 }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...adm}>
    <path d="M21 12a8 8 0 01-11.6 7.1L3 21l1.9-6.4A8 8 0 1121 12z" />
  </svg>
);
export const IcConfig = ({ size = 17 }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...adm}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.6 1.6 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.6 1.6 0 00-1.8-.3 1.6 1.6 0 00-1 1.5V21a2 2 0 11-4 0v-.1A1.6 1.6 0 007 19.4a1.6 1.6 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.6 1.6 0 00.3-1.8 1.6 1.6 0 00-1.5-1H1a2 2 0 110-4h.1A1.6 1.6 0 002.6 7a1.6 1.6 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.6 1.6 0 001.8.3H7a1.6 1.6 0 001-1.5V1a2 2 0 114 0v.1a1.6 1.6 0 001 1.5 1.6 1.6 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.6 1.6 0 00-.3 1.8V7a1.6 1.6 0 001.5 1H21a2 2 0 110 4h-.1a1.6 1.6 0 00-1.5 1z" />
  </svg>
);
export const IcSair = ({ size = 17 }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...adm}>
    <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" />
    <path d="M16 17l5-5-5-5M21 12H9" />
  </svg>
);
export const IcSite = ({ size = 17 }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...adm}>
    <circle cx="12" cy="12" r="9" />
    <path d="M3 12h18M12 3c2.5 2.7 2.5 15 0 18-2.5-3-2.5-15.3 0-18z" />
  </svg>
);

export const IcCatalogo = ({ size = 17 }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...adm}>
    <rect x="3" y="4" width="8" height="7" rx="1.5" />
    <rect x="13" y="4" width="8" height="7" rx="1.5" />
    <rect x="3" y="13" width="8" height="7" rx="1.5" />
    <rect x="13" y="13" width="8" height="7" rx="1.5" />
  </svg>
);

export const IcEntregas = ({ size = 17 }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...adm}>
    <path d="M2 7h11v10H2zM13 10h4l3 3v4h-7z" />
    <circle cx="6.5" cy="18.5" r="1.8" />
    <circle cx="17" cy="18.5" r="1.8" />
  </svg>
);

export const IcImportar = ({ size = 17 }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...adm}>
    <path d="M12 3v11M8 10.5l4 4 4-4" />
    <path d="M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2" />
  </svg>
);

export const IcAfiliados = ({ size = 17 }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...adm}>
    <path d="M10 13a5 5 0 007.5.5l2-2a5 5 0 00-7-7l-1 1" />
    <path d="M14 11a5 5 0 00-7.5-.5l-2 2a5 5 0 007 7l1-1" />
  </svg>
);

export const IcLeads = ({ size = 17 }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...adm}>
    <path d="M6 2l1.5 4h12L18 15H8L6 2H3" />
    <path d="M14 8.5l-3 3-1.5-1.5" />
  </svg>
);
