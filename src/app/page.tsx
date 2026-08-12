import { prisma } from '@/lib/prisma';
import { num } from '@/lib/format';
import Hero from '@/components/Hero';
import { Reveal, Contador } from '@/components/Enfeites';
import Consentimento from '@/components/Consentimento';
import {
  Loja,
  Topbar,
  Cabecalho,
  GradeKits,
  BlocoAssinatura,
  ListaBeneficios,
} from '@/components/Loja';
import {
  Estrela,
  Frete,
  Cartao,
  Coracao,
  CoracaoTraco,
  Troca,
  Instagram,
  Whatsapp,
  Tiktok,
} from '@/components/Icones';
import type {
  BannerPublico,
  ConfigPublica,
  DepoimentoPublico,
  KitPublico,
} from '@/components/tipos';

// O saldo do estoque muda a cada pedido: a home não pode ser servida de cache.
export const dynamic = 'force-dynamic';

const PASSOS = [
  {
    n: 1,
    img: '/assets/como/passo-1.jpg',
    titulo: 'Você assina',
    texto:
      'Preenche seus dados e escolhe pagar por PIX, boleto ou cartão. Leva menos de dois minutos.',
  },
  {
    n: 2,
    img: '/assets/como/passo-2.jpg',
    titulo: 'Nós montamos',
    texto: 'Todo dia 10 fechamos a edição do mês e montamos a sua caixa com a curadoria nova.',
  },
  {
    n: 3,
    img: '/assets/como/passo-3.jpg',
    titulo: 'Chega em casa',
    texto: 'Enviamos com código de rastreio e frete incluso. É só abrir e usar.',
  },
];

const PALAVRAS = [
  'Pronto para presentear',
  'Embalagem inclusa',
  'Entrega grátis em João Pessoa',
  'Amor em cada detalhe',
  'Sem fidelidade',
  'Curadoria mensal',
];

