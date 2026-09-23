# Decisões que não devem ser desfeitas sem querer

Cada item aqui parece estranho fora de contexto e tem um motivo caro atrás.
Se for mudar algum, mude sabendo o que quebra.

---

## 1. Estoque: a checagem e a escrita são a MESMA instrução SQL

`src/lib/estoque.ts`

```sql
UPDATE "Kit" SET "saidas" = "saidas" + $qtd
 WHERE "id" = $id AND "entradas" - "saidas" >= $qtd
```

Se o UPDATE não afetar nenhuma linha, o estoque acabou no meio do caminho e a
transação inteira volta atrás.

**Por que não ler, conferir em JS e depois gravar:** duas pessoas comprando ao
mesmo tempo leem "resta 1" juntas e ambas levam a última unidade. É a diferença
entre um controle que funciona e um que parece funcionar até o primeiro dia de
movimento.

Todo caminho que tira estoque passa por aqui: checkout do site, assinatura e
PDV do balcão. **Não crie um caminho novo que mexa em `saidas` direto.**

## 2. Preço vem sempre do banco, nunca do navegador

`api/checkout`, `api/assinatura`, `lib/pdv.ts`

O cliente manda apenas **quais produtos e quantas unidades**. Valor unitário,
subtotal, desconto e frete são recalculados no servidor.

Aceitar valor vindo do navegador é deixar o comprador escolher quanto paga —
basta editar o JSON no DevTools.

O mesmo vale para o **frete**: o navegador manda só qual serviço foi escolhido;
o preço vem de uma cotação feita na hora do pedido.

## 3. O middleware NÃO é a autenticação

`src/middleware.ts` roda no Edge, onde não existe o `crypto` do Node. Ele só
confere se **existe** um cookie, para redirecionar rápido quem nem entrou.

A validação real — assinatura HMAC, validade e **papel** — está no layout de
cada área e, individualmente, em **cada server action**.

**Por que em cada action:** server action é um endpoint HTTP como outro
qualquer. Dá para chamar direto, sem passar por página nenhuma. Se a checagem
estivesse só no layout, bastaria chamar a action pela rede.

Ao criar uma server action nova, **chame `exigirLogin()` (admin) ou
`podeVerCatalogo()` (equipe) na primeira linha.**

## 4. Papéis: admin e equipe

`src/lib/auth.ts`

Cada pessoa entra com usuário e senha cadastrados em **Admin > Usuários**
(tabela `Usuario`, hash scrypt em `src/lib/senha.ts`). O **papel, o id do
usuário e a versão da sessão fazem parte do texto assinado** do cookie, então
não dá para editar o cookie e virar admin, nem virar outra pessoa.

- **A assinatura não basta.** `sessaoAtual()` confere no banco, a cada
  requisição, se o usuário existe, está ativo, tem o mesmo papel e a mesma
  `versaoSessao`. Trocar senha, papel, desativar ou "Desconectar aparelhos"
  soma 1 na versão e derruba na hora todo cookie antigo — sem isso a sessão da
  equipe viveria 30 dias depois de a pessoa sair da loja.
- **`ADMIN_PASSWORD` e `EQUIPE_PASSWORD` continuam valendo**, como senha
  mestra: login com o campo de usuário em branco. É a chave reserva para
  ninguém se trancar fora do painel. Tirar a variável da Vercel encerra também
  as sessões que ela abriu. Não apague as duas sem ter um admin cadastrado.
- Cinco senhas erradas seguidas travam aquele login por 15 minutos.

- `admin` → tudo. Sessão de 12h.
- `equipe` → só `/catalogo`. Sessão de 30 dias, porque a vendedora usa o
  celular no balcão o dia inteiro e relogar toda hora atrapalharia.

## 4B. Entrega: motoboy na região, transportadora no resto

`src/lib/frete.ts`

Não existe frete grátis na compra avulsa — grátis é benefício de quem assina a
Glow Box. Fora isso:

- **João Pessoa, Bayeux, Santa Rita e Cabedelo** veem a opção de **motoboy**,
  que aparece primeiro. O valor **não sai do site**: a corrida varia com a
  distância, e quem mora ao lado da loja não paga o mesmo de quem mora do
  outro lado do rio. A cliente paga os produtos, e o valor da entrega é
  combinado pelo WhatsApp — botão dentro do pedido, em Meus pedidos.
  `valor: 0` com `combinar: true`, **nunca** `gratis: true`: a tela precisa
  dizer "a combinar", e não prometer entrega de graça.
- Quem decide se tem motoboy é a **cidade do ViaCEP**, não a faixa de CEP. Os
  Correios remanejam faixas (Bayeux trocou a dela); uma faixa velha mandaria
  motoboy para outro município.
- **Mínimo de R$ 50 no carrinho só de avulsos** (`erroDoCarrinho`). Não é piso
  de cadastro: a vitrine tem produto de R$ 20, ele só não sai sozinho, porque
  frete e embalagem comem a venda. Com kit no carrinho não há mínimo. A tela
  avisa antes, mas quem barra é o servidor, no checkout.

## 5. Chaves de terceiros só no servidor

`src/lib/asaas.ts` e `src/lib/frete.ts` têm `import 'server-only'` no topo.

Se alguém importar esses arquivos num componente de cliente, **o build quebra**
em vez de vazar a chave no bundle. Não remova o import.

Uma chave do Asaas vazada cria cobranças, lê a base de clientes e transfere
dinheiro. Não existe "vou colocar no client só para testar".

## 6. Degradar, nunca derrubar a venda

- **Sem `ASAAS_API_KEY`** → pedido é gravado, estoque baixa, não há cobrança.
- **Sem `MELHOR_ENVIO_TOKEN`** ou API fora do ar → pedido entra com "frete a
  combinar" e uma observação registrada.
