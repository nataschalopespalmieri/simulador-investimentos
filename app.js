'use strict';

/* ============================================================
 * Formatação e leitura de números no padrão pt-BR
 * ============================================================ */
const fmtBRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtMoneyInput = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtPct = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtRate = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 4 });
const fmtYears = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 });
const fmtCompact = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  notation: 'compact',
  maximumFractionDigits: 1,
});

/**
 * Converte texto digitado no padrão brasileiro em número.
 * Aceita "10.000,50", "10000,5", "10000.5", "R$ 1.000" e "12,5%".
 */
function parseBR(raw) {
  if (raw == null) return NaN;
  let s = String(raw).trim().replace(/R\$|%|\s/g, '');
  if (!s) return NaN;
  if (s.includes(',')) {
    s = s.replace(/\./g, '').replace(',', '.');
  } else if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) {
    // "10.000" sem vírgula: ponto como separador de milhar
    s = s.replace(/\./g, '');
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}

/* ============================================================
 * Matemática financeira
 * ============================================================ */

/** Taxa anual (%) -> taxa mensal equivalente (%), juros compostos. */
function anualParaMensal(aa) {
  return (Math.pow(1 + aa / 100, 1 / 12) - 1) * 100;
}

/** Taxa mensal (%) -> taxa anual equivalente (%), juros compostos. */
function mensalParaAnual(am) {
  return (Math.pow(1 + am / 100, 12) - 1) * 100;
}

/** Taxa efetiva anual (%) de um pós-fixado que rende `pct`% do CDI (capitalização diária, 252 dias úteis). */
function taxaPorCDI(cdiAa, pct) {
  const diaria = Math.pow(1 + cdiAa / 100, 1 / 252) - 1;
  return (Math.pow(1 + diaria * (pct / 100), 252) - 1) * 100;
}

/** Composição de duas taxas anuais (%): (1 + a)(1 + b) - 1. */
function comporTaxas(aPct, bPct) {
  return ((1 + aPct / 100) * (1 + bPct / 100) - 1) * 100;
}

/** Alíquota do IR regressivo de renda fixa conforme o tempo de aplicação (meses de 30 dias). */
function aliquotaIR(meses) {
  if (meses <= 6) return 0.225; // até 180 dias
  if (meses <= 12) return 0.2; // 181 a 360 dias
  if (meses <= 24) return 0.175; // 361 a 720 dias
  return 0.15; // acima de 720 dias
}

/**
 * Simula um investimento com valor inicial (mês 0) e aportes ao final de cada mês.
 * Cada aporte é um "lote" com data própria, para aplicar o IR regressivo corretamente.
 * A custódia é calculada mês a mês sobre o saldo e deduzida da base de cálculo do IR.
 */
function simularInvestimento({ inicial, aporte, taxaAa, meses, custodiaAa = 0, aplicarIR = true }) {
  const im = Math.pow(1 + taxaAa / 100, 1 / 12) - 1;
  const cm = custodiaAa > 0 ? Math.pow(1 + custodiaAa / 100, 1 / 12) - 1 : 0;

  const lotes = [];
  if (inicial > 0) lotes.push({ inicio: 0, principal: inicial, valor: inicial, custodia: 0 });

  let investido = inicial;
  let custodiaTotal = 0;
  const serie = [{ mes: 0, investido, bruto: inicial, custodia: 0 }];

  for (let m = 1; m <= meses; m++) {
    let bruto = 0;
    for (const lote of lotes) {
      lote.valor *= 1 + im;
      if (cm) {
        const c = lote.valor * cm;
        lote.custodia += c;
        custodiaTotal += c;
      }
      bruto += lote.valor;
    }
    if (aporte > 0) {
      lotes.push({ inicio: m, principal: aporte, valor: aporte, custodia: 0 });
      investido += aporte;
      bruto += aporte;
    }
    serie.push({ mes: m, investido, bruto, custodia: custodiaTotal });
  }

  let ir = 0;
  let bruto = 0;
  for (const lote of lotes) {
    bruto += lote.valor;
    if (aplicarIR) {
      const ganho = lote.valor - lote.principal - lote.custodia;
      if (ganho > 0) ir += ganho * aliquotaIR(meses - lote.inicio);
    }
  }

  const rendimentoBruto = bruto - investido;
  const liquido = bruto - custodiaTotal - ir;
  return {
    taxaMensal: im,
    investido,
    bruto,
    rendimentoBruto,
    custodia: custodiaTotal,
    ir,
    liquido,
    rendimentoLiquido: liquido - investido,
    aliquotaInicial: aliquotaIR(meses),
    aliquotaEfetiva: rendimentoBruto - custodiaTotal > 0 ? ir / (rendimentoBruto - custodiaTotal) : 0,
    serie,
  };
}

