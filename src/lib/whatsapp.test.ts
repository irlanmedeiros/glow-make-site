import { describe, expect, it } from 'vitest';
import { WHATSAPP_LOJA, linkPedidoWhatsapp, mensagemPedido } from './whatsapp';

const PEDIDO = {
  numero: 42,
  itens: [
    { nome: 'KIT MAYARA', qtd: 2, preco: 35 },
    { nome: 'Batom Nude', qtd: 1, preco: 29.9 },
  ],
  total: 99.9,
  nome: 'Maria Silva',
  cep: '58056030',
  endereco: 'Rua das Flores',
  enderecoNumero: '123',
  complemento: 'Apto 4',
  bairro: 'Centro',
  cidade: 'João Pessoa',
  uf: 'PB',
};

describe('mensagemPedido', () => {
  it('leva o numero do pedido, os itens e o endereco', () => {
    const m = mensagemPedido(PEDIDO);
    expect(m).toContain('#42');
    expect(m).toContain('2x KIT MAYARA');
    expect(m).toContain('1x Batom Nude');
    expect(m).toContain('Rua das Flores, 123 — Apto 4');
    expect(m).toContain('Centro');
    expect(m).toContain('João Pessoa/PB');
    expect(m).toContain('CEP 58056-030');
    expect(m).toContain('Maria Silva');
  });

  it('multiplica preco por quantidade, em vez de repetir o unitario', () => {
    expect(mensagemPedido(PEDIDO)).toContain('2x KIT MAYARA — R$ 70,00');
  });

  it('mostra o total dos produtos, que no motoboy e o que foi cobrado', () => {
    expect(mensagemPedido(PEDIDO)).toContain('Total dos produtos: R$ 99,90');
  });

  /* O complemento e opcional no checkout. Sem esta juncao condicional a
     mensagem saia com um " — " pendurado no fim da rua. */
  it('nao deixa separador solto quando o complemento esta vazio', () => {
    const m = mensagemPedido({ ...PEDIDO, complemento: '' });
    expect(m).toContain('Rua das Flores, 123');
    expect(m).not.toContain('—\n');
    expect(m).not.toMatch(/123 —\s*$/m);
  });

  it('aguenta bairro e cidade vazios sem gerar linha em branco no meio', () => {
    const m = mensagemPedido({ ...PEDIDO, bairro: '', cidade: '', uf: '' });
    expect(m).not.toMatch(/\n\n\n/);
    expect(m).toContain('CEP 58056-030');
  });

  it('deixa o CEP como veio quando nao tem 8 digitos', () => {
    expect(mensagemPedido({ ...PEDIDO, cep: '5805' })).toContain('CEP 5805');
  });
});

describe('linkPedidoWhatsapp', () => {
  it('usa o numero de Configuracoes quando ele e valido', () => {
    const l = linkPedidoWhatsapp('(83) 98818-7878', PEDIDO)!;
    expect(l.startsWith('https://wa.me/5583988187878?text=')).toBe(true);
  });

  /* O banco nasce com "(00) 00000-0000". Sem a queda para a constante o botao
     desapareceria justo no pedido de motoboy, que e quem mais precisa dele. */
  it('cai no numero da loja quando Configuracoes esta no placeholder', () => {
    const l = linkPedidoWhatsapp('(00) 00000-0000', PEDIDO)!;
    expect(l).toContain(`wa.me/55${WHATSAPP_LOJA}`);
  });

  it('cai no numero da loja quando Configuracoes esta vazio', () => {
    expect(linkPedidoWhatsapp('', PEDIDO)).toContain(`wa.me/55${WHATSAPP_LOJA}`);
  });

  it('nao duplica o 55 de um numero ja internacional', () => {
    const l = linkPedidoWhatsapp('+55 83 98818-7878', PEDIDO)!;
    expect(l).toContain('wa.me/5583988187878');
    expect(l).not.toContain('5555');
  });

  it('escapa a mensagem: nenhuma quebra de linha crua na URL', () => {
    const l = linkPedidoWhatsapp('', PEDIDO)!;
    expect(l).not.toContain('\n');
    expect(l).toContain('%0A');
  });

  it('o texto da URL decodificado e a propria mensagem', () => {
    const l = linkPedidoWhatsapp('', PEDIDO)!;
    const texto = decodeURIComponent(l.split('?text=')[1]);
    expect(texto).toBe(mensagemPedido(PEDIDO));
  });
});
