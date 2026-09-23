import { Cabecalho, Painel } from '@/components/admin/Ui';
import Conferidor from '@/components/admin/Conferidor';

export const dynamic = 'force-dynamic';

export default function Conferencia() {
  return (
    <>
      <Cabecalho
        titulo="Conferência da maquininha"
        descricao="Compare o extrato da PagBank com as vendas no cartão do balcão"
      />

      <Painel titulo="Como funciona">
        <ol style={{ paddingLeft: 20, fontSize: 14.5, lineHeight: 1.9, color: 'var(--muted)' }}>
          <li>No painel ou no app da PagBank, exporte o <b>extrato de vendas</b> do período.</li>
          <li>Suba o arquivo aqui. O sistema casa cada transação com a venda do balcão.</li>
          <li>Confira o que sobrou dos dois lados e, se estiver certo, grave.</li>
        </ol>

        <div className="note" style={{ marginTop: 14 }}>
          A maquininha <b>não conversa com o site</b>: a integração da PagBank exige um aplicativo
          rodando na própria máquina. Por isso a conferência é por arquivo — e por isso vale a pena
          a equipe digitar o <b>código do comprovante</b> na hora da venda: com ele o casamento é
          exato, sem ele é por valor e horário.
        </div>

        <div className="note" style={{ marginTop: 10 }}>
          Conferir <b>não mexe em estoque, faturamento nem caixa</b>. Só marca as vendas como
          conferidas e guarda a taxa que a maquininha cobrou — o número que faz R$ 100 de venda
          virar menos na conta da loja.
        </div>
      </Painel>

      <Conferidor />
    </>
  );
}
