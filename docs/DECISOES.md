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

Duas senhas, um formulário. O **papel faz parte do texto assinado** do cookie,
então não dá para editar o cookie e virar admin.

- `admin` → tudo. Sessão de 12h.
- `equipe` → só `/catalogo`. Sessão de 30 dias, porque a vendedora usa o
  celular no balcão o dia inteiro e relogar toda hora atrapalharia.

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