- **Sem `ASAAS_WEBHOOK_TOKEN`** → o webhook recusa **tudo**, de propósito: sem
  token não há como provar que quem chamou foi o Asaas, e qualquer um poderia
  marcar pedidos como pagos.

Perder a venda porque um terceiro caiu é pior do que combinar o detalhe depois.
**Mas o webhook é exceção:** ali, recusar é o comportamento certo.

## 7. Idempotência onde o dinheiro passa

`Comissao.referencia` é `@unique` (`pedido:ID` ou `assinatura:ID:AAAA-MM`).
Um webhook reenviado pelo Asaas tenta criar a mesma comissão e o erro P2002 é
**ignorado de propósito**.

Sem isso, reentrega de webhook viraria pagamento em dobro, e o erro só
apareceria na hora de pagar o influenciador.

`Pedido.estoqueDevolvido` cumpre o mesmo papel: cancelar duas vezes não devolve
estoque duas vezes.

## 8. Caixa: o esperado na gaveta não soma PIX nem cartão

`src/lib/pdv.ts`, função `resumoDoCaixa`.

`esperadoNaGaveta = trocoInicial + vendas em DINHEIRO`.

Somar tudo é o erro clássico que faz o fechamento nunca bater e ninguém
entender por quê. PIX e cartão não passam pela gaveta.

## 8B. Maquininha: comprovante digitado, não integração

`src/lib/pdv.ts`, `VendaLoja.codigoMaquineta`

A loja passa cartão na **Moderninha Smart 2** da PagBank. Ela **não conversa
com o site**: a integração da PagBank (PlugPagService) é para um aplicativo
Android instalado na própria maquininha, e página no navegador não alcança
isso. Fingir integração seria pior do que não ter.

O que existe no lugar: a venda no cartão guarda o **código do comprovante**
(NSU), digitado pela equipe ou preenchido depois no admin. É esse número que
liga a venda daqui à transação do extrato da PagBank; sem ele, conferir o dia
vira adivinhação. O campo é **opcional de propósito** — com cliente na frente,
travar a venda por causa de um número seria o erro caro.

Dinheiro e PIX não guardam código nenhum: número digitado ali só sujaria a
conferência.

A conferência é por **arquivo**: a dona exporta o extrato no painel da PagBank
e sobe em Admin > Conferência da maquininha (`src/lib/extrato.ts` e
`src/lib/conciliacao.ts`). O cruzamento tem duas passadas, da mais confiável
para a menos: **comprovante** primeiro, que é identidade; depois **valor igual
e horário próximo** (90 min de tolerância, porque o relógio da maquininha não
é o do sistema). A tela mostra COMO cada par casou em vez de fingir certeza, e
grava só depois de a pessoa conferir — pelo mesmo motivo da importação de
planilha (#12).

Transação cancelada no extrato fica **fora** do cruzamento: casaria com uma
venda boa de mesmo valor. As duas sobras é que interessam, e a pior é
transação sem venda — o estoque não baixou, e o site segue vendendo peça que
já saiu da loja.

## 9. Venda é venda; perda é perda

O balcão tem dois caminhos separados: **venda** (com valor e forma de
pagamento) e **baixa sem venda** (quebra, brinde, uso interno, com motivo
obrigatório).

Antes existia só "dar baixa", e quebra virava faturamento no relatório.

## 10. O hero não sobrepõe nada na arte

`src/components/Hero.tsx` e `.slides` no CSS.

As artes oficiais já trazem título, preço e itens **desenhados dentro da
imagem**. Por isso o carrossel não tem véu branco, nem texto por cima, nem Ken
Burns, e usa `aspect-ratio: 20/9` com `object-fit: contain`.

Recortar corta o selo de preço, que fica na borda. Se alguém "consertar" isso
voltando para `cover`, o preço some.

## 11. LGPD não é enfeite

- O **Pixel do Meta só carrega depois do aceite** no banner de cookies.
- Lead **sem autorização de contato** aparece no admin **sem** os botões de
  WhatsApp e e-mail.
- Existe botão de **revogar consentimento** em `/privacidade`, porque a lei
  exige que revogar seja tão fácil quanto consentir.

Nada disso é decorativo. Remover qualquer um transforma o site em passivo.

## 12. Importação de planilha grava em dois passos

Primeiro **mostra o diff**, só depois aplica. Coluna em branco significa "não
mexe", não "apaga". Produto ausente da planilha **nunca é excluído**. Estoque
vira **ajuste** no histórico em vez de sobrescrever.

Importação que grava direto é como se perde catálogo: uma coluna trocada de
lugar e todos os preços viram outra coisa sem ninguém ver.

---

## Como aplicar mudança de schema em produção

A Vercel **não expõe o valor** do `DATABASE_URL` da integração Neon, então não
dá para rodar `prisma db push` da sua máquina contra produção.

O procedimento:

1. Altere `prisma/schema.prisma`
2. Em `package.json`, mude temporariamente o build para
   `prisma generate && prisma db push && next build`
3. Publique **num branch** — o deploy de preview aplica o schema e valida a
   compilação **sem tocar em produção**
4. Confira no log que apareceu `Your database is now in sync`
5. Reverta o `package.json` e faça o merge na `main`

Se o `db push` recusar por aviso de perda de dados, **leia o aviso antes de
usar `--accept-data-loss`**. Ele já barrou pelo menos uma publicação — naquele
caso era uma constraint em coluna nova e vazia, e era seguro. Nem sempre será.

## Convenções

- Código e interface em **português**
- **Nada de emoji** — ícones em `src/components/Icones.tsx`
- Comentário explica **o porquê**, não o quê. Os que existem marcam decisões.
