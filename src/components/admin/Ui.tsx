/** Peças reaproveitadas pelas telas do admin. */

export function Aviso({ ok, erro }: { ok?: string; erro?: string }) {
  if (!ok && !erro) return null;
  return <div className={`toast-srv ${erro ? 'erro' : 'ok'}`}>{erro ?? ok}</div>;
}

export function Cabecalho({
  titulo,
  descricao,
  children,
}: {
  titulo: string;
  descricao?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="adm-hd">
      <div>
        <h1>{titulo}</h1>
        {descricao && <p>{descricao}</p>}
      </div>
      {children && <div className="adm-acoes">{children}</div>}
    </div>
  );
}

export function Painel({
  titulo,
  descricao,
  acoes,
  flush,
  children,
}: {
  titulo?: string;
  descricao?: string;
  acoes?: React.ReactNode;
  flush?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section className="painel">
      {(titulo || acoes) && (
        <div className="painel-hd">
          <div>
            {titulo && <h2>{titulo}</h2>}
            {descricao && <p>{descricao}</p>}
          </div>
          {acoes}
        </div>
      )}
      <div className={`painel-body${flush ? ' flush' : ''}`}>{children}</div>
    </section>
  );
}

export function Vazio({ titulo, texto }: { titulo: string; texto: string }) {
  return (
    <div className="vazio">
      <b>{titulo}</b>
      {texto}
    </div>
  );
}

export function Pill({
  cor,
  children,
}: {
  cor: 'ok' | 'low' | 'out' | 'info';
  children: React.ReactNode;
}) {
  return <span className={`pill ${cor}`}>{children}</span>;
}

/** Lê ?ok= e ?erro= que as server actions colocam na URL após redirecionar. */
export function mensagens(sp: Record<string, string | string[] | undefined>) {
  const um = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  return { ok: um(sp.ok), erro: um(sp.erro) };
}
