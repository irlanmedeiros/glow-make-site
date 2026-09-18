import { prisma } from '@/lib/prisma';
import { dataHora } from '@/lib/format';
import { sessaoAtual, senhaAdminConfigurada, senhaEquipeConfigurada } from '@/lib/auth';
import { SENHA_MINIMA } from '@/lib/senha';
import {
  criarUsuario,
  alterarUsuario,
  redefinirSenhaUsuario,
  alternarUsuario,
  encerrarSessoesUsuario,
  excluirUsuario,
} from '../../actions';
import { Aviso, Cabecalho, Painel, Pill, Vazio, mensagens } from '@/components/admin/Ui';

export const dynamic = 'force-dynamic';

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

const ROTULO_PAPEL = { ADMIN: 'Administrador', EQUIPE: 'Equipe do balcão' } as const;

function CamposSenha() {
  return (
    <div className="row2">
      <div className="field">
        <label>Senha</label>
        <input type="password" name="senha" required minLength={SENHA_MINIMA} autoComplete="new-password" />
      </div>
      <div className="field">
        <label>Repita a senha</label>
        <input type="password" name="confirmacao" required minLength={SENHA_MINIMA} autoComplete="new-password" />
      </div>
    </div>
  );
}

function SeletorPapel({ valor, travado }: { valor?: string; travado?: boolean }) {
  return (
    <div className="field">
      <label>Tipo de acesso</label>
      <select name="papel" defaultValue={valor ?? 'EQUIPE'} disabled={travado}>
        <option value="EQUIPE">{ROTULO_PAPEL.EQUIPE} — só o catálogo e o caixa</option>
        <option value="ADMIN">{ROTULO_PAPEL.ADMIN} — painel completo</option>
      </select>
      {/* select desabilitado não vai no formulário; o valor segue escondido */}
      {travado && <input type="hidden" name="papel" value={valor} />}
    </div>
  );
}

export default async function Usuarios({ searchParams }: Props) {
  const { ok, erro } = mensagens(await searchParams);
  const [usuarios, eu] = await Promise.all([
    prisma.usuario.findMany({ orderBy: [{ ativo: 'desc' }, { papel: 'asc' }, { nome: 'asc' }] }),
    sessaoAtual(),
  ]);
  const agora = Date.now();
  const mestras = [senhaAdminConfigurada() && 'ADMIN_PASSWORD', senhaEquipeConfigurada() && 'EQUIPE_PASSWORD'].filter(Boolean);

  return (
    <>
      <Cabecalho
        titulo="Usuários"
        descricao="Quem entra no painel e no balcão. Cada acesso tem usuário e senha próprios e pode ser desligado sozinho."
      />
      <Aviso ok={ok} erro={erro} />

      <div className="note" style={{ marginBottom: 20 }}>
        <b>Equipe do balcão</b> vê só o catálogo: estoque ao vivo, vendas e caixa do dia. Não vê pedidos
        do site, clientes nem faturamento. <b>Administrador</b> vê tudo, inclusive esta tela.
        {mestras.length > 0 && (
          <>
            {' '}
            A senha mestra ({mestras.join(' e ')}, na Vercel) continua funcionando como chave reserva:
            no login, deixe o campo de usuário em branco.
          </>
        )}
      </div>

      <Painel titulo="Novo acesso">
        <form action={criarUsuario}>
          <div className="row2">
            <div className="field">
              <label>Nome</label>
              <input name="nome" required maxLength={80} placeholder="Ex.: Balcão da loja" />
            </div>
            <div className="field">
              <label>Usuário (para entrar)</label>
              <input
                name="login"
                required
                maxLength={40}
                pattern="[A-Za-z0-9][A-Za-z0-9._\-]{2,39}"
                autoCapitalize="none"
                autoComplete="off"
                spellCheck={false}
                placeholder="Ex.: balcao"
              />
            </div>
          </div>
          <SeletorPapel />
          <CamposSenha />
          <small style={{ display: 'block', color: 'var(--muted)', margin: '-6px 0 14px' }}>
            Mínimo de {SENHA_MINIMA} caracteres. A senha não fica visível para ninguém depois de salva, nem aqui:
            se for esquecida, crie uma nova no botão Trocar senha.
          </small>
          <button className="btn btn-primary">Criar acesso</button>
        </form>
      </Painel>

      {!usuarios.length ? (
        <Painel>
          <Vazio titulo="Nenhum usuário ainda" texto="Crie o primeiro no formulário acima." />
        </Painel>
      ) : (
        usuarios.map((u) => {
          const souEu = u.id === eu?.usuarioId;
          const travado = Boolean(u.bloqueadoAte && u.bloqueadoAte.getTime() > agora);
          return (
            <Painel key={u.id}>
              <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                <div style={{ flex: '1 1 240px', minWidth: 0 }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <b style={{ fontSize: 16 }}>{u.nome}</b>
                    <Pill cor={u.papel === 'ADMIN' ? 'info' : 'ok'}>{ROTULO_PAPEL[u.papel]}</Pill>
                    {!u.ativo && <Pill cor="out">Desativado</Pill>}
                    {travado && <Pill cor="low">Travado por senha errada</Pill>}
                    {souEu && <Pill cor="info">Você</Pill>}
                  </div>
                  <p style={{ fontSize: 13.5, marginTop: 4 }}>
                    Usuário: <b>{u.login}</b>
                  </p>
                  <p style={{ fontSize: 13, color: 'var(--muted)' }}>
                    {u.ultimoAcesso ? `Último acesso em ${dataHora(u.ultimoAcesso)}` : 'Ainda não entrou'}
                  </p>
                </div>
                {!souEu && (
                  <div className="adm-acoes">
                    <form action={alternarUsuario}>
                      <input type="hidden" name="id" value={u.id} />
                      <button className="btn btn-ghost btn-sm">{u.ativo ? 'Desativar' : 'Reativar'}</button>
                    </form>
                    {u.ativo && (
                      <form action={encerrarSessoesUsuario}>
                        <input type="hidden" name="id" value={u.id} />
                        <button className="btn btn-ghost btn-sm">Desconectar aparelhos</button>
                      </form>
                    )}
                    {!u.ativo && (
                      <form action={excluirUsuario}>
                        <input type="hidden" name="id" value={u.id} />
                        <button className="btn btn-danger btn-sm">Excluir</button>
                      </form>
                    )}
                  </div>
                )}
              </div>

              <details style={{ marginTop: 12 }}>
                <summary style={{ cursor: 'pointer', color: 'var(--rose)', fontSize: 14, fontWeight: 600 }}>
                  Trocar senha
                </summary>
                <form action={redefinirSenhaUsuario} style={{ marginTop: 16 }}>
                  <input type="hidden" name="id" value={u.id} />
                  <CamposSenha />
                  <button className="btn btn-primary btn-sm">Salvar nova senha</button>
                </form>
              </details>

              <details style={{ marginTop: 12 }}>
                <summary style={{ cursor: 'pointer', color: 'var(--rose)', fontSize: 14, fontWeight: 600 }}>
                  Editar nome e acesso
                </summary>
                <form action={alterarUsuario} style={{ marginTop: 16 }}>
                  <input type="hidden" name="id" value={u.id} />
                  <div className="field">
                    <label>Nome</label>
                    <input name="nome" defaultValue={u.nome} required maxLength={80} />
                  </div>
                  <SeletorPapel valor={u.papel} travado={souEu} />
                  <button className="btn btn-primary btn-sm">Salvar</button>
                </form>
              </details>
            </Painel>
          );
        })
      )}
    </>
  );
}
