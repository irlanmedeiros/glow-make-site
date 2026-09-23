'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import {
  abrirSessao,
  ehAdmin,
  fecharSessao,
  papelDaSenha,
  papelDoUsuario,
  senhaAdminConfigurada,
  senhaEquipeConfigurada,
  sessaoAtual,
} from '@/lib/auth';
import { autenticarUsuario } from '@/lib/usuarios';
import { erroDeLogin, erroDeSenha, gerarHash, normalizarLogin } from '@/lib/senha';
import { devolverEstoque } from '@/lib/estoque';
import { ehCartao, normalizarCodigoMaquineta, type FormaPagamento } from '@/lib/pdv';
import { cancelarAssinatura as cancelarNoAsaas, asaasConfigurado } from '@/lib/asaas';
import { cancelarPedido, recusarCancelamentoPedido, ErroCancelamento } from '@/lib/cancelamento';
import { PREFIXO_AVATAR_EXEMPLO } from '@/lib/conteudo';
import { codigoLivre, validarCupom } from '@/lib/cupom';
import { erroDePreco, tipoValido } from '@/lib/produto';
import { IMAGEM_PADRAO_PRODUTO, enderecoDeImagemValido } from '@/lib/imagem';

/**
 * Toda ação confere o login por conta própria. O layout do admin já barra a
 * navegação, mas uma server action é um endpoint HTTP como outro qualquer —
 * dá para chamar direto, sem passar por página nenhuma.
 */
async function exigirLogin() {
  if (!(await ehAdmin())) throw new Error('Sessão expirada ou sem permissão. Entre novamente.');
}

