import 'server-only';
import { prisma } from '@/lib/prisma';
import { conferirSenha, gastarTempoDeConferencia } from '@/lib/senha';

// Cinco erros seguidos travam aquele login por 15 minutos. A tela de login é
// pública; sem trava, dava para testar senha da equipe a noite inteira.
export const TENTATIVAS_ANTES_DE_TRAVAR = 5;
export const MINUTOS_DE_TRAVA = 15;

type Autenticado = { ok: true; usuario: { id: string; papel: 'ADMIN' | 'EQUIPE'; versaoSessao: number } };
type Recusado = { ok: false; erro: string };

const INCORRETO = 'Usuário ou senha incorretos.';

export async function autenticarUsuario(login: string, senha: string): Promise<Autenticado | Recusado> {
  const u = await prisma.usuario.findUnique({ where: { login } });

  if (!u) {
    await gastarTempoDeConferencia(senha);
    return { ok: false, erro: INCORRETO };
  }

  if (u.bloqueadoAte && u.bloqueadoAte.getTime() > Date.now()) {
    const minutos = Math.ceil((u.bloqueadoAte.getTime() - Date.now()) / 60_000);
    return { ok: false, erro: `Muitas tentativas erradas. Tente de novo em ${minutos} min.` };
  }

  const certa = await conferirSenha(senha, u.senhaHash);

  if (!certa) {
    // Incremento no banco, não em JS: duas tentativas simultâneas contam as duas.
    const { tentativasFalhas } = await prisma.usuario.update({
      where: { id: u.id },
      data: { tentativasFalhas: { increment: 1 } },
      select: { tentativasFalhas: true },
    });
    if (tentativasFalhas >= TENTATIVAS_ANTES_DE_TRAVAR) {
      await prisma.usuario.update({
        where: { id: u.id },
        data: { tentativasFalhas: 0, bloqueadoAte: new Date(Date.now() + MINUTOS_DE_TRAVA * 60_000) },
      });
    }
    return { ok: false, erro: INCORRETO };
  }

  // Senha certa em usuário desativado recebe a mesma resposta de senha errada:
  // não confirma para quem saiu da loja que o login ainda existe.
  if (!u.ativo) return { ok: false, erro: INCORRETO };

  await prisma.usuario.update({
    where: { id: u.id },
    data: { tentativasFalhas: 0, bloqueadoAte: null, ultimoAcesso: new Date() },
  });
  return { ok: true, usuario: { id: u.id, papel: u.papel, versaoSessao: u.versaoSessao } };
}