/**
 * Cálculos de aposentadoria (em valores reais, descontada a inflação).
 * usufrutoMeses = 0 significa viver apenas dos rendimentos (perpetuidade).
 */
function rendaSustentavel(patrimonioReal, taxaRealMensal, usufrutoMeses) {
  if (usufrutoMeses === 0) return taxaRealMensal > 0 ? patrimonioReal * taxaRealMensal : NaN;
  if (Math.abs(taxaRealMensal) < 1e-12) return patrimonioReal / usufrutoMeses;
  return (patrimonioReal * taxaRealMensal) / (1 - Math.pow(1 + taxaRealMensal, -usufrutoMeses));
}

function patrimonioNecessario(rendaReal, taxaRealMensal, usufrutoMeses) {
  if (usufrutoMeses === 0) return taxaRealMensal > 0 ? rendaReal / taxaRealMensal : Infinity;
  if (Math.abs(taxaRealMensal) < 1e-12) return rendaReal * usufrutoMeses;
  return (rendaReal * (1 - Math.pow(1 + taxaRealMensal, -usufrutoMeses))) / taxaRealMensal;
}

/** Aporte mensal (ao final de cada mês) para atingir `alvo` a partir de `inicial`. */
function aporteNecessario(alvo, inicial, taxaMensal, meses) {
  const fator = Math.pow(1 + taxaMensal, meses);
  const restante = alvo - inicial * fator;
  if (restante <= 0) return 0;
  if (Math.abs(taxaMensal) < 1e-12) return restante / meses;
  return (restante * taxaMensal) / (fator - 1);
}

/* ============================================================
 * Leitura e validação dos formulários
 * ============================================================ */
class ValidationError extends Error {
  constructor(message, field) {
    super(message);
    this.field = field;
  }
}

function lerNumero(form, name, { label, min = -Infinity, max = Infinity, inteiro = false } = {}) {
  const el = form.elements[name];
  const v = parseBR(el.value);
  if (!Number.isFinite(v)) throw new ValidationError(`Informe um valor válido para "${label}".`, el);
  if (inteiro && !Number.isInteger(v)) throw new ValidationError(`"${label}" deve ser um número inteiro.`, el);
  if (v < min) throw new ValidationError(`"${label}" deve ser maior ou igual a ${fmtRate.format(min)}.`, el);
  if (v > max) throw new ValidationError(`"${label}" deve ser menor ou igual a ${fmtRate.format(max)}.`, el);
  return v;
}

function lerBase(form) {
  const inicial = lerNumero(form, 'inicial', { label: 'Valor inicial', min: 0 });
  const aporte = lerNumero(form, 'aporte', { label: 'Aporte mensal', min: 0 });
  if (inicial === 0 && aporte === 0) {
    throw new ValidationError('Informe um valor inicial ou um aporte mensal maior que zero.', form.elements.inicial);
  }
  const taxaAa = lerNumero(form, 'taxa_aa', { label: 'Taxa ao ano', min: -99, max: 1000 });
  const meses = lerNumero(form, 'meses', { label: 'Prazo em meses', min: 1, max: 1200, inteiro: true });
  return { inicial, aporte, taxaAa, meses };
}

/* ============================================================
 * Simuladores por tipo de investimento
 * ============================================================ */
