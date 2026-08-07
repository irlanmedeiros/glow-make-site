'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { BannerPublico } from './tipos';
import { Anterior, Proximo, Seta } from './Icones';

const INTERVALO = 6000;

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
          <div className={`slide${i === atual ? ' on' : ''}`} key={b.id}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="bg" src={b.imagem} alt="" fetchPriority={i === 0 ? 'high' : 'low'} />
            <div className="slide-in">
              <div className="slide-txt">
                <span className="slide-tag">{b.tag}</span>
                <h2>{b.titulo}</h2>
                <p>{b.subtitulo}</p>
                <a className="btn btn-primary" href={b.ctaLink}>
                  {b.ctaTexto}
                  <Seta />
                </a>
              </div>
            </div>
          </div>
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
                /* a key muda junto com o slide ativo para a barra de progresso
                   reiniciar a animação a cada troca */
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