function texto(fd: FormData, campo: string, max = 500): string {
  return String(fd.get(campo) ?? '').trim().slice(0, max);
}
function inteiro(fd: FormData, campo: string): number {
  const n = Number(String(fd.get(campo) ?? '').replace(',', '.'));
  return Number.isFinite(n) ? Math.trunc(n) : NaN;
}
function decimal(fd: FormData, campo: string): number {
  const n = Number(String(fd.get(campo) ?? '').replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : NaN;
}
function voltar(rota: string, msg: string, tipo: 'ok' | 'erro' = 'ok'): never {
  revalidatePath(rota);
  redirect(`${rota}?${tipo}=${encodeURIComponent(msg)}`);
}

/* ============================================================
   Sessão
   ============================================================ */

/**
 * Um formulário só para os dois papéis. Com usuário preenchido, vale o cadastro
 * de Admin > Usuários e o papel dele decide se a pessoa cai no painel ou no
 * catálogo. Sem usuário, a senha é conferida contra a senha mestra.
 */
export async function entrar(_estado: unknown, fd: FormData) {
  const login = normalizarLogin(fd.get('usuario'));
  const senha = String(fd.get('senha') ?? '');

  if (login) {
    const r = await autenticarUsuario(login, senha);
    if (!r.ok) {
      await new Promise((ok) => setTimeout(ok, 600));
      return { erro: r.erro };
    }
    const papel = papelDoUsuario(r.usuario.papel);
    await abrirSessao(papel, r.usuario);
    redirect(papel === 'admin' ? '/admin' : '/catalogo');
  }

  if (!senhaAdminConfigurada() && !senhaEquipeConfigurada()) {
    return { erro: 'Informe seu usuário.' };
  }

  const papel = papelDaSenha(senha);
  if (!papel) {
    // Espera curta para desestimular tentativa em massa por força bruta.
    await new Promise((r) => setTimeout(r, 600));
    return { erro: 'Senha incorreta.' };
  }

  await abrirSessao(papel);
  redirect(papel === 'admin' ? '/admin' : '/catalogo');
}

export async function sair() {
  await fecharSessao();
  redirect('/admin/login');
}

/* ============================================================
   Estoque
   ============================================================ */

export async function lancarEntrada(fd: FormData) {
  await exigirLogin();
  const id = texto(fd, 'id');
  const qtd = inteiro(fd, 'qtd');
  const motivo = texto(fd, 'motivo', 160) || 'Entrada manual no admin';

  if (!id || !Number.isInteger(qtd) || qtd < 1) {
    voltar('/admin/estoque', 'Informe uma quantidade inteira maior que zero.', 'erro');
  }

  await prisma.$transaction(async (tx) => {
    const kit = await tx.kit.update({
      where: { id },
      data: { entradas: { increment: qtd } },
    });
    await tx.movimentacao.create({
      data: {
        sku: kit.sku,
        nome: kit.nome,
        tipo: 'ENTRADA',
        qtd,
        origem: motivo,
        saldoApos: kit.entradas - kit.saidas,
      },
    });
  });

  revalidatePath('/');
  voltar('/admin/estoque', `Entrada de ${qtd} unidade(s) registrada.`);
}

export async function ajustarSaldo(fd: FormData) {
  await exigirLogin();
  const id = texto(fd, 'id');
  const novo = inteiro(fd, 'saldo');
  if (!id || !Number.isInteger(novo) || novo < 0) {
    voltar('/admin/estoque', 'Informe um saldo inteiro igual ou maior que zero.', 'erro');
  }

  const kit = await prisma.kit.findUnique({ where: { id } });
  if (!kit) voltar('/admin/estoque', 'Produto não encontrado.', 'erro');

  const atual = kit.entradas - kit.saidas;
  if (novo === atual) voltar('/admin/estoque', 'O saldo já era esse.', 'erro');

  await prisma.$transaction(async (tx) => {
    // O ajuste mexe nas entradas para o histórico de saídas (o que foi vendido)
    // continuar refletindo só venda de verdade.
    const atualizado = await tx.kit.update({
      where: { id },
      data: { entradas: kit.entradas + (novo - atual) },
    });
    await tx.movimentacao.create({
      data: {
        sku: atualizado.sku,
        nome: atualizado.nome,
        tipo: 'AJUSTE',
        qtd: Math.abs(novo - atual),
        origem: `Ajuste manual: ${atual} para ${novo}`,
        saldoApos: atualizado.entradas - atualizado.saidas,
      },
    });
  });

  revalidatePath('/');
  voltar('/admin/estoque', `Saldo de ${kit.nome} ajustado para ${novo}.`);
}

/* ============================================================
   Kits
   ============================================================ */

function slugificar(s: string) {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')  // tira acentos
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export async function salvarKit(fd: FormData) {
  await exigirLogin();
  const id = texto(fd, 'id');
  const nome = texto(fd, 'nome', 120);
  const sku = texto(fd, 'sku', 30).toUpperCase();
  const descricao = texto(fd, 'descricao', 300);
  const preco = decimal(fd, 'preco');
  const imagem = texto(fd, 'imagem', 300);
  const estoqueBaixo = inteiro(fd, 'estoqueBaixo');
  const ordem = inteiro(fd, 'ordem');
  const ativo = fd.get('ativo') === 'on';
  const itens = texto(fd, 'itens', 2000)
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  if (!nome || !sku) voltar('/admin/kits', 'Nome e SKU são obrigatórios.', 'erro');

  /* A caixa da assinatura nao muda de tipo pelo formulario: ela e unica e o
     fluxo dela depende disso. Produto novo sem tipo nasce kit. */
  const atual = id ? await prisma.kit.findUnique({ where: { id }, select: { tipo: true } }) : null;
  const tipo = atual?.tipo === 'BOX' ? 'BOX' : (tipoValido(texto(fd, 'tipo', 20)) ?? 'KIT');

  const erroPreco = erroDePreco(tipo, Number.isFinite(preco) ? preco : null);
  if (erroPreco) voltar('/admin/kits', erroPreco, 'erro');
  if (imagem && !enderecoDeImagemValido(imagem)) {
    voltar('/admin/kits', 'Endereço da foto inválido. Envie a foto ou cole um link https.', 'erro');
  }

  const codigoBarras = texto(fd, 'codigoBarras', 60) || null;

  const dados = {
    nome,
    sku,
    tipo,
    descricao,
    itens,
    codigoBarras,
    preco: new Prisma.Decimal(preco.toFixed(2)),
    imagem: imagem || IMAGEM_PADRAO_PRODUTO,
    estoqueBaixo: Number.isInteger(estoqueBaixo) && estoqueBaixo >= 0 ? estoqueBaixo : 10,
    ordem: Number.isInteger(ordem) ? ordem : 0,
    ativo,
  };

  try {
    if (id) {
      await prisma.kit.update({ where: { id }, data: dados });
    } else {
      await prisma.kit.create({ data: { ...dados, slug: slugificar(nome) || sku.toLowerCase() } });
    }
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      voltar('/admin/kits', 'Já existe um produto com esse SKU ou nome.', 'erro');
    }
    throw e;
  }

  revalidatePath('/');
  voltar('/admin/kits', id ? 'Produto atualizado.' : 'Produto criado.');
}

export async function alternarKit(fd: FormData) {
  await exigirLogin();
  const id = texto(fd, 'id');
  const kit = await prisma.kit.findUnique({ where: { id } });
  if (!kit) voltar('/admin/kits', 'Produto não encontrado.', 'erro');
  await prisma.kit.update({ where: { id }, data: { ativo: !kit.ativo } });
  revalidatePath('/');
  voltar('/admin/kits', kit.ativo ? `${kit.nome} saiu do site.` : `${kit.nome} voltou ao site.`);
}

export async function excluirKit(fd: FormData) {
  await exigirLogin();
  const id = texto(fd, 'id');
  const kit = await prisma.kit.findUnique({ where: { id }, include: { itensPedido: true } });
  if (!kit) voltar('/admin/kits', 'Produto não encontrado.', 'erro');

  if (kit.tipo === 'BOX') {
    voltar('/admin/kits', 'A Glow Box não pode ser excluída — desative se quiser tirar do ar.', 'erro');
  }
  // Excluir apagaria o produto do histórico de quem já comprou. Melhor desativar.
  if (kit.itensPedido.length > 0) {
    voltar(
      '/admin/kits',
      `${kit.nome} já aparece em ${kit.itensPedido.length} pedido(s) e não pode ser excluído. Desative-o.`,
      'erro'
    );
  }

  await prisma.kit.delete({ where: { id } });
  revalidatePath('/');
  voltar('/admin/kits', 'Produto excluído.');
}

/* ============================================================
   Pedidos
   ============================================================ */

const STATUS_PEDIDO = [
  'AGUARDANDO_PAGAMENTO',
  'PAGO',
  'EM_SEPARACAO',
  'ENVIADO',
  'ENTREGUE',
  'CANCELADO',
] as const;
type StatusPedido = (typeof STATUS_PEDIDO)[number];

export async function mudarStatusPedido(fd: FormData) {
  await exigirLogin();
  const id = texto(fd, 'id');
  const novo = texto(fd, 'status', 30) as StatusPedido;
  if (!STATUS_PEDIDO.includes(novo)) voltar('/admin/pedidos', 'Status inválido.', 'erro');

  const pedido = await prisma.pedido.findUnique({ where: { id } });
  if (!pedido) voltar('/admin/pedidos', 'Pedido não encontrado.', 'erro');
  if (pedido.status === novo) voltar('/admin/pedidos', 'O pedido já está nesse status.', 'erro');

  // Cancelar pelo seletor e aprovar o pedido da cliente fazem a mesma coisa,
  // entao passam pelo mesmo lugar: estoque devolvido uma vez, comissao
  // cancelada e cobranca em aberto apagada no Asaas.
  if (novo === 'CANCELADO') await concluirCancelamento(id);

  await prisma.pedido.update({ where: { id }, data: { status: novo } });
  voltar('/admin/pedidos', `Pedido #${pedido.numero} atualizado.`);
}

async function concluirCancelamento(id: string, resposta?: string): Promise<never> {
  let msg: string;
  try {
    const r = await cancelarPedido(id, resposta);
    msg = `Pedido #${r.numero} cancelado, estoque devolvido e comissão cancelada.`;
    // O estorno nao e automatico de proposito: dinheiro so volta pela mao de alguem.
    if (r.precisaEstorno) msg += ' O pagamento já tinha entrado: faça o estorno no painel do Asaas.';
  } catch (e) {
    if (e instanceof ErroCancelamento) voltar('/admin/pedidos', e.message, 'erro');
    throw e;
  }
  revalidatePath('/');
  voltar('/admin/pedidos', msg);
}

/** Aprova o cancelamento pedido pela cliente em /meus-pedidos. */
export async function aprovarCancelamento(fd: FormData) {
  await exigirLogin();
  const id = texto(fd, 'id');
  const pedido = await prisma.pedido.findUnique({ where: { id } });
  if (!pedido?.cancelamentoSolicitadoEm || pedido.cancelamentoRespondidoEm) {
    voltar('/admin/pedidos', 'Esse pedido não tem cancelamento pendente.', 'erro');
  }
  await concluirCancelamento(id, texto(fd, 'resposta', 500));
}

/** Recusa o cancelamento. A resposta aparece para a cliente em /meus-pedidos. */
export async function recusarCancelamento(fd: FormData) {
  await exigirLogin();
  let numero: number;
  try {
    numero = await recusarCancelamentoPedido(texto(fd, 'id'), texto(fd, 'resposta', 500));
  } catch (e) {
    if (e instanceof ErroCancelamento) voltar('/admin/pedidos', e.message, 'erro');
    throw e;
  }
  voltar('/admin/pedidos', `Cancelamento do pedido #${numero} recusado. A cliente vê a resposta em Meus pedidos.`);
}

export async function anotarPedido(fd: FormData) {
  await exigirLogin();
  const id = texto(fd, 'id');
  const observacao = texto(fd, 'observacao', 500);
  await prisma.pedido.update({ where: { id }, data: { observacao: observacao || null } });
  voltar('/admin/pedidos', 'Observação salva.');
}

/* ============================================================
   Assinantes
   ============================================================ */

export async function cancelarAssinante(fd: FormData) {
  await exigirLogin();
  const id = texto(fd, 'id');
  const assinante = await prisma.assinante.findUnique({ where: { id } });
  if (!assinante) voltar('/admin/assinantes', 'Assinante não encontrado.', 'erro');
  if (assinante.status === 'CANCELADA') {
    voltar('/admin/assinantes', 'Essa assinatura já estava cancelada.', 'erro');
  }

  let aviso = '';
  if (assinante.asaasSubscriptionId && asaasConfigurado()) {
    try {
      await cancelarNoAsaas(assinante.asaasSubscriptionId);
    } catch (e) {
      // Cancelamos localmente de qualquer forma, mas avisamos: a cobrança
      // recorrente pode continuar rodando no Asaas.
      aviso = ' Atenção: o Asaas recusou o cancelamento, confira no painel dele.';
      console.error('[assinante] cancelamento no Asaas falhou:', e);
    }
  }

  await prisma.$transaction(async (tx) => {
    await tx.assinante.update({
      where: { id },
      data: { status: 'CANCELADA', canceladaEm: new Date(), canceladaPor: 'ADMIN' },
    });
    // A caixa reservada volta para a edição do mês.
    const box = await tx.kit.findFirst({ where: { tipo: 'BOX' } });
    if (box) {
      await devolverEstoque(tx, [{ kitId: box.id, qtd: 1 }], `Cancelamento de ${assinante.nome}`);
    }
  });

  revalidatePath('/');
  voltar('/admin/assinantes', `Assinatura de ${assinante.nome} cancelada.${aviso}`, aviso ? 'erro' : 'ok');
}

export async function reativarAssinante(fd: FormData) {
  await exigirLogin();
  const id = texto(fd, 'id');
  await prisma.assinante.update({
    where: { id },
    data: {
      status: 'ATIVA',
      canceladaEm: null,
      canceladaPor: null,
      cancelamentoIp: null,
      cancelamentoContratoVersao: null,
    },
  });
  voltar('/admin/assinantes', 'Assinatura reativada.');
}

/* ============================================================
   Banners
   ============================================================ */

export async function salvarBanner(fd: FormData) {
  await exigirLogin();
  const id = texto(fd, 'id');
  const dados = {
    tag: texto(fd, 'tag', 60),
    titulo: texto(fd, 'titulo', 120),
    subtitulo: texto(fd, 'subtitulo', 240),
    imagem: texto(fd, 'imagem', 300),
    ctaTexto: texto(fd, 'ctaTexto', 40),
    ctaLink: texto(fd, 'ctaLink', 200),
    ordem: Number.isInteger(inteiro(fd, 'ordem')) ? inteiro(fd, 'ordem') : 0,
    ativo: fd.get('ativo') === 'on',
  };
  if (!dados.titulo || !dados.imagem) {
    voltar('/admin/banners', 'Título e imagem são obrigatórios.', 'erro');
  }
  if (!enderecoDeImagemValido(dados.imagem)) {
    voltar('/admin/banners', 'Endereço da arte inválido. Envie a imagem ou cole um link https.', 'erro');
  }

  if (id) await prisma.banner.update({ where: { id }, data: dados });
  else await prisma.banner.create({ data: dados });

  revalidatePath('/');
  voltar('/admin/banners', id ? 'Banner atualizado.' : 'Banner criado.');
}

export async function excluirBanner(fd: FormData) {
  await exigirLogin();
  await prisma.banner.delete({ where: { id: texto(fd, 'id') } });
  revalidatePath('/');
  voltar('/admin/banners', 'Banner excluído.');
}

/* ============================================================
   Depoimentos
   ============================================================ */

export async function salvarDepoimento(fd: FormData) {
  await exigirLogin();
  const id = texto(fd, 'id');
  const nota = inteiro(fd, 'nota');
  const dados = {
    nome: texto(fd, 'nome', 80),
    cidade: texto(fd, 'cidade', 80),
    tempo: texto(fd, 'tempo', 80),
    texto: texto(fd, 'texto', 400),
    avatar: texto(fd, 'avatar', 300),
    nota: Number.isInteger(nota) && nota >= 1 && nota <= 5 ? nota : 5,
    ordem: Number.isInteger(inteiro(fd, 'ordem')) ? inteiro(fd, 'ordem') : 0,
    ativo: fd.get('ativo') === 'on',
  };
  if (!dados.nome || !dados.texto) {
    voltar('/admin/depoimentos', 'Nome e depoimento são obrigatórios.', 'erro');
  }
  if (dados.avatar && !enderecoDeImagemValido(dados.avatar)) {
    voltar('/admin/depoimentos', 'Endereço da foto inválido. Envie a foto ou cole um link https.', 'erro');
  }

  if (id) await prisma.depoimento.update({ where: { id }, data: dados });
  else await prisma.depoimento.create({ data: dados });

  revalidatePath('/');
  voltar('/admin/depoimentos', id ? 'Depoimento atualizado.' : 'Depoimento criado.');
}

export async function excluirDepoimento(fd: FormData) {
  await exigirLogin();
  await prisma.depoimento.delete({ where: { id: texto(fd, 'id') } });
  revalidatePath('/');
  voltar('/admin/depoimentos', 'Depoimento excluído.');
}

/** Oculta de uma vez os depoimentos ficticios que vieram no seed. Oculta, nao
    apaga: se algum tiver sido aproveitado por engano, volta com um clique. */
export async function ocultarDepoimentosDeExemplo() {
  await exigirLogin();
  const r = await prisma.depoimento.updateMany({
    where: { ativo: true, avatar: { startsWith: PREFIXO_AVATAR_EXEMPLO } },
    data: { ativo: false },
  });
  revalidatePath('/');
  voltar('/admin/depoimentos', `${r.count} depoimento(s) de exemplo ocultado(s).`);
}

/* ============================================================
   Cupons de indicação
   ============================================================ */

export async function salvarCupom(fd: FormData) {
  await exigirLogin();
  const id = texto(fd, 'id');
  const r = validarCupom({
    codigo: texto(fd, 'codigo', 30),
    tipo: texto(fd, 'tipo', 20),
    valor: texto(fd, 'valor', 20),
    indicadorNome: texto(fd, 'indicadorNome', 120),
    indicadorEmail: texto(fd, 'indicadorEmail', 160),
    indicadorDocumento: texto(fd, 'indicadorDocumento', 20),
    indicadorTelefone: texto(fd, 'indicadorTelefone', 30),
    primeiraCompra: fd.get('primeiraCompra') === 'on',
    validoAte: texto(fd, 'validoAte', 10),
    ativo: fd.get('ativo') === 'on',
    observacao: texto(fd, 'observacao', 300),
  });
  if ('erro' in r) voltar('/admin/cupons', r.erro, 'erro');

  const codigo = r.codigo || (await codigoLivre(r.indicadorNome));
  try {
    if (id) await prisma.cupom.update({ where: { id }, data: { ...r, codigo } });
    else await prisma.cupom.create({ data: { ...r, codigo } });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      voltar('/admin/cupons', `O código ${codigo} já existe. Escolha outro ou deixe vazio para gerar.`, 'erro');
    }
    throw e;
  }
  voltar('/admin/cupons', id ? `Cupom ${codigo} atualizado.` : `Cupom ${codigo} criado.`);
}