function cardsInvestimento(r, base, { comCustodia }) {
  const cards = [
    { label: 'Total investido', value: fmtBRL.format(r.investido) },
    { label: 'Valor bruto no resgate', value: fmtBRL.format(r.bruto) },
    {
      label: 'Rendimento bruto',
      value: fmtBRL.format(r.rendimentoBruto),
      detail: r.investido > 0 ? `${fmtPct.format((r.rendimentoBruto / r.investido) * 100)}% sobre o investido` : '',
    },
  ];
  if (comCustodia) {
    cards.push({ label: 'Taxa de custódia B3', value: `− ${fmtBRL.format(r.custodia)}` });
  }
  cards.push({
    label: 'Imposto de Renda',
    value: `− ${fmtBRL.format(r.ir)}`,
    detail:
      r.ir > 0
        ? `Alíquota de ${fmtPct.format(r.aliquotaInicial * 100)}% sobre o valor inicial; efetiva de ${fmtPct.format(r.aliquotaEfetiva * 100)}%`
        : 'Não descontado',
  });

  let detalheLiquido = `Ganho líquido de ${fmtBRL.format(r.rendimentoLiquido)}`;
  if (base.aporte === 0 && base.inicial > 0 && r.liquido > 0) {
    const liqAa = (Math.pow(r.liquido / base.inicial, 12 / base.meses) - 1) * 100;
    detalheLiquido += ` (${fmtPct.format(liqAa)}% a.a. líquido)`;
  }
  cards.push({ label: 'Valor líquido no resgate', value: fmtBRL.format(r.liquido), detail: detalheLiquido, highlight: true });
  return cards;
}

function colunasPadrao() {
  return [
    { titulo: 'Período', valor: (p) => rotuloPeriodo(p.mes) },
    { titulo: 'Total investido', valor: (p) => fmtBRL.format(p.investido) },
    { titulo: 'Rendimento acumulado', valor: (p) => fmtBRL.format(p.bruto - p.investido) },
    { titulo: 'Saldo bruto', valor: (p) => fmtBRL.format(p.bruto) },
  ];
}

const LINHAS_PADRAO = [
  { chave: 'bruto', rotulo: 'Saldo bruto', cor: '--c-bruto', preencher: true },
  { chave: 'investido', rotulo: 'Total investido', cor: '--c-investido' },
];

const NOTA_IR = 'O IR incide apenas sobre o rendimento, com alíquota definida pelo tempo de cada aporte.';

