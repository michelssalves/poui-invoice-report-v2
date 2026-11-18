import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, HostListener, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  PoAccordionModule,
  PoButtonModule,
  PoChartOptions,
  PoChartSerie,
  PoChartType,
  PoFieldModule,
  PoLoadingModule,
  PoModule,
  PoNotificationService,
  PoSelectOption,
  PoTableColumn,
  PoTableLiterals,
  PoTableModule,
  PoToolbarModule
} from '@po-ui/ng-components';
import * as ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import { FiltroRcap, RcapConsulta } from '../../../core/webchannel/contrato';
import { ProtheusCanalService } from '../../../core/webchannel/protheus-canal.service';
import { RelatorioRecapService } from './relatorio-rcap.component.service';

@Component({
  selector: 'app-relatorio-rcap',
  templateUrl: './relatorio-rcap.component.html',
  styleUrl: './relatorio-rcap.component.css',
  imports: [
    CommonModule,
    FormsModule,
    PoModule,
    PoAccordionModule,
    PoButtonModule,
    PoLoadingModule,
    PoFieldModule,
    PoTableModule,
    PoToolbarModule
  ],
  providers: [RelatorioRecapService],
  standalone: true
})
export class RelatorioRcapComponent implements OnInit {
  private readonly columnsStorageKey = 'poui.rcap.columns.visible.v1';
  colunasExcel: Array<{ key: string; header: string }> = [];
  private usuarioEdicaoExcel = '';

  /** Código do usuário Protheus, recebido na abertura da tela (rcapInicio). */
  get usuarioExcel(): string {
    return this.usuario;
  }

  prepararColunasExcel(): void {
    this.usuarioEdicaoExcel = this.usuarioExcel;
    this.colunasExcel = this.ordenarColunasExcel(this.getExcelColumns())
      .map(column => ({ key: column.key!, header: String(column.header) }));
  }

  moverColunaExcel(index: number, destino: number): void {
    if (destino < 0 || destino >= this.colunasExcel.length) return;
    const [coluna] = this.colunasExcel.splice(index, 1);
    this.colunasExcel.splice(destino, 0, coluna);
  }

  restaurarOrdemExcel(): void {
    this.colunasExcel = this.getExcelColumns()
      .map(column => ({ key: column.key!, header: String(column.header) }));
  }

  salvarOrdemExcel(): boolean {
    if (!this.usuarioExcel || (this.usuarioEdicaoExcel && this.usuarioExcel !== this.usuarioEdicaoExcel)) {
      this.poNotification.warning('Abra novamente a configuração com o usuário identificado no Protheus.');
      return false;
    }
    try {
      window.localStorage.setItem(this.excelOrderStorageKey(), JSON.stringify(this.colunasExcel.map(column => column.key)));
      this.poNotification.success('Ordem das colunas salva para este usuário neste navegador.');
      return true;
    } catch {
      this.poNotification.error('Não foi possível salvar a ordem das colunas neste navegador.');
      return false;
    }
  }

  private excelOrderStorageKey(): string {
    return `poui.rcap.excel.order.v2:${encodeURIComponent(this.empresa)}:${encodeURIComponent(this.usuarioExcel)}`;
  }

  private ordenarColunasExcel(columns: Partial<ExcelJS.Column>[]): Partial<ExcelJS.Column>[] {
    if (!this.usuarioExcel) return columns;
    try {
      const saved: unknown = JSON.parse(window.localStorage.getItem(this.excelOrderStorageKey()) || 'null');
      if (!Array.isArray(saved)) return columns;
      const available = new Map(columns.map(column => [column.key, column]));
      const ordered: Partial<ExcelJS.Column>[] = [];
      for (const key of saved) {
        const column = available.get(key);
        if (column) {
          ordered.push(column);
          available.delete(key);
        }
      }
      return [...ordered, ...available.values()];
    } catch {
      return columns;
    }
  }

  constructor(
    private http: HttpClient,
    private sampleAirfare: RelatorioRecapService,
    private poNotification: PoNotificationService,
    private canal: ProtheusCanalService
  ) {}

  /** Empresa, filial e usuário da sessão do Protheus que abriu a tela (sem seletor: é a empresa logada). */
  empresa = '';
  filial = '';
  nomeEmpresa = '';
  nomeFilial = '';
  erroAbertura = '';
  private usuario = '';
  private urlSalesforce = '';
  get modoDemo(): boolean {
    return this.canal.modoDemo;
  }

  columns!: Array<PoTableColumn>;
  items: Array<any> = [];
  itemsAll: Array<any> = [];
  page = 1;
  pageSize = 50;
  total = 0;
  loading = false;
  // p-height fixa o cabeçalho da tabela; recalculada no resize para acompanhar a janela do Protheus.
  alturaTabela = this.calcularAlturaTabela();
  graficosVisiveis = false;
  readonly tableLiterals: PoTableLiterals = {
    noData: 'Nenhuma nota encontrada para os filtros informados.'
  };

  totalLiquido = 0;
  totalBruto = 0;
  totalImpostos = 0;
  totalNotas = 0;
  totalHorasSLA = 0;
  mediaHorasSLA = 0;
  mediaDiasSLA = 0;
  slaHoras = 48;
  totalDentroSLA = 0;
  percentDentroSLA = 0;

  tipo: string = '3';
  papeleta: string = '2';
  liquidado: string = '3';
  imprimir: string = 'N';
  agruparNaturezaTes: string = 'S';
  detalharAprovacoes: string = 'N';
  notaFiscal: string = '';
  fornecedor: string = '';
  path: string = 'C:\\temp';