export async function alternarCupom(fd: FormData) {
  await exigirLogin();
  const id = texto(fd, 'id');
  const c = await prisma.cupom.findUnique({ where: { id } });
  if (!c) voltar('/admin/cupons', 'Cupom não encontrado.', 'erro');
  await prisma.cupom.update({ where: { id }, data: { ativo: !c.ativo } });
  voltar('/admin/cupons', `Cupom ${c.codigo} ${c.ativo ? 'desativado' : 'ativado'}.`);
}

/** Cupom ja usado nao se apaga: o pedido guarda o codigo, mas o historico de
    quem indicou se perderia. Para tirar de circulacao, desative. */
export async function excluirCupom(fd: FormData) {
  await exigirLogin();
  const id = texto(fd, 'id');
  const usos = await prisma.pedido.count({ where: { cupomId: id } });
  if (usos > 0) voltar('/admin/cupons', 'Este cupom já foi usado. Desative em vez de excluir.', 'erro');
  const c = await prisma.cupom.delete({ where: { id } });
  voltar('/admin/cupons', `Cupom ${c.codigo} excluído.`);
}

/* ============================================================
   Usuários
   ============================================================ */

const USUARIOS = '/admin/usuarios';

function papelDoForm(fd: FormData): 'ADMIN' | 'EQUIPE' | null {
  const p = texto(fd, 'papel');
  return p === 'ADMIN' || p === 'EQUIPE' ? p : null;
}

