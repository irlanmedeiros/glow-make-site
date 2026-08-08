'use client';

import { useEffect, useState } from 'react';

const CHAVE = 'glowmake_consentimento';

/**
 * Permite mudar a escolha de cookies depois de já ter decidido.
 *
 * O art. 8º, §5º da LGPD exige que revogar seja tão fácil quanto consentir.
 * Banner que só aparece uma vez e nunca mais volta descumpre isso na prática,
 * mesmo que o texto do banner esteja correto.
 */
export default function RevogarConsentimento() {
  const [escolha, setEscolha] = useState<string | null>(null);
  const [pronto, setPronto] = useState(false);

  useEffect(() => {
    setEscolha(localStorage.getItem(CHAVE));
    setPronto(true);
  }, []);

  if (!pronto) return null;

  function limpar() {
    localStorage.removeItem(CHAVE);
    // Recarrega para o Pixel parar de valer já nesta visita, e não só na
    // próxima — revogação que só vale amanhã não é revogação.
    window.location.reload();
  }

  return (
    <div className="note" style={{ marginTop: 12 }}>
      {escolha ? (
        <>
          Sua escolha atual: <b>{escolha === 'aceito' ? 'cookies aceitos' : 'cookies recusados'}</b>.
          <br />
          <button className="btn btn-ghost btn-sm" style={{ marginTop: 10 }} onClick={limpar}>
            Mudar minha escolha
          </button>
        </>
      ) : (
        <>Você ainda não escolheu. O aviso aparece na próxima página que abrir.</>
      )}
    </div>
  );
}