  startDate: Date = new Date(new Date().setDate(new Date().getDate() - 1));
  endDate: Date = new Date(new Date().setDate(new Date().getDate() - 1));

  pizzaItens: Array<PoChartSerie> = [];
  readonly pizzaChartType = PoChartType.Pie;
  colunaItens: Array<PoChartSerie> = [];
  categoriasUsuarios: string[] = [];

  pageSizeOptions: PoSelectOption[] = [
    { label: '50', value: 50 },
    { label: '100', value: 100 },
    { label: '200', value: 200 },
    { label: '500', value: 500 }
  ];

  private endDateAlteradaManual = false;
  private requestIdAtual = 0;
  private feriadosCache = new Map<number, Set<string>>();
  private feriadosJsonCache: Record<string, Array<{ date: string; name: string; type: string }>> | null = null;
  private feriadosMunicipaisJsonCache: {
    recorrentes?: Array<{ month: number; day: number; name: string; type: string }>;
  } | null = null;

  chartOptions: PoChartOptions = {
    tooltip: true,
    legend: true,
    axis: {
      labels: false
    } as any,
    dataLabel: {
      enabled: true,
      format: '{label}: {value}'
    }
  };

  tipoOptions: PoSelectOption[] = [
    { label: 'Pedido', value: '1' },
    { label: 'Contrato', value: '2' },
    { label: 'Ambos', value: '3' }
  ];

  papeletaOptions: PoSelectOption[] = [
    { label: 'Pedido', value: '1' },
    { label: 'Nota Fiscal', value: '2' },
    { label: 'Ambos', value: '3' }
  ];

  liquidadoOptions: PoSelectOption[] = [
    { label: 'Sim', value: '1' },
    { label: 'Não', value: '2' },
    { label: 'Ambos', value: '3' }
  ];

  imprimirOptions: PoSelectOption[] = [
    { label: 'Sim', value: 'S' },
    { label: 'Não', value: 'N' }
  ];

  agruparNaturezaTesOptions: PoSelectOption[] = [
    { label: 'Sim', value: 'S' },
    { label: 'Não', value: 'N' }
  ];

  detalharAprovacoesOptions: PoSelectOption[] = [
    { label: 'Não', value: 'N' },
    { label: 'Sim', value: 'S' }
  ];

  async ngOnInit(): Promise<void> {
    this.inicializarColunas();
    this.loading = true;

    try {
      const inicio = await this.canal.aguardarInicio();

      if (!inicio.sucesso || !inicio.dados) {
        throw new Error(inicio.mensagem || 'O Protheus não devolveu a empresa da sessão.');
      }

      this.empresa = inicio.dados.empresa;
      this.filial = inicio.dados.filial;
      this.nomeEmpresa = inicio.dados.nomeEmpresa;
      this.nomeFilial = inicio.dados.nomeFilial;
      this.usuario = inicio.dados.usuario;
      this.urlSalesforce = (inicio.dados.urlSalesforce ?? '').replace(/\/+$/, '');
    } catch (erro) {
      this.loading = false;
      this.erroAbertura = erro instanceof Error ? erro.message : String(erro);
      return;
    }

    this.carregarDados();
  }

  onVisibleColumnsChanged(visibleColumns: string[]): void {
    this.aplicarColunasSalvas(visibleColumns);
  }

  onRestoreColumnManager(visibleColumns: string[]): void {
    this.aplicarColunasSalvas(visibleColumns);
  }


  onStartChanged(value: any): void {
    const date = this.toDateSafe(value);
    this.startDate = date;

    if (!this.endDateAlteradaManual) {
      this.endDate = date;
    }
  }

  onEndChanged(value: any): void {
    this.endDate = this.toDateSafe(value);
    this.endDateAlteradaManual = true;
  }

  private toDateSafe(value: any): Date {
    if (value instanceof Date) return value;

    if (typeof value === 'string') {
      if (/^\d{4}-\d{2}-\d{2}/.test(value)) {
        const [y, m, d] = value.slice(0, 10).split('-').map(Number);
        return new Date(y, m - 1, d);
      }
      if (/^\d{2}\/\d{2}\/\d{4}$/.test(value)) {
        const [d, m, y] = value.split('/').map(Number);
        return new Date(y, m - 1, d);
      }
    }

    const dt = new Date(value);
    return isNaN(dt.getTime()) ? new Date() : dt;
  }

  filtrar(): void {
    this.carregarDados();
  }

  @HostListener('window:resize')
  onResize(): void {
    this.alturaTabela = this.calcularAlturaTabela();
  }

  private calcularAlturaTabela(): number {
    const alturaJanela = typeof window === 'undefined' ? 900 : window.innerHeight;
    return Math.min(920, Math.max(320, alturaJanela - 260));
  }

  updatePageItems(): void {
    const start = (this.page - 1) * this.pageSize;
    const end = start + this.pageSize;
    this.items = this.itemsAll.slice(start, end);
  }

  nextPage(): void {
    if (this.page * this.pageSize >= this.total) return;
    this.page++;
    this.updatePageItems();
  }

  prevPage(): void {
    if (this.page <= 1) return;
    this.page--;
    this.updatePageItems();
  }

  setPageSize(size: number): void {
    this.pageSize = Number(size) || 50;
    this.page = 1;
    this.updatePageItems();
  }

  private isRequestAtiva(requestId: number): boolean {
    return requestId === this.requestIdAtual;
  }

