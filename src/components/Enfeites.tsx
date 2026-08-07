'use client';

import { useEffect, useRef, useState } from 'react';

/** Faz o bloco subir com fade quando entra na tela. */
export function Reveal({
  children,
  className = '',
  delay = 0,
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [visivel, setVisivel] = useState(false);

  useEffect(() => {
    const el = ref.current;
    // Sem IntersectionObserver, mostra tudo — melhor do que deixar invisível.
    if (!el || typeof IntersectionObserver === 'undefined') {
      setVisivel(true);
      return;
    }
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setVisivel(true);
          io.disconnect();
        }
      },
      { threshold: 0.12, rootMargin: '0px 0px -40px' }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={`rv${visivel ? ' in' : ''} ${className}`.trim()}
      style={delay ? { transitionDelay: `${delay}ms` } : undefined}
    >
      {children}
    </div>
  );
}

/** Número que conta de zero até o alvo ao entrar na tela. */
export function Contador({
  alvo,
  decimal = false,
  rotulo,
}: {
  alvo: number;
  decimal?: boolean;
  rotulo: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [valor, setValor] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') {
      setValor(alvo);
      return;
    }
    const io = new IntersectionObserver(
      ([e]) => {
        if (!e.isIntersecting) return;
        io.disconnect();
        const inicio = performance.now();
        const dur = 1400;
        const passo = (t: number) => {
          const p = Math.min((t - inicio) / dur, 1);
          setValor(alvo * (1 - Math.pow(1 - p, 3)));
          if (p < 1) requestAnimationFrame(passo);
        };
        requestAnimationFrame(passo);
      },
      { threshold: 0.5 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [alvo]);

  return (
    <div className="stat" ref={ref}>
      <b>
        {decimal
          ? (valor / 10).toFixed(1).replace('.', ',')
          : Math.round(valor).toLocaleString('pt-BR')}
      </b>
      <span>{rotulo}</span>
    </div>
  );
}
