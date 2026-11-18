import { bootstrapApplication } from '@angular/platform-browser';
import '@totvs/twebchannel-js';
import { AppComponent } from './app/app.component';
import { appConfig } from './app/app.config';
import { TIPO_INICIO } from './app/core/webchannel/contrato';
import { MODO_DEMO } from './app/core/webchannel/modo';
import { EVENTO_ADVPL } from './app/core/webchannel/protheus-canal.service';

// Ponte WebChannel no mesmo padrão das outras telas FwCallApp: conecta e dispara jstoadvplPar1 uma
// única vez dentro do callback de connect() (padrão do TDN, sem retry). A primeira resposta do
// AdvPL pode se perder; a tela avisa por tempo limite em vez de ficar carregando para sempre.

interface CanalTotvs {
  advplToJs?: (type: string, content: string) => void;
  connect?: (callback: () => void) => void;
  gotConnection?: boolean;
  jsToAdvpl?: (type: string, content: string) => void;
}

declare global {
  interface Window {
    twebchannel?: CanalTotvs;
    /** Mensagens AdvPL -> JS recebidas antes desta ponte (preload/advpltojs.js guarda aqui). */
    rcapFila?: Array<[string, string]>;
  }
}

function publicar(type: string, content: string): void {
  if (type === TIPO_INICIO) {
    window.rcapInicio = content;
  }

  window.dispatchEvent(new CustomEvent(EVENTO_ADVPL, { detail: { type, content } }));
}

function configurarPonte(): void {
  window.advplToJs = publicar;

  window.jsToAdvpl = (type: string, content: string): boolean => {
    const canal = window.twebchannel;

    if (typeof canal?.jsToAdvpl !== 'function') {
      console.warn('[rcap] WebChannel indisponível para enviar', type);
      return false;
    }

    canal.jsToAdvpl(type, content);
    return true;
  };

  for (const [type, content] of window.rcapFila ?? []) {
    publicar(type, content);
  }

  window.rcapFila = [];
}

function conectar(): void {
  const canal = window.twebchannel;

  if (typeof canal?.connect !== 'function') {
    console.warn('[rcap] pacote @totvs/twebchannel-js não expôs connect()');
    return;
  }

  canal.advplToJs = (type: string, content: string): void => window.advplToJs?.(type, content);

  try {
    canal.connect(() => {
      canal.gotConnection = true;
      window.jsToAdvpl?.('jstoadvplPar1', 'content');
    });
  } catch (erro) {
    console.error('[rcap] falha ao conectar o WebChannel', erro);
  }
}

configurarPonte();

if (MODO_DEMO) {
  // Chunk separado: o build do Protheus nem carrega o simulador.
  import('./demo/protheus-simulado').then(simulador => simulador.instalar());
} else {
  conectar();
}

bootstrapApplication(AppComponent, appConfig)
  .catch((erro: unknown) => console.error(erro));
