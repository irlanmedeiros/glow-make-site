export type DadosCliente = {
  nome: string;
  email: string;
  documento: string;
  telefone: string;
  cep: string;
  pagamento: string;
};

const PAGAMENTOS = ['UNDEFINED', 'PIX', 'BOLETO', 'CREDIT_CARD'];

const texto = (v: unknown, max = 160) =>
  typeof v === 'string' ? v.trim().slice(0, max) : '';

/** Valida CPF (11) ou CNPJ (14) pelos dígitos verificadores. */
export function documentoValido(bruto: string): boolean {
  const d = bruto.replace(/\D/g, '');

  if (d.length === 11) {
    if (/^(\d)\1{10}$/.test(d)) return false;
    for (const [fim, peso] of [
      [9, 10],
      [10, 11],
    ] as const) {
      let soma = 0;
      for (let i = 0; i < fim; i++) soma += Number(d[i]) * (peso - i);
      const resto = (soma * 10) % 11 % 10;
      if (resto !== Number(d[fim])) return false;
    }
    return true;
  }

  if (d.length === 14) {
    if (/^(\d)\1{13}$/.test(d)) return false;
    const calc = (fim: number) => {
      const pesos = fim === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
      let soma = 0;
      for (let i = 0; i < fim; i++) soma += Number(d[i]) * pesos[i];
      const resto = soma % 11;
      return resto < 2 ? 0 : 11 - resto;
    };
    return calc(12) === Number(d[12]) && calc(13) === Number(d[13]);
  }

  return false;
}

export function validarCliente(bruto: unknown): DadosCliente | { erro: string } {
  const c = (bruto ?? {}) as Record<string, unknown>;

  const nome = texto(c.nome);
  if (nome.length < 3) return { erro: 'Informe seu nome completo.' };

  const email = texto(c.email).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return { erro: 'E-mail inválido.' };

  const documento = texto(c.documento, 20);
  if (!documentoValido(documento)) return { erro: 'CPF ou CNPJ inválido.' };

  const telefone = texto(c.telefone, 20);
  const soDigitos = telefone.replace(/\D/g, '');
  if (soDigitos.length < 10 || soDigitos.length > 13) return { erro: 'Celular inválido.' };

  const cep = texto(c.cep, 12);
  if (cep.replace(/\D/g, '').length !== 8) return { erro: 'CEP inválido.' };

  const pagamentoBruto = texto(c.pagamento, 20);
  const pagamento = PAGAMENTOS.includes(pagamentoBruto) ? pagamentoBruto : 'UNDEFINED';

  return { nome, email, documento, telefone, cep, pagamento };
}
