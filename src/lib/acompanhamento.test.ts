import { describe, it, expect } from 'vitest';
import {
  mesmoDocumento,
  validarCredenciais,
  etapaDoPedido,
  situacaoCancelamento,
  linkRastreio,
  efeitoCancelamentoAssinatura,
  trechoCancelamento,
  linkWhatsapp,
} from './acompanhamento';

const semCancelamento = {
  cancelamentoSolicitadoEm: null,
  cancelamentoRespondidoEm: null,
  cancelamentoResposta: null,
};

describe('mesmoDocumento', () => {
  it('compara so os digitos, com ou sem mascara', () => {
    expect(mesmoDocumento('529.982.247-25', '52998224725')).toBe(true);
    expect(mesmoDocumento('52998224725', '529.982.247-26')).toBe(false);
  });

  it('nunca casa documento vazio ou curto', () => {
    // Sem isto, dois documentos em branco seriam "iguais" e liberariam o pedido.
    expect(mesmoDocumento('', '')).toBe(false);
    expect(mesmoDocumento('123', '123')).toBe(false);
  });
});

describe('validarCredenciais', () => {
  it('normaliza o e-mail como o checkout grava', () => {
    expect(validarCredenciais({ email: '  Ana@Exemplo.COM ', documento: '529.982.247-25' })).toEqual({
      email: 'ana@exemplo.com',
      documento: '529.982.247-25',
    });
  });

  it('recusa e-mail ou documento invalidos', () => {
    expect(validarCredenciais({ email: 'ana', documento: '529.982.247-25' })).toHaveProperty('erro');
    expect(validarCredenciais({ email: 'ana@exemplo.com', documento: '111.111.111-11' })).toHaveProperty('erro');
    expect(validarCredenciais(null)).toHaveProperty('erro');
  });
});

describe('etapaDoPedido', () => {
  it('ordena as etapas e deixa cancelado fora da linha', () => {
    expect(etapaDoPedido('AGUARDANDO_PAGAMENTO')).toBe(0);
    expect(etapaDoPedido('ENTREGUE')).toBe(4);
    expect(etapaDoPedido('CANCELADO')).toBe(-1);
  });
});

describe('situacaoCancelamento', () => {
  it('antes de sair para entrega, pode solicitar', () => {
    for (const status of ['AGUARDANDO_PAGAMENTO', 'PAGO', 'EM_SEPARACAO']) {
      expect(situacaoCancelamento({ status, ...semCancelamento }).tipo).toBe('pode-solicitar');
    }
  });

  it('depois de enviado, nao', () => {
    expect(situacaoCancelamento({ status: 'ENVIADO', ...semCancelamento }).tipo).toBe('ja-enviado');
    expect(situacaoCancelamento({ status: 'ENTREGUE', ...semCancelamento }).tipo).toBe('ja-enviado');
  });

  it('solicitado e sem resposta fica pendente', () => {
    const s = situacaoCancelamento({
      status: 'PAGO',
      ...semCancelamento,
      cancelamentoSolicitadoEm: new Date('2026-09-10T12:00:00Z'),
    });
    expect(s).toEqual({ tipo: 'pendente', solicitadoEm: '2026-09-10T12:00:00.000Z' });
  });

  it('respondido com o pedido de pe e recusa, e nao reabre', () => {
    const s = situacaoCancelamento({
      status: 'PAGO',
      cancelamentoSolicitadoEm: new Date(),
      cancelamentoRespondidoEm: new Date(),
      cancelamentoResposta: 'Ja foi postado.',
    });
    expect(s).toEqual({ tipo: 'recusado', resposta: 'Ja foi postado.' });
  });

  it('cancelado ganha de tudo', () => {
    const s = situacaoCancelamento({
      status: 'CANCELADO',
      cancelamentoSolicitadoEm: new Date(),
      cancelamentoRespondidoEm: new Date(),
      cancelamentoResposta: null,
    });
    expect(s.tipo).toBe('cancelado');
  });
});

describe('linkRastreio', () => {
  it('monta o link dos Correios, que e o padrao das Entregas', () => {
    expect(linkRastreio('AA123456789BR', 'Correios')).toContain('objetos=AA123456789BR');
    expect(linkRastreio('AA123456789BR', null)).toContain('objetos=');
  });

  it('sem codigo ou com outra transportadora, nao inventa link', () => {
    expect(linkRastreio(null, 'Correios')).toBeNull();
    expect(linkRastreio('JD123', 'Jadlog')).toBeNull();
  });
});

describe('efeitoCancelamentoAssinatura', () => {
  it('so devolve a caixa se a assinatura nunca foi paga', () => {
    expect(efeitoCancelamentoAssinatura('AGUARDANDO_PAGAMENTO')).toEqual({ podeCancelar: true, devolveCaixa: true });
    expect(efeitoCancelamentoAssinatura('ATIVA')).toEqual({ podeCancelar: true, devolveCaixa: false });
    // Atrasada pode ser a primeira ou a quinta mensalidade: na duvida, nao cria estoque.
    expect(efeitoCancelamentoAssinatura('ATRASADA')).toEqual({ podeCancelar: true, devolveCaixa: false });
  });

  it('cancelada nao cancela de novo', () => {
    expect(efeitoCancelamentoAssinatura('CANCELADA').podeCancelar).toBe(false);
  });
});

describe('trechoCancelamento', () => {
  const contrato = [
    'CONTRATO',
    '3. ENTREGA',
    'Envio apos o pagamento.',
    '',
    '4. CANCELAMENTO',
    'Pode cancelar a qualquer momento.',
    'Vale em 7 dias.',
    '',
    '5. DIREITO DE ARREPENDIMENTO',
    'Ate 7 dias.',
  ].join('\n');

  it('recorta ate a proxima clausula numerada', () => {
    expect(trechoCancelamento(contrato)).toBe(
      '4. CANCELAMENTO\nPode cancelar a qualquer momento.\nVale em 7 dias.'
    );
  });

  it('linha comecando com numero sem ponto nao corta a clausula', () => {
    expect(trechoCancelamento('4. CANCELAMENTO\n7 dias de prazo.')).toBe('4. CANCELAMENTO\n7 dias de prazo.');
  });

  it('contrato sem a clausula devolve null', () => {
    expect(trechoCancelamento('1. OBJETO\nTexto.')).toBeNull();
  });

  it('funciona com quebra de linha do Windows, que e como o contrato esta gravado', () => {
    const t = trechoCancelamento('4. CANCELAMENTO\r\nPode cancelar.\r\n\r\n5. ARREPENDIMENTO\r\nAte 7 dias.');
    expect(t).toContain('Pode cancelar.');
    expect(t).not.toContain('ARREPENDIMENTO');
  });
});

describe('linkWhatsapp', () => {
  it('ignora o placeholder do banco', () => {
    expect(linkWhatsapp('(00) 00000-0000')).toBeNull();
    expect(linkWhatsapp('')).toBeNull();
  });

  it('poe o 55 quando falta', () => {
    expect(linkWhatsapp('(83) 99999-1234')).toBe('https://wa.me/5583999991234');
    expect(linkWhatsapp('+55 83 99999-1234')).toBe('https://wa.me/5583999991234');
  });
});
