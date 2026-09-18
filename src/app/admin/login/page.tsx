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
          <label htmlFor="usuario">Usuário</label>
          <input
            id="usuario"
            name="usuario"
            autoFocus
            autoCapitalize="none"
            autoComplete="username"
            spellCheck={false}
            maxLength={40}
          />
        </div>

        <div className="field">
          <label htmlFor="senha">Senha</label>
          <input id="senha" name="senha" type="password" required autoComplete="current-password" />
        </div>

        {estado?.erro && <div className="note erro">{estado.erro}</div>}

        <button className="btn btn-primary btn-block" disabled={pendente}>
          {pendente ? 'Entrando...' : 'Entrar'}
        </button>

        <div className="note" style={{ marginTop: 16 }}>
          Administrador entra no painel completo. A equipe do balcão entra direto no{' '}
          <b>catálogo da loja</b>, com o estoque ao vivo. Os acessos são criados em Admin &gt; Usuários.
        </div>
      </form>
    </div>
  );
}
