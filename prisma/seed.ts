import { PrismaClient, Prisma } from '@prisma/client';

const prisma = new PrismaClient();

const KITS: Prisma.KitCreateInput[] = [
  {
    sku: 'GM-ESS',
    nome: 'Kit Essencial Glow',
    slug: 'kit-essencial-glow',
    descricao: 'O básico bem feito para o dia a dia.',
    itens: ['Base líquida 30ml', 'Pó compacto matte', 'Máscara de cílios', 'Batom rosé', 'Necessaire'],
    preco: new Prisma.Decimal('89.90'),
    imagem: '/assets/kits/kit-1.jpg',
    entradas: 40,
    ordem: 1,
  },
  {
    sku: 'GM-OLH',
    nome: 'Kit Olhar Marcante',
    slug: 'kit-olhar-marcante',
    descricao: 'Tudo para o olhar, do neutro ao noite.',
    itens: ['Paleta 12 cores', 'Delineador em caneta', 'Máscara alongamento', 'Lápis marrom', 'Dois pincéis'],
    preco: new Prisma.Decimal('129.90'),
    imagem: '/assets/kits/kit-2.jpg',
    entradas: 25,
    ordem: 2,
  },
  {
    sku: 'GM-PEL',
    nome: 'Kit Pele Perfeita',
    slug: 'kit-pele-perfeita',
    descricao: 'Do preparo ao acabamento da pele.',
    itens: ['Primer hidratante', 'Base 12 tons', 'Corretivo líquido', 'Pó solto', 'Blush', 'Spray fixador'],
    preco: new Prisma.Decimal('159.90'),
    imagem: '/assets/kits/kit-3.jpg',
    entradas: 18,
    ordem: 3,
  },
  {
    sku: 'GM-LAB',
    nome: 'Kit Lábios Glow',
    slug: 'kit-labios-glow',
    descricao: 'Cinco acabamentos de boca em um kit.',
    itens: ['Batom matte', 'Batom cremoso', 'Gloss volume', 'Lápis contorno', 'Bálsamo'],
    preco: new Prisma.Decimal('99.90'),
    imagem: '/assets/kits/kit-4.jpg',
    entradas: 32,
    ordem: 4,
  },
  {
    sku: 'GM-DLX',
    nome: 'Kit Completo Deluxe',
    slug: 'kit-completo-deluxe',
    descricao: 'Rosto inteiro, com estojo rígido.',
    itens: ['Paleta 18 cores', 'Base, corretivo e pó', 'Contorno e iluminador', 'Blush duo', 'Trio de batons', 'Oito pincéis'],
    preco: new Prisma.Decimal('249.90'),
    imagem: '/assets/kits/kit-5.jpg',
    entradas: 8,
    ordem: 5,
  },
  {
    sku: 'GM-PIN',
    nome: 'Kit Pincéis Essenciais',
    slug: 'kit-pinceis-essenciais',
    descricao: 'Os pincéis que faltavam para o resultado ficar profissional.',
    itens: ['Pincel de base', 'Pincel de pó', 'Pincel de blush', 'Pincel chanfrado', 'Duo para sombra', 'Porta-pincéis'],
    preco: new Prisma.Decimal('119.90'),
    imagem: '/assets/kits/kit-6.jpg',
    entradas: 22,
    ordem: 6,
  },
  {
    sku: 'GM-BOX',
    nome: 'Glow Box Mensal',
    slug: 'glow-box-mensal',
    descricao: 'De quatro a seis produtos selecionados, entregues todo mês.',
    itens: [
      'Curadoria nova a cada mês, nunca repetida',
      'Frete incluso para todo o Brasil',
      'Dez por cento de desconto em qualquer kit avulso',
      'Acesso antecipado aos lançamentos',
      'Cancele a qualquer momento, sem multa',
    ],
    preco: new Prisma.Decimal('99.90'),
    imagem: '/assets/kits/glowbox.jpg',
    tipo: 'BOX',
    entradas: 120,
    estoqueBaixo: 20,
    ordem: 99,
  },
];

