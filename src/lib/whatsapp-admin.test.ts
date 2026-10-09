import { describe, expect, it } from 'vitest';
import {
  type PedidoParaMensagem,
  linkClienteWhatsapp,
  linkLojaWhatsapp,
  mensagemParaCliente,
  mensagemParaLoja,
} from './whatsapp-admin';
import { WHATSAPP_LOJA } from './whatsapp';

const BASE: PedidoParaMensagem = {
  numero: 12,
  status: 'PAGO',
  criadoEm: new Date('2026-10-09T12:30:00Z'),
  pagamento: 'PIX',
  nome: 'Maria Silva Souza',
  email: 'maria@exemplo.com',
  documento: '529.982.247-25',
  telefone: '(83) 99999-1234',
  cep: '58056030',
  endereco: 'Rua das Flores',
  enderecoNumero: '123',
  complemento: 'Apto 4',
  bairro: 'Centro',
  cidade: 'João Pessoa',
  uf: 'PB',
  itens: [
    { nome: 'KIT MAYARA', qtd: 2, preco: 35 },
    { nome: 'Batom Nude', qtd: 1, preco: 29.9 },
  ],
  subtotal: 99.9,
  frete: 24.9,
  total: 124.8,
  desconto: 0,
  cupomCodigo: null,
  freteServico: 'PAC',
  transportadora: null,
  codigoRastreio: null,
  observacao: null,
  invoiceUrl: null,
};

describe('mensagemParaCliente', () => {
  it('chama a cliente pelo primeiro nome', () => {
    expect(mensagemParaCliente(BASE)).toContain('Oi, Maria!');
  });

  /* Mandar "compra confirmada" para quem ainda nao pagou e pior do que nao
     mandar nada: a pessoa para de esperar a cobranca. */
  it('muda o texto conforme o status', () => {
    expect(mensagemParaCliente(BASE)).toContain('está confirmado');
    expect(mensagemParaCliente({ ...BASE, status: 'AGUARDANDO_PAGAMENTO' })).toContain(
      'pagamento ainda não entrou'
    );
    expect(mensagemParaCliente({ ...BASE, status: 'ENVIADO' })).toContain('saiu para entrega');
    expect(mensagemParaCliente({ ...BASE, status: 'CANCELADO' })).toContain('foi cancelado');
  });

  it('nao quebra num status que ainda nao existe', () => {
    const m = mensagemParaCliente({ ...BASE, status: 'INVENTADO' });
    expect(m).toContain('#12');
    expect(m).not.toContain('undefined');
  });

  it('leva itens, totais e endereco', () => {
    const m = mensagemParaCliente(BASE);
    expect(m).toContain('2x KIT MAYARA — R$ 70,00');
    expect(m).toContain('Produtos: R$ 99,90');
    expect(m).toContain('Frete (PAC): R$ 24,90');
    expect(m).toContain('*Total: R$ 124,80*');
    expect(m).toContain('Rua das Flores, 123 — Apto 4');
    expect(m).toContain('Centro — João Pessoa/PB');
    expect(m).toContain('CEP 58056-030');
  });

  it('so mostra rastreio quando ja foi enviado e existe codigo', () => {
    const comCodigo = { ...BASE, codigoRastreio: 'AA123BR', transportadora: 'Correios' };
    expect(mensagemParaCliente(comCodigo)).not.toContain('AA123BR');
    expect(mensagemParaCliente({ ...comCodigo, status: 'ENVIADO' })).toContain(
      'Rastreio (Correios): AA123BR'
    );
  });

  /* O documento nao entra: a cliente ja sabe o CPF dela, e mandar por
     WhatsApp so espalha dado que nao precisa sair do painel. */
  /* Avisar que falta pagar sem dizer onde pagar e meio recado. */
  it('manda o link de pagamento so para quem ainda nao pagou', () => {
    const comLink = { ...BASE, invoiceUrl: 'https://asaas.com/i/abc123' };
    expect(mensagemParaCliente(comLink)).not.toContain('asaas.com/i/abc123');
    expect(
      mensagemParaCliente({ ...comLink, status: 'AGUARDANDO_PAGAMENTO' })
    ).toContain('https://asaas.com/i/abc123');
  });

  it('nao manda o CPF para a cliente', () => {
    expect(mensagemParaCliente(BASE)).not.toContain('529.982.247-25');
  });
});

describe('mensagemParaLoja', () => {
  it('leva quem e, para onde vai e o que separar', () => {
    const m = mensagemParaLoja(BASE);
    expect(m).toContain('*Pedido #12 — Pago*');
    expect(m).toContain('Maria Silva Souza');
    expect(m).toContain('(83) 99999-1234');
    expect(m).toContain('CPF/CNPJ 529.982.247-25');
    expect(m).toContain('2x KIT MAYARA');
    expect(m).toContain('Rua das Flores, 123 — Apto 4');
  });

  it('mostra o cupom quando houve desconto', () => {
    const m = mensagemParaLoja({ ...BASE, desconto: 10, cupomCodigo: 'GLOW10' });
    expect(m).toContain('Cupom GLOW10: − R$ 10,00');
  });

  it('leva a observacao do pedido quando existe', () => {
    const m = mensagemParaLoja({ ...BASE, observacao: 'Combinar horário' });
    expect(m).toContain('Obs: Combinar horário');
  });

  /* Frete zero no motoboy e "ainda nao cobrado", nao brinde — ver lib/frete.ts. */
  it('no motoboy diz "a combinar", nunca "gratis"', () => {
    const m = mensagemParaLoja({
      ...BASE,
      frete: 0,
      freteServico: 'Motoboy — entrega no mesmo dia',
    });
    expect(m).toContain('a combinar');
    expect(m).not.toContain('grátis');
  });

  it('frete zero fora do motoboy continua sendo gratis', () => {
    expect(mensagemParaLoja({ ...BASE, frete: 0, freteServico: 'PAC' })).toContain('grátis');
  });
});

describe('links', () => {
  it('a cliente recebe no telefone do proprio pedido', () => {
    expect(linkClienteWhatsapp(BASE)).toContain('wa.me/5583999991234');
  });

  it('sem telefone utilizavel devolve null, para a tela desabilitar o botao', () => {
    expect(linkClienteWhatsapp({ ...BASE, telefone: '(00) 0000-0000' })).toBeNull();
    expect(linkClienteWhatsapp({ ...BASE, telefone: '' })).toBeNull();
  });

  it('a loja usa Configuracoes, e cai no numero fixo no placeholder', () => {
    expect(linkLojaWhatsapp('(83) 98818-7878', BASE)).toContain('wa.me/5583988187878');
    expect(linkLojaWhatsapp('(00) 00000-0000', BASE)).toContain(`wa.me/55${WHATSAPP_LOJA}`);
  });

  it('o texto vai escapado e volta igual a mensagem', () => {
    const l = linkClienteWhatsapp(BASE)!;
    expect(l).not.toContain('\n');
    expect(decodeURIComponent(l.split('?text=')[1])).toBe(mensagemParaCliente(BASE));
  });
});