const simuladores = {
  cdb(form) {
    const base = lerBase(form);
    const r = simularInvestimento({ ...base, aplicarIR: form.elements.ir.checked });
    return {
      titulo: `CDB a ${fmtRate.format(base.taxaAa)}% a.a. por ${rotuloPrazo(base.meses)}`,
      cards: cardsInvestimento(r, base, { comCustodia: false }),
      serie: r.serie,
      linhas: LINHAS_PADRAO,
      colunas: colunasPadrao(),
      notas: [
        NOTA_IR,
        'CDBs contam com a garantia do FGC até R$ 250 mil por CPF e por instituição, respeitado o limite global do fundo.',
      ],
    };
  },

  selic(form) {
    const base = lerBase(form);
    const custodiaAa = lerNumero(form, 'custodia', { label: 'Taxa de custódia', min: 0, max: 10 });
    const r = simularInvestimento({ ...base, custodiaAa, aplicarIR: form.elements.ir.checked });
    return {
      titulo: `Tesouro Selic a ${fmtRate.format(base.taxaAa)}% a.a. por ${rotuloPrazo(base.meses)}`,
      cards: cardsInvestimento(r, base, { comCustodia: custodiaAa > 0 }),
      serie: r.serie,
      linhas: LINHAS_PADRAO,
      colunas: colunasPadrao(),
      notas: [
        NOTA_IR,
        'A taxa Selic é considerada constante durante todo o prazo. Na prática ela varia conforme as decisões do Copom.',
        'A custódia da B3 é cobrada sobre o saldo e deduzida da base de cálculo do IR. Confira as regras de isenção vigentes no site do Tesouro Direto.',
      ],
    };
  },

  tesouro(form) {
    const base = lerBase(form);
    const custodiaAa = lerNumero(form, 'custodia', { label: 'Taxa de custódia', min: 0, max: 10 });
    const r = simularInvestimento({ ...base, custodiaAa, aplicarIR: form.elements.ir.checked });
    const ipca = form.elements.titulo.value === 'ipca';
    const nome = ipca ? 'Tesouro IPCA+' : 'Tesouro Prefixado';
    const notas = [
      NOTA_IR,
      'A simulação considera o título mantido até o resgate na taxa contratada. Em venda antecipada, o preço segue a marcação a mercado e pode ser maior ou menor.',
      'A custódia da B3 é cobrada sobre o saldo e deduzida da base de cálculo do IR.',
    ];
    if (ipca) notas.splice(1, 0, 'Para o IPCA+, a taxa nominal depende do IPCA projetado, que é apenas uma estimativa.');
    return {
      titulo: `${nome} a ${fmtRate.format(base.taxaAa)}% a.a. por ${rotuloPrazo(base.meses)}`,
      cards: cardsInvestimento(r, base, { comCustodia: custodiaAa > 0 }),
      serie: r.serie,
      linhas: LINHAS_PADRAO,
      colunas: colunasPadrao(),
      notas,
    };
  },

  aposentadoria(form) {
    const idade = lerNumero(form, 'idade', { label: 'Idade atual', min: 0, max: 120, inteiro: true });
    const inflacao = lerNumero(form, 'inflacao', { label: 'Inflação esperada', min: -50, max: 100 });
    const base = lerBase(form);
    const renda = lerNumero(form, 'renda', { label: 'Renda mensal desejada', min: 0 });
    const usufruto = lerNumero(form, 'usufruto', { label: 'Anos recebendo a renda', min: 0, max: 100, inteiro: true });

    const r = simularInvestimento({ ...base, aplicarIR: false });
    const infM = Math.pow(1 + inflacao / 100, 1 / 12) - 1;
    const realM = (1 + r.taxaMensal) / (1 + infM) - 1;
    const realAa = (Math.pow(1 + realM, 12) - 1) * 100;
    const fatorInflacao = Math.pow(1 + infM, base.meses);
    const patrimonioReal = r.bruto / fatorInflacao;
    const nUsufruto = usufruto * 12;

    const rendaPossivel = rendaSustentavel(patrimonioReal, realM, nUsufruto);
    const pvNecessario = patrimonioNecessario(renda, realM, nUsufruto);
    const fvNecessario = pvNecessario * fatorInflacao;
    const aporteMeta = Number.isFinite(fvNecessario)
      ? aporteNecessario(fvNecessario, base.inicial, r.taxaMensal, base.meses)
      : NaN;

    const idadeFinal = idade + base.meses / 12;
    const cards = [
      { label: 'Idade ao se aposentar', value: `${fmtYears.format(idadeFinal)} anos` },
      { label: 'Total investido', value: fmtBRL.format(r.investido) },
      { label: 'Patrimônio acumulado', value: fmtBRL.format(r.bruto), detail: 'Valor nominal na data da aposentadoria' },
      {
        label: 'Patrimônio em valores de hoje',
        value: fmtBRL.format(patrimonioReal),
        detail: `Taxa real de ${fmtPct.format(realAa)}% a.a.`,
      },
      {
        label: 'Renda mensal estimada',
        value: Number.isFinite(rendaPossivel) ? fmtBRL.format(rendaPossivel) : 'Não sustentável',
        detail: Number.isFinite(rendaPossivel)
          ? `Em valores de hoje, ${usufruto === 0 ? 'vivendo só dos rendimentos' : `por ${usufruto} anos`}`
          : 'A taxa real precisa ser positiva para viver só dos rendimentos',
        highlight: true,
      },
    ];

    let detalheMeta;
    let valorMeta;
    if (!Number.isFinite(aporteMeta)) {
      valorMeta = 'Inatingível';
      detalheMeta = 'Com taxa real nula ou negativa, a renda perpétua não é possível';
    } else if (aporteMeta === 0) {
      valorMeta = fmtBRL.format(0);
      detalheMeta = 'O valor já investido é suficiente para a meta';
    } else {
      valorMeta = fmtBRL.format(aporteMeta);
      const diff = aporteMeta - base.aporte;
      detalheMeta =
        diff > 0
          ? `Faltam ${fmtBRL.format(diff)} por mês para a renda de ${fmtBRL.format(renda)}`
          : `Seu aporte atual já cobre a renda de ${fmtBRL.format(renda)}`;
    }
    cards.push({ label: 'Aporte necessário para a meta', value: valorMeta, detail: detalheMeta });

    const serie = r.serie.map((p) => ({ ...p, real: p.bruto / Math.pow(1 + infM, p.mes) }));
    return {
      titulo: `Aposentadoria em ${rotuloPrazo(base.meses)} a ${fmtRate.format(base.taxaAa)}% a.a.`,
      cards,
      serie,
      linhas: [...LINHAS_PADRAO, { chave: 'real', rotulo: 'Saldo em valores de hoje', cor: '--c-real' }],
      colunas: [
        { titulo: 'Idade', valor: (p) => `${fmtYears.format(idade + p.mes / 12)} anos` },
        ...colunasPadrao(),
        { titulo: 'Saldo em valores de hoje', valor: (p) => fmtBRL.format(p.real) },
      ],
      notas: [
        'Valores brutos, sem IR, taxas de administração ou custódia. Considere esses custos conforme o produto escolhido (PGBL, VGBL, Tesouro etc.).',
        'Os aportes são considerados constantes. Reajustá-los pela inflação aumenta o patrimônio real acumulado.',
        'A renda estimada é corrigida pela inflação durante todo o período de recebimento.',
      ],
    };
  },
};

