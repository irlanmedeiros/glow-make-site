import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { consultarCep } from '@/lib/frete';

/**
 * O cache de CEP existe para tirar o ViaCEP do caminho crítico da compra — foi
 * ele que desabou com 12 compras simultâneas no teste de carga em produção.
 *
 * Testes de integração contra Postgres de verdade: o ponto é o que acontece
 * entre a função e o banco, e isso mock nenhum prova.
 */

const prisma = new PrismaClient();
const CEP = '58013420';

beforeAll(() => {
  const url = process.env.DATABASE_URL ?? '';
  if (!url) throw new Error('DATABASE_URL não configurada.');
  if (/prod|production/i.test(url) && !/dev/i.test(url)) {
    throw new Error('DATABASE_URL parece produção. Estes testes escrevem no banco.');
  }
});
afterAll(async () => {
  await prisma.cepConsultado.deleteMany({ where: { cep: { in: [CEP, '01310100', '99999999'] } } });
  await prisma.$disconnect();
});
beforeEach(async () => {
  await prisma.cepConsultado.deleteMany({ where: { cep: { in: [CEP, '01310100', '99999999'] } } });
  vi.restoreAllMocks();
});

/* Uma Response NOVA por chamada: o corpo de uma Response só pode ser lido uma
   vez, e o teste de concorrência faz seis chamadas de uma vez. Reusar a mesma
   instância faria cinco delas falharem — erro do teste, não do código. */
function fingirViaCep(corpo: unknown, ok = true) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async () =>
    new Response(JSON.stringify(corpo), {
      status: ok ? 200 : 500,
      headers: { 'Content-Type': 'application/json' },
    })
  );
}

const RESPOSTA = { localidade: 'João Pessoa', uf: 'PB', logradouro: 'Avenida Dom Pedro II', bairro: 'Centro' };

describe('consultarCep — primeira consulta', () => {
  it('busca no ViaCEP e guarda o endereço', async () => {
    const spy = fingirViaCep(RESPOSTA);
    const r = await consultarCep(CEP);

    expect(r).toEqual({ cep: CEP, cidade: 'João Pessoa', uf: 'PB' });
    expect(spy).toHaveBeenCalledTimes(1);

    // A gravação não segura a resposta; espera o banco alcançar.
    await vi.waitFor(async () => {
      const salvo = await prisma.cepConsultado.findUnique({ where: { cep: CEP } });
      expect(salvo?.cidade).toBe('João Pessoa');
      expect(salvo?.logradouro).toBe('Avenida Dom Pedro II');
      expect(salvo?.bairro).toBe('Centro');
    });
  });

  it('aceita CEP com máscara e guarda só os dígitos', async () => {
    fingirViaCep(RESPOSTA);
    const r = await consultarCep('58013-420');
    expect(r?.cep).toBe(CEP);
    await vi.waitFor(async () => {
      expect(await prisma.cepConsultado.findUnique({ where: { cep: CEP } })).not.toBeNull();
    });
  });
});

describe('consultarCep — segunda consulta', () => {
  it('responde do banco SEM chamar o ViaCEP', async () => {
    await prisma.cepConsultado.create({
      data: { cep: CEP, cidade: 'João Pessoa', uf: 'PB', logradouro: 'Av Dom Pedro II', bairro: 'Centro' },
    });
    const spy = vi.spyOn(globalThis, 'fetch');

    const r = await consultarCep(CEP);

    expect(r).toEqual({ cep: CEP, cidade: 'João Pessoa', uf: 'PB' });
    // É o ponto inteiro do cache: o terceiro sai do caminho crítico.
    expect(spy).not.toHaveBeenCalled();
  });
});

describe('consultarCep — o que NÃO pode acontecer', () => {
  it('não guarda CEP inexistente — os Correios criam CEP novo', async () => {
    fingirViaCep({ erro: 'true' });
    expect(await consultarCep('99999999')).toBeNull();
    await new Promise((r) => setTimeout(r, 300));
    expect(await prisma.cepConsultado.findUnique({ where: { cep: '99999999' } })).toBeNull();
  });

  it('não guarda quando o ViaCEP responde erro HTTP', async () => {
    fingirViaCep({}, false);
    expect(await consultarCep(CEP)).toBeNull();
    await new Promise((r) => setTimeout(r, 300));
    expect(await prisma.cepConsultado.findUnique({ where: { cep: CEP } })).toBeNull();
  });

  it('ViaCEP fora do ar devolve null em vez de lançar', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('rede caiu'));
    await expect(consultarCep(CEP)).resolves.toBeNull();
  });

  it('CEP com tamanho errado nem chega ao banco nem ao ViaCEP', async () => {
    const spy = vi.spyOn(globalThis, 'fetch');
    for (const c of ['', '580', '5801342012', 'abcdefgh']) {
      expect(await consultarCep(c), c).toBeNull();
    }
    expect(spy).not.toHaveBeenCalled();
  });

  it('duas consultas do mesmo CEP ao mesmo tempo não quebram por chave duplicada', async () => {
    fingirViaCep(RESPOSTA);
    const todos = await Promise.all(Array.from({ length: 6 }, () => consultarCep(CEP)));
    expect(todos.every((r) => r?.cidade === 'João Pessoa')).toBe(true);
    await vi.waitFor(async () => {
      expect(await prisma.cepConsultado.count({ where: { cep: CEP } })).toBe(1);
    });
  });
});
