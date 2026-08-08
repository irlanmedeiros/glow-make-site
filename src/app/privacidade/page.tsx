import { prisma } from '@/lib/prisma';
import RevogarConsentimento from '@/components/RevogarConsentimento';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Política de Privacidade — Glow Make',
  description: 'Como a Glow Make trata os dados pessoais de quem usa o site.',
};

/**
 * O detalhe que saiu do banner mora aqui.
 *
 * Encurtar o aviso na tela é legítimo; o que não pode é a informação sumir.
 * A LGPD aceita consentimento colhido num banner curto desde que a finalidade
 * completa esteja acessível — e é esta página que sustenta aquele banner.
 */
export default async function Privacidade() {
  const config = await prisma.config.findUnique({ where: { id: 'config' } });
  const email = config?.email || 'contato@glowmake.com.br';
  const cnpj = config?.cnpj || '';

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
        <h1>Política de Privacidade</h1>
        <p className="legal-data">
          Última atualização: {new Date().toLocaleDateString('pt-BR')}
        </p>

        <div className="note alerta">
          <b>Rascunho.</b> Este texto foi escrito como base para o site funcionar e{' '}
          <b>não passou por revisão jurídica</b>. Peça ao seu advogado para revisar antes de operar
          com clientes reais.
        </div>

        <h2>1. Quem trata seus dados</h2>
        <p>
          A Glow Make{cnpj ? `, inscrita no CNPJ ${cnpj},` : ''} é a controladora dos dados pessoais
          coletados neste site, nos termos da Lei 13.709/2018 (LGPD). Para qualquer assunto
          relacionado a esta política, escreva para <a href={`mailto:${email}`}>{email}</a>.
        </p>

        <h2>2. Quais dados coletamos</h2>
        <p>
          <b>Dados que você informa.</b> Nome, e-mail, CPF ou CNPJ, telefone e endereço completo,
          quando você faz um pedido ou assina a Glow Box. Sem eles não é possível cobrar nem
          entregar.
        </p>
        <p>
          <b>Dados de navegação.</b> Páginas visitadas, produtos vistos, origem do acesso e
          informações técnicas do dispositivo, coletados por cookies quando você aceita.
        </p>
        <p>
          <b>Contato iniciado e não concluído.</b> Se você preencher seu e-mail no checkout e não
          finalizar a compra, guardamos esse contato junto com o que estava no carrinho, para
          entender o que travou a venda e, havendo sua autorização expressa, retomar o contato.
        </p>

        <h2>3. Para que usamos</h2>
        <ul>
          <li>Processar pagamentos, emitir cobranças e entregar seus pedidos.</li>
          <li>Dar suporte e responder ao que você pedir.</li>
          <li>Entender como o site é usado e melhorar a loja.</li>
          <li>
            Mostrar nossos anúncios em outras plataformas e enviar novidades e ofertas —{' '}
            <b>somente com o seu consentimento</b>, que pode ser retirado a qualquer momento.
          </li>
          <li>Cumprir obrigações legais, fiscais e contábeis.</li>
        </ul>

        <h2>4. Com base em quê</h2>
        <p>
          Execução de contrato (art. 7º, V) para processar e entregar pedidos; cumprimento de
          obrigação legal (art. 7º, II) para guarda fiscal; consentimento (art. 7º, I) para cookies
          de publicidade e comunicações comerciais; e legítimo interesse (art. 7º, IX) para
          segurança e prevenção a fraude.
        </p>

        <h2>5. Com quem compartilhamos</h2>
        <p>
          Compartilhamos apenas o necessário, e apenas com quem opera parte do serviço:
        </p>
        <ul>
          <li>
            <b>Asaas</b> — processamento de pagamentos e cobranças recorrentes.
          </li>
          <li>
            <b>Melhor Envio e transportadoras</b> — cálculo de frete e entrega das encomendas.
          </li>
          <li>
            <b>Meta (Facebook e Instagram)</b> — mensuração e anúncios, somente se você aceitar os
            cookies.
          </li>
          <li>
            <b>Vercel e Neon</b> — hospedagem do site e do banco de dados.
          </li>
        </ul>
        <p>Não vendemos seus dados para ninguém.</p>

        <h2>6. Cookies</h2>
        <p>
          Cookies necessários mantêm o carrinho e a sessão funcionando e não podem ser desligados.
          Cookies de mensuração e publicidade só são ativados depois do seu aceite no aviso que
          aparece na primeira visita. Recusar não limita nada da sua compra.
        </p>
        <RevogarConsentimento />

        <h2>7. Por quanto tempo guardamos</h2>
        <p>
          Dados de pedidos ficam guardados pelo prazo exigido pela legislação fiscal. Contatos
          coletados para comunicação comercial são mantidos enquanto houver interesse comercial ou
          até você pedir a remoção.
        </p>

        <h2>8. Seus direitos</h2>
        <p>
          Você pode pedir, a qualquer momento e sem custo: confirmação de que tratamos seus dados,
          acesso a eles, correção do que estiver errado, anonimização ou exclusão, portabilidade,
          informação sobre com quem compartilhamos, e revogação do consentimento. Basta escrever
          para <a href={`mailto:${email}`}>{email}</a>. Respondemos em até 15 dias.
        </p>

        <h2>9. Segurança</h2>
        <p>
          Usamos conexão criptografada, acesso restrito ao painel administrativo e chaves de
          integração guardadas apenas no servidor. Nenhum sistema é infalível, mas mantemos as
          medidas técnicas e administrativas adequadas ao risco.
        </p>

        <h2>10. Mudanças</h2>
        <p>
          Se esta política mudar, publicamos a nova versão nesta página com a data atualizada.
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
