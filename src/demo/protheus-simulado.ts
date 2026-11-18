import { FiltroRcap, RcapConsulta, RcapInicio, TIPO_CONSULTA, TIPO_INICIO } from '../app/core/webchannel/contrato';

/**
 * Simulador do Protheus para a demonstração (GitHub Pages): responde às mesmas mensagens do
 * WebChannel que o AdvPL responderia, com dados fictícios gerados aqui. Nada sai do navegador.
 */
export function instalar(): void {
  window.jsToAdvpl = (tipo: string, conteudo: string): boolean => {
    // Responde depois, como o Protheus faria (a tela trata a resposta de forma assíncrona).
    setTimeout(() => responder(tipo, conteudo), 400);
    return true;
  };

  responder('jstoadvplPar1', '');
}

function responder(tipo: string, conteudo: string): void {
  switch (tipo) {
    case 'jstoadvplPar1':
      window.advplToJs?.(TIPO_INICIO, JSON.stringify(inicio()));
      break;
    case 'rcapConsultar':
      window.advplToJs?.(TIPO_CONSULTA, JSON.stringify(consultar(JSON.parse(conteudo) as FiltroRcap)));
      break;
    default:
      // abrirSalesforce e close não têm resposta; na demonstração a tela avisa o que aconteceria.
      break;
  }
}

function inicio(): RcapInicio {
  return {
    sucesso: true,
    mensagem: '',
    dados: {
      empresa: '99',
      nomeEmpresa: 'Empresa Demonstração S.A.',
      filial: '01',
      nomeFilial: 'Matriz',
      usuario: '000001',
      nomeUsuario: 'Usuário Demonstração',
      urlSalesforce: ''
    }
  };
}

const USUARIOS = [
  { codUsr: 'ana.souza', user: 'Ana Souza' },
  { codUsr: 'carlos.lima', user: 'Carlos Lima' },
  { codUsr: 'bianca.rocha', user: 'Bianca Rocha' },
  { codUsr: 'joao.santos', user: 'João Santos' },
  { codUsr: 'marina.costa', user: 'Marina Costa' }
];

const FORNECEDORES = [
  'Alfa Serviços Portuários Ltda', 'Beta Manutenção Industrial Ltda', 'Gama Tecnologia S.A.',
  'Delta Transportes Ltda', 'Épsilon Engenharia Ltda', 'Zeta Suprimentos Ltda',
  'Ômega Consultoria Ltda', 'Sigma Equipamentos S.A.'
];

// CNPJs de exemplo com dígito verificador válido (não pertencem a empresas reais conhecidas).
const CNPJS = ['11222333000181', '11444777000161', '22333444000181', '33444555000172'];

function consultar(filtro: FiltroRcap): RcapConsulta {
  const de = paraData(filtro.dataInicial);
  const ate = paraData(filtro.dataFinal);
  const dias = Math.max(1, Math.round((ate.getTime() - de.getTime()) / 86_400_000) + 1);
  const quantidade = Math.min(400, 15 * dias);
  const nota = filtro.notaFiscal.trim();
  const fornecedor = filtro.fornecedor.trim();

  const dados = Array.from({ length: quantidade }, (_, idx) => gerarItem(idx, de, dias))
    .filter(item => filtro.tipo === '3' || (filtro.tipo === '2') === Boolean(item['contrato']))
    .filter(item => !nota || String(item['nota']).includes(nota))
    .filter(item => !fornecedor || String(item['fornecedor']).includes(fornecedor));

  const envelope: RcapConsulta = { sucesso: true, mensagem: '', dados };

  if (filtro.print === 'S') {
    envelope.papeleta = {
      sucesso: true,
      mensagem: `Demonstração: no Protheus a papeleta (${dados.length} PDFs) seria gerada, copiada para `
        + `${filtro.path || 'a pasta escolhida'} e aberta.`,
      arquivo: `Papeletas_${filtro.dataFinal}.zip`
    };
  }

  return envelope;
}

