'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { BannerPublico } from './tipos';
import { Anterior, Proximo } from './Icones';

const INTERVALO = 6000;

/**
 * Carrossel do topo.
 *
 * As artes oficiais já trazem título, preço e lista de itens desenhados
 * dentro da imagem. Por isso aqui NÃO existe véu branco, texto sobreposto
 * nem zoom: qualquer um dos três estragaria a peça que a designer entregou.
 *
 * O bloco mantém a proporção exata da arte (20:9) e usa `contain`, então a
 * imagem aparece inteira em qualquer largura. Recortar cortaria justamente o
 * selo de preço, que fica na borda.
 */
export default function Hero({ banners }: { banners: BannerPublico[] }) {
  const [atual, setAtual] = useState(0);
  const [pausado, setPausado] = useState(false);
  const toqueX = useRef(0);
  const total = banners.length;

  const ir = useCallback((n: number) => setAtual((a) => (n + total) % total), [total]);

  useEffect(() => {
    if (pausado || total < 2) return;
    const t = setTimeout(() => ir(atual + 1), INTERVALO);
    return () => clearTimeout(t);
  }, [atual, pausado, total, ir]);

  useEffect(() => {
    const teclado = (e: KeyboardEvent) => {
      if (document.querySelector('.modal.on')) return;
      if (e.key === 'ArrowLeft') ir(atual - 1);
      if (e.key === 'ArrowRight') ir(atual + 1);
    };
    window.addEventListener('keydown', teclado);
    return () => window.removeEventListener('keydown', teclado);
  }, [atual, ir]);

  if (!total) return null;

  return (
    <div
      className="hero"
      onMouseEnter={() => setPausado(true)}
      onMouseLeave={() => setPausado(false)}
      onTouchStart={(e) => {
        toqueX.current = e.touches[0].clientX;
        setPausado(true);
      }}
      onTouchEnd={(e) => {
        const dx = e.changedTouches[0].clientX - toqueX.current;
        if (Math.abs(dx) > 45) ir(atual + (dx < 0 ? 1 : -1));
        setPausado(false);
      }}
    >
      <div className="slides">
        {banners.map((b, i) => (
          <a
            className={`slide${i === atual ? ' on' : ''}`}
            key={b.id}
            href={b.ctaLink || '#kits'}
            aria-label={b.titulo || `Banner ${i + 1}`}
            aria-hidden={i !== atual}
            tabIndex={i === atual ? 0 : -1}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              className="bg"
              src={b.imagem}
              alt={b.titulo || ''}
              fetchPriority={i === 0 ? 'high' : 'low'}
              loading={i === 0 ? 'eager' : 'lazy'}
            />
          </a>
        ))}
      </div>

      {total > 1 && (
        <>
          <button className="arrow prev" onClick={() => ir(atual - 1)} aria-label="Banner anterior">
            <Anterior />
          </button>
          <button className="arrow next" onClick={() => ir(atual + 1)} aria-label="Próximo banner">
            <Proximo />
          </button>
          <div className="dots">
            {banners.map((b, i) => (
              <button
                key={b.id}
                className={`dot${i === atual ? ' on' : ''}`}
                onClick={() => ir(i)}
                aria-label={`Banner ${i + 1}`}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