/* ============================================================
 * Rótulos
 * ============================================================ */
function rotuloPrazo(meses) {
  const anos = Math.floor(meses / 12);
  const resto = meses % 12;
  const partes = [];
  if (anos) partes.push(`${anos} ${anos === 1 ? 'ano' : 'anos'}`);
  if (resto) partes.push(`${resto} ${resto === 1 ? 'mês' : 'meses'}`);
  return partes.join(' e ');
}

function rotuloPeriodo(mes) {
  if (mes === 0) return 'Início';
  return mes % 12 === 0 ? `Ano ${mes / 12}` : `Mês ${mes}`;
}

/* ============================================================
 * Gráfico (canvas, sem dependências)
 * ============================================================ */
function maximoArredondado(v) {
  if (!(v > 0)) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const f = v / p;
  const nice = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10;
  return nice * p;
}

function desenharGrafico(canvas, serie, linhas) {
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  if (!w || !h) return; // painel oculto
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);

  const css = getComputedStyle(document.documentElement);
  const cor = (v) => css.getPropertyValue(v).trim();
  const pad = { l: 78, r: 16, t: 12, b: 30 };
  const larg = w - pad.l - pad.r;
  const alt = h - pad.t - pad.b;
  const n = Math.max(serie.length - 1, 1);

  let maxV = 0;
  for (const p of serie) for (const l of linhas) maxV = Math.max(maxV, p[l.chave]);
  const maxY = maximoArredondado(maxV);
  const x = (i) => pad.l + (i / n) * larg;
  const y = (v) => pad.t + (1 - Math.max(v, 0) / maxY) * alt;

  // Grade e eixo Y
  ctx.font = '12px system-ui, sans-serif';
  ctx.fillStyle = cor('--muted');
  ctx.strokeStyle = cor('--chart-grid');
  ctx.lineWidth = 1;
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  const ticks = 5;
  for (let i = 0; i <= ticks; i++) {
    const v = (maxY / ticks) * i;
    const yy = Math.round(y(v)) + 0.5;
    ctx.beginPath();
    ctx.moveTo(pad.l, yy);
    ctx.lineTo(w - pad.r, yy);
    ctx.stroke();
    ctx.fillText(fmtCompact.format(v), pad.l - 8, yy);
  }

  // Eixo X
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  const meses = serie.length - 1;
  if (meses >= 24) {
    const passo = Math.max(1, Math.ceil(meses / 12 / 8)) * 12;
    for (let m = 0; m <= meses; m += passo) ctx.fillText(`${m / 12}a`, x(m), h - pad.b + 8);
  } else {
    const passo = Math.max(1, Math.ceil(meses / 8));
    for (let m = 0; m <= meses; m += passo) ctx.fillText(`${m}m`, x(m), h - pad.b + 8);
  }

  // Linhas
  for (const l of linhas) {
    const c = cor(l.cor);
    ctx.beginPath();
    serie.forEach((p, i) => (i ? ctx.lineTo(x(i), y(p[l.chave])) : ctx.moveTo(x(i), y(p[l.chave]))));
    ctx.strokeStyle = c;
    ctx.lineWidth = 2.5;
    ctx.stroke();
    if (l.preencher) {
      ctx.lineTo(x(n), y(0));
      ctx.lineTo(x(0), y(0));
      ctx.closePath();
      ctx.globalAlpha = 0.12;
      ctx.fillStyle = c;
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }
}

