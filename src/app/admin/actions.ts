'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { abrirSessao, ehAdmin, fecharSessao, papelDaSenha, senhaAdminConfigurada, senhaEquipeConfigurada } from '@/lib/auth';
import { devolverEstoque } from '@/lib/estoque';
import { cancelarAssinatura as cancelarNoAsaas, asaasConfigurado } from '@/lib/asaas';

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
 * Um formulário só para os dois papéis: a senha digitada é que decide se a
 * pessoa cai no painel completo ou no catálogo da loja.
 */
export async function entrar(_estado: unknown, fd: FormData) {
  if (!senhaAdminConfigurada() && !senhaEquipeConfigurada()) {
    return { erro: 'Nenhuma senha configurada no servidor (ADMIN_PASSWORD ou EQUIPE_PASSWORD).' };
  }

  const papel = papelDaSenha(String(fd.get('senha') ?? ''));
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
  if (!Number.isFinite(preco) || preco <= 0) {
    voltar('/admin/kits', 'Preço inválido. Use o formato 129,90.', 'erro');
  }

  const dados = {
    nome,
    sku,
    descricao,
    itens,
    preco: new Prisma.Decimal(preco.toFixed(2)),
    imagem: imagem || '/assets/kits/kit-1.jpg',
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

  const pedido = await prisma.pedido.findUnique({ where: { id }, include: { itens: true } });
  if (!pedido) voltar('/admin/pedidos', 'Pedido não encontrado.', 'erro');
  if (pedido.status === novo) voltar('/admin/pedidos', 'O pedido já está nesse status.', 'erro');

  // Cancelar devolve as unidades ao estoque — mas só uma vez, mesmo que o
  // pedido seja cancelado, reaberto e cancelado de novo.
  if (novo === 'CANCELADO' && !pedido.estoqueDevolvido) {
    await prisma.$transaction(async (tx) => {
      await devolverEstoque(
        tx,
        pedido.itens.filter((i) => i.kitId).map((i) => ({ kitId: i.kitId!, qtd: i.qtd })),
        `Cancelamento do pedido #${pedido.numero}`
      );
      await tx.pedido.update({
        where: { id },
        data: { status: novo, estoqueDevolvido: true },
      });
    });
    revalidatePath('/');
    voltar('/admin/pedidos', `Pedido #${pedido.numero} cancelado e estoque devolvido.`);
  }

  await prisma.pedido.update({ where: { id }, data: { status: novo } });
  voltar('/admin/pedidos', `Pedido #${pedido.numero} atualizado.`);
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
      data: { status: 'CANCELADA', canceladaEm: new Date() },
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
    data: { status: 'ATIVA', canceladaEm: null },
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

/* ============================================================
   Configurações
   ============================================================ */

export async function salvarConfig(fd: FormData) {
  await exigirLogin();
  const freteValor = decimal(fd, 'freteValor');
  const freteGratisAcima = decimal(fd, 'freteGratisAcima');
  if (!Number.isFinite(freteValor) || freteValor < 0) {
    voltar('/admin/config', 'Valor do frete inválido.', 'erro');
  }
  if (!Number.isFinite(freteGratisAcima) || freteGratisAcima < 0) {
    voltar('/admin/config', 'Limite do frete grátis inválido.', 'erro');
  }

  await prisma.config.upsert({
    where: { id: 'config' },
    update: {
      freteValor: new Prisma.Decimal(freteValor.toFixed(2)),
      freteGratisAcima: new Prisma.Decimal(freteGratisAcima.toFixed(2)),
      avisos: texto(fd, 'avisos', 1000).split('\n').map((l) => l.trim()).filter(Boolean),
      whatsapp: texto(fd, 'whatsapp', 40),
      email: texto(fd, 'email', 120),
      instagram: texto(fd, 'instagram', 60),
      cnpj: texto(fd, 'cnpj', 30),
    },
    create: {
      id: 'config',
      freteValor: new Prisma.Decimal(freteValor.toFixed(2)),
      freteGratisAcima: new Prisma.Decimal(freteGratisAcima.toFixed(2)),
      avisos: texto(fd, 'avisos', 1000).split('\n').map((l) => l.trim()).filter(Boolean),
    },
  });

  revalidatePath('/');
  voltar('/admin/config', 'Configurações salvas.');
}
