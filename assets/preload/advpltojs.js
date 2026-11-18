// Exigido pelo FwCallApp: o WebApp procura um advplToJs próprio da aplicação. Até o main.ts
// assumir a ponte, as mensagens do Protheus ficam numa fila (window.rcapFila) para não se perderem.
if (typeof window.advplToJs !== 'function') {
  window.rcapFila = window.rcapFila || [];
  window.advplToJs = function (type, content) {
    window.rcapFila.push([type, content]);
  };
}