  private async processarResposta(response: RcapConsulta, requestId: number): Promise<void> {
    if (!this.isRequestAtiva(requestId)) return;

    this.itemsAll = (response?.dados ?? []).map((item: any) => ({
      ...item,
      cnpjFormatado: this.formatCpfCnpj(item?.cnpj),
      dataAprovacaoPR: this.formatDatasAprovacaoPR(item?.dataAprovacaoPR),
      prLinks: this.montarLinksPR(item?.pr, item?.salesPr)
    }));

    if (!this.itemsAll.length) {
      if (!this.isRequestAtiva(requestId)) return;
      this.total = 0;
      this.page = 1;
      this.items = [];
      this.zerarTotais();
      this.loading = false;
      return;
    }

    try {
      // garante feriados com parse robusto (não depende de slice(0,4))
      const anos = this.itemsAll
        .flatMap(i => {
          const a = this.parseDateOnly(i?.Dt3Way)?.getFullYear();
          const b = this.parseDateOnly(i?.digitacao)?.getFullYear();
          return [a, b];
        })
        .filter((y): y is number => typeof y === 'number' && !isNaN(y));

      await this.garantirFeriados(anos);

      // SLA (Date + Time) com exceção acordada: mesmo dia e sem horas -> 24h
      for (let i = 0; i < this.itemsAll.length; i++) {
        if (!this.isRequestAtiva(requestId)) return;
        const item = this.itemsAll[i];

        const dtFim = this.parseDateOnly(item.digitacao);
        if (!dtFim) {
          item.horasSLA = 0;
          item.dentroSLA = true;
          item.slaStatus = 'Dentro';
          item.horasSLALabel = this.formatHorasSLA(item.horasSLA);
          continue;
        }

        const dtIni = this.isDataNula(item.Dt3Way)
          ? this.parseDateOnly(item.digitacao)
          : this.parseDateOnly(item.Dt3Way);

        if (!dtIni) {
          item.horasSLA = 0;
          item.dentroSLA = true;
          item.slaStatus = 'Dentro';
          item.horasSLALabel = this.formatHorasSLA(item.horasSLA);
          continue;
        }

        const data3WayNula = this.isDataNula(item.Dt3Way);
        const hora3WayNula = this.isHoraNula(item.Hr3Way);
        const horaDigitNula = this.isHoraNula(item.HrDigitacao);

        const hrIniNula = hora3WayNula || data3WayNula;
        const hrFimNula = horaDigitNula;

        let horas = 0;

        // ✅ REGRA HISTÓRICA / DADOS LEGADOS
        // Mesmo dia sem horas em ambos os lados mantém 24h.
        if (hrIniNula && hrFimNula && this.sameDay(dtIni, dtFim)) {
          horas = 24;
        } else {
          // Quando não existir hora no 3Way mas houver Dt3Way, usa início 00:00:00
          // para não colapsar o cálculo em 0h.
          let dataInicio = data3WayNula ? item.digitacao : item.Dt3Way;
          let horaInicio = data3WayNula
            ? (horaDigitNula ? '00:00:00' : item.HrDigitacao)
            : (hora3WayNula ? '00:00:00' : item.Hr3Way);

          // Legado: horas zeradas em dias diferentes -> não conta o dia da aprovação 3Way.
          if (!data3WayNula && hora3WayNula && horaDigitNula && !this.sameDay(dtIni, dtFim)) {
            const proximoDia = new Date(dtIni.getFullYear(), dtIni.getMonth(), dtIni.getDate() + 1);
            dataInicio = this.toISODate(proximoDia);
            horaInicio = '00:00:00';
          }

          const horaFim = horaDigitNula ? '23:59:59' : item.HrDigitacao;

          const ini = this.buildDateTime(dataInicio, horaInicio);
          const fim = this.buildDateTime(item.digitacao, horaFim);

          horas = (ini && fim)
            ? this.calcularHorasUteisDateTime(ini, fim)
            : 24; // fallback defensivo

          // Fallback: quando ha hora inicial/final no mesmo dia e o util resultar 0
          // (ex.: data marcada como nao util), exibe ao menos o tempo corrido em minutos.
          if (
            horas === 0 &&
            ini &&
            fim &&
            this.sameDay(ini, fim) &&
            !hrIniNula &&
            !hrFimNula
          ) {
            horas = this.calcularHorasCorridasDateTime(ini, fim);
          }
        }

        item.horasSLA = horas;
        item.horasSLALabel = this.formatHorasSLA(horas);
        item.dentroSLA = horas <= this.slaHoras;
        item.slaStatus = item.dentroSLA ? 'Dentro' : 'Fora';

        if (i % 500 === 0) await new Promise(r => setTimeout(r, 0));
      }

      // Nota pode se repetir por múltiplos pedidos; mantém SLA só na 1a ocorrência.
      const notasComSla = new Set<string>();
      for (const item of this.itemsAll) {
        const chaveNota = this.gerarChaveNota(item);
        if (!chaveNota) continue;

        if (notasComSla.has(chaveNota)) {
          item.horasSLA = 0;
          item.horasSLALabel = this.formatHorasSLA(0);
          item.dentroSLA = true;
          item.slaStatus = '';
          continue;
        }

        notasComSla.add(chaveNota);
      }

      // Métricas de SLA por nota única (não por linha/pedido).
      const metricasSla: Array<any> = [];
      const notasMetricas = new Set<string>();
      for (const item of this.itemsAll) {
        const chaveNota = this.gerarChaveNota(item);
        if (!chaveNota) {
          metricasSla.push(item);
          continue;
        }
        if (notasMetricas.has(chaveNota)) continue;
        notasMetricas.add(chaveNota);
        metricasSla.push(item);
      }

      // totais
      if (!this.isRequestAtiva(requestId)) return;
      this.totalNotas = metricasSla.length;
      this.totalDentroSLA = metricasSla.filter(i => !!i.dentroSLA).length;
      this.percentDentroSLA = this.totalNotas
        ? Math.round((this.totalDentroSLA / this.totalNotas) * 10000) / 100
        : 0;

      this.totalHorasSLA = metricasSla.reduce((sum, item) => sum + (item.horasSLA || 0), 0);
      this.mediaHorasSLA = this.totalNotas ? Math.round(this.totalHorasSLA / this.totalNotas) : 0;
      this.mediaDiasSLA = this.totalNotas
        ? Math.round((this.totalHorasSLA / 24 / this.totalNotas) * 100) / 100
        : 0;

      const totalPedido = this.itemsAll.filter(i => !i.contrato || i.contrato.trim() === '').length;
      const totalContrato = this.itemsAll.filter(i => i.contrato && i.contrato.trim() !== '').length;

      const mapaUsuarios: Record<string, number> = {};
      for (const i of this.itemsAll) {
        const usuario = i.codUsr;
        if (!usuario) continue;
        mapaUsuarios[usuario] = (mapaUsuarios[usuario] ?? 0) + 1;
      }

      const usuarios = Object.keys(mapaUsuarios);
      this.categoriasUsuarios = usuarios;
      this.colunaItens = [{
        label: 'Notas',
        data: usuarios.map(u => Number(mapaUsuarios[u]) || 0)
      }];

      this.setChartDataLabelEnabled(usuarios.length <= 30);

      // OBS: se sua versão do PO não suportar "color" em PoChartSerie, remova as propriedades color abaixo.
      this.pizzaItens = [
        { label: 'Pedido', data: totalPedido, color: 'po-color-08' as any },
        { label: 'Contrato', data: totalContrato, color: 'po-color-07' as any }
      ];

      const round2 = (v: number) => Math.round(v * 100) / 100;
      this.totalLiquido = round2(this.itemsAll.reduce((sum, item) => sum + (item.liquido || 0), 0));
      this.totalBruto = round2(this.itemsAll.reduce((sum, item) => sum + (item.bruto || 0), 0));
      this.totalImpostos = round2(this.itemsAll.reduce((sum, item) =>
        sum +
        (item.inss || 0) +
        (item.pis || 0) +
        (item.cofins || 0) +
        (item.csll || 0) +
        (item.ipi || 0), 0)
      );

      this.total = this.itemsAll.length;
      this.page = 1;
      this.updatePageItems();

      // Papeleta: o AdvPL já gerou o ZIP, copiou para a máquina do usuário e abriu (não há download pela tela).
      if (response.papeleta) {
        if (response.papeleta.sucesso) {
          this.poNotification.success(response.papeleta.mensagem || `Papeleta aberta: ${response.papeleta.arquivo ?? ''}`);
        } else {
          this.poNotification.warning(response.papeleta.mensagem || 'Não foi possível gerar a papeleta.');
        }
      }

      if (!this.isRequestAtiva(requestId)) return;

      this.loading = false;
      this.imprimir = 'N'

    } catch (e) {
      if (!this.isRequestAtiva(requestId)) return;
      console.error('Erro no processamento', e);
      this.loading = false;
      this.imprimir = 'N';
    }
  }

