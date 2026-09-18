import { describe, it, expect } from 'vitest';
import { avisosPublicaveis, ehDepoimentoDeExemplo, iniciais, semPromocaoEncerrada } from './conteudo';

describe('ehDepoimentoDeExemplo', () => {
  it('reconhece so as fotos que o seed usava', () => {
    expect(ehDepoimentoDeExemplo('/assets/avatares/avatar-3.jpg')).toBe(true);
    expect(ehDepoimentoDeExemplo('https://cdn.exemplo.com/cliente.jpg')).toBe(false);
    expect(ehDepoimentoDeExemplo('')).toBe(false);
  });
});

describe('semPromocaoEncerrada', () => {
  it('tira os 10% da lista de beneficios da assinatura e mantem o frete', () => {
    const itens = [
      'Curadoria nova a cada mes, nunca repetida',
      'Frete incluso para todo o Brasil',
      'Dez por cento de desconto em qualquer kit avulso',
      'Acesso antecipado aos lancamentos',
    ];
    expect(semPromocaoEncerrada(itens)).toEqual([
      'Curadoria nova a cada mes, nunca repetida',
      'Frete incluso para todo o Brasil',
      'Acesso antecipado aos lancamentos',
    ]);
  });

  it('pega "10%" e "10 %", mas nao 100% nem 110%', () => {
    expect(semPromocaoEncerrada(['Ganhe 10% OFF', 'Ganhe 10 % OFF'])).toEqual([]);
    expect(semPromocaoEncerrada(['100% vegano', '110% de amor'])).toEqual(['100% vegano', '110% de amor']);
  });
});

describe('avisosPublicaveis', () => {
  it('tira frete gratis geral e a promocao, mantem o resto', () => {
    const avisos = [
      'Frete grátis para João Pessoa',
      'Entrega gratis em toda a cidade',
      'Parcele em até 6x sem juros no cartão',
      'Ganhe dez por cento na primeira compra',
    ];
    expect(avisosPublicaveis(avisos)).toEqual(['Parcele em até 6x sem juros no cartão']);
  });
});

describe('avisosPublicaveis com a assinatura oculta', () => {
  const avisos = [
    'Assine a Glow Box até dia 10 e receba a edição deste mês',
    'Parcele em até 6x sem juros no cartão',
    'Conheça a Glowbox',
  ];

  it('tira o aviso da assinatura só quando ela está oculta', () => {
    expect(avisosPublicaveis(avisos, { assinaturaAtiva: false })).toEqual(['Parcele em até 6x sem juros no cartão']);
    expect(avisosPublicaveis(avisos, { assinaturaAtiva: true })).toEqual(avisos);
    expect(avisosPublicaveis(avisos)).toEqual(avisos);
  });
});

describe('iniciais', () => {
  it('usa primeira e ultima palavra', () => {
    expect(iniciais('Ana Maria de Souza')).toBe('AS');
    expect(iniciais('  ana  ')).toBe('A');
    expect(iniciais('')).toBe('');
  });
});
