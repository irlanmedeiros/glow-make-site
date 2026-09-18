import { describe, it, expect, afterEach } from 'vitest';
import { PrismaClient } from '@prisma/client';

/**
 * Com a assinatura oculta, a rota recusa antes de fazer qualquer coisa:
 * nao valida dados, nao baixa estoque da caixa, nao grava assinante.
 */
delete process.env.ASAAS_API_KEY;

const prisma = new PrismaClient();
const EMAIL = 'teste-int-assinatura-oculta@glowmake.test';
const original = process.env.SUBSCRIPTION_ENABLED;

afterEach(async () => {
  if (original === undefined) delete process.env.SUBSCRIPTION_ENABLED;
  else process.env.SUBSCRIPTION_ENABLED = original;
  await prisma.assinante.deleteMany({ where: { email: EMAIL } });
});

async function assinar(corpo: unknown) {
  const { POST } = await import('@/app/api/assinatura/route');
  const r = await POST(
    new Request('http://localhost/api/assinatura', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(corpo),
    })
  );
  return { status: r.status, corpo: await r.json() };
}

const cliente = {
  nome: 'Assinante Teste', email: EMAIL, documento: '529.982.247-25', telefone: '(83) 99999-0000',
  cep: '58056-030', endereco: 'Rua de Teste', enderecoNumero: '10', complemento: '',
  bairro: 'Centro', cidade: 'João Pessoa', uf: 'PB', pagamento: 'PIX',
};

describe('assinatura oculta', () => {
  it('sem a variavel, recusa e nao grava nada nem mexe na caixa', async () => {
    delete process.env.SUBSCRIPTION_ENABLED;
    const box = await prisma.kit.findFirst({ where: { tipo: 'BOX' } });
    const r = await assinar({ cliente, aceitouContrato: true });
    expect(r.status).toBe(404);
    expect(r.corpo.erro).toMatch(/ainda não está disponível/);
    expect(await prisma.assinante.count({ where: { email: EMAIL } })).toBe(0);
    if (box) {
      const depois = await prisma.kit.findUniqueOrThrow({ where: { id: box.id } });
      expect(depois.saidas).toBe(box.saidas);
    }
  });

  it('ligada, a rota volta a funcionar (aqui para na validacao do corpo vazio)', async () => {
    process.env.SUBSCRIPTION_ENABLED = 'true';
    const r = await assinar({});
    expect(r.status).toBe(400);
    expect(r.corpo.erro).not.toMatch(/ainda não está disponível/);
  });
});
