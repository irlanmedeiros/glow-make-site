import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { baixarEstoque, EstoqueInsuficiente } from '@/lib/estoque';
import { asaasConfigurado, criarOuBuscarCliente, criarCobranca } from '@/lib/asaas';
import { validarCliente, type DadosCliente } from '@/lib/validacao';
import { calcularFrete } from '@/lib/frete';
import { afiliadoPorCodigo, gerarComissaoPedido } from '@/lib/afiliado';
import { marcarConvertido } from '@/lib/lead';
import { num } from '@/lib/format';

export const runtime = 'nodejs';

type Corpo = {
  cliente?: Partial<DadosCliente> & { pagamento?: string };
  itens?: { kitId?: string; qtd?: number }[];
  freteServico?: string;
  ref?: string;
};

export async function POST(req: Request) {
  let corpo: Corpo;
  try {
    corpo = await req.json();
  } catch {
    return NextResponse.json({ erro: 'Requisição inválida.' }, { status: 400 });
  }

  const cliente = validarCliente(corpo.cliente);
  if ('erro' in cliente) return NextResponse.json({ erro: cliente.erro }, { status: 400 });

  const pedidos = (corpo.itens ?? []).filter(
    (i): i is { kitId: string; qtd: number } =>
      typeof i.kitId === 'string' && Number.isInteger(i.qtd) && (i.qtd as number) > 0
  );
  if (!pedidos.length) {
    return NextResponse.json({ erro: 'Seu carrinho está vazio.' }, { status: 400 });
  }
  if (pedidos.length > 20) {
    return NextResponse.json({ erro: 'Pedido com itens demais.' }, { status: 400 });
  }

  // Os preços vêm SEMPRE do banco. Se viessem do navegador, bastaria editar o
  // JSON no DevTools para comprar o Kit Deluxe por um real.
  const kits = await prisma.kit.findMany({
    where: { id: { in: pedidos.map((p) => p.kitId) }, ativo: true, tipo: 'KIT' },
  });
  if (kits.length !== pedidos.length) {
    return NextResponse.json(
      { erro: 'Algum kit do carrinho saiu do catálogo. Atualize a página.' },
      { status: 409 }
    );
  }

  const config = await prisma.config.findUnique({ where: { id: 'config' } });

  const linhas = pedidos.map((p) => {
    const kit = kits.find((k) => k.id === p.kitId)!;
    return { kit, qtd: p.qtd, valor: kit.preco.mul(p.qtd) };
  });

  const subtotal = linhas.reduce((s, l) => s.add(l.valor), new Prisma.Decimal(0));

  /* O frete é RECALCULADO aqui, mesmo que o navegador já tenha mostrado o
     valor. O que vem do cliente é só qual serviço ele escolheu — o preço vem
     da cotação feita agora. Aceitar o valor enviado pelo navegador é o mesmo
     que deixar escolher quanto pagar de frete. */
  const totalPecas = pedidos.reduce((s, p) => s + p.qtd, 0);
  const cotacao = await calcularFrete({
    cepDestino: cliente.cep,
    cepOrigem: config?.cepOrigem ?? '58000-000',
    pesoKg: num(config?.pesoPadraoKit ?? 0.7) * totalPecas,
    valorSegurado: Number(subtotal.toString()),
    cidadeGratis: config?.cidadeFreteGratis ?? 'João Pessoa',
    ufGratis: config?.ufFreteGratis ?? 'PB',
    caixa: {
      alturaCm: config?.caixaAlturaCm ?? 11,
      larguraCm: config?.caixaLarguraCm ?? 20,
      comprimentoCm: config?.caixaComprimentoCm ?? 25,
    },
  });

  const escolhida =
    cotacao.opcoes.find((o) => o.servico === corpo.freteServico) ?? cotacao.opcoes[0];

  /* Sem cotação (transportadora fora do ar, CEP sem cobertura) o pedido entra
     com frete zero e uma observação. Perder a venda porque a API de terceiro
     caiu seria pior do que combinar o frete depois por WhatsApp. */
  const frete = escolhida ? new Prisma.Decimal(escolhida.valor.toFixed(2)) : new Prisma.Decimal(0);
  const freteServico = escolhida?.servico ?? 'A combinar';
  const total = subtotal.add(frete);

  const afiliado = await afiliadoPorCodigo(corpo.ref);

  try {
    const pedido = await prisma.$transaction(async (tx) => {
      await baixarEstoque(
        tx,
        pedidos.map((p) => ({ kitId: p.kitId, qtd: p.qtd })),
        `Pedido de ${cliente.nome}`
      );

      return tx.pedido.create({
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
          subtotal,
          frete,
          total,
          freteServico,
          afiliadoId: afiliado?.id ?? null,
          observacao: escolhida ? null : cotacao.aviso ?? 'Frete a combinar com o cliente.',
          pagamento: cliente.pagamento,
          itens: {
            create: linhas.map((l) => ({
              kitId: l.kit.id,
              sku: l.kit.sku,
              nome: l.kit.nome,
              preco: l.kit.preco,
              qtd: l.qtd,
            })),
          },
        },
        include: { itens: true },
      });
    });

    // A comissão nasce PENDENTE e só é aprovada quando o pagamento entra.
    await gerarComissaoPedido(pedido);
    await marcarConvertido(cliente.email);

    // Sem Asaas configurado o pedido existe e o estoque já baixou — só não há
    // cobrança. É o modo de demonstração.
    if (!asaasConfigurado()) {
      return NextResponse.json({ ok: true, demo: true, pedido: pedido.numero });
    }

    try {
      const customerId = await criarOuBuscarCliente(cliente);
      const cobranca = await criarCobranca({
        customerId,
        valor: Number(total.toString()),
        descricao: `Pedido #${pedido.numero} — Glow Make`,
        formaPagamento: cliente.pagamento,
        referenciaExterna: pedido.id,
      });
      await prisma.pedido.update({
        where: { id: pedido.id },
        data: { asaasPaymentId: cobranca.id, invoiceUrl: cobranca.invoiceUrl },
      });
      return NextResponse.json({ ok: true, invoiceUrl: cobranca.invoiceUrl, pedido: pedido.numero });
    } catch (e) {
      // O pedido ficou registrado com o estoque reservado; só a cobrança falhou.
      // Deixamos o rastro no pedido para o admin resolver em vez de sumir com ele.
      const msg = e instanceof Error ? e.message : 'erro desconhecido';
      console.error('[checkout] Asaas falhou:', msg);
      await prisma.pedido.update({
        where: { id: pedido.id },
        data: { observacao: `Falha ao gerar cobrança no Asaas: ${msg}` },
      });
      return NextResponse.json({
        ok: true,
        demo: true,
        pedido: pedido.numero,
        aviso: 'Pedido registrado, mas a cobrança não foi gerada. Entraremos em contato.',
      });
    }
  } catch (e) {
    if (e instanceof EstoqueInsuficiente) {
      return NextResponse.json({ erro: e.message }, { status: 409 });
    }
    console.error('[checkout]', e);
    return NextResponse.json({ erro: 'Não consegui concluir o pedido.' }, { status: 500 });
  }
}
