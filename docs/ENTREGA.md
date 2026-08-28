# Entrega — estado do projeto

Atualizado em 2026-08-13.

## Resumo em uma linha

O sistema está construído e no ar, mas **ainda não vende**: faltam três
credenciais e a troca do catálogo, que é fictício.

---

## O que está pronto e testado em produção

| Área | Situação |
|---|---|
| Site público | vitrine, carrinho, checkout com endereço e CEP automático |
| Assinatura | fluxo dados → contrato → pagamento, com aceite registrado (versão, data, IP) |
| Estoque | entradas, saídas, saldo, histórico, alertas, trava anti-corrida |
| PDV de balcão | venda com leitor de código de barras, desconto, forma de pagamento |
| Caixa | abertura com troco, fechamento com contagem e diferença |
| Entregas | fila de expedição, endereço, transportadora, rastreio |
| Importação | Excel/CSV com conferência antes de gravar |
| Carrinhos abandonados | captura por e-mail, com trava de LGPD |
| Afiliados | link `?ref=`, cookie de 30 dias, comissão idempotente |
| LGPD | banner de consentimento, Pixel só após aceite, política e revogação |

Cada um foi verificado no ambiente de produção, não apenas compilado.

---

## O que BLOQUEIA vender

### 1. Asaas não está ligado
Sem `ASAAS_API_KEY`, **nenhuma cobrança é gerada**. O pedido entra, o estoque
baixa, e ninguém paga.

Já cadastrados na Vercel: `ASAAS_ENV` e `ASAAS_WEBHOOK_TOKEN`. O webhook já foi
testado (401 sem token, 200 com o token certo). **Falta só a chave de API do
cliente.**

### 2. Melhor Envio não está ligado
Sem `MELHOR_ENVIO_TOKEN`, venda fora da cidade-sede sai com **frete R$ 0** e a
loja paga o envio. Entrega na cidade-sede é grátis por regra e não depende
dessa chave.

Também falta corrigir em Admin → Configurações: **CEP de origem** real (está
genérico) e **peso do kit** embalado (está estimado em 0,700 kg).

### 3. O catálogo é fictício
Os produtos publicados foram inventados durante o desenvolvimento. Os reais
aparecem nas artes de banner: kits de presente de **R$ 35 a R$ 45**, não os
kits de maquiagem de R$ 89,90 a R$ 249,90 que estão no ar.

Também afeta o **preço da assinatura** (R$ 99,90, mais que o dobro do kit mais
caro real).

Caminho mais rápido: Admin → Importar planilha.

### 4. Depoimentos são fictícios sobre rostos reais
Os textos foram escritos durante o desenvolvimento e as fotos são de pessoas
reais do banco Unsplash, que nunca escreveram aquilo. A combinação sugere
endosso que não existe.

**Trocar por avaliações reais com autorização antes de qualquer tráfego.**

---

## Pendências menores

- Barra de avisos e um banner ainda anunciam "frete grátis acima de R$ 199",
  regra que não existe mais — corrigir em Configurações e Banners
- Fotos dos kits são de banco, de produtos de outras marcas
- `banner-2.jpg` tem uma marca de concorrente legível
- Falta arte de banner para **celular**: na faixa 20:9 os textos menores da arte
  ficam ilegíveis no telefone
- Contrato de assinatura e política de privacidade são **rascunhos sem revisão
  jurídica** (há aviso em ambos)
- Dados institucionais no rodapé são placeholder (CNPJ, contatos)
- Termos de Uso não existem — o link aponta para a política
- Nota fiscal (NFC-e) não existe: depende de certificado A1, inscrição estadual
  e credenciamento na SEFAZ, que são do cliente
- Pedidos e vendas de teste no banco, feitos durante a validação

---

## Depois que as chaves entrarem, ainda falta

As duas chaves sozinhas **não concluem a integração**.

1. **Cadastrar o webhook no painel do Asaas.** A variável
   `ASAAS_WEBHOOK_TOKEN` está na Vercel, mas o webhook nunca foi cadastrado do
   lado do Asaas. Sem isso a cobrança é criada, o cliente paga, e o site nunca
   fica sabendo: o pedido fica "aguardando pagamento" para sempre e a comissão
   do afiliado não é gerada. É a falha mais silenciosa do projeto.
   URL: `https://SEU-DOMINIO/api/asaas/webhook`, com o **mesmo** token.
2. **`ASAAS_ENV` ainda está `sandbox`.** Precisa virar `producao`, com chave de
   produção. Chave de produção em ambiente sandbox dá 401.
3. **Comprar etiqueta é manual.** `src/lib/frete.ts` chama só
   `shipment/calculate` — isso cota. Comprar etiqueta e gerar rastreio é feito
   à mão no site do Melhor Envio e digitado em `/admin/entregas`. Automatizar é
   desenvolvimento novo.
4. **O site não envia e-mail nenhum.** Sem confirmação de pedido, sem aviso de
   pagamento, sem aviso de envio. Carrinho abandonado é capturado, mas o contato
   é manual. Automatizar exige Resend (ou similar) e domínio verificado.
5. **Configurações com valor de exemplo:** CEP de origem `58000-000`, peso do
   kit estimado em 0,700 kg, CNPJ e WhatsApp placeholder, Meta Pixel vazio, e a
   regra morta "frete grátis acima de R$ 199" ainda aparecendo nos avisos.
   As **dimensões da caixa (11 × 20 × 25 cm) estão fixas no código**, em
   `frete.ts`, apesar do comentário mandar ajustar em Configurações.
6. **Domínio próprio.** Hoje é `glow-make-site.vercel.app`. Resolver **antes**
   de cadastrar o webhook, senão a URL terá que ser refeita.

---

## Acessos que o desenvolvedor precisa

| O quê | Como |
|---|---|
| Repositório | colaborador no GitHub |
| Vercel | membro do projeto `glow-make-site` |
| Banco | branch de desenvolvimento no Neon — **não o de produção** |
| Senhas do admin | `ADMIN_PASSWORD` e `EQUIPE_PASSWORD`, pelo dono |

**Nunca aponte o ambiente local para o banco de produção.** Qualquer teste
mexeria em pedido, estoque e caixa reais.

---

## Onde está o resto do contexto

O "porquê" das decisões técnicas está em [`DECISOES.md`](DECISOES.md) — leia
antes de mexer no código. O contexto do negócio está em
[`CONTEXTO.md`](CONTEXTO.md), e as instruções para um agente que for trabalhar
neste repositório estão em [`CLAUDE.md`](../CLAUDE.md).

A documentação de negócio (produtos, identidade visual, integrações, passo a
passo do Asaas, LGPD) vive num cofre Obsidian com o dono do projeto, fora
deste repositório.
