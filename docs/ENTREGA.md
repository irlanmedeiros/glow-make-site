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
antes de mexer no código.

A documentação de negócio (produtos, identidade visual, integrações, passo a
passo do Asaas, LGPD) vive num cofre Obsidian com o dono do projeto, fora
deste repositório.
