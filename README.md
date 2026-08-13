# Glow Make

Loja de kits de presente com venda online, PDV de balcão e assinatura mensal.

**Produção:** https://glow-make-site.vercel.app
**Stack:** Next.js 15 (App Router) · TypeScript · Prisma · PostgreSQL (Neon) · Vercel

> **Novo no projeto?** Leia [`docs/DECISOES.md`](docs/DECISOES.md) antes de mexer no
> código. São escolhas que parecem estranhas fora de contexto e que quebram coisas
> importantes se forem desfeitas sem querer.
> Depois, [`docs/ENTREGA.md`](docs/ENTREGA.md) diz o que está pronto e o que falta.

---

## Rodar localmente

```bash
cp .env.example .env      # preencha as variáveis
npm install
npm run db:push           # cria as tabelas
npm run db:seed           # popula dados iniciais
npm run dev               # http://localhost:3000
```

Precisa de um PostgreSQL. O mais simples é criar um branch de desenvolvimento
no Neon — **não aponte o ambiente local para o banco de produção**, senão
qualquer teste mexe em pedido e estoque reais.

| Comando | O que faz |
|---|---|
| `npm run dev` | servidor de desenvolvimento |
| `npm run build` | build de produção |
| `npm run typecheck` | confere os tipos |
| `npm run db:push` | aplica o schema no banco |
| `npm run db:seed` | popula dados iniciais (idempotente) |
| `npm run db:studio` | abre o Prisma Studio |

## Variáveis de ambiente

| Variável | Obrigatória | Para quê |
|---|---|---|
| `DATABASE_URL` | sim | PostgreSQL |
| `ADMIN_PASSWORD` | sim | senha do painel completo |
| `EQUIPE_PASSWORD` | sim | senha da equipe da loja (só `/catalogo`) |
| `AUTH_SECRET` | sim | assina o cookie de sessão (mín. 16 caracteres) |
| `ASAAS_API_KEY` | não | sem ela, nenhuma cobrança é gerada |
| `ASAAS_ENV` | não | `sandbox` ou `producao` |
| `ASAAS_WEBHOOK_TOKEN` | não | sem ele o webhook recusa tudo, de propósito |
| `MELHOR_ENVIO_TOKEN` | não | sem ele, frete fora da cidade-sede sai como "a combinar" |
| `MELHOR_ENVIO_ENV` | não | `sandbox` ou `producao` |

O código **degrada em vez de quebrar**: sem Asaas o pedido é gravado sem
cobrança; sem Melhor Envio o frete fica a combinar. Ver `docs/DECISOES.md`.

## Deploy

O repositório está conectado à Vercel. **`git push` na `main` publica** em ~50s.

Mudança de schema precisa de um passo a mais, porque a Vercel não expõe o
valor do `DATABASE_URL` da integração Neon para rodar `prisma db push` de fora.
O procedimento está em `docs/DECISOES.md`, seção "Como aplicar schema".

---

## Mapa do código

```
prisma/
  schema.prisma        modelo de dados (15 tabelas)
  seed.ts              dados iniciais, idempotente

src/lib/
  prisma.ts            conexão, com cache em dev
  auth.ts              sessão com dois papéis (admin | equipe), HMAC
  estoque.ts           baixa e devolução com trava anti-corrida  ← núcleo
  pdv.ts               venda de balcão e caixa
  asaas.ts             pagamento (server-only)
  frete.ts             ViaCEP + Melhor Envio
  afiliado.ts          atribuição por link e comissão
  lead.ts              carrinho abandonado
  planilha.ts          leitura e modelo de Excel/CSV
  validacao.ts         CPF/CNPJ, e-mail, CEP, endereço
  format.ts            moeda, datas e rótulos

src/app/
  page.tsx             home
  privacidade/         política de privacidade
  catalogo/            tela da loja física: PDV, estoque e caixa
  api/
    checkout           compra avulsa
    assinatura         assinatura mensal (exige aceite do contrato)
    frete              cotação
    estoque            estoque ao vivo (usado pelo catálogo)
    lead               captura de carrinho abandonado
    asaas/webhook      confirmação de pagamento
    modelo-planilha    baixa o Excel modelo
  admin/
    login/             entrada dos dois papéis
    (protegido)/       painel, estoque, kits, vendas, pedidos, entregas,
                       assinantes, leads, afiliados, banners, depoimentos,
                       importar, config
    actions.ts         server actions do admin

src/components/        Hero, Loja, Catalogo, Consentimento, Icones, admin/
src/middleware.ts      redirect rápido + cookie de afiliado
```

## Áreas do sistema

| Área | Rota | O que faz |
|---|---|---|
| Site | `/` | vitrine, carrinho, checkout, assinatura |
| Loja física | `/catalogo` | PDV com leitor de código de barras, estoque ao vivo, caixa |
| Painel | `/admin` | faturamento site + loja, alertas de estoque |
| Estoque | `/admin/estoque` | entradas, saídas, saldo, histórico |
| Produtos | `/admin/kits` | CRUD, preço, itens, foto, código de barras |
| Vendas da loja | `/admin/vendas` | balcão: por forma de pagamento, fechamentos de caixa |
| Pedidos | `/admin/pedidos` | pedidos do site, status, cobrança |
| Entregas | `/admin/entregas` | fila de expedição, endereço, rastreio |
| Assinantes | `/admin/assinantes` | recorrência, cancelamento |
| Leads | `/admin/leads` | carrinhos abandonados, com trava de LGPD |
| Afiliados | `/admin/afiliados` | links, comissões, pagamento |
| Importar | `/admin/importar` | Excel/CSV com conferência antes de gravar |

## Convenções

- **Código e interface em português.** Nomes de variável, comentário e texto de
  tela. Manter, para não virar meio-a-meio.
- **Nada de emoji.** Todo ícone é SVG traçado em `src/components/Icones.tsx`.
- **Comentário explica o porquê, não o quê.** Os comentários existentes marcam
  decisões — apagá-los perde a razão delas.