function gerarItem(idx: number, inicio: Date, dias: number): Record<string, unknown> {
  const i = idx + 1;
  const usuario = USUARIOS[idx % USUARIOS.length];
  const temContrato = idx % 2 === 0;
  const dia = somarDias(inicio, idx % dias);
  const cenario = idx % 6;

  let inicio3Way: Date;
  let fimDigitacao: Date;

  // Cenários de SLA: rápido, algumas horas, virada de dia, sem hora, vários dias, fim de tarde.
  if (cenario === 0) {
    inicio3Way = comHora(dia, 8 + (idx % 4), 10);
    fimDigitacao = somarMinutos(inicio3Way, 20 + (idx % 8) * 10);
  } else if (cenario === 1) {
    inicio3Way = comHora(dia, 8 + (idx % 5), 0);
    fimDigitacao = somarMinutos(inicio3Way, 90 + (idx % 7) * 30);
  } else if (cenario === 2) {
    inicio3Way = comHora(somarDias(dia, -1), 16, 0);
    fimDigitacao = comHora(dia, 9 + (idx % 3), 15);
  } else if (cenario === 3) {
    inicio3Way = comHora(dia, 0, 0);
    fimDigitacao = comHora(dia, 11 + (idx % 4), 25);
  } else if (cenario === 4) {
    inicio3Way = comHora(somarDias(dia, -4), 9, 0);
    fimDigitacao = comHora(dia, 10, 0);
  } else {
    inicio3Way = comHora(dia, 14, idx % 2 === 0 ? 0 : 15);
    fimDigitacao = somarMinutos(inicio3Way, 10 + (idx % 5) * 10);
  }

  const liquido = arred(1200 + ((idx * 377.8) % 18000));
  const bruto = arred(liquido * 1.07);
  const ttPedido = arred(bruto * (temContrato ? 1.12 : 1.05));
  const codFornecedor = String(100100 + (idx % FORNECEDORES.length)).padStart(6, '0');

  return {
    item: i,
    filial: '01',
    nota: String(53190 + i).padStart(9, '0'),
    serie: '1',
    fornecedor: codFornecedor,
    loja: '01',
    razao: FORNECEDORES[idx % FORNECEDORES.length],
    cnpj: CNPJS[idx % CNPJS.length],
    emissao: aaaaMmDd(somarDias(inicio3Way, -1)),
    digitacao: aaaaMmDd(fimDigitacao),
    HrDigitacao: hhMmSs(fimDigitacao),
    vencimento: aaaaMmDd(somarDias(fimDigitacao, 5 + (idx % 3))),
    natureza: ['2035', '3035', '3065', '3179', '7001'][idx % 5],
    tes: ['017', '018', '026', '033', '055'][idx % 5],
    DtPreNota: aaaaMmDd(somarDias(inicio3Way, 1)),
    DtEmissaoPedido: aaaaMmDd(somarDias(inicio3Way, -3)),
    DtPedido: aaaaMmDd(somarDias(inicio3Way, -2)),
    HrPedido: hhMmSs(somarDias(inicio3Way, -2)),
    Dt3Way: aaaaMmDd(inicio3Way),
    Hr3Way: cenario === 3 ? '00:00:00' : hhMmSs(inicio3Way),
    tipo: ['NFSE', 'NFS', 'SPED'][idx % 3],
    estado: idx % 2 === 0 ? 'PR' : 'SP',
    inss: arred(liquido * 0.011),
    pis: arred(liquido * 0.0065),
    cofins: arred(liquido * 0.03),
    csll: arred(liquido * 0.01),
    ipi: idx % 3 === 0 ? arred(liquido * 0.02) : 0,
    frete: idx % 4 === 0 ? 40 : 0,
    desconto: idx % 5 === 0 ? 12.5 : 0,
    despesa: idx % 6 === 0 ? 9.75 : 0,
    liquido,
    bruto,
    TTPedido: ttPedido,
    diferenca: arred(ttPedido - bruto),
    pedido: String(215200 + i),
    pagamento: String(30 + (idx % 4) * 15).padStart(3, '0'),
    pagamentoDescricao: `${30 + (idx % 4) * 15} DIAS`,
    pr: idx % 3 === 0 ? `${String(7400 + idx).padStart(6, '0')}\n${String(8400 + idx).padStart(6, '0')}` : String(7400 + idx).padStart(6, '0'),
    dataAprovacaoPR: idx % 3 === 0 ? `${aaaammdd(somarDias(dia, -2))}\n${aaaammdd(somarDias(dia, -1))}` : aaaammdd(somarDias(dia, -1)),
    salesPr: idx % 3 === 0 ? 'a1B000000DEMO01AAA\na1B000000DEMO02AAA' : 'a1B000000DEMO01AAA',
    salesPedido: 'a1v000000DEMO03AAA',
    codAprovadorPedido: usuario.codUsr,
    aprovadorPedido: usuario.user,
    codUsr: usuario.codUsr,
    user: usuario.user,
    contrato: temContrato ? `CTR-${100 + (idx % 20)}` : '',
    medicao: temContrato ? String(52000 + idx).padStart(6, '0') : ''
  };
}

function paraData(aaaammddTexto: string): Date {
  const texto = /^\d{8}$/.test(aaaammddTexto) ? aaaammddTexto : aaaammdd(new Date());
  return new Date(Number(texto.slice(0, 4)), Number(texto.slice(4, 6)) - 1, Number(texto.slice(6, 8)));
}

function somarDias(data: Date, dias: number): Date {
  const nova = new Date(data.getTime());
  nova.setDate(nova.getDate() + dias);
  return nova;
}

function somarMinutos(data: Date, minutos: number): Date {
  return new Date(data.getTime() + minutos * 60_000);
}

function comHora(data: Date, hora: number, minuto: number): Date {
  const nova = new Date(data.getTime());
  nova.setHours(hora, minuto, 0, 0);
  return nova;
}

function dois(n: number): string {
  return String(n).padStart(2, '0');
}

/** Formato que o relatório recebe nas datas: AAAA/MM/DD. */
function aaaaMmDd(data: Date): string {
  return `${data.getFullYear()}/${dois(data.getMonth() + 1)}/${dois(data.getDate())}`;
}

function aaaammdd(data: Date): string {
  return `${data.getFullYear()}${dois(data.getMonth() + 1)}${dois(data.getDate())}`;
}

function hhMmSs(data: Date): string {
  return `${dois(data.getHours())}:${dois(data.getMinutes())}:${dois(data.getSeconds())}`;
}

function arred(valor: number): number {
  return Math.round(valor * 100) / 100;
}