/** Quem está logado agora, para as regras de "não mexa no próprio acesso". */
async function euMesmo(): Promise<string | null> {
  return (await sessaoAtual())?.usuarioId ?? null;
}

export async function criarUsuario(fd: FormData) {
  await exigirLogin();
  const nome = texto(fd, 'nome', 80);
  const login = normalizarLogin(fd.get('login'));
  const papel = papelDoForm(fd);
  const senha = String(fd.get('senha') ?? '');

  if (!nome) voltar(USUARIOS, 'Informe o nome.', 'erro');
  const erro = erroDeLogin(login) ?? erroDeSenha(senha, String(fd.get('confirmacao') ?? ''));
  if (erro) voltar(USUARIOS, erro, 'erro');
  if (!papel) voltar(USUARIOS, 'Escolha o tipo de acesso.', 'erro');

  try {
    await prisma.usuario.create({ data: { nome, login, papel, senhaHash: await gerarHash(senha) } });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      voltar(USUARIOS, `Já existe alguém com o usuário "${login}".`, 'erro');
    }
    throw e;
  }
  voltar(USUARIOS, `Acesso de ${nome} criado. Usuário: ${login}.`);
}

export async function alterarUsuario(fd: FormData) {
  await exigirLogin();
  const id = texto(fd, 'id');
  const nome = texto(fd, 'nome', 80);
  const papel = papelDoForm(fd);
  if (!nome || !papel) voltar(USUARIOS, 'Informe nome e tipo de acesso.', 'erro');

  const u = await prisma.usuario.findUnique({ where: { id } });
  if (!u) voltar(USUARIOS, 'Usuário não encontrado.', 'erro');
  const mudouPapel = u.papel !== papel;
  if (mudouPapel && id === (await euMesmo())) {
    voltar(USUARIOS, 'Você não pode mudar o seu próprio tipo de acesso. Peça a outro admin.', 'erro');
  }

  await prisma.usuario.update({
    where: { id },
    // Papel novo derruba as sessões abertas: quem virou equipe não pode seguir
    // no painel com o cookie de admin que já tinha.
    data: { nome, papel, ...(mudouPapel && { versaoSessao: { increment: 1 } }) },
  });
  voltar(USUARIOS, `${nome} atualizado.`);
}

