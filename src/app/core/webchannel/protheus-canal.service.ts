import { Injectable, NgZone } from '@angular/core';
import { FiltroRcap, MensagemAdvpl, RcapConsulta, RcapInicio, TIPO_CONSULTA, TIPO_INICIO } from './contrato';
import { MODO_DEMO } from './modo';

/** Tempo sem resposta da abertura até avisar que o WebChannel provavelmente se perdeu. */
const ESPERA_INICIO_MS = 30_000;

/** Tempo sem resposta de uma consulta (período grande ou papeleta com muitos PDFs). */
const ESPERA_CONSULTA_MS = 300_000;

/** Evento que o main.ts dispara a cada mensagem AdvPL -> JS. */
export const EVENTO_ADVPL = 'rcapAdvplToJs';

declare global {
  interface Window {
    advplToJs?: (type: string, content: string) => void;
    jsToAdvpl?: (type: string, content: string) => boolean;
    /** Última resposta de abertura: pode chegar antes de o Angular subir. */
    rcapInicio?: string;
  }
}

/**
 * Ponte entre a tela e o Protheus. Cada pedido espera a resposta do tipo correspondente; um pedido
 * novo do mesmo tipo descarta o anterior (o usuário clicou Filtrar de novo).
 */
@Injectable({ providedIn: 'root' })
export class ProtheusCanalService {
  readonly modoDemo = MODO_DEMO;

  private readonly inicio: Promise<RcapInicio>;
  private pendente?: { resolver: (envelope: RcapConsulta) => void; falhar: (erro: Error) => void; espera: ReturnType<typeof setTimeout> };

  constructor(private readonly zona: NgZone) {
    this.inicio = new Promise<RcapInicio>((resolver, falhar) => {
      const espera = setTimeout(
        () => falhar(new Error('O Protheus não respondeu à abertura da tela. Feche a tela e abra novamente.')),
        ESPERA_INICIO_MS
      );

      const tratar = (conteudo: string): void => {
        clearTimeout(espera);

        try {
          resolver(JSON.parse(conteudo) as RcapInicio);
        } catch {
          falhar(new Error('Resposta de abertura do Protheus não é um JSON válido.'));
        }
      };

      if (window.rcapInicio) {
        tratar(window.rcapInicio);
        return;
      }

      window.addEventListener(EVENTO_ADVPL, evento => {
        const mensagem = (evento as CustomEvent<MensagemAdvpl>).detail;

        if (mensagem.type === TIPO_INICIO) {
          this.zona.run(() => tratar(mensagem.content));
        }
      });
    });

    window.addEventListener(EVENTO_ADVPL, evento => {
      const mensagem = (evento as CustomEvent<MensagemAdvpl>).detail;

      if (mensagem.type === TIPO_CONSULTA) {
        this.zona.run(() => this.tratarConsulta(mensagem.content));
      }
    });
  }

  aguardarInicio(): Promise<RcapInicio> {
    return this.inicio;
  }

  consultar(filtro: FiltroRcap): Promise<RcapConsulta> {
    this.pendente?.falhar(new Error('substituida'));
    clearTimeout(this.pendente?.espera);

    return new Promise<RcapConsulta>((resolver, falhar) => {
      const espera = setTimeout(() => {
        this.pendente = undefined;
        falhar(new Error('O Protheus não respondeu a consulta. Tente um período menor.'));
      }, ESPERA_CONSULTA_MS);

      this.pendente = { resolver, falhar, espera };

      if (!this.enviar('rcapConsultar', JSON.stringify(filtro))) {
        clearTimeout(espera);
        this.pendente = undefined;
        falhar(new Error('WebChannel indisponível para consultar o Protheus.'));
      }
    });
  }

  /** Dentro do Protheus o navegador embutido não abre aba nova: o AdvPL abre no navegador padrão. */
  abrirSalesforce(tipo: 'PR' | 'PEDIDO', id: string): boolean {
    return this.enviar('abrirSalesforce', JSON.stringify({ tipo, id }));
  }

  /** Fecha a tela pelo FwCallApp (tipo "close", tratado pelo próprio framework). */
  fechar(): boolean {
    return this.enviar('close', '');
  }

  private enviar(tipo: string, conteudo: string): boolean {
    return window.jsToAdvpl?.(tipo, conteudo) ?? false;
  }

  private tratarConsulta(conteudo: string): void {
    const pendente = this.pendente;

    // Resposta que chegou depois do tempo limite ou de um pedido substituído.
    if (!pendente) {
      return;
    }

    clearTimeout(pendente.espera);
    this.pendente = undefined;

    try {
      pendente.resolver(JSON.parse(conteudo) as RcapConsulta);
    } catch {
      pendente.falhar(new Error('Resposta do Protheus não é um JSON válido.'));
    }
  }
}