const BANNERS: Prisma.BannerCreateInput[] = [
  // As artes oficiais já trazem título, preço e itens desenhados dentro da
  // imagem. Os campos de texto aqui servem só para acessibilidade (alt) e
  // para o admin identificar cada peça — nada disso aparece por cima.
  {
    tag: 'Kit Puro Leite',
    titulo: 'Kit Puro Leite — cuidado completo para sua pele, por R$ 40',
    subtitulo: 'Sabonete, hidratante e esfoliante corporal na bolsa transparente.',
    imagem: '/assets/banners/banner-1.jpg',
    ctaTexto: 'Ver os kits',
    ctaLink: '#kits',
    ordem: 1,
  },
  {
    tag: 'Kit Presente',
    titulo: 'Kit Presente — pele e cabelos, por R$ 40',
    subtitulo: 'Hidratante, esfoliante e body splash, na bolsa com presilha.',
    imagem: '/assets/banners/banner-2.jpg',
    ctaTexto: 'Ver os kits',
    ctaLink: '#kits',
    ordem: 2,
  },
  {
    tag: 'Kit Presente',
    titulo: 'Kit Presente — pele incrível e perfumada, por R$ 45',
    subtitulo: 'Hidratante, esfoliante, body splash, touca de cetim e presilha.',
    imagem: '/assets/banners/banner-3.jpg',
    ctaTexto: 'Ver os kits',
    ctaLink: '#kits',
    ordem: 3,
  },
  {
    tag: 'Kit Presente',
    titulo: 'Kit Presente — para encantar com carinho, por R$ 35',
    subtitulo: 'Porta joia, presilha de cabelo, brinco e batom.',
    imagem: '/assets/banners/banner-4.jpg',
    ctaTexto: 'Ver os kits',
    ctaLink: '#kits',
    ordem: 4,
  },
  {
    tag: 'Kit Presente',
    titulo: 'Kit Presente — o presente ideal, por R$ 35',
    subtitulo: 'Porta joia, presilha de cabelo, brinco e batom.',
    imagem: '/assets/banners/banner-5.jpg',
    ctaTexto: 'Ver os kits',
    ctaLink: '#kits',
    ordem: 5,
  },
];

