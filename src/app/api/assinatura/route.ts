import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { baixarEstoque, EstoqueInsuficiente } from '@/lib/estoque';
import { asaasConfigurado, criarOuBuscarCliente, criarAssinatura } from '@/lib/asaas';
import { validarCliente } from '@/lib/validacao';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  let corpo: { cliente?: unknown };
  try {
    corpo = await req.json();
  } catch {
    return NextResponse.json({ erro: 'Requisição inválida.' }, { status: 400 });
  }

  const cliente = validarCliente(corpo.cliente);
  if ('erro' in cliente) return NextResponse.json({ erro: cliente.erro }, { status: 400 });

  const box = await prisma.kit.findFirst({ where: { tipo: 'BOX' } });
  if (!box) {
    return NextResponse.json({ erro: 'A assinatura não está disponível.' }, { status: 404 });
  }

  const jaAssina = await prisma.assinante.findFirst({
    where: {
      email: cliente.email,
      status: { in: ['ATIVA', 'AGUARDANDO_PAGAMENTO'] },
    },
  });
  if (jaAssina) {
    return NextResponse.json(
      { erro: 'Já existe uma assinatura ativa para esse e-mail.' },
      { status: 409 }
    );
  }

  try {
    // Cada assinatura reserva uma caixa da edição do mês.
    const assinante = await prisma.$transaction(async (tx) => {
      await baixarEstoque(tx, [{ kitId: box.id, qtd: 1 }], `Assinatura de ${cliente.nome}`);
      return tx.assinante.create({
        data: {
          nome: cliente.nome,
          email: cliente.email,
          documento: cliente.documento,
          telefone: cliente.telefone,
          cep: cliente.cep,
          valor: box.preco,
        },
      });
    });

    if (!asaasConfigurado()) {
      return NextResponse.json({ ok: true, demo: true });
    }

    try {
      const customerId = await criarOuBuscarCliente(cliente);
      const assinatura = await criarAssinatura({
        customerId,
        valor: Number(box.preco.toString()),
        descricao: 'Assinatura Glow Box Mensal',
        formaPagamento: cliente.pagamento,
        referenciaExterna: assinante.id,
      });

      await prisma.assinante.update({
        where: { id: assinante.id },
        data: {
          asaasCustomerId: customerId,
          asaasSubscriptionId: assinatura.id,
          invoiceUrl: assinatura.invoiceUrl,
        },
      });

      return NextResponse.json({ ok: true, invoiceUrl: assinatura.invoiceUrl });
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'erro desconhecido';
      console.error('[assinatura] Asaas falhou:', msg);
      return NextResponse.json({
        ok: true,
        demo: true,
        aviso: 'Assinatura registrada, mas a cobrança não foi gerada. Entraremos em contato.',
      });
    }
  } catch (e) {
    if (e instanceof EstoqueInsuficiente) {
      return NextResponse.json(
        { erro: 'As vagas desta edição acabaram. Entre na lista de espera.' },
        { status: 409 }
      );
    }
    console.error('[assinatura]', e);
    return NextResponse.json({ erro: 'Não consegui concluir a assinatura.' }, { status: 500 });
  }
}
