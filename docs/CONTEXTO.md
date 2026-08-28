# Contexto do negócio

O que não dá para deduzir lendo o código. Se uma decisão aqui parecer
discutível, ela já foi discutida — está registrado quem decidiu.

## O negócio

Glow Make vende **kits de presente** montados. Tem loja física em João Pessoa
(PB) e agora o site. Não é uma marca de maquiagem própria: monta e revende kits.

Três formas de vender, **um estoque só**:

1. **Site** — kits avulsos, entrega ou retirada
2. **Assinatura mensal** — a "Glow Box", cobrança recorrente
3. **Balcão** — PDV na loja física, com leitor de código de barras e caixa

O ponto que amarra tudo: uma venda no balcão baixa o mesmo saldo que o site
consulta, na hora. Foi o pedido explícito — a vendedora não pode vender o que o
site já vendeu, nem o contrário.

## Decisões de produto já tomadas

**Só kits e assinatura.** Nada de produto avulso (um batom solto, um pincel).
Decisão do dono, para não virar drogaria.

**A assinatura passa por contrato.** O fluxo é formulário → contrato → pagamento.
O aceite é gravado com versão do texto, data e IP. Não é enfeite: é o que
sustenta a cobrança recorrente se alguém contestar.

**Frete grátis em João Pessoa, real fora dela.** A checagem é pelo **nome da
cidade** que o ViaCEP devolve, não por faixa de CEP — faixa numérica quebra no
dia em que os Correios criam um CEP novo no meio. Existe no schema um campo
`freteGratisAcima` (R$ 199) que é **regra morta**, de uma versão anterior.

**Afiliados ganham 50%, recorrente na assinatura.** O dono escolheu isso sabendo
que sobra pouco para produto, frete e imposto. Já foi apresentado o cálculo.
**Não relitigue** — se for mudar, é decisão dele, não sugestão sua.

**Nada de emoji, e o hero não sobrepõe nada.** As artes de banner já trazem
título, preço e itens desenhados dentro da imagem. Por isso o carrossel não tem
véu, nem texto por cima, nem zoom.

## LGPD — postura assumida

O Pixel do Meta **só carrega depois do aceite** no banner de cookies. Lead sem
autorização de contato aparece no admin **sem** os botões de WhatsApp e e-mail.
Existe botão de revogar consentimento em `/privacidade`.

O dono pediu um texto de cookies mais discreto. O texto foi encurtado e o
detalhe foi para a política, mas **o que é coletado continua declarado** —
esconder invalidaria o consentimento e é justamente o que gera passivo.

## O que está publicado é exemplo, não realidade

Isto é importante e não é óbvio olhando o site:

- **O catálogo é fictício.** Os kits publicados custam R$ 89,90 a R$ 249,90. Os
  produtos reais, que aparecem nas artes de banner, custam **R$ 35 a R$ 45**.
- **O preço da assinatura** (R$ 99,90) está na mesma escala errada.
- **Os depoimentos são inventados**, e estão sobre fotos de pessoas reais de
  banco de imagens que nunca escreveram aquilo. Trocar antes de qualquer
  tráfego pago.
- Fotos de kit são de banco, de produtos de outras marcas. `banner-2.jpg` tem
  marca de concorrente legível.
- Dados institucionais no rodapé (CNPJ, contatos) são placeholder.

## Quem faz o quê

O site foi construído por uma agência para um cliente. **A conta do Asaas é do
cliente**, assim como CNPJ, certificado fiscal e os produtos. A agência faz a
integração.

Consequência prática: várias pendências não são de código e não adianta o dev
tentar resolver — dependem do cliente entregar chave, dado ou conteúdo.

## O que ainda não existe

- **Nenhum e-mail é enviado.** Não há Resend, nodemailer, nada. Quem compra não
  recebe confirmação. Carrinho abandonado é capturado, mas o contato é manual.
- **Etiqueta de frete é comprada à mão.** O código só cota. Comprar etiqueta e
  gerar rastreio é feito no site do Melhor Envio e digitado no admin.
- **Nota fiscal (NFC-e) não existe.** Depende de certificado A1, inscrição
  estadual e credenciamento na SEFAZ — tudo do cliente.
- **Termos de Uso não existem.** O link aponta para a política de privacidade.
- Contrato e política são **rascunhos sem revisão jurídica**, com aviso no texto.

## Onde está o resto

O detalhe (identidade visual, banners originais, passo a passo do Asaas, kits,
histórico de decisões) vive num cofre Obsidian com o dono do projeto. Não está
neste repositório e não deve estar — parte é material de cliente.
