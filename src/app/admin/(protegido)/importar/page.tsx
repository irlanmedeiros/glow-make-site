import { Cabecalho, Painel } from '@/components/admin/Ui';
import Importador from '@/components/admin/Importador';

export const dynamic = 'force-dynamic';

export default function Importar() {
  return (
    <>
      <Cabecalho
        titulo="Importar planilha"
        descricao="Suba um Excel com os produtos e o catálogo do site se atualiza de uma vez"
      >
        <a className="btn btn-ghost btn-sm" href="/api/modelo-planilha">
          Baixar planilha modelo
        </a>
      </Cabecalho>

      <Painel titulo="Como funciona">
        <ol style={{ paddingLeft: 20, fontSize: 14.5, lineHeight: 1.9, color: 'var(--muted)' }}>
          <li>
            Baixe a <b>planilha modelo</b> — ela já vem com os cabeçalhos certos e uma aba
            explicando cada coluna.
          </li>
          <li>Preencha com os seus produtos e salve.</li>
          <li>
            Envie aqui. O sistema <b>mostra o que vai mudar antes de gravar</b> — você confere e só
            então confirma.
          </li>
        </ol>

        <div className="note" style={{ marginTop: 14 }}>
          <b>O SKU é a chave.</b> Se ele já existe no site, o produto é atualizado; se não existe, é
          criado. Produto que está no site e não aparece na planilha <b>não é apagado</b> — apagar
          catálogo por esquecimento seria destrutivo demais. Coluna em branco significa &ldquo;não
          mexe nesse campo&rdquo;, não &ldquo;apaga&rdquo;.
        </div>

        <div className="note" style={{ marginTop: 10 }}>
          <b>Estoque não é sobrescrito às cegas.</b> O número da coluna <code>estoque</code> é o
          saldo que o produto deve ficar; a diferença entra como <b>ajuste</b> no histórico, com
          data e origem. Assim nenhum saldo muda sem deixar rastro.
        </div>
      </Painel>

      <Importador />
    </>
  );
}