/* ============================================================
 * Renderização dos resultados
 * ============================================================ */
function escapeHTML(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

function linhasDaTabela(serie) {
  const ultimo = serie.length - 1;
  return serie.filter((p) => p.mes === 0 || p.mes % 12 === 0 || p.mes === ultimo || (ultimo < 12));
}

function renderizar(container, res) {
  const cards = res.cards
    .map(
      (c) => `
      <div class="stat${c.highlight ? ' highlight' : ''}">
        <span class="label">${escapeHTML(c.label)}</span>
        <span class="value">${escapeHTML(c.value)}</span>
        ${c.detail ? `<span class="detail">${escapeHTML(c.detail)}</span>` : ''}
      </div>`
    )
    .join('');

  const legenda = res.linhas
    .map((l) => `<li><span class="swatch" style="background: var(${l.cor})"></span>${escapeHTML(l.rotulo)}</li>`)
    .join('');

  const cab = res.colunas.map((c) => `<th scope="col">${escapeHTML(c.titulo)}</th>`).join('');
  const corpo = linhasDaTabela(res.serie)
    .map((p) => `<tr>${res.colunas.map((c) => `<td>${escapeHTML(c.valor(p))}</td>`).join('')}</tr>`)
    .join('');

  const ultimo = res.serie[res.serie.length - 1];
  const ariaGrafico = `Gráfico da evolução do patrimônio. Saldo final de ${fmtBRL.format(ultimo.bruto)} para ${fmtBRL.format(ultimo.investido)} investidos. Os valores detalhados estão na tabela abaixo.`;

  container.innerHTML = `
    <div class="card">
      <h2>${escapeHTML(res.titulo)}</h2>
      <div class="cards">${cards}</div>
    </div>
    <div class="card">
      <h2>Evolução do patrimônio</h2>
      <div class="chart-wrap"><canvas role="img" aria-label="${escapeHTML(ariaGrafico)}"></canvas></div>
      <ul class="legend">${legenda}</ul>
    </div>
    <div class="card">
      <details>
        <summary>Tabela de evolução</summary>
        <div class="table-wrap">
          <table>
            <caption class="hint" style="caption-side: bottom; text-align: left">Valores brutos, antes de impostos e taxas.</caption>
            <thead><tr>${cab}</tr></thead>
            <tbody>${corpo}</tbody>
          </table>
        </div>
      </details>
    </div>
    <div class="card">
      <h2>Como calculamos</h2>
      <ul class="notes">${res.notas.map((n) => `<li>${escapeHTML(n)}</li>`).join('')}</ul>
    </div>`;

  const canvas = container.querySelector('canvas');
  container._grafico = { canvas, serie: res.serie, linhas: res.linhas };
  desenharGrafico(canvas, res.serie, res.linhas);
}

function redesenhar(container) {
  const g = container && container._grafico;
  if (g) desenharGrafico(g.canvas, g.serie, g.linhas);
}

/* ============================================================
 * Interação
 * ============================================================ */
function definirTaxa(form, aa) {
  form.elements.taxa_aa.value = fmtRate.format(aa);
  form.elements.taxa_am.value = fmtRate.format(anualParaMensal(aa));
}

function vincularTaxas(form) {
  const aa = form.elements.taxa_aa;
  const am = form.elements.taxa_am;
  aa.addEventListener('input', () => {
    const v = parseBR(aa.value);
    am.value = Number.isFinite(v) && v > -100 ? fmtRate.format(anualParaMensal(v)) : '';
  });
  am.addEventListener('input', () => {
    const v = parseBR(am.value);
    aa.value = Number.isFinite(v) && v > -100 ? fmtRate.format(mensalParaAnual(v)) : '';
  });
  // Sincroniza o campo mensal a partir do anual preenchido no HTML
  const inicial = parseBR(aa.value);
  if (Number.isFinite(inicial)) definirTaxa(form, inicial);
}

function vincularPrazo(form) {
  const meses = form.elements.meses;
  const anos = form.elements.anos;
  meses.addEventListener('input', () => {
    const v = parseBR(meses.value);
    anos.value = Number.isFinite(v) ? fmtYears.format(v / 12) : '';
  });
  anos.addEventListener('input', () => {
    const v = parseBR(anos.value);
    meses.value = Number.isFinite(v) ? String(Math.round(v * 12)) : '';
  });
}

function vincularMoeda(form) {
  form.querySelectorAll('input.money').forEach((el) => {
    el.addEventListener('blur', () => {
      const v = parseBR(el.value);
      if (Number.isFinite(v)) el.value = fmtMoneyInput.format(v);
    });
  });
}

function executar(form, { silencioso = false } = {}) {
  const erro = form.querySelector('.form-error');
  form.querySelectorAll('[aria-invalid]').forEach((el) => el.removeAttribute('aria-invalid'));
  try {
    const res = simuladores[form.dataset.tipo](form);
    erro.textContent = '';
    renderizar(document.getElementById(`results-${form.dataset.tipo}`), res);
  } catch (e) {
    if (!(e instanceof ValidationError)) throw e;
    erro.textContent = e.message;
    if (e.field) {
      e.field.setAttribute('aria-invalid', 'true');
      if (!silencioso) e.field.focus();
    }
  }
}

const acoes = {
  'aplicar-cdi'(form) {
    const cdi = lerNumero(form, 'cdi', { label: 'CDI', min: -99, max: 1000 });
    const pct = lerNumero(form, 'pct_cdi', { label: 'Percentual do CDI', min: 0, max: 1000 });
    definirTaxa(form, taxaPorCDI(cdi, pct));
  },
  'aplicar-selic'(form) {
    const selic = lerNumero(form, 'selic', { label: 'Taxa Selic', min: -99, max: 1000 });
    const spread = lerNumero(form, 'spread', { label: 'Ágio/deságio', min: -99, max: 100 });
    definirTaxa(form, comporTaxas(selic, spread));
  },
  'aplicar-ipca'(form) {
    const ipca = lerNumero(form, 'ipca', { label: 'IPCA projetado', min: -50, max: 100 });
    const real = lerNumero(form, 'real', { label: 'Taxa real', min: -50, max: 100 });
    definirTaxa(form, comporTaxas(ipca, real));
  },
};

function aplicarAcao(form, nome, { silencioso = false } = {}) {
  const erro = form.querySelector('.form-error');
  form.querySelectorAll('[aria-invalid]').forEach((el) => el.removeAttribute('aria-invalid'));
  try {
    acoes[nome](form);
    executar(form, { silencioso });
  } catch (e) {
    if (!(e instanceof ValidationError)) throw e;
    erro.textContent = e.message;
    e.field.setAttribute('aria-invalid', 'true');
    if (!silencioso) e.field.focus();
  }
}

function atualizarIdadeFinal(form) {
  const hint = document.getElementById('apo-idade-final');
  const idade = parseBR(form.elements.idade.value);
  const meses = parseBR(form.elements.meses.value);
  hint.textContent =
    Number.isFinite(idade) && Number.isFinite(meses) && meses > 0
      ? `Você se aposentará com ${fmtYears.format(idade + meses / 12)} anos.`
      : '';
}

function iniciarFormulario(form) {
  vincularTaxas(form);
  vincularPrazo(form);
  vincularMoeda(form);

  let timer;
  form.addEventListener('input', (e) => {
    if (e.target.hasAttribute('data-ignore-live')) return;
    if (form.dataset.tipo === 'aposentadoria') atualizarIdadeFinal(form);
    clearTimeout(timer);
    timer = setTimeout(() => executar(form, { silencioso: true }), 350);
  });
  form.addEventListener('change', (e) => {
    if (e.target.type === 'checkbox') executar(form, { silencioso: true });
  });
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    clearTimeout(timer);
    executar(form);
  });
  form.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action]');
    if (btn) aplicarAcao(form, btn.dataset.action);
  });
}

