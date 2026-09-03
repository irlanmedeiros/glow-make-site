import { prisma } from '@/lib/prisma';
import { num } from '@/lib/format';
import { asaasConfigurado } from '@/lib/asaas';
import { salvarConfig } from '../../actions';
import { Aviso, Cabecalho, Painel, Pill, mensagens } from '@/components/admin/Ui';

export const dynamic = 'force-dynamic';

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

const brl = (v: number) => v.toFixed(2).replace('.', ',');

export default async function Configuracoes({ searchParams }: Props) {
  const { ok, erro } = mensagens(await searchParams);
  const config = await prisma.config.findUnique({ where: { id: 'config' } });

  const ambiente = process.env.ASAAS_ENV === 'producao' ? 'Produção' : 'Sandbox (teste)';
  const webhookPronto = Boolean(process.env.ASAAS_WEBHOOK_TOKEN);

  return (
    <>
      <Cabecalho titulo="Configurações" descricao="Frete, avisos do topo e dados de contato" />
      <Aviso ok={ok} erro={erro} />

      <Painel titulo="Loja">
        <form action={salvarConfig}>
          <input type="hidden" name="freteValor" value={brl(num(config?.freteValor ?? 24.9))} />
          <input
            type="hidden"
            name="freteGratisAcima"
            value={brl(num(config?.freteGratisAcima ?? 199))}
          />

          <div className="row3">
            <div className="field">
              <label>Cidade com entrega grátis</label>
              <input name="cidadeFreteGratis" defaultValue={config?.cidadeFreteGratis ?? 'João Pessoa'} />
              <small>Comparado com a cidade real do CEP</small>
            </div>
            <div className="field">
              <label>UF</label>
              <input name="ufFreteGratis" defaultValue={config?.ufFreteGratis ?? 'PB'} maxLength={2} />
            </div>
            <div className="field">
              <label>CEP de origem</label>
              <input name="cepOrigem" defaultValue={config?.cepOrigem ?? ''} placeholder="58000-000" />
              <small>De onde as encomendas saem</small>
            </div>
          </div>

          <div className="field">
            <label>Peso de um kit (kg)</label>
            <input
              name="pesoPadraoKit"
              defaultValue={num(config?.pesoPadraoKit ?? 0.7).toFixed(3).replace('.', ',')}
            />
            <small>Usado na cotação do frete. Pese um kit embalado e ponha aqui.</small>
          </div>

          <div className="row3">
            <div className="field">
              <label>Altura da caixa (cm)</label>
              <input name="caixaAlturaCm" defaultValue={config?.caixaAlturaCm ?? 11} />
            </div>
            <div className="field">
              <label>Largura da caixa (cm)</label>
              <input name="caixaLarguraCm" defaultValue={config?.caixaLarguraCm ?? 20} />
            </div>
            <div className="field">
              <label>Comprimento da caixa (cm)</label>
              <input name="caixaComprimentoCm" defaultValue={config?.caixaComprimentoCm ?? 25} />
            </div>
          </div>
          <small>Medidas da embalagem padrão. Vão na cotação do Melhor Envio.</small>

          <div className="field">
            <label>Avisos da barra do topo</label>
            <textarea name="avisos" defaultValue={(config?.avisos ?? []).join('\n')} rows={4} />
            <small>Um por linha. Eles se alternam sozinhos a cada 4 segundos.</small>
          </div>

          <div className="row2">
            <div className="field">
              <label>WhatsApp</label>
              <input name="whatsapp" defaultValue={config?.whatsapp ?? ''} maxLength={40} />
            </div>
            <div className="field">
              <label>E-mail de contato</label>
              <input name="email" defaultValue={config?.email ?? ''} maxLength={120} />
            </div>
          </div>
          <div className="row2">
            <div className="field">
              <label>Instagram</label>
              <input name="instagram" defaultValue={config?.instagram ?? ''} maxLength={60} />
            </div>
            <div className="field">
              <label>CNPJ</label>
              <input name="cnpj" defaultValue={config?.cnpj ?? ''} maxLength={30} />
            </div>
          </div>

          <div className="field">
            <label>ID do Pixel do Meta</label>
            <input name="metaPixelId" defaultValue={config?.metaPixelId ?? ''} placeholder="1234567890123456" />
            <small>
              Só números, do Gerenciador de Eventos do Meta. O Pixel só dispara depois que a
              visitante aceita os cookies.
            </small>
          </div>

          <div className="row2">
            <div className="field">
              <label>Versão do contrato</label>
              <input name="contratoVersao" defaultValue={config?.contratoVersao ?? 'v1'} maxLength={20} />
              <small>Mude ao alterar o texto: fica gravado em quem aceitou qual versão.</small>
            </div>
          </div>

          <div className="field">
            <label>Texto do contrato da assinatura</label>
            <textarea name="contratoTexto" defaultValue={config?.contratoTexto ?? ''} rows={14} />
            <small>Aparece integralmente na etapa de aceite, antes de qualquer cobrança.</small>
          </div>

          <button className="btn btn-primary">Salvar configurações</button>
        </form>
      </Painel>

      <Painel titulo="Frete (Melhor Envio)" descricao="Configurado por variável de ambiente">
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
          <Pill cor={process.env.MELHOR_ENVIO_TOKEN ? 'ok' : 'low'}>
            {process.env.MELHOR_ENVIO_TOKEN ? 'Token configurado' : 'Sem token — frete a combinar'}
          </Pill>
          <Pill cor={process.env.MELHOR_ENVIO_ENV === 'producao' ? 'ok' : 'info'}>
            {process.env.MELHOR_ENVIO_ENV === 'producao' ? 'Produção' : 'Sandbox (teste)'}
          </Pill>
        </div>
        <div className="note">
          Entrega na cidade acima sai <b>grátis</b> sempre. Fora dela, o preço vem do Melhor Envio
          pelo peso e pelo CEP. Sem o token, o pedido entra com <b>frete a combinar</b> e uma
          observação — perder a venda porque a API de terceiro caiu seria pior.
          <br />
          <br />
          Variáveis: <code>MELHOR_ENVIO_TOKEN</code> e <code>MELHOR_ENVIO_ENV</code>.
        </div>
      </Painel>

      <Painel titulo="Pagamento (Asaas)" descricao="Configurado por variáveis de ambiente, não por esta tela">
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
          <Pill cor={asaasConfigurado() ? 'ok' : 'low'}>
            {asaasConfigurado() ? 'Chave configurada' : 'Sem chave — modo demonstração'}
          </Pill>
          <Pill cor={process.env.ASAAS_ENV === 'producao' ? 'ok' : 'info'}>{ambiente}</Pill>
          <Pill cor={webhookPronto ? 'ok' : 'low'}>
            {webhookPronto ? 'Webhook com token' : 'Webhook sem token'}
          </Pill>
        </div>

        <div className="note">
          A chave do Asaas <b>nunca</b> aparece nesta tela nem em qualquer lugar do navegador — ela
          fica só nas variáveis de ambiente do servidor. Se ela fosse editável por aqui, qualquer
          pessoa com acesso ao admin poderia ler a chave e emitir cobranças na sua conta.
          <br />
          <br />
          Variáveis usadas: <code>ASAAS_API_KEY</code>, <code>ASAAS_ENV</code> (sandbox ou
          producao) e <code>ASAAS_WEBHOOK_TOKEN</code>.
        </div>

        {!webhookPronto && (
          <div className="note alerta" style={{ marginTop: 12 }}>
            Sem <code>ASAAS_WEBHOOK_TOKEN</code>, a rota de webhook recusa todas as chamadas. Isso é
            proposital: sem token não há como provar que quem chamou foi mesmo o Asaas, e qualquer
            um poderia marcar pedidos como pagos. Enquanto isso, os status de pagamento precisam ser
            atualizados à mão.
          </div>
        )}
      </Painel>

      <Painel titulo="Acesso ao admin">
        <div className="note">
          A senha fica na variável <code>ADMIN_PASSWORD</code> e a assinatura da sessão em{' '}
          <code>AUTH_SECRET</code>. Para trocar a senha, mude a variável na Vercel e faça um novo
          deploy — todas as sessões abertas caem junto.
        </div>
      </Painel>
    </>
  );
}