export async function redefinirSenhaUsuario(fd: FormData) {
  await exigirLogin();
  const id = texto(fd, 'id');
  const senha = String(fd.get('senha') ?? '');
  const erro = erroDeSenha(senha, String(fd.get('confirmacao') ?? ''));
  if (erro) voltar(USUARIOS, erro, 'erro');

  const existe = await prisma.usuario.findUnique({ where: { id }, select: { id: true } });
  if (!existe) voltar(USUARIOS, 'Usuário não encontrado.', 'erro');

  // Senha nova encerra as sessões abertas com a antiga e destrava o login.
  const u = await prisma.usuario.update({
    where: { id },
    data: {
      senhaHash: await gerarHash(senha),
      versaoSessao: { increment: 1 },
      tentativasFalhas: 0,
      bloqueadoAte: null,
    },
  });

  // Quem trocou a própria senha continua logado neste aparelho; os outros caem.
  if (id === (await euMesmo())) await abrirSessao(papelDoUsuario(u.papel), u);
  voltar(USUARIOS, `Senha de ${u.nome} trocada. Os aparelhos que estavam conectados precisam entrar de novo.`);
}

export async function alternarUsuario(fd: FormData) {
  await exigirLogin();
  const id = texto(fd, 'id');
  if (id === (await euMesmo())) voltar(USUARIOS, 'Você não pode desativar o seu próprio acesso.', 'erro');

  const u = await prisma.usuario.findUnique({ where: { id } });
  if (!u) voltar(USUARIOS, 'Usuário não encontrado.', 'erro');
  await prisma.usuario.update({
    where: { id },
    data: u.ativo
      ? { ativo: false, versaoSessao: { increment: 1 } }
      : { ativo: true, tentativasFalhas: 0, bloqueadoAte: null },
  });
  voltar(USUARIOS, u.ativo ? `Acesso de ${u.nome} desativado. Ele sai na hora de todos os aparelhos.` : `Acesso de ${u.nome} reativado.`);
}

