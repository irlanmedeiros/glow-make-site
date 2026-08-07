'use client';

import { useActionState } from 'react';
import { entrar } from '../actions';

export default function Login() {
  const [estado, acao, pendente] = useActionState(entrar, null as { erro?: string } | null);

  return (
    <div className="adm-login">
      <form className="caixa" action={acao}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/assets/logo.png" alt="Glow Make" />

        <div className="field">
          <label htmlFor="senha">Senha do administrador</label>
          <input
            id="senha"
            name="senha"
            type="password"
            required
            autoFocus
            autoComplete="current-password"
            placeholder="••••••••"
          />
        </div>

        {estado?.erro && <div className="note erro">{estado.erro}</div>}

        <button className="btn btn-primary btn-block" disabled={pendente}>
          {pendente ? 'Entrando...' : 'Entrar'}
        </button>

        <div className="note" style={{ marginTop: 16 }}>
          A senha fica na variável <b>ADMIN_PASSWORD</b>, no servidor. Ela nunca é enviada para o
          navegador e não aparece no código do site.
        </div>
      </form>
    </div>
  );
}
