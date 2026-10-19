import { describe, it, expect } from 'vitest';
import { cotacaoEhDoCep, ehMotoboy, SERVICO_MOTOBOY } from './entrega';

/**
 * A pessoa digita um CEP, corrige para outro, e as duas cotações voltam fora
 * de ordem. Se a primeira chegar por último, a tela volta a mostrar as opções
 * do CEP ERRADO — e na região da loja isso punha o motoboy na frente de quem
 * mora longe.
 */
describe('cotacaoEhDoCep', () => {
  const cep = '58032030';

  it('aceita a resposta do mesmo CEP, com ou sem traço', () => {
    expect(cotacaoEhDoCep({ destino: { cep: '58032030' } }, cep)).toBe(true);
    expect(cotacaoEhDoCep({ destino: { cep: '58032-030' } }, cep)).toBe(true);
    expect(cotacaoEhDoCep({ destino: { cep } }, '58032-030')).toBe(true);
  });

  it('descarta a resposta de outro CEP', () => {
    expect(cotacaoEhDoCep({ destino: { cep: '01310100' } }, cep)).toBe(false);
  });

  it('aceita resposta sem destino: ela não afirma cidade nenhuma', () => {
    expect(cotacaoEhDoCep({ destino: null }, cep)).toBe(true);
    expect(cotacaoEhDoCep({}, cep)).toBe(true);
    expect(cotacaoEhDoCep(null, cep)).toBe(true);
  });

  it('CEP incompleto na tela não aceita resposta nenhuma', () => {
    expect(cotacaoEhDoCep({ destino: { cep } }, '5803')).toBe(false);
    expect(cotacaoEhDoCep({ destino: { cep } }, '')).toBe(false);
  });
});

describe('ehMotoboy', () => {
  it('reconhece o serviço do motoboy e só ele', () => {
    expect(ehMotoboy(SERVICO_MOTOBOY)).toBe(true);
    expect(ehMotoboy('SEDEX')).toBe(false);
    expect(ehMotoboy('Frete padrão')).toBe(false);
    expect(ehMotoboy(null)).toBe(false);
  });
});