  async carregarDados(): Promise<void> {
    const requestId = ++this.requestIdAtual;
    this.loading = true;

    const filtro: FiltroRcap = {
      dataInicial: this.ToAAAMMDD(this.startDate),
      dataFinal: this.ToAAAMMDD(this.endDate),
      tipo: this.tipo,
      workflow: this.papeleta,
      liquidado: this.liquidado,
      agruparNaturezaTes: this.agruparNaturezaTes,
      notaFiscal: this.notaFiscal,
      fornecedor: this.fornecedor,
      print: this.imprimir,
      detalharAprovacoes: this.detalharAprovacoes,
      path: this.path
    };

    try {
      const resposta = await this.canal.consultar(filtro);

      if (!this.isRequestAtiva(requestId)) return;

      if (!resposta.sucesso) {
        this.poNotification.error(resposta.mensagem || 'O Protheus não devolveu o relatório.');
        this.loading = false;
        this.imprimir = 'N';
        return;
      }

      await this.processarResposta(resposta, requestId);
    } catch (erro) {
      // Pedido substituído por um Filtrar mais novo: quem responde é o novo.
      if (!this.isRequestAtiva(requestId)) return;

      this.poNotification.error(erro instanceof Error ? erro.message : String(erro));
      this.loading = false;
      this.imprimir = 'N';
    }
  }

  private setChartDataLabelEnabled(enabled: boolean): void {
    const opt: any = this.chartOptions ?? {};
    const dl: any = opt['dataLabel'] ?? {};
    this.chartOptions = {
      ...opt,
      ['dataLabel']: { ...dl, enabled }
    } as any;
  }

  private zerarTotais(): void {
    this.totalLiquido = 0;
    this.totalBruto = 0;
    this.totalImpostos = 0;
    this.totalNotas = 0;
    this.totalHorasSLA = 0;
    this.mediaHorasSLA = 0;
    this.mediaDiasSLA = 0;
    this.pizzaItens = [];
    this.colunaItens = [];
    this.categoriasUsuarios = [];
  }