const DEPOIMENTOS: Omit<Prisma.DepoimentoCreateInput, 'avatar' | 'ordem'>[] = [
  { nome: 'Mariana Alves', cidade: 'São Paulo, SP', tempo: 'Assinante há 8 meses', texto: 'A caixa de julho veio com uma paleta que eu queria comprar havia meses. Vale muito mais do que eu pago.' },
  { nome: 'Camila Souza', cidade: 'Belo Horizonte, MG', tempo: 'Cliente desde 2025', texto: 'Comprei o Kit Pele Perfeita para testar e acabei assinando. Entrega rápida e embalagem impecável.' },
  { nome: 'Juliana Pires', cidade: 'Curitiba, PR', tempo: 'Assinante há 1 ano', texto: 'Dei o Kit Completo Deluxe de presente para minha irmã. Ela achou que era de marca importada.' },
  { nome: 'Larissa Rocha', cidade: 'Recife, PE', tempo: 'Assinante há 5 meses', texto: 'O que mais gosto é não saber o que vem. Toda vez descubro uma marca nova que não conhecia.' },
  { nome: 'Beatriz Fontes', cidade: 'Porto Alegre, RS', tempo: 'Cliente desde 2024', texto: 'Chegou em quatro dias aqui no Sul, com rastreio funcionando direitinho. Nada quebrado.' },
  { nome: 'Tatiane Nunes', cidade: 'Salvador, BA', tempo: 'Assinante há 3 meses', texto: 'A base do Kit Essencial acertou meu tom de primeira, coisa que nunca acontece comigo.' },
  { nome: 'Amanda Vieira', cidade: 'Fortaleza, CE', tempo: 'Assinante há 7 meses', texto: 'Cancelei um mês porque estava apertada e voltei no seguinte, sem multa e sem drama nenhum.' },
  { nome: 'Renata Dias', cidade: 'Campinas, SP', tempo: 'Cliente desde 2025', texto: 'O Kit Olhar Marcante virou meu padrão para trabalhar. A paleta rende muito mais do que eu esperava.' },
  { nome: 'Patrícia Campos', cidade: 'Goiânia, GO', tempo: 'Assinante há 10 meses', texto: 'Já indiquei para cinco amigas. Três assinaram no mesmo mês e ninguém se arrependeu.' },
  { nome: 'Gabriela Martins', cidade: 'Florianópolis, SC', tempo: 'Assinante há 2 meses', texto: 'O atendimento no WhatsApp respondeu em minutos quando errei o endereço. Resolveram na hora.' },
  { nome: 'Sabrina Lima', cidade: 'Manaus, AM', tempo: 'Cliente desde 2025', texto: 'Moro longe e sempre pago caro no frete. Aqui veio grátis e chegou antes do prazo previsto.' },
  { nome: 'Vanessa Cardoso', cidade: 'Brasília, DF', tempo: 'Assinante há 6 meses', texto: 'Uso o desconto de assinante para comprar refil dos kits. No fim das contas, a assinatura se paga.' },
  { nome: 'Daniela Araújo', cidade: 'Natal, RN', tempo: 'Assinante há 4 meses', texto: 'A curadoria é honesta. Nunca recebi aquele produto de encher caixa que ninguém usa.' },
  { nome: 'Karina Mendes', cidade: 'Vitória, ES', tempo: 'Cliente desde 2024', texto: 'Comprei o Kit Lábios Glow no lançamento. O gloss é o melhor que já usei nessa faixa de preço.' },
  { nome: 'Nathália Barbosa', cidade: 'Belém, PA', tempo: 'Assinante há 9 meses', texto: 'Abrir a caixa virou meu programa do mês. Minha filha já espera junto comigo.' },
];

const CONTRATO_RASCUNHO = `CONTRATO DE ASSINATURA — GLOW BOX MENSAL

ATENÇÃO: este é um RASCUNHO gerado automaticamente para o site funcionar.
Ele NÃO foi redigido nem revisado por advogado. Substitua pelo seu contrato
em Admin > Configurações antes de vender para o público.

1. OBJETO
A Glow Make entrega, mensalmente, uma caixa com produtos de maquiagem
selecionados pela equipe, cujo conteúdo varia a cada edição e não é escolhido
pelo assinante.

2. VALOR E COBRANÇA
A assinatura custa o valor informado no site no momento da contratação,
cobrado automaticamente a cada mês pela plataforma de pagamentos Asaas, na
forma escolhida pelo assinante. O valor pode ser reajustado mediante aviso
prévio de 30 dias.

3. ENTREGA
O envio ocorre após a confirmação do pagamento de cada mês, para o endereço
informado no cadastro. É responsabilidade do assinante manter o endereço
atualizado. Entregas devolvidas por endereço incorreto podem ser reenviadas
mediante novo pagamento de frete.

4. CANCELAMENTO
O assinante pode cancelar a qualquer momento, sem multa, pelos canais de
atendimento. O cancelamento vale para as cobranças seguintes; o mês já pago
é entregue normalmente.

5. DIREITO DE ARREPENDIMENTO
Nos termos do art. 49 do Código de Defesa do Consumidor, o assinante pode
desistir em até 7 dias corridos contados do recebimento da primeira caixa,
com devolução do valor pago, desde que os produtos sejam devolvidos lacrados
e sem uso.

6. TROCAS
Produtos avariados no transporte são substituídos mediante comunicação em até
7 dias do recebimento, com foto do item e da embalagem. Por se tratar de
cosméticos, não há troca por preferência pessoal após a abertura.

7. DADOS PESSOAIS
Os dados são usados para processar pagamento, entregar as caixas e, havendo
consentimento específico, para comunicações comerciais. O assinante pode
solicitar acesso, correção ou exclusão a qualquer momento, conforme a Lei
13.709/2018 (LGPD).

8. FORO
Fica eleito o foro da comarca de João Pessoa/PB para dirimir controvérsias.`;