export async function encerrarSessoesUsuario(fd: FormData) {
  await exigirLogin();
  const id = texto(fd, 'id');
  if (id === (await euMesmo())) voltar(USUARIOS, 'Para sair deste aparelho, use o botão Sair.', 'erro');

  const u = await prisma.usuario.update({ where: { id }, data: { versaoSessao: { increment: 1 } } }).catch(() => null);
  if (!u) voltar(USUARIOS, 'Usuário não encontrado.', 'erro');
  voltar(USUARIOS, `${u.nome} foi desconectado de todos os aparelhos.`);
}

export async function excluirUsuario(fd: FormData) {
  await exigirLogin();
  const id = texto(fd, 'id');
  if (id === (await euMesmo())) voltar(USUARIOS, 'Você não pode excluir o seu próprio acesso.', 'erro');

  const u = await prisma.usuario.delete({ where: { id } }).catch(() => null);
  if (!u) voltar(USUARIOS, 'Usuário não encontrado.', 'erro');
  voltar(USUARIOS, `Acesso de ${u.nome} excluído.`);
}

/* ============================================================
   Configurações
   ============================================================ */

/**
 * Liga e desliga a venda da assinatura. Fica fora do formulário grande de
 * Configurações de propósito: é um botão só, e salvar o formulário inteiro
 * para mudar uma chave convidaria a mexer sem querer no frete e no contrato.
 */
export async function alternarAssinatura() {
  await exigirLogin();
  const atual = await prisma.config.findUnique({
    where: { id: 'config' },
    select: { assinaturaAtiva: true },
  });
  const novo = !(atual?.assinaturaAtiva ?? false);
  await prisma.config.upsert({
    where: { id: 'config' },
    update: { assinaturaAtiva: novo },
    create: { id: 'config', assinaturaAtiva: novo, avisos: [] },
  });
  // A home e o layout são estáticos por rota: sem revalidar, a mudança só
  // apareceria para quem chegasse depois do próximo build.
  revalidatePath('/', 'layout');
  voltar(
    '/admin/config',
    novo
      ? 'A assinatura passou a ser oferecida no site.'
      : 'A assinatura saiu do site. Quem já assina continua com a dela.'
  );
}

