/**
 * Contrato das mensagens entre a tela e o Protheus pelo WebChannel (FwCallApp).
 *
 * Ida (jsToAdvpl):
 * - jstoadvplPar1: disparada uma vez quando o canal conecta (padrão do TDN) -> responde rcapInicio
 * - rcapConsultar: filtros da tela (FiltroRcap) -> responde rcapConsulta
 * - abrirSalesforce: {tipo, id}; o AdvPL monta a URL e abre no navegador padrão (sem resposta)
 * - close: tratado pelo próprio FwCallApp, fecha a tela
 *
 * Volta (advplToJs): sempre um envelope JSON {sucesso, mensagem, ...}.
 *
 * Antes desta versão a tela consultava um endpoint REST com usuário e senha embutidos no
 * JavaScript. Pelo WebChannel não existe porta, URL nem credencial na tela: a consulta roda na
 * sessão do usuário que abriu a rotina, na empresa e filial em que ele entrou.
 */
export const TIPO_INICIO = 'rcapInicio';
export const TIPO_CONSULTA = 'rcapConsulta';

export interface RcapInicio {
  sucesso: boolean;
  mensagem: string;
  dados?: {
    empresa: string;
    nomeEmpresa: string;
    filial: string;
    nomeFilial: string;
    usuario: string;
    nomeUsuario: string;
    /** Base do Salesforce (parâmetro do Protheus) para os links do Excel; vazio = Excel sem link. */
    urlSalesforce: string;
  };
}

export interface FiltroRcap {
  dataInicial: string;
  dataFinal: string;
  tipo: string;
  workflow: string;
  liquidado: string;
  agruparNaturezaTes: string;
  notaFiscal: string;
  fornecedor: string;
  print: string;
  detalharAprovacoes: string;
  /** Pasta da máquina do usuário onde a papeleta (ZIP) é gravada antes de abrir. */
  path: string;
}

/** Resultado da papeleta: o AdvPL gera o ZIP no servidor, copia para a máquina do usuário e abre. */
export interface PapeletaRcap {
  sucesso: boolean;
  mensagem: string;
  arquivo?: string;
}

export interface RcapConsulta {
  sucesso: boolean;
  mensagem: string;
  // Itens no mesmo formato que o relatório já usava (nota, fornecedor, impostos, SLA...).
  dados?: Array<Record<string, unknown>>;
  papeleta?: PapeletaRcap;
}

export interface MensagemAdvpl {
  type: string;
  content: string;
}

export type ValorRcap = string | number;
