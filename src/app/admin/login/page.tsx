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
          <label htmlFor="senha">Sua senha de acesso</label>
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
          A senha do administrador abre o painel completo. A senha da equipe abre só o{' '}
          <b>catálogo da loja</b>, com o estoque ao vivo. As duas ficam no servidor e nunca são
          enviadas para o navegador.
        </div>
      </form>
    </div>
  );
}
