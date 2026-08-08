'use client';

import { useEffect, useState } from 'react';

/**
 * Banner de consentimento + Pixel do Meta.
 *
 * O Pixel só é carregado DEPOIS do aceite. Disparar rastreamento publicitário
 * antes de a pessoa autorizar é justamente o que a LGPD trata como uso
 * indevido — e um banner que rastreia enquanto pergunta não serve de nada.
 *
 * A escolha fica no localStorage. Quem recusa navega e compra normalmente:
 * o consentimento é para publicidade, não para vender.
 */

const CHAVE = 'glowmake_consentimento';

type Escolha = 'aceito' | 'recusado' | null;

declare global {
  interface Window {
    fbq?: ((...args: unknown[]) => void) & { queue?: unknown[]; loaded?: boolean };
    _fbq?: unknown;
  }
}

export default function Consentimento({ pixelId }: { pixelId: string }) {
  const [escolha, setEscolha] = useState<Escolha>(null);
  const [carregado, setCarregado] = useState(false);

  useEffect(() => {
    const salvo = localStorage.getItem(CHAVE) as Escolha;
    setEscolha(salvo);
    setCarregado(true);
  }, []);

  // Carrega o Pixel só depois do aceite.
  useEffect(() => {
    if (escolha !== 'aceito' || !pixelId || window.fbq) return;

    const f = function (...args: unknown[]) {
      (f as unknown as { callMethod?: (...a: unknown[]) => void }).callMethod
        ? (f as unknown as { callMethod: (...a: unknown[]) => void }).callMethod(...args)
        : (f.queue as unknown[]).push(args);
    } as unknown as NonNullable<Window['fbq']>;
    f.queue = [];
    f.loaded = true;
    window.fbq = f;
    window._fbq = f;

    const s = document.createElement('script');
    s.async = true;
    s.src = 'https://connect.facebook.net/en_US/fbevents.js';
    document.head.appendChild(s);

    window.fbq('init', pixelId);
    window.fbq('track', 'PageView');
  }, [escolha, pixelId]);

  function decidir(valor: Exclude<Escolha, null>) {
    localStorage.setItem(CHAVE, valor);
    setEscolha(valor);
  }

  // Enquanto lê o localStorage não mostra nada, para o banner não piscar em
  // quem já decidiu.
  if (!carregado || escolha) return null;

  return (
    <div className="lgpd" role="dialog" aria-label="Consentimento de cookies">
      <div className="lgpd-txt">
        <b>A gente usa cookies para entender o que funciona.</b>
        <span>
          Servem para medir de onde vêm as visitas e mostrar nossos anúncios a quem já se
          interessou. Recusar não atrapalha em nada a sua compra.
        </span>
      </div>
      <div className="lgpd-btns">
        <button className="btn btn-ghost btn-sm" onClick={() => decidir('recusado')}>
          Recusar
        </button>
        <button className="btn btn-primary btn-sm" onClick={() => decidir('aceito')}>
          Aceitar
        </button>
      </div>
    </div>
  );
}

/** Dispara um evento do Pixel se — e só se — houver consentimento. */
export function evento(nome: string, dados?: Record<string, unknown>) {
  if (typeof window === 'undefined') return;
  if (localStorage.getItem(CHAVE) !== 'aceito') return;
  window.fbq?.('track', nome, dados);
}
