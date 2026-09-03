import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Termos de Uso — Glow Make',
  description: 'Regras de uso do site e das compras na Glow Make.',
};

/**
 * Antes, o link "Termos" no rodapé apontava para /privacidade — não existia
 * página de termos. Este texto é um rascunho para o link parar de mentir, no
 * mesmo padrão da política de privacidade e do contrato da assinatura: base
 * para operar, com aviso de que falta revisão jurídica.
 *
 * O contrato da assinatura (mostrado na etapa de aceite, gravado com versão,
 * data e IP) é o documento que rege a recorrência. Havendo conflito, ele
 * prevalece sobre estes termos gerais.
 */
export default async function Termos() {
  const config = await prisma.config.findUnique({ where: { id: 'config' } });
  const email = config?.email || 'contato@glowmake.com.br';
  const cnpj = config?.cnpj || '';
  const cidadeGratis = config?.cidadeFreteGratis || 'João Pessoa';
  const ufGratis = config?.ufFreteGratis || 'PB';

  return (
    <div className="legal">
      <div className="legal-topo">
        <a href="/" className="logo">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/assets/logo.png" alt="Glow Make" />
        </a>
        <a className="btn btn-ghost btn-sm" href="/">
          Voltar à loja
        </a>
      </div>

      <article className="legal-corpo">
        <h1>Termos de Uso</h1>
        <p className="legal-data">
          Última atualização: {new Date().toLocaleDateString('pt-BR')}
        </p>

        <div className="note alerta">
          <b>Rascunho.</b> Este texto foi escrito como base para o site funcionar e{' '}
          <b>não passou por revisão jurídica</b>. Peça ao seu advogado para revisar antes de operar
          com clientes reais.
        </div>

        <h2>1. Aceitação</h2>
        <p>
          Ao navegar neste site, fazer um pedido ou assinar a Glow Box, você concorda com estes
          Termos de Uso. Se não concordar, não utilize o site.
        </p>

        <h2>2. Quem opera a loja</h2>
        <p>
          A Glow Make{cnpj ? `, inscrita no CNPJ ${cnpj},` : ''} monta e revende kits de presente,
          com loja física em {cidadeGratis}/{ufGratis} e vendas por este site. Contato:{' '}
          <a href={`mailto:${email}`}>{email}</a>.
        </p>

        <h2>3. O que é vendido</h2>
        <p>
          A loja vende <b>kits de presente montados</b> e a <b>assinatura mensal Glow Box</b>. Não
          vendemos itens avulsos. As fotos e descrições são ilustrativas; a composição de cada kit é
          a listada na página do produto no momento da compra.
        </p>

        <h2>4. Preços e pagamento</h2>
        <p>
          O preço válido é o exibido no site no momento em que o pedido é finalizado. O valor total,
          incluindo frete e eventuais descontos, é sempre recalculado pelo servidor na conclusão do
          pedido — o que o navegador exibe antes é apenas uma estimativa.
        </p>
        <p>
          Os pagamentos são processados pela <b>Asaas</b> (PIX, boleto ou cartão, com parcelamento
          quando disponível). O pedido é confirmado após a aprovação do pagamento. Pedidos não pagos
          podem ser cancelados automaticamente, e o estoque reservado, liberado.
        </p>

        <h2>5. Assinatura Glow Box</h2>
        <p>
          A Glow Box é uma cobrança recorrente mensal. Antes da primeira cobrança, você lê e aceita
          um <b>contrato específico</b>, cuja versão, data e IP do aceite ficam registrados. Esse
          contrato rege a assinatura e <b>prevalece sobre estes termos</b> no que for específico da
          recorrência (valor, ciclo, cancelamento).
        </p>
        <p>
          O cancelamento pode ser solicitado a qualquer momento pelo e-mail acima e encerra as
          cobranças seguintes; a edição já paga do mês é enviada normalmente.
        </p>

        <h2>6. Entrega e frete</h2>
        <p>
          A entrega em {cidadeGratis}/{ufGratis} é <b>grátis</b> — a checagem é feita pelo nome da
          cidade correspondente ao CEP informado. Para as demais localidades, o frete é cotado no
          momento do pedido pelo peso e pelo destino, por meio do Melhor Envio e das
          transportadoras. Os prazos são estimados pela transportadora e contados a partir da
          postagem.
        </p>
        <p>
          É responsabilidade do cliente informar endereço e CEP corretos. Reenvios motivados por
          endereço incorreto podem gerar novo custo de frete.
        </p>

        <h2>7. Trocas, devoluções e arrependimento</h2>
        <p>
          <b>Arrependimento.</b> Em compras pelo site, você pode desistir em até <b>7 dias corridos</b>{' '}
          após receber o produto, nos termos do art. 49 do Código de Defesa do Consumidor, com
          devolução do valor pago. O produto deve ser devolvido sem indício de uso, com a embalagem.
        </p>
        <p>
          <b>Defeito.</b> Produtos com defeito podem ser trocados dentro do prazo legal de garantia.
          Entre em contato pelo e-mail acima com o número do pedido e fotos do problema.
        </p>
        <p>
          Por serem itens de higiene e cuidado pessoal, produtos abertos ou usados sem defeito não
          são trocados por motivo de preferência.
        </p>

        <h2>8. Uso do site</h2>
        <p>
          Você concorda em não tentar burlar preços, cupons, estoque ou o processo de pagamento, não
          fazer coleta automatizada de dados (scraping) e não interferir no funcionamento do site.
          Contas e pedidos suspeitos de fraude podem ser cancelados.
        </p>

        <h2>9. Propriedade intelectual</h2>
        <p>
          A marca, os textos, o layout e as imagens de autoria da loja pertencem à Glow Make e não
          podem ser reproduzidos sem autorização. Imagens de bancos de terceiros seguem as licenças
          dos respectivos autores.
        </p>

        <h2>10. Limitação de responsabilidade</h2>
        <p>
          O site é oferecido no estado em que se encontra. Não respondemos por indisponibilidades
          temporárias, por erros evidentes de digitação em preço ou descrição — casos em que o
          pedido pode ser cancelado com devolução integral — nem por atrasos causados pelas
          transportadoras ou pelo provedor de pagamento.
        </p>

        <h2>11. Privacidade</h2>
        <p>
          O tratamento de dados pessoais está descrito na{' '}
          <a href="/privacidade">Política de Privacidade</a>, que integra estes Termos.
        </p>

        <h2>12. Alterações</h2>
        <p>
          Estes Termos podem ser atualizados. A versão vigente é sempre a publicada nesta página,
          com a data de atualização acima.
        </p>

        <h2>13. Lei aplicável e foro</h2>
        <p>
          Aplica-se a lei brasileira. Fica eleito o foro da comarca de {cidadeGratis}/{ufGratis}{' '}
          para dirimir questões destes Termos, sem prejuízo do foro do domicílio do consumidor
          quando a lei assim garantir.
        </p>

        <div className="legal-rodape">
          <a className="btn btn-primary" href="/">
            Voltar à loja
          </a>
        </div>
      </article>
    </div>
  );
}
