import { limparCodigo, type LinhaExtrato } from './extrato';

/**
 * Cruza o extrato da maquininha com as vendas no cartão do balcão.
 *
 * O que a loja quer saber é sempre a mesma coisa: o que passou na maquininha
 * bate com o que foi registrado no sistema? As duas sobras são o que importa:
 *
 *  - Transação sem venda: passou o cartão e ninguém registrou. É a pior, e
 *    hoje é invisível — o estoque não baixou, então o site segue vendendo uma
 *    peça que já saiu da loja.
 *  - Venda sem transação: registrou no sistema e não achou no extrato. Venda
 *    digitada errada, cancelada na máquina, ou paga em outra maquininha.
 *
 * O casamento é feito em duas passadas, da mais confiável para a menos:
 * primeiro pelo comprovante (NSU), que é identidade; depois por valor igual e
 * horário próximo. A segunda passada é palpite fundamentado, e por isso a tela
 * mostra COMO cada par foi casado em vez de fingir certeza.
 */

export type VendaParaConferir = {
  id: string;
  numero: number;
  criadoEm: string; // ISO
  total: number;
  codigoMaquineta: string | null;
};

export type Par = {
  venda: VendaParaConferir;
  transacao: LinhaExtrato;
  como: 'comprovante' | 'valor e horario';
  /** Diferença de horário em minutos, quando o casamento foi por valor. */
  distanciaMin: number | null;
};

export type Conferencia = {
  pares: Par[];
  vendasSemTransacao: VendaParaConferir[];
  transacoesSemVenda: LinhaExtrato[];
  canceladas: LinhaExtrato[];
  totais: {
    vendas: number;
    extratoBruto: number;
    extratoLiquido: number;
    taxa: number;
    diferenca: number; // vendas casadas − bruto casado
  };
};

/** Quanto o relógio da maquininha pode estar longe do relógio do sistema. */
const MINUTOS_DE_TOLERANCIA = 90;

const centavos = (v: number) => Math.round(v * 100);

export function conferir(
  vendas: VendaParaConferir[],
  linhas: LinhaExtrato[],
  opcoes: { toleranciaMin?: number } = {}
): Conferencia {
  const tolerancia = opcoes.toleranciaMin ?? MINUTOS_DE_TOLERANCIA;

  // Transação cancelada ou recusada não é venda: fica de fora do casamento e
  // aparece à parte, senão ela "casaria" com uma venda boa de mesmo valor.
  const canceladas = linhas.filter((l) => l.cancelada);
  const disponiveis = linhas.filter((l) => !l.cancelada && l.bruto !== null);

  const usadas = new Set<LinhaExtrato>();
  const pares: Par[] = [];
  const pendentes: VendaParaConferir[] = [];

  // 1ª passada: comprovante, que é identidade e não depende de relógio.
  for (const venda of vendas) {
    const codigo = limparCodigo(venda.codigoMaquineta);
    if (!codigo) {
      pendentes.push(venda);
      continue;
    }
    const achada = disponiveis.find((l) => !usadas.has(l) && l.codigo && l.codigo === codigo);
    if (achada) {
      usadas.add(achada);
      pares.push({ venda, transacao: achada, como: 'comprovante', distanciaMin: null });
    } else {
      pendentes.push(venda);
    }
  }

  // 2ª passada: mesmo valor e horário próximo. Entre as candidatas, a mais
  // próxima no tempo; empate resolve pela ordem do arquivo.
  for (const venda of pendentes.slice()) {
    const alvo = centavos(venda.total);
    const quandoVenda = new Date(venda.criadoEm).getTime();

    let melhor: { linha: LinhaExtrato; distancia: number } | null = null;
    for (const l of disponiveis) {
      if (usadas.has(l) || l.bruto === null || centavos(l.bruto) !== alvo) continue;
      const distancia = l.quando
        ? Math.abs(new Date(l.quando).getTime() - quandoVenda) / 60000
        : Number.POSITIVE_INFINITY;
      // Sem hora no arquivo, o valor sozinho ainda serve: é melhor casar e
      // dizer como do que jogar as duas pontas na lista de sobras.
      const aceitavel = l.quando ? distancia <= tolerancia : true;
      if (!aceitavel) continue;
      if (!melhor || distancia < melhor.distancia) melhor = { linha: l, distancia };
    }

    if (melhor) {
      usadas.add(melhor.linha);
      pares.push({
        venda,
        transacao: melhor.linha,
        como: 'valor e horario',
        distanciaMin: Number.isFinite(melhor.distancia) ? Math.round(melhor.distancia) : null,
      });
      pendentes.splice(pendentes.indexOf(venda), 1);
    }
  }

  const somaBruto = pares.reduce((s, p) => s + (p.transacao.bruto ?? 0), 0);
  const somaLiquido = pares.reduce((s, p) => s + (p.transacao.liquido ?? p.transacao.bruto ?? 0), 0);
  const somaVendas = pares.reduce((s, p) => s + p.venda.total, 0);

  return {
    pares,
    vendasSemTransacao: pendentes,
    transacoesSemVenda: disponiveis.filter((l) => !usadas.has(l)),
    canceladas,
    totais: {
      vendas: Number(somaVendas.toFixed(2)),
      extratoBruto: Number(somaBruto.toFixed(2)),
      extratoLiquido: Number(somaLiquido.toFixed(2)),
      taxa: Number((somaBruto - somaLiquido).toFixed(2)),
      diferenca: Number((somaVendas - somaBruto).toFixed(2)),
    },
  };
}
