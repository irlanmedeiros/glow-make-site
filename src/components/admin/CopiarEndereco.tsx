'use client';

import { useState } from 'react';

/** Copia o endereço formatado para colar no site dos Correios ou na etiqueta.
 *  Redigitar endereço é onde nasce encomenda devolvida. */
export default function CopiarEndereco({ texto }: { texto: string }) {
  const [copiado, setCopiado] = useState(false);

  async function copiar() {
    try {
      await navigator.clipboard.writeText(texto);
    } catch {
      // Navegador sem permissão de área de transferência: seleciona o texto
      // para a pessoa copiar à mão em vez de simplesmente não fazer nada.
      const ta = document.createElement('textarea');
      ta.value = texto;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    }
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2000);
  }

  return (
    <button className="btn btn-ghost btn-sm" style={{ marginTop: 10 }} onClick={copiar} type="button">
      {copiado ? 'Copiado' : 'Copiar endereço'}
    </button>
  );
}
