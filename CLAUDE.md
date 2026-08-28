# Instruções para o Claude neste projeto

Loja da Glow Make: site de venda de kits, assinatura mensal e PDV de balcão da
loja física. **Os três compartilham o mesmo estoque.** É um sistema em produção,
com dinheiro e estoque reais — não é protótipo.

## Leia antes de mexer, nesta ordem

1. `README.md` — como rodar, mapa do código, variáveis de ambiente
2. `docs/DECISOES.md` — **o mais importante.** 12 decisões que parecem estranhas
   fora de contexto e quebram coisas caras se forem "corrigidas"
3. `docs/CONTEXTO.md` — o negócio: o que se vende, para quem, o que já foi decidido
4. `docs/ENTREGA.md` — o que está pronto, o que falta, o que bloqueia vender

Não pule o `DECISOES.md`. Metade dos erros possíveis aqui é desfazer sem querer
algo que foi feito de propósito.

## Nunca faça

- **Não aponte o ambiente local para o banco de produção.** Qualquer teste
  mexeria em pedido, estoque e caixa reais. Use um branch de dev no Neon.
- **Não escreva em `Kit.saidas` direto.** Toda baixa de estoque passa por
  `src/lib/estoque.ts`, que faz a checagem e a escrita na mesma instrução SQL.
  Ler-conferir-gravar em JS deixa duas pessoas comprarem a última unidade.
- **Não remova `import 'server-only'`** de `src/lib/asaas.ts` e
  `src/lib/frete.ts`. Ele existe para o build quebrar em vez de vazar chave.
- **Não aceite preço vindo do navegador.** O cliente manda o quê e quantos; o
  valor é sempre recalculado no servidor.
- **Não confie no middleware como autenticação.** Ele só redireciona. A
  validação real está no layout e em **cada server action**, individualmente.
- **Não use emoji.** Ícones são SVG em `src/components/Icones.tsx`.
- **Não faça commit de `.env`, chave, token ou senha.** O repositório já esteve
  público.

## Ao criar código novo

- **Server action nova:** primeira linha é `exigirLogin()` (admin) ou
  `podeVerCatalogo()` (equipe). Server action é endpoint HTTP — dá para chamar
  direto, sem passar por página nenhuma.
- **Integração com terceiro:** degrade, não derrube a venda. Sem chave do Asaas
  o pedido é gravado sem cobrança; sem token de frete entra como "a combinar".
  **Exceção: o webhook recusa tudo sem token, e isso é o certo.**
- **Onde passa dinheiro, seja idempotente.** Webhook é reentregue. Veja
  `Comissao.referencia` e `Pedido.estoqueDevolvido`.

## Fluxo de trabalho

`git push` na `main` **publica em produção**, em ~50s, numa loja que vende. Seja
deliberado. Valide antes:

```
npm run typecheck
```

**Mudança de schema** tem procedimento próprio, porque a Vercel não expõe o
valor do `DATABASE_URL` da integração Neon. Está no fim do `docs/DECISOES.md`.
Resumo: build temporário com `prisma db push`, publica **num branch**, confere
no log que apareceu `Your database is now in sync`, reverte, faz merge.

Nunca use `--accept-data-loss` sem ler o aviso. Ele já barrou uma publicação
com razão.

## Confirme com a pessoa antes de

- Qualquer coisa que toque dados de produção
- Mudar preço, comissão de afiliado ou regra de frete
- Publicar conteúdo novo no site (o catálogo atual ainda é de exemplo)
- Trocar a arte do hero para `object-fit: cover` — corta o selo de preço

## Convenções

Código e interface em **português**, inclusive nomes de variável. Comentário
explica **o porquê**, não o quê — os que existem marcam decisões, apagá-los
perde a razão delas.

## Onde está o resto

A documentação de negócio completa (produtos, identidade visual, passo a passo
do Asaas, LGPD, contrato) vive num cofre Obsidian com o dono do projeto, fora
deste repositório. Se faltar contexto, pergunte a ele em vez de supor.
