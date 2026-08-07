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
          <div className="row2">
            <div className="field">
              <label>Valor do frete</label>
              <input name="freteValor" defaultValue={brl(num(config?.freteValor ?? 24.9))} required />
              <small>Cobrado quando o pedido não atinge o limite abaixo</small>
            </div>
            <div className="field">
              <label>Frete grátis a partir de</label>
              <input
                name="freteGratisAcima"
                defaultValue={brl(num(config?.freteGratisAcima ?? 199))}
                required
              />
              <small>Aparece no aviso do topo e na barra de selos</small>
            </div>
          </div>

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

          <button className="btn btn-primary">Salvar configurações</button>
        </form>
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