async function main() {
  console.log('Semeando o banco da Glow Make...');

  for (const kit of KITS) {
    await prisma.kit.upsert({
      where: { sku: kit.sku },
      // update deliberadamente vazio: rodar o seed de novo não pode zerar
      // estoque nem sobrescrever preço que já foi ajustado no admin.
      update: {},
      create: kit,
    });
  }
  console.log(`  ${KITS.length} produtos`);

  // Banner é atualizado pela ORDEM, não recriado: assim as artes oficiais
  // substituem os placeholders sem duplicar nem apagar ajuste feito no admin.
  for (const b of BANNERS) {
    const existente = await prisma.banner.findFirst({ where: { ordem: b.ordem } });
    if (existente) await prisma.banner.update({ where: { id: existente.id }, data: b });
    else await prisma.banner.create({ data: b });
  }
  console.log(`  ${BANNERS.length} banners`);

  if ((await prisma.depoimento.count()) === 0) {
    await prisma.depoimento.createMany({
      data: DEPOIMENTOS.map((d, i) => ({
        ...d,
        avatar: `/assets/avatares/avatar-${i + 1}.jpg`,
        ordem: i + 1,
      })),
    });
    console.log(`  ${DEPOIMENTOS.length} depoimentos`);
  }

  if ((await prisma.foto.count()) === 0) {
    await prisma.foto.createMany({
      data: Array.from({ length: 8 }, (_, i) => ({
        url: `/assets/galeria/g-${i + 1}.jpg`,
        ordem: i + 1,
      })),
    });
    console.log('  8 fotos da galeria');
  }

  await prisma.config.upsert({
    where: { id: 'config' },
    // Só preenche o contrato se ainda estiver vazio. Assim o rascunho aparece
    // em quem já tem config criada, sem nunca sobrescrever o contrato de
    // verdade depois que o Irlan colar o dele.
    update: {},
    create: {
      id: 'config',
      contratoTexto: CONTRATO_RASCUNHO,
      avisos: [
        // Frete grátis é por cidade (cidadeFreteGratis), não por valor de
        // compra. O antigo "acima de R$ 199" descrevia uma regra que não existe.
        'Frete grátis para João Pessoa',
        'Parcele em até 6x sem juros no cartão',
        'Assine a Glow Box até dia 10 e receba a edição deste mês',
      ],
    },
  });
  const cfg = await prisma.config.findUnique({ where: { id: 'config' } });
  if (cfg && !cfg.contratoTexto.trim()) {
    await prisma.config.update({
      where: { id: 'config' },
      data: { contratoTexto: CONTRATO_RASCUNHO },
    });
    console.log('  rascunho de contrato preenchido');
  }
  console.log('  configurações da loja');

  // Checa produto a produto, e não a tabela inteira: assim um kit criado
  // depois também ganha a linha de entrada inicial no histórico.
  const kits = await prisma.kit.findMany();
  for (const k of kits) {
    const jaTem = await prisma.movimentacao.count({ where: { sku: k.sku } });
    if (jaTem > 0) continue;
    await prisma.movimentacao.create({
      data: {
        sku: k.sku,
        nome: k.nome,
        tipo: 'ENTRADA',
        qtd: k.entradas,
        origem: 'Estoque inicial (seed)',
        saldoApos: k.entradas - k.saidas,
      },
    });
    console.log(`  histórico inicial de ${k.sku}`);
  }

  console.log('Pronto.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
