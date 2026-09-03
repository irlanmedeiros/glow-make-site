import { describe, it, expect } from 'vitest';
import { documentoValido, validarCliente } from './validacao';

/**
 * Validação do cliente é a primeira barreira do checkout. Um CPF que passa
 * errado vira cobrança recusada no Asaas; um endereço incompleto vira pedido
 * que ninguém consegue entregar.
 */

const CLIENTE_OK = {
  nome: 'Maria Aparecida Silva',
  email: 'maria@example.com',
  documento: '111.444.777-35',
  telefone: '(83) 99999-0000',
  cep: '58013-420',
  endereco: 'Avenida Dom Pedro II',
  enderecoNumero: '100',
  complemento: 'Apto 3',
  bairro: 'Centro',
  cidade: 'João Pessoa',
  uf: 'PB',
  pagamento: 'PIX',
};

describe('documentoValido — CPF', () => {
  it('aceita CPF válido, com ou sem máscara', () => {
    expect(documentoValido('11144477735')).toBe(true);
    expect(documentoValido('111.444.777-35')).toBe(true);
    expect(documentoValido('529.982.247-25')).toBe(true);
  });

  it('recusa CPF com dígito verificador errado', () => {
    // Mesmo número do válido acima, só o último dígito trocado.
    expect(documentoValido('11144477736')).toBe(false);
    expect(documentoValido('52998224724')).toBe(false);
  });

  it('recusa os dígitos repetidos, que passam na conta mas não existem', () => {
    for (const d of ['00000000000', '11111111111', '99999999999']) {
      expect(documentoValido(d), d).toBe(false);
    }
  });

  it('recusa comprimento errado', () => {
    expect(documentoValido('1234567890')).toBe(false); // 10
    expect(documentoValido('123456789012')).toBe(false); // 12
    expect(documentoValido('')).toBe(false);
  });
});

describe('documentoValido — CNPJ', () => {
  it('aceita CNPJ válido, com ou sem máscara', () => {
    expect(documentoValido('11222333000181')).toBe(true);
    expect(documentoValido('11.222.333/0001-81')).toBe(true);
    expect(documentoValido('11444777000161')).toBe(true);
  });

  it('recusa CNPJ com dígito verificador errado', () => {
    expect(documentoValido('11222333000182')).toBe(false);
  });

  it('recusa dígitos repetidos', () => {
    expect(documentoValido('00000000000000')).toBe(false);
    expect(documentoValido('11111111111111')).toBe(false);
  });
});

describe('validarCliente — caminho feliz', () => {
  it('aceita um cliente completo e normaliza os campos', () => {
    const r = validarCliente(CLIENTE_OK);
    expect('erro' in r).toBe(false);
    if ('erro' in r) return;

    expect(r.nome).toBe('Maria Aparecida Silva');
    expect(r.pagamento).toBe('PIX');
    expect(r.uf).toBe('PB');
  });

  it('baixa o e-mail para minúsculas', () => {
    const r = validarCliente({ ...CLIENTE_OK, email: 'Maria@Example.COM' });
    expect('erro' in r).toBe(false);
    if ('erro' in r) return;
    expect(r.email).toBe('maria@example.com');
  });

  it('aceita UF em minúsculas e devolve maiúscula', () => {
    const r = validarCliente({ ...CLIENTE_OK, uf: 'pb' });
    expect('erro' in r).toBe(false);
    if ('erro' in r) return;
    expect(r.uf).toBe('PB');
  });

  it('aceita complemento vazio — é o único campo de endereço opcional', () => {
    const r = validarCliente({ ...CLIENTE_OK, complemento: '' });
    expect('erro' in r).toBe(false);
  });
});

describe('validarCliente — recusas', () => {
  const casos: [string, Record<string, unknown>, string][] = [
    ['nome curto demais', { nome: 'Jo' }, 'nome completo'],
    ['e-mail sem arroba', { email: 'maria.example.com' }, 'E-mail'],
    ['e-mail sem domínio', { email: 'maria@example' }, 'E-mail'],
    ['CPF inválido', { documento: '11111111111' }, 'CPF ou CNPJ'],
    ['telefone curto', { telefone: '8399' }, 'Celular'],
    ['CEP com menos de 8 dígitos', { cep: '58013' }, 'CEP'],
    ['rua vazia', { endereco: '' }, 'rua ou avenida'],
    ['sem número', { enderecoNumero: '' }, 'número'],
    ['bairro vazio', { bairro: '' }, 'bairro'],
    ['cidade vazia', { cidade: '' }, 'cidade'],
    ['UF inexistente', { uf: 'XX' }, 'Estado'],
  ];

  for (const [descricao, patch, trecho] of casos) {
    it(`recusa ${descricao}`, () => {
      const r = validarCliente({ ...CLIENTE_OK, ...patch });
      expect('erro' in r, descricao).toBe(true);
      if ('erro' in r) expect(r.erro).toContain(trecho);
    });
  }

  it('recusa corpo vazio ou nulo sem explodir', () => {
    expect('erro' in validarCliente(undefined)).toBe(true);
    expect('erro' in validarCliente(null)).toBe(true);
    expect('erro' in validarCliente({})).toBe(true);
  });
});

describe('validarCliente — forma de pagamento', () => {
  it('aceita as formas que o Asaas entende', () => {
    for (const p of ['PIX', 'BOLETO', 'CREDIT_CARD', 'UNDEFINED']) {
      const r = validarCliente({ ...CLIENTE_OK, pagamento: p });
      expect('erro' in r).toBe(false);
      if (!('erro' in r)) expect(r.pagamento).toBe(p);
    }
  });

  it('cai para UNDEFINED em vez de aceitar valor arbitrário do navegador', () => {
    // Deixar passar um valor livre daqui iria direto para a API do Asaas.
    const r = validarCliente({ ...CLIENTE_OK, pagamento: 'DINHEIRO_VIVO' });
    expect('erro' in r).toBe(false);
    if ('erro' in r) return;
    expect(r.pagamento).toBe('UNDEFINED');
  });
});

describe('validarCliente — limites de tamanho', () => {
  it('corta campos longos em vez de recusar', () => {
    const r = validarCliente({ ...CLIENTE_OK, endereco: 'A'.repeat(500) });
    expect('erro' in r).toBe(false);
    if ('erro' in r) return;
    expect(r.endereco.length).toBe(160);
  });
});
