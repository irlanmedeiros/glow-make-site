import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { baixarEstoque, EstoqueInsuficiente } from '@/lib/estoque';
import { asaasConfigurado, criarOuBuscarCliente, criarAssinatura } from '@/lib/asaas';
import { validarCliente } from '@/lib/validacao';
import { afiliadoPorCodigo, gerarComissaoAssinatura } from '@/lib/afiliado';
import { marcarConvertido } from '@/lib/lead';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  let corpo: { cliente?: unknown; aceitouContrato?: boolean; ref?: string };
  try {
    corpo = await req.json();
  } catch {
    return NextResponse.json({ erro: 'Requisição inválida.' }, { status: 400 });
  }

  const cliente = validarCliente(corpo.cliente);
  if ('erro' in cliente) return NextResponse.json({ erro: cliente.erro }, { status: 400 });

  /* O aceite do contrato é conferido no SERVIDOR. Se dependesse só do
     checkbox da tela, bastaria remover o atributo no DevTools para assinar
     sem aceitar nada — e um contrato que dá para pular não vale como prova. */
  if (corpo.aceitouContrato !== true) {
    return NextResponse.json(
      { erro: 'É preciso ler e aceitar o contrato para assinar.' },
      { status: 400 }
    );
  }

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

  const config = await prisma.config.findUnique({ where: { id: 'config' } });
  const afiliado = await afiliadoPorCodigo(corpo.ref);

  // Guardar de onde veio o aceite: um aceite sem data e origem não serve de
  // prova se a assinatura for contestada depois.
  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    req.headers.get('x-real-ip') ??
    null;

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
          endereco: cliente.endereco,
          enderecoNumero: cliente.enderecoNumero,
          complemento: cliente.complemento,
          bairro: cliente.bairro,
          cidade: cliente.cidade,
          uf: cliente.uf,
          contratoVersao: config?.contratoVersao ?? 'v1',
          contratoAceitoEm: new Date(),
          contratoIp: ip,
          afiliadoId: afiliado?.id ?? null,
          valor: box.preco,
        },
      });
    });

    await gerarComissaoAssinatura(assinante);
    await marcarConvertido(cliente.email);

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
