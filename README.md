# Glow Make — site e painel administrativo

Loja de kits de maquiagem com assinatura mensal (Glow Box), controle de estoque
e integração de pagamento com o Asaas.

Next.js 15 (App Router) · TypeScript · Prisma · PostgreSQL · pronto para Vercel.

---

## Subir na Vercel (do zero, ~10 minutos)

### 1. Suba o código para o GitHub

```bash
cd ~/Documents/glow-make-site
git init && git add -A && git commit -m "Glow Make: site e admin"
gh repo create glow-make-site --private --source=. --push
```

### 2. Importe na Vercel

Em [vercel.com/new](https://vercel.com/new), escolha o repositório. Não faça o
deploy ainda — falta o banco.

### 3. Crie o banco

No projeto da Vercel: **Storage → Create Database → Neon (Postgres)**. A Vercel
preenche a variável `DATABASE_URL` sozinha. O plano gratuito atende de sobra
para apresentar ao cliente.

### 4. Configure as variáveis restantes

Em **Settings → Environment Variables**:

| Variável | Obrigatória | O que é |
|---|---|---|
| `DATABASE_URL` | sim | preenchida pela Vercel no passo 3 |
| `ADMIN_PASSWORD` | sim | senha do `/admin`, mínimo 8 caracteres |
| `AUTH_SECRET` | sim | segredo que assina o cookie de sessão, mínimo 16 caracteres |
| `ASAAS_API_KEY` | não | sem ela o site roda em modo demonstração |
| `ASAAS_ENV` | não | `sandbox` (padrão) ou `producao` |
| `ASAAS_WEBHOOK_TOKEN` | não | token do webhook, definido por você no painel do Asaas |

Gere o `AUTH_SECRET` com:

```bash
openssl rand -base64 32
```

### 5. Faça o deploy e prepare o banco

Depois do primeiro deploy, rode localmente apontando para o banco de produção:

```bash
DATABASE_URL="<a mesma URL da Vercel>" npx prisma db push
DATABASE_URL="<a mesma URL da Vercel>" npm run db:seed
```

`db push` cria as tabelas. `db:seed` popula 5 kits, a Glow Box, 5 banners,
15 depoimentos, a galeria e as configurações iniciais.

Pronto: o site responde em `/` e o painel em `/admin`.

---

## Rodar na sua máquina

```bash
cp .env.example .env      # preencha DATABASE_URL, ADMIN_PASSWORD e AUTH_SECRET
npm install
npm run db:push
npm run db:seed
npm run dev               # http://localhost:3000
```

Você precisa de um Postgres. O mais rápido é apontar a `DATABASE_URL` para o
mesmo Neon da Vercel (crie um branch de desenvolvimento lá para não misturar
com os dados reais).

Scripts disponíveis:

| Comando | O que faz |
|---|---|
| `npm run dev` | servidor de desenvolvimento |
| `npm run build` | build de produção |
| `npm run typecheck` | confere os tipos sem gerar arquivos |
| `npm run db:push` | aplica o schema no banco |
| `npm run db:seed` | popula os dados iniciais |
| `npm run db:studio` | abre o Prisma Studio para ver o banco |

---

## O que o painel faz

Acesso em `/admin`, protegido por senha.

| Tela | Funções |
|---|---|
| **Painel** | faturamento do mês, receita recorrente, pedidos a receber, alertas de estoque, últimos pedidos e movimentações |
| **Estoque** | entradas, saídas e saldo por produto; lançar entrada; corrigir saldo; histórico completo de movimentações |
| **Kits e produtos** | criar, editar, ocultar e excluir; nome, SKU, preço, itens, foto, ordem e limite de alerta |
| **Pedidos** | filtro por status, detalhe do cliente e dos itens, mudança de status, observação interna, link da cobrança |
| **Assinantes** | lista, receita recorrente, cancelar (encerra no Asaas e devolve a caixa ao estoque) e reativar |
| **Banners** | CRUD dos slides do carrossel, com ordem e ativação |
| **Depoimentos** | CRUD das avaliações do carrossel |
| **Configurações** | frete, limite de frete grátis, avisos do topo, dados de contato |

---

## Como o estoque não fura

Esse é o ponto que o briefing pedia: nunca vender o que não existe.

Cada produto guarda **entradas** e **saídas** acumuladas; o saldo é sempre a
diferença entre as duas. A baixa acontece assim:

```sql
UPDATE "Kit"
   SET "saidas" = "saidas" + $qtd
 WHERE "id" = $id
   AND "entradas" - "saidas" >= $qtd
```

A conferência e a escrita estão na **mesma instrução**, dentro de uma transação.
Se o `UPDATE` não afetar nenhuma linha, o estoque acabou no meio do caminho e a
transação inteira volta atrás.

Se em vez disso o código lesse o saldo, conferisse em JavaScript e só depois
gravasse, duas pessoas comprando ao mesmo tempo poderiam ler "resta 1" juntas e
ambas levar a última unidade. É a diferença entre um controle de estoque que
funciona e um que parece funcionar até o primeiro dia de movimento.

Cancelar um pedido devolve as unidades — uma única vez, controlado pela flag
`estoqueDevolvido`, para o pedido não virar fábrica de estoque se for cancelado
e reaberto várias vezes.

Toda alteração de saldo grava uma linha em `Movimentacao`: nada muda sem rastro.

---

## Segurança — o que está protegido e por quê

**A chave do Asaas nunca chega ao navegador.** Ela vive só em variável de
ambiente do servidor e é usada em `src/lib/asaas.ts`, que tem `import 'server-only'`
no topo — se algum dia alguém importar esse arquivo em um componente de
cliente, o build quebra em vez de vazar a chave.

**Os preços vêm sempre do banco.** O checkout recebe apenas os IDs e as
quantidades; valor unitário, subtotal e frete são recalculados no servidor. Se
o preço viesse do navegador, bastaria editar o JSON no DevTools para comprar o
Kit Deluxe por um real.

**A senha do admin não está no código.** Fica em `ADMIN_PASSWORD`. O cookie de
sessão carrega um token assinado com HMAC-SHA256 usando `AUTH_SECRET`; sem o
segredo ninguém forja um token válido. A comparação usa `timingSafeEqual`.

**O middleware não é a proteção real.** Ele roda no Edge, onde não existe o
`crypto` do Node, então só confere se existe um cookie para já redirecionar
quem claramente não está logado. A validação de verdade acontece no layout do
admin e, individualmente, em **cada server action** — porque uma server action é
um endpoint HTTP e pode ser chamada direto, sem passar por página nenhuma.

**O webhook exige token.** A rota `/api/asaas/webhook` é pública na internet.
Sem `ASAAS_WEBHOOK_TOKEN` configurado ela recusa tudo, de propósito: sem token
não há como provar que quem chamou foi o Asaas, e qualquer pessoa poderia
marcar pedidos como pagos.

---

## Modo demonstração

Sem `ASAAS_API_KEY`, o site funciona inteiro — pedidos e assinaturas são
gravados, o estoque baixa, o admin mostra tudo — só não existe cobrança nem
link de pagamento. É o suficiente para apresentar ao cliente antes de abrir
conta no Asaas.

---

## Antes de vender de verdade

- [ ] Trocar os depoimentos e as fotos: os que vêm no seed são textos fictícios
      sobre rostos de pessoas reais do Unsplash, que nunca escreveram aquilo.
      A combinação sugere um endosso que não existe.
- [ ] Fotografar os kits: as fotos atuais são de produtos de outras marcas.
- [ ] Trocar o `banner-2.jpg`, que tem a marca **tarte** legível.
- [ ] Cadastrar o webhook no painel do Asaas apontando para
      `https://SEU-DOMINIO/api/asaas/webhook` com o mesmo token da variável.
- [ ] Calcular frete real por CEP (hoje é valor fixo com faixa de frete grátis).
- [ ] Preencher CNPJ, endereço e políticas de troca e privacidade.

---

## Estrutura

```
prisma/
  schema.prisma        modelo de dados
  seed.ts              dados iniciais
src/
  lib/
    prisma.ts          conexão (com cache em dev)
    auth.ts            sessão do admin, HMAC
    asaas.ts           integração de pagamento (server-only)
    estoque.ts         baixa e devolução com trava anti-corrida
    validacao.ts       validação de CPF/CNPJ, e-mail, CEP
    format.ts          moeda, datas e rótulos
  components/          site (Hero, Loja, ícones) e peças do admin
  app/
    page.tsx           página inicial
    api/               checkout, assinatura, webhook
    admin/
      login/           tela de acesso
      (protegido)/     todas as telas do painel
      actions.ts       server actions
  middleware.ts        redirecionamento rápido do /admin
```