function iniciarAbas() {
  const abas = [...document.querySelectorAll('[role="tab"]')];
  const ativar = (aba, focar) => {
    abas.forEach((a) => {
      const sel = a === aba;
      a.setAttribute('aria-selected', String(sel));
      a.tabIndex = sel ? 0 : -1;
      document.getElementById(a.getAttribute('aria-controls')).hidden = !sel;
    });
    if (focar) aba.focus();
    redesenhar(document.querySelector(`#${aba.getAttribute('aria-controls')} .results`));
  };
  abas.forEach((aba, i) => {
    aba.addEventListener('click', () => ativar(aba, false));
    aba.addEventListener('keydown', (e) => {
      let alvo;
      if (e.key === 'ArrowRight') alvo = abas[(i + 1) % abas.length];
      else if (e.key === 'ArrowLeft') alvo = abas[(i - 1 + abas.length) % abas.length];
      else if (e.key === 'Home') alvo = abas[0];
      else if (e.key === 'End') alvo = abas[abas.length - 1];
      if (alvo) {
        e.preventDefault();
        ativar(alvo, true);
      }
    });
  });
}

function iniciar() {
  iniciarAbas();
  document.querySelectorAll('form[data-tipo]').forEach(iniciarFormulario);

  // Taxas iniciais calculadas a partir dos auxiliares
  aplicarAcao(document.getElementById('form-cdb'), 'aplicar-cdi', { silencioso: true });
  aplicarAcao(document.getElementById('form-selic'), 'aplicar-selic', { silencioso: true });

  const tesouro = document.getElementById('form-tesouro');
  tesouro.elements.titulo.addEventListener('change', () => {
    const ipca = tesouro.elements.titulo.value === 'ipca';
    tesouro.querySelector('.ipca-only').hidden = !ipca;
    if (ipca) aplicarAcao(tesouro, 'aplicar-ipca', { silencioso: true });
    else executar(tesouro, { silencioso: true });
  });
  executar(tesouro, { silencioso: true });

  const apo = document.getElementById('form-aposentadoria');
  atualizarIdadeFinal(apo);
  executar(apo, { silencioso: true });

  // Redesenha o gráfico visível ao redimensionar a janela
  let rTimer;
  window.addEventListener('resize', () => {
    clearTimeout(rTimer);
    rTimer = setTimeout(() => {
      document.querySelectorAll('.panel:not([hidden]) .results').forEach(redesenhar);
    }, 150);
  });
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    document.querySelectorAll('.panel:not([hidden]) .results').forEach(redesenhar);
  });
}

if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', iniciar);
}

// Exporta as funções de cálculo para testes em Node.js
if (typeof module !== 'undefined') {
  module.exports = {
    parseBR,
    anualParaMensal,
    mensalParaAnual,
    taxaPorCDI,
    comporTaxas,
    aliquotaIR,
    simularInvestimento,
    rendaSustentavel,
    patrimonioNecessario,
    aporteNecessario,
  };
}