export async function salvarConfig(fd: FormData) {
  await exigirLogin();
  const freteValor = decimal(fd, 'freteValor');
  if (!Number.isFinite(freteValor) || freteValor < 0) {
    voltar('/admin/config', 'Frete padrão inválido. Use o formato 24,90.', 'erro');
  }

  // Dimensões da caixa: o Melhor Envio recusa qualquer lado menor que 1 cm.
  const caixaAlturaCm = inteiro(fd, 'caixaAlturaCm');
  const caixaLarguraCm = inteiro(fd, 'caixaLarguraCm');
  const caixaComprimentoCm = inteiro(fd, 'caixaComprimentoCm');
  if (
    [caixaAlturaCm, caixaLarguraCm, caixaComprimentoCm].some((v) => !Number.isFinite(v) || v < 1)
  ) {
    voltar('/admin/config', 'Medidas da caixa inválidas (mínimo 1 cm por lado).', 'erro');
  }

  await prisma.config.upsert({
    where: { id: 'config' },
    update: {
      freteValor: new Prisma.Decimal(freteValor.toFixed(2)),
      avisos: texto(fd, 'avisos', 1000).split('\n').map((l) => l.trim()).filter(Boolean),
      whatsapp: texto(fd, 'whatsapp', 40),
      email: texto(fd, 'email', 120),
      instagram: texto(fd, 'instagram', 60),
      cnpj: texto(fd, 'cnpj', 30),
      cidadeFreteGratis: texto(fd, 'cidadeFreteGratis', 80) || 'João Pessoa',
      ufFreteGratis: texto(fd, 'ufFreteGratis', 2).toUpperCase() || 'PB',
      cepOrigem: texto(fd, 'cepOrigem', 12),
      pesoPadraoKit: new Prisma.Decimal((decimal(fd, 'pesoPadraoKit') || 0.7).toFixed(3)),
      caixaAlturaCm,
      caixaLarguraCm,
      caixaComprimentoCm,
      metaPixelId: texto(fd, 'metaPixelId', 40).replace(/\D/g, ''),
      contratoVersao: texto(fd, 'contratoVersao', 20) || 'v1',
      contratoTexto: texto(fd, 'contratoTexto', 20000),
    },
    create: {
      id: 'config',
      freteValor: new Prisma.Decimal(freteValor.toFixed(2)),
      avisos: texto(fd, 'avisos', 1000).split('\n').map((l) => l.trim()).filter(Boolean),
    },
  });

  revalidatePath('/');
  voltar('/admin/config', 'Configurações salvas.');
}

/* ============================================================
   Entregas
   ============================================================ */

/**
 * A fila de entrega começa em PAGO, nunca em AGUARDANDO_PAGAMENTO.
 * Separar e despachar antes de o dinheiro entrar é como a loja perde
 * mercadoria — a regra fica no código, não na memória de quem opera.
 */
export async function marcarSeparado(fd: FormData) {
  await exigirLogin();
  const id = texto(fd, 'id');
  const pedido = await prisma.pedido.findUnique({ where: { id } });
  if (!pedido) voltar('/admin/entregas', 'Pedido não encontrado.', 'erro');
  if (pedido.status === 'AGUARDANDO_PAGAMENTO') {
    voltar('/admin/entregas', `O pedido #${pedido.numero} ainda não foi pago.`, 'erro');
  }
  if (pedido.status === 'CANCELADO') {
    voltar('/admin/entregas', `O pedido #${pedido.numero} está cancelado.`, 'erro');
  }

  await prisma.pedido.update({
    where: { id },
    data: { status: 'EM_SEPARACAO', separadoEm: new Date() },
  });
  voltar('/admin/entregas', `Pedido #${pedido.numero} em separação.`);
}

export async function marcarEnviado(fd: FormData) {
  await exigirLogin();
  const id = texto(fd, 'id');
  const transportadora = texto(fd, 'transportadora', 60);
  const codigoRastreio = texto(fd, 'codigoRastreio', 60);

  const pedido = await prisma.pedido.findUnique({ where: { id } });
  if (!pedido) voltar('/admin/entregas', 'Pedido não encontrado.', 'erro');
  if (pedido.status === 'AGUARDANDO_PAGAMENTO' || pedido.status === 'CANCELADO') {
    voltar('/admin/entregas', `O pedido #${pedido.numero} não pode ser enviado agora.`, 'erro');
  }
  if (!codigoRastreio) {
    voltar('/admin/entregas', 'Informe o código de rastreio antes de marcar como enviado.', 'erro');
  }

  await prisma.pedido.update({
    where: { id },
    data: {
      status: 'ENVIADO',
      enviadoEm: new Date(),
      transportadora: transportadora || null,
      codigoRastreio,
    },
  });
  voltar('/admin/entregas', `Pedido #${pedido.numero} marcado como enviado.`);
}

export async function marcarEntregue(fd: FormData) {
  await exigirLogin();
  const id = texto(fd, 'id');
  const pedido = await prisma.pedido.findUnique({ where: { id } });
  if (!pedido) voltar('/admin/entregas', 'Pedido não encontrado.', 'erro');

  await prisma.pedido.update({
    where: { id },
    data: { status: 'ENTREGUE', entregueEm: new Date() },
  });
  voltar('/admin/entregas', `Pedido #${pedido.numero} entregue.`);
}

export async function salvarRastreio(fd: FormData) {
  await exigirLogin();
  const id = texto(fd, 'id');
  await prisma.pedido.update({
    where: { id },
    data: {
      transportadora: texto(fd, 'transportadora', 60) || null,
      codigoRastreio: texto(fd, 'codigoRastreio', 60) || null,
    },
  });
  voltar('/admin/entregas', 'Rastreio atualizado.');
}

/* ============================================================
   Afiliados
   ============================================================ */

