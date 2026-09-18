import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/site';

/* Buscador ve a loja e os documentos legais. Admin, balcao, API e a consulta
   de pedidos da cliente nao tem o que fazer num resultado de busca. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: '*', allow: '/', disallow: ['/admin', '/catalogo', '/api', '/meus-pedidos'] }],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