export default async function Home() {
  const [kitsDb, boxDb, bannersDb, depoimentosDb, fotosDb, configDb] = await Promise.all([
    prisma.kit.findMany({ where: { ativo: true, tipo: 'KIT' }, orderBy: { ordem: 'asc' } }),
    prisma.kit.findFirst({ where: { tipo: 'BOX' } }),
    prisma.banner.findMany({ where: { ativo: true }, orderBy: { ordem: 'asc' } }),
    prisma.depoimento.findMany({ where: { ativo: true }, orderBy: { ordem: 'asc' } }),
    prisma.foto.findMany({ where: { ativo: true }, orderBy: { ordem: 'asc' } }),
    prisma.config.findUnique({ where: { id: 'config' } }),
  ]);

  const paraPublico = (k: (typeof kitsDb)[number]): KitPublico => ({
    id: k.id,
    sku: k.sku,
    nome: k.nome,
    descricao: k.descricao,
    itens: k.itens,
    preco: num(k.preco),
    imagem: k.imagem,
    saldo: k.entradas - k.saidas,
    estoqueBaixo: k.estoqueBaixo,
  });

  const kits = kitsDb.map(paraPublico);
  const box = boxDb ? paraPublico(boxDb) : null;

  const banners: BannerPublico[] = bannersDb.map((b) => ({
    id: b.id,
    tag: b.tag,
    titulo: b.titulo,
    subtitulo: b.subtitulo,
    imagem: b.imagem,
    ctaTexto: b.ctaTexto,
    ctaLink: b.ctaLink,
  }));

  const depoimentos: DepoimentoPublico[] = depoimentosDb.map((d) => ({
    id: d.id,
    nome: d.nome,
    cidade: d.cidade,
    tempo: d.tempo,
    texto: d.texto,
    avatar: d.avatar,
    nota: d.nota,
  }));

  const config: ConfigPublica = {
    freteValor: num(configDb?.freteValor ?? 24.9),
    freteGratisAcima: num(configDb?.freteGratisAcima ?? 199),
    cidadeFreteGratis: configDb?.cidadeFreteGratis ?? 'João Pessoa',
    contratoTexto: configDb?.contratoTexto ?? '',
    contratoVersao: configDb?.contratoVersao ?? 'v1',
    metaPixelId: configDb?.metaPixelId ?? '',
    avisos: configDb?.avisos ?? [],
    whatsapp: configDb?.whatsapp ?? '',
    email: configDb?.email ?? '',
    instagram: configDb?.instagram ?? '',
    cnpj: configDb?.cnpj ?? '',
  };

  // Metade em cima, metade embaixo; cada faixa é duplicada no JSX para o loop
  // do carrossel fechar sem emenda visível.
  const meio = Math.ceil(depoimentos.length / 2);
  const faixa1 = depoimentos.slice(0, meio);
  const faixa2 = depoimentos.slice(meio);

  return (
    <Loja kits={kits} box={box} config={config}>
      <Topbar avisos={config.avisos} />
      <Cabecalho />
      <Consentimento pixelId={config.metaPixelId} />

      <Hero banners={banners} />

      <div className="perks">
        <div className="wrap perks-g">
          <div className="perk">
            <i><Frete /></i>
            <div>
              <b>Frete grátis</b>
              <span>Em {config.cidadeFreteGratis}</span>
            </div>
          </div>
          <div className="perk">
            <i><Cartao /></i>
            <div>
              <b>Até 6x sem juros</b>
              <span>PIX, boleto ou cartão</span>
            </div>
          </div>
          <div className="perk">
            <i><Coracao /></i>
            <div>
              <b>Cruelty free</b>
              <span>Não testamos em animais</span>
            </div>
          </div>
          <div className="perk">
            <i><Troca /></i>
            <div>
              <b>Troca fácil</b>
              <span>7 dias para trocar</span>
            </div>
          </div>
        </div>
      </div>

      {/* ---------- KITS ---------- */}
      <section id="kits">
        <div className="wrap">
          <Reveal>
            <div className="sec-head">
              <div className="eyebrow">Nossos kits</div>
              <h2>
                Kits prontos para <span className="script">presentear</span>
              </h2>
              <p>
                Montados um a um pela nossa equipe, com embalagem pronta para entregar. Compre
                avulso ou receba todo mês na Glow Box.
              </p>
              <div className="div-coracao">
                <CoracaoTraco size={18} />
              </div>
            </div>
          </Reveal>
          <GradeKits />
        </div>
      </section>

      {/* ---------- NÚMEROS ---------- */}
      <div className="stats">
        <div className="wrap stats-g">
          <Contador alvo={3240} rotulo="caixas entregues" />
          <Contador alvo={12800} rotulo="clientes atendidas" />
          <Contador alvo={49} decimal rotulo="nota média das avaliações" />
          <Contador alvo={27} rotulo="estados que já receberam" />
        </div>
      </div>

      {/* ---------- ASSINATURA ---------- */}
      <section id="assinatura">
        <div className="wrap">
          <Reveal>
            <div className="sub">
              <div>
                <div className="eyebrow">Assinatura mensal</div>
                <h2>Glow Box: sua caixa de beleza <span className="script">todo mês</span></h2>
                <p className="lead">
                  De quatro a seis produtos selecionados chegando na sua casa, com valor de varejo
                  acima de R$ 250. Sem fidelidade, cancele quando quiser.
                </p>
                <ListaBeneficios itens={box?.itens ?? []} />
                <BlocoAssinatura />
                <div className="pay-brands">
                  <span>PIX</span>
                  <span>Boleto</span>
                  <span>Cartão de crédito</span>
                  <span>Cobrança via Asaas</span>
                </div>
                <p className="sub-note">
                  Cobrança recorrente mensal processada pelo Asaas. Você recebe o link de pagamento
                  por e-mail e pode cancelar direto com a gente.
                </p>
              </div>
              <div className="sub-img">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={box?.imagem ?? '/assets/kits/glowbox.jpg'} alt="Glow Box mensal" />
                <div className="sub-float">
                  Edição de agosto
                  <b>Fecha dia 10</b>
                </div>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      <div className="strip">
        <div className="strip-track">
          {[...PALAVRAS, ...PALAVRAS].map((p, i) => (
            <span key={`${p}-${i}`}>
              {p}
              <i> ·</i>
            </span>
          ))}
        </div>
      </div>

      {/* ---------- COMO FUNCIONA ---------- */}
      <section id="como">
        <div className="wrap">
          <Reveal>
            <div className="sec-head">
              <div className="eyebrow">Como funciona</div>
              <h2>Três passos até a <span className="script">sua Glow Box</span></h2>
              <p>Do cadastro à entrega, sem burocracia e sem contrato de fidelidade.</p>
            </div>
          </Reveal>
          <div className="steps">
            {PASSOS.map((p, i) => (
              <Reveal key={p.n} delay={i * 90}>
                <article className="step">
                  <div className="step-img">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={p.img} alt="" loading="lazy" />
                    <div className="n">{p.n}</div>
                  </div>
                  <div className="step-body">
                    <h4>{p.titulo}</h4>
                    <p>{p.texto}</p>
                  </div>
                </article>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ---------- DEPOIMENTOS ---------- */}
      <section id="depo">
        <div className="wrap">
          <Reveal>
            <div className="sec-head">
              <div className="eyebrow">Quem já usa</div>
              <h2>Mais de três mil caixas <span className="script">entregues</span></h2>
              <p>Passe o mouse sobre um depoimento para pausar o carrossel.</p>
            </div>
          </Reveal>
        </div>

        <div className="mq">
          <div className="mq-track">
            {[...faixa1, ...faixa1].map((d, i) => (
              <CardDepoimento key={`a-${d.id}-${i}`} d={d} />
            ))}
          </div>
        </div>
        <div className="mq rev">
          <div className="mq-track">
            {[...faixa2, ...faixa2].map((d, i) => (
              <CardDepoimento key={`b-${d.id}-${i}`} d={d} />
            ))}
          </div>
        </div>

        <div className="wrap">
          <p className="depo-foot">
            Nota média <b>4,9 de 5</b> em 1.184 avaliações verificadas.
          </p>
        </div>
      </section>

      {/* ---------- GALERIA ---------- */}
      <section style={{ paddingBottom: 0 }}>
        <div className="wrap">
          <Reveal>
            <div className="sec-head">
              <div className="eyebrow">No Instagram</div>
              <h2>As caixas na casa de <span className="script">quem assina</span></h2>
              <p>Marque {config.instagram} para aparecer aqui.</p>
            </div>
          </Reveal>
          <Reveal>
            <div className="gal">
              {fotosDb.map((f, i) => (
                <a href="#" key={f.id} aria-label={`Foto ${i + 1}`}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={f.url} alt="" loading="lazy" />
                </a>
              ))}
            </div>
          </Reveal>
        </div>
      </section>

      {/* ---------- NEWSLETTER ---------- */}
      <section>
        <div className="wrap">
          <Reveal>
            <div className="news">
              <h3>Ganhe dez por cento na primeira compra</h3>
              <p>Cadastre seu e-mail e receba o cupom junto com as novidades de cada edição.</p>
              <form action="#">
                <input type="email" placeholder="seu@email.com" required aria-label="Seu e-mail" />
                <button className="btn">Quero meu cupom</button>
              </form>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ---------- RODAPÉ ---------- */}
      <footer className="site">
        <div className="wrap">
          <div className="foot">
            <div>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img className="fl" src="/assets/logo.png" alt="Glow Make" />
              <p>
                Kits de maquiagem selecionados e a Glow Box mensal entregue na sua casa. Beleza sem
                complicação.
              </p>
              <div className="socials">
                <a href="#" aria-label="Instagram"><Instagram /></a>
                <a href="#" aria-label="WhatsApp"><Whatsapp /></a>
                <a href="#" aria-label="TikTok"><Tiktok /></a>
              </div>
            </div>
            <div>
              <h5>Loja</h5>
              <ul>
                <li><a href="#kits">Todos os kits</a></li>
                <li><a href="#assinatura">Assinatura</a></li>
                <li><a href="#como">Como funciona</a></li>
                <li><a href="#depo">Avaliações</a></li>
              </ul>
            </div>
            <div>
              <h5>Ajuda</h5>
              <ul>
                <li><a href="#">Central de atendimento</a></li>
                <li><a href="#">Trocas e devoluções</a></li>
                <li><a href="#">Prazo de entrega</a></li>
                <li><a href="#">Rastrear pedido</a></li>
              </ul>
            </div>
            <div>
              <h5>Contato</h5>
              <ul>
                <li><a href="#">WhatsApp {config.whatsapp}</a></li>
                <li><a href={`mailto:${config.email}`}>{config.email}</a></li>
                <li><a href="#">{config.instagram}</a></li>
              </ul>
            </div>
          </div>
          <div className="foot-bottom">
            <span>© {new Date().getFullYear()} Glow Make · CNPJ {config.cnpj}</span>
            <span>
              <a href="/privacidade">Privacidade</a> · <a href="/privacidade">Termos</a> · <a href="/admin">Admin</a>
            </span>
          </div>
        </div>
      </footer>
    </Loja>
  );
}

function CardDepoimento({ d }: { d: DepoimentoPublico }) {
  return (
    <article className="dep">
      <div className="stars">
        {Array.from({ length: d.nota }, (_, i) => (
          <Estrela key={i} />
        ))}
      </div>
      <p>&ldquo;{d.texto}&rdquo;</p>
      <div className="dep-who">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={d.avatar} alt="" loading="lazy" />
        <div>
          <b>{d.nome}</b>
          <span>
            {d.cidade} · {d.tempo}
          </span>
        </div>
      </div>
    </article>
  );
}