export async function salvarAfiliado(fd: FormData) {
  await exigirLogin();
  const id = texto(fd, 'id');
  const nome = texto(fd, 'nome', 120);
  const codigoBruto = texto(fd, 'codigo', 40).toUpperCase().replace(/[^A-Z0-9]/g, '');
  const percentual = decimal(fd, 'percentual');

  if (!nome) voltar('/admin/afiliados', 'Informe o nome do afiliado.', 'erro');
  if (!codigoBruto) voltar('/admin/afiliados', 'Informe um código com letras e números.', 'erro');
  if (!Number.isFinite(percentual) || percentual < 0 || percentual > 100) {
    voltar('/admin/afiliados', 'Percentual precisa ficar entre 0 e 100.', 'erro');
  }

  const dados = {
    nome,
    codigo: codigoBruto,
    email: texto(fd, 'email', 120),
    telefone: texto(fd, 'telefone', 20),
    instagram: texto(fd, 'instagram', 60),
    documento: texto(fd, 'documento', 20),
    chavePix: texto(fd, 'chavePix', 120),
    percentual: new Prisma.Decimal(percentual.toFixed(2)),
    recorrente: fd.get('recorrente') === 'on',
    ativo: fd.get('ativo') === 'on',
  };

  try {
    if (id) await prisma.afiliado.update({ where: { id }, data: dados });
    else await prisma.afiliado.create({ data: dados });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      voltar('/admin/afiliados', `O código ${codigoBruto} já está em uso.`, 'erro');
    }
    throw e;
  }

  voltar('/admin/afiliados', id ? 'Afiliado atualizado.' : `Afiliado criado. Link: ?ref=${codigoBruto}`);
}

export async function pagarComissoes(fd: FormData) {
  await exigirLogin();
  const afiliadoId = texto(fd, 'afiliadoId');

  // Só APROVADA vira paga. PENDENTE é venda cujo pagamento ainda não entrou —
  // pagar comissão antes de receber é adiantar dinheiro que pode não vir.
  const r = await prisma.comissao.updateMany({
    where: { afiliadoId, status: 'APROVADA' },
    data: { status: 'PAGA', pagoEm: new Date() },
  });

  voltar(
    '/admin/afiliados',
    r.count ? `${r.count} comissão(ões) marcada(s) como paga(s).` : 'Nenhuma comissão aprovada para pagar.',
    r.count ? 'ok' : 'erro'
  );
}

/* ============================================================
   Leads — quem não finalizou a compra
   ============================================================ */

export async function marcarLeadContatado(fd: FormData) {
  await exigirLogin();
  const id = texto(fd, 'id');
  await prisma.lead.update({
    where: { id },
    data: { contatado: true, contatadoEm: new Date(), anotacao: texto(fd, 'anotacao', 300) || null },
  });
  voltar('/admin/leads', 'Lead marcado como contatado.');
}

export async function excluirLead(fd: FormData) {
  await exigirLogin();
  await prisma.lead.delete({ where: { id: texto(fd, 'id') } });
  voltar('/admin/leads', 'Lead excluído.');
}

/* ============================================================
   Vendas da loja (PDV)
   ============================================================ */

/**
 * Preenche ou corrige o código do comprovante da maquininha numa venda que já
 * foi registrada. Existe porque no balcão, com cliente esperando, o número é
 * justamente o que se pula — e sem ele não dá para casar a venda com a linha
 * do extrato da PagBank.
 */
export async function salvarCodigoMaquineta(fd: FormData) {
  await exigirLogin();
  const id = texto(fd, 'id');
  const venda = await prisma.vendaLoja.findUnique({ where: { id } });
  if (!venda) voltar('/admin/vendas', 'Venda não encontrada.', 'erro');
  if (!ehCartao(venda.formaPagamento as FormaPagamento)) {
    voltar('/admin/vendas', 'Só venda no cartão tem comprovante de maquininha.', 'erro');
  }

  const codigo = normalizarCodigoMaquineta(fd.get('codigoMaquineta'));
  await prisma.vendaLoja.update({ where: { id }, data: { codigoMaquineta: codigo } });
  voltar(
    '/admin/vendas',
    codigo ? `Venda #${venda.numero}: comprovante ${codigo}.` : `Venda #${venda.numero}: comprovante apagado.`
  );
}

export async function cancelarVendaAdmin(fd: FormData) {
  await exigirLogin();
  const id = texto(fd, 'id');
  const venda = await prisma.vendaLoja.findUnique({ where: { id }, include: { itens: true } });
  if (!venda) voltar('/admin/vendas', 'Venda não encontrada.', 'erro');
  if (venda.cancelada) voltar('/admin/vendas', 'Essa venda já estava cancelada.', 'erro');

  await prisma.$transaction(async (tx) => {
    await devolverEstoque(
      tx,
      venda.itens.filter((i) => i.kitId).map((i) => ({ kitId: i.kitId!, qtd: i.qtd })),
      `Cancelamento da venda #${venda.numero}`
    );
    await tx.vendaLoja.update({
      where: { id },
      data: {
        cancelada: true,
        canceladaEm: new Date(),
        motivoCancelamento: texto(fd, 'motivo', 200) || 'Cancelada pelo admin',
      },
    });
  });

  revalidatePath('/');
  revalidatePath('/catalogo');
  voltar('/admin/vendas', `Venda #${venda.numero} cancelada e estoque devolvido.`);
}