  ToAAAMMDD(date: Date): string {
    if (!(date instanceof Date) || isNaN(date.getTime())) return '';
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}${m}${d}`;
  }

  // -------------------- Feriados --------------------
  private async garantirFeriados(anos: number[]): Promise<void> {
    const unicos = Array.from(new Set(anos.filter(a => a && !isNaN(a))));
    await Promise.all(unicos.map(ano => this.carregarFeriadosAno(ano)));
  }

  private async carregarFeriadosAno(ano: number): Promise<void> {
    if (this.feriadosCache.has(ano)) return;

    // carrega os calendários 1x
    if (!this.feriadosJsonCache) {
      this.feriadosJsonCache = await new Promise((resolve) => {
        this.http.get<Record<string, Array<{ date: string; name: string; type: string }>>>(
          'assets/feriados-br.json'
        ).subscribe({
          next: resolve,
          error: () => resolve({})
        });
      });
    }

    if (!this.feriadosMunicipaisJsonCache) {
      this.feriadosMunicipaisJsonCache = await new Promise((resolve) => {
        this.http.get<{
          recorrentes?: Array<{ month: number; day: number; name: string; type: string }>;
        }>('assets/feriados-municipais.json').subscribe({
          next: resolve,
          error: () => resolve({ recorrentes: [] })
        });
      });
    }

    const listaGeral = this.feriadosJsonCache?.[String(ano)] ?? [];
    const listaMunicipais = (this.feriadosMunicipaisJsonCache?.recorrentes ?? [])
      .map(feriado => ({
        ...feriado,
        date: `${ano}-${String(feriado.month).padStart(2, '0')}-${String(feriado.day).padStart(2, '0')}`
      }));
    const lista = [...listaGeral, ...listaMunicipais];

    console.log(`Feriados carregados para ${ano}:`, lista);

    this.feriadosCache.set(ano, new Set(lista.map(f => f.date)));
  }

  // -------------------- SLA (DateTime) --------------------
  private isHoraNula(h?: string): boolean {
    if (!h) return true;
    const v = h.trim();
    return v === '00:00:00' || v === '00:00' || v === '0';
  }

  private sameDay(a: Date, b: Date): boolean {
    return a.getFullYear() === b.getFullYear()
      && a.getMonth() === b.getMonth()
      && a.getDate() === b.getDate();
  }

  private isDataNula(data?: string): boolean {
    if (!data) return true;
    const v = data.trim();
    return v === '00/00/00' || v === '0000/00/00' || v === '0000-00-00';
  }

  private parseDateOnly(data?: string): Date | null {
    if (!data || this.isDataNula(data)) return null;
    const v = data.trim();

    if (/^\d{4}\/\d{2}\/\d{2}$/.test(v)) {
      const [y, m, d] = v.split('/').map(Number);
      return new Date(y, m - 1, d);
    }

    if (/^\d{4}-\d{2}-\d{2}$/.test(v)) {
      const [y, m, d] = v.split('-').map(Number);
      return new Date(y, m - 1, d);
    }

    if (/^\d{2}\/\d{2}\/\d{4}$/.test(v)) {
      const [d, m, y] = v.split('/').map(Number);
      return new Date(y, m - 1, d);
    }

    const dt = new Date(v);
    return isNaN(dt.getTime()) ? null : dt;
  }

  private parseTimeToSeconds(hhmmss?: string): number {
    if (!hhmmss) return 0;
    const v = hhmmss.trim();
    if (!/^\d{2}:\d{2}:\d{2}$/.test(v)) return 0;

    const [hh, mm, ss] = v.split(':').map(Number);
    return (hh * 3600) + (mm * 60) + ss;
  }

  private parseExcelTime(hhmmss?: string): number | null {
    if (!hhmmss) return null;
    const v = hhmmss.trim();
    if (!/^\d{2}:\d{2}:\d{2}$/.test(v)) return null;

    const [hh, mm, ss] = v.split(':').map(Number);
    // Hora no Excel como fração do dia (evita distorção de timezone histórico).
    return ((hh * 3600) + (mm * 60) + ss) / 86400;
  }

  private formatCpfCnpj(value: unknown): string {
    const original = String(value ?? '').trim();
    const digits = original.replace(/\D/g, '');

    if (digits.length === 11) {
      return digits.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
    }

    if (digits.length === 14) {
      return digits.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
    }

    return original;
  }

  // PR e salesPr vêm do REST com quebras de linha na mesma ordem: a n-ésima chave é da n-ésima PR.
  private montarLinksPR(prs: unknown, salesIds: unknown): Array<{ numero: string; salesId: string }> {
    const ids = String(salesIds ?? '').split(/\r?\n/);
    return String(prs ?? '')
      .split(/\r?\n/)
      .map((numero, idx) => ({ numero: numero.trim(), salesId: (ids[idx] ?? '').trim() }))
      .filter(link => link.numero !== '');
  }

  abrirSalesforce(event: Event, tipo: 'PR' | 'PEDIDO', salesId: string): void {
    event.preventDefault();
    event.stopPropagation();

    const id = String(salesId ?? '').trim();
    if (!/^[A-Za-z0-9]{15}([A-Za-z0-9]{3})?$/.test(id)) return;

    // O navegador embutido do Protheus não abre aba nova: o AdvPL monta a URL (o endereço do
    // Salesforce fica num parâmetro do Protheus, não na tela) e abre no navegador padrão.
    if (this.modoDemo) {
      this.poNotification.information(`Demonstração: no Protheus abriria ${tipo === 'PR' ? 'a PR' : 'o pedido'} no Salesforce.`);
      return;
    }

    this.canal.abrirSalesforce(tipo, id);
  }

  /** Link do registro para o Excel; sem a base do Salesforce (parâmetro do Protheus) não há link. */
  private montarUrlSalesforce(tipo: 'PR' | 'PEDIDO', salesId: unknown): string | null {
    const id = String(salesId ?? '').trim();
    if (!this.urlSalesforce || !/^[A-Za-z0-9]{15}([A-Za-z0-9]{3})?$/.test(id)) return null;
    const objeto = tipo === 'PR' ? 'PurchaseRequest__c' : 'Purchase_Order__c';
    return `${this.urlSalesforce}/lightning/r/${objeto}/${id}/view`;
  }

  private formatDatasAprovacaoPR(value: unknown): string {
    return String(value ?? '')
      .split(/\r?\n/)
      .map(data => /^\d{8}$/.test(data)
        ? `${data.slice(6, 8)}/${data.slice(4, 6)}/${data.slice(0, 4)}`
        : data)
      .join('\n');
  }

  private parseExcelDate(dateStr?: string): number | null {
    const d = this.parseDateOnly(dateStr);
    if (!d) return null;

    const y = d.getFullYear();
    const m = d.getMonth();
    const day = d.getDate();

    // Excel (1900 date system) usa 1899-12-30 como base.
    const excelEpochUtc = Date.UTC(1899, 11, 30);
    const valueUtc = Date.UTC(y, m, day);
    return Math.round((valueUtc - excelEpochUtc) / 86400000);
  }

  private buildDateTime(dateStr?: string, timeStr?: string): Date | null {
    const d = this.parseDateOnly(dateStr);
    if (!d) return null;

    const sec = this.parseTimeToSeconds(timeStr);
    const hh = Math.floor(sec / 3600);
    const mm = Math.floor((sec % 3600) / 60);
    const ss = sec % 60;

    return new Date(d.getFullYear(), d.getMonth(), d.getDate(), hh, mm, ss, 0);
  }

  private toISODate(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  private isDiaUtil(d: Date): boolean {
    const dow = d.getDay();
    if (dow === 0 || dow === 6) return false;

    const set = this.feriadosCache.get(d.getFullYear());
    if (!set) return true;

    return !set.has(this.toISODate(d));
  }

  private calcularHorasUteisDateTime(inicio: Date, fim: Date): number {
    if (!inicio || !fim || inicio >= fim) return 0;

    const msHour = 3600000;
    let totalMs = 0;

    let cur = new Date(inicio);

    while (cur < fim) {
      const dayStart = new Date(cur.getFullYear(), cur.getMonth(), cur.getDate(), 0, 0, 0, 0);
      const dayEnd = new Date(cur.getFullYear(), cur.getMonth(), cur.getDate(), 23, 59, 59, 999);

      const segIni = inicio > dayStart ? inicio : dayStart;
      const segFim = fim < dayEnd ? fim : dayEnd;

      if (segIni < segFim && this.isDiaUtil(dayStart)) {
        totalMs += (segFim.getTime() - segIni.getTime());
      }

      cur = new Date(dayStart.getTime() + 86400000);
    }

    return Math.round((totalMs / msHour) * 100) / 100;
  }

  private inicializarColunas(): void {
    const defaultColumns = this.sampleAirfare.getColumns().map(column => ({ ...column }));
    const visibleColumns = this.lerColunasSalvas() ?? this.getDefaultVisibleColumns(defaultColumns);
    this.columns = this.setVisibleColumns(defaultColumns, visibleColumns);
    this.salvarColunasVisiveis(visibleColumns);
  }

  private aplicarColunasSalvas(visibleColumns: string[] | null | undefined): void {
    if (!Array.isArray(visibleColumns) || !this.columns?.length) {
      return;
    }

    const visibleColumnsValidas = this.sanitizarColunasVisiveis(visibleColumns, this.columns);
    this.columns = this.setVisibleColumns(this.columns, visibleColumnsValidas);
    this.salvarColunasVisiveis(visibleColumnsValidas);
  }

  private getDefaultVisibleColumns(columns: PoTableColumn[]): string[] {
    return columns
      .filter(column => column.visible !== false)
      .map(column => String(column.property))
      .filter(Boolean);
  }

  private setVisibleColumns(columns: PoTableColumn[], visibleColumns: string[]): PoTableColumn[] {
    const visibleSet = new Set(visibleColumns.map(String));
    return columns.map(column => {
      const property = String(column.property ?? '');
      if (!property) {
        return { ...column };
      }

      return {
        ...column,
        visible: visibleSet.has(property)
      };
    });
  }

  private sanitizarColunasVisiveis(visibleColumns: string[], columns: PoTableColumn[]): string[] {
    const available = new Set(
      columns
        .map(column => String(column.property ?? ''))
        .filter(Boolean)
    );

    return visibleColumns
      .map(String)
      .filter(property => available.has(property));
  }

  private lerColunasSalvas(): string[] | null {
    if (typeof window === 'undefined' || !window.localStorage) {
      return null;
    }

    try {
      const raw = window.localStorage.getItem(this.columnsStorageKey);
      if (!raw) {
        return null;
      }

      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) {
        return null;
      }

      const defaultColumns = this.sampleAirfare.getColumns();
      const visibleColumns = this.sanitizarColunasVisiveis(parsed, defaultColumns);
      return visibleColumns.length ? visibleColumns : null;
    } catch {
      return null;
    }
  }

  private salvarColunasVisiveis(visibleColumns: string[]): void {
    if (typeof window === 'undefined' || !window.localStorage) {
      return;
    }

    try {
      window.localStorage.setItem(this.columnsStorageKey, JSON.stringify(visibleColumns));
    } catch {
      // sem ação: armazenamento pode estar indisponível (aba privada, quota, etc.)
    }
  }

  private calcularHorasCorridasDateTime(inicio: Date, fim: Date): number {
    if (!inicio || !fim || inicio >= fim) return 0;
    const msHour = 3600000;
    return Math.round(((fim.getTime() - inicio.getTime()) / msHour) * 100) / 100;
  }

  private formatHorasSLA(horas: number | null | undefined): string {
    const h = Number(horas);
    if (!isFinite(h) || h < 0) return '';

    if (h === 0) return '0 min';

    if (h < 1) {
      const min = Math.max(1, Math.round(h * 60));
      return `${min} min`;
    }

    return `${h.toFixed(2)} h`;
  }

  private gerarChaveNota(item: any): string {
    const filial = String(item?.filial ?? '').trim();
    const nota = String(item?.nota ?? '').trim();
    const serie = String(item?.serie ?? '').trim();
    const fornecedor = String(item?.fornecedor ?? '').trim();
    const loja = String(item?.loja ?? '').trim();

    if (!filial || !nota) return '';
    return `${filial}|${nota}|${serie}|${fornecedor}|${loja}`;
  }

  formatDecimalPtBr(value: number | null | undefined, min = 2, max = 2): string {
    const n = Number(value ?? 0);
    return new Intl.NumberFormat('pt-BR', {
      minimumFractionDigits: min,
      maximumFractionDigits: max
    }).format(isFinite(n) ? n : 0);
  }

  get totalPages(): number {
    return Math.max(1, Math.ceil((this.total || 0) / (this.pageSize || 1)));
  }

  // -------------------- Excel --------------------
  private getExcelColumns(): Partial<ExcelJS.Column>[] {
    return [
      { header: 'Item', key: 'item', width: 10 },
      { header: 'Filial', key: 'filial', width: 10 },
      { header: 'Nota', key: 'nota', width: 15 },
      { header: 'Série', key: 'serie', width: 10 },
      { header: 'Fornecedor', key: 'fornecedor', width: 15 },
      { header: 'Loja', key: 'loja', width: 10 },
      { header: 'Razão Social', key: 'razao', width: 60 },
       { header: 'CNPJ', key: 'cnpjFormatado', width: 22 },
      { header: 'Natureza', key: 'natureza', width: 15 },
      { header: 'TES', key: 'tes', width: 10 },
      { header: 'Emissão', key: 'emissao', width: 15, style: { numFmt: 'dd/mm/yyyy' } },
      { header: 'Digitação', key: 'digitacao', width: 15, style: { numFmt: 'dd/mm/yyyy' } },
      { header: 'Hr Digt', key: 'HrDigitacao', width: 15, style: { numFmt: 'hh:mm:ss' } },
      { header: 'Venc Real', key: 'vencimento', width: 15, style: { numFmt: 'dd/mm/yyyy' } },
      { header: 'Venc PreNota', key: 'DtPreNota', width: 15, style: { numFmt: 'dd/mm/yyyy' } },
      { header: 'Dt Emis Pedido', key: 'DtEmissaoPedido', width: 18, style: { numFmt: 'dd/mm/yyyy' } },
      { header: 'Dt Pedido', key: 'DtPedido', width: 15, style: { numFmt: 'dd/mm/yyyy' } },
      { header: 'Hr Pedido', key: 'HrPedido', width: 15, style: { numFmt: 'hh:mm:ss' } },
      { header: 'Dt 3Way', key: 'Dt3Way', width: 15, style: { numFmt: 'dd/mm/yyyy' } },
      { header: 'Hr 3Way', key: 'Hr3Way', width: 15, style: { numFmt: 'hh:mm:ss' } },
      { header: 'Tipo', key: 'tipo', width: 10 },
      { header: 'Estado', key: 'estado', width: 10 },
      { header: 'Líquido', key: 'liquido', width: 15, style: { numFmt: 'R$ #,##0.00' } },
      { header: 'Bruto', key: 'bruto', width: 15, style: { numFmt: 'R$ #,##0.00' } },
      { header: 'INSS', key: 'inss', width: 15, style: { numFmt: 'R$ #,##0.00' } },
      { header: 'PIS', key: 'pis', width: 15, style: { numFmt: 'R$ #,##0.00' } },
      { header: 'COFINS', key: 'cofins', width: 15, style: { numFmt: 'R$ #,##0.00' } },
      { header: 'CSLL', key: 'csll', width: 15, style: { numFmt: 'R$ #,##0.00' } },
      { header: 'IPI', key: 'ipi', width: 15, style: { numFmt: 'R$ #,##0.00' } },
      { header: 'Frete', key: 'frete', width: 15, style: { numFmt: 'R$ #,##0.00' } },
      { header: 'Desconto', key: 'desconto', width: 15, style: { numFmt: 'R$ #,##0.00' } },
      { header: 'Despesa', key: 'despesa', width: 15, style: { numFmt: 'R$ #,##0.00' } },
      { header: 'Pedido', key: 'pedido', width: 15 },
      { header: 'Cond Pagto', key: 'pagamento', width: 15 },
       { header: 'Descrição Cond. Pagto', key: 'pagamentoDescricao', width: 28 },
      { header: 'PR', key: 'pr', width: 16 },
      { header: 'Dt Aprov. PR', key: 'dataAprovacaoPR', width: 16 },
      { header: 'Contrato', key: 'contrato', width: 18 },
      { header: 'Medição', key: 'medicao', width: 12 },
       { header: 'Cód. Aprovador Pedido', key: 'codAprovadorPedido', width: 20 },
       { header: 'Aprovador Pedido', key: 'aprovadorPedido', width: 32 },
      { header: 'R$ Pedido', key: 'TTPedido', width: 15, style: { numFmt: 'R$ #,##0.00' } },
      { header: 'R$ Saldo', key: 'diferenca', width: 15, style: { numFmt: 'R$ #,##0.00' } },
      { header: 'Usuário', key: 'user', width: 35 },
      { header: 'Horas SLA', key: 'horasSLA', width: 12 },
      { header: `Dentro SLA (${this.slaHoras}h)`, key: 'slaStatus', width: 16 }
    ];
  }

  async exportToExcel(): Promise<void> {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Relatório RCAP');
    worksheet.columns = this.ordenarColunasExcel(this.getExcelColumns());

    worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    worksheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '4e73df' } };
    worksheet.getRow(1).alignment = { horizontal: 'center' };

    const rows = this.itemsAll.map(item => ({
      ...item,
      cnpjFormatado: this.formatCpfCnpj(item.cnpj),
      emissao: this.parseExcelDate(item.emissao) ?? null,
      digitacao: this.parseExcelDate(item.digitacao) ?? null,
      HrDigitacao: this.parseExcelTime(item.HrDigitacao) ?? null,
      vencimento: this.parseExcelDate(item.vencimento) ?? null,
      DtPreNota: this.parseExcelDate(item.DtPreNota) ?? null,
      DtEmissaoPedido: this.parseExcelDate(item.DtEmissaoPedido) ?? null,
      DtPedido: this.parseExcelDate(item.DtPedido) ?? null,
      HrPedido: this.parseExcelTime(item.HrPedido) ?? null,
      Dt3Way: this.parseExcelDate(item.Dt3Way) ?? null,
      Hr3Way: this.parseExcelTime(item.Hr3Way) ?? null
    }));

    worksheet.addRows(rows);

    const aplicarLink = (cell: ExcelJS.Cell, texto: string, url: string | null): void => {
      if (!texto || !url) return;
      cell.value = { text: texto, hyperlink: url };
      cell.font = { color: { argb: 'FF0563C1' }, underline: true };
    };
    let linksPrSheet: ExcelJS.Worksheet | undefined;
    this.itemsAll.forEach((item, index) => {
      const row = worksheet.getRow(index + 2);
      aplicarLink(row.getCell('pedido'), String(item.pedido ?? ''), this.montarUrlSalesforce('PEDIDO', item.salesPedido));
      const prs = this.montarLinksPR(item.pr, item.salesPr);
      if (prs.length === 1) {
        aplicarLink(row.getCell('pr'), prs[0].numero, this.montarUrlSalesforce('PR', prs[0].salesId));
      } else if (prs.length > 1 && prs.some(pr => this.montarUrlSalesforce('PR', pr.salesId))) {
        // O XLSX aceita um link por célula; várias PRs recebem links individuais nesta aba.
        if (!linksPrSheet) {
          linksPrSheet = workbook.addWorksheet('Links PR');
          linksPrSheet.columns = [
            { header: 'Filial', key: 'filial', width: 10 },
            { header: 'Nota', key: 'nota', width: 15 },
            { header: 'Série', key: 'serie', width: 10 },
            { header: 'Pedido', key: 'pedido', width: 15 },
            { header: 'PR', key: 'pr', width: 16 },
            { header: 'Relatório', key: 'relatorio', width: 20 }
          ];
        }
        const primeiraLinha = linksPrSheet.rowCount + 1;
        for (const pr of prs) {
          const detail = linksPrSheet.addRow({ filial: item.filial, nota: item.nota, serie: item.serie, pedido: item.pedido, pr: pr.numero });
          aplicarLink(detail.getCell('pedido'), String(item.pedido ?? ''), this.montarUrlSalesforce('PEDIDO', item.salesPedido));
          aplicarLink(detail.getCell('pr'), pr.numero, this.montarUrlSalesforce('PR', pr.salesId));
          aplicarLink(detail.getCell('relatorio'), 'Voltar ao relatório', `#'${worksheet.name}'!A${row.number}`);
        }
        aplicarLink(row.getCell('pr'), prs.map(pr => pr.numero).join('\n'), `#'Links PR'!E${primeiraLinha}`);
        row.height = Math.max(row.height || 15, prs.length * 15);
      }
    });

    workbook.eachSheet(sheet => {
      sheet.getRow(1).font = worksheet.getRow(1).font;
      sheet.getRow(1).fill = worksheet.getRow(1).fill;
      sheet.getRow(1).alignment = worksheet.getRow(1).alignment;
      sheet.eachRow((row: ExcelJS.Row, rowNumber: number) => {
        row.eachCell((cell: ExcelJS.Cell) => {
          cell.border = {
            top: { style: 'thin' },
            left: { style: 'thin' },
            bottom: { style: 'thin' },
            right: { style: 'thin' }
          };
          if (rowNumber > 1) {
            cell.alignment = {
              vertical: 'middle',
              horizontal: 'left',
              wrapText: true
            };
          }
        });
      });
      sheet.views = [{ state: 'frozen', ySplit: 1 }];
    });

    const buffer = await workbook.xlsx.writeBuffer();
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    saveAs(new Blob([buffer]), `RecapImpostos_${stamp}.xlsx`);
  }
}
