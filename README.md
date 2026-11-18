# poui-invoice-report-v2 — RCAP de Impostos (WebChannel)

Relatório de notas de entrada com impostos retidos e **SLA entre o 3-way e a digitação**, feito em
**Angular 19 + PO-UI** e aberto **dentro do TOTVS Protheus** por `FwCallApp`.

É a versão 2 do `poui-invoice-report`: a tela é a mesma, mas a comunicação com o Protheus passou de
**REST para WebChannel**.

**Demonstração (dados fictícios):** https://michelssalves.github.io/poui-invoice-report-v2/

## O que mudou da v1 para a v2

| | v1 (REST) | v2 (WebChannel) |
|---|---|---|
| Comunicação | `HttpClient` → endpoint TLPP REST | `jsToAdvpl` / `advplToJs` pelo canal do `FwCallApp` |
| Autenticação | Basic Auth com usuário de serviço no JavaScript | nenhuma credencial na tela: roda na sessão de quem abriu a rotina |
| Empresa/filial | seletor na tela + cabeçalho `tenantid` | empresa e filial da sessão logada |
| Endereço do servidor | URL por ambiente (parâmetro + build) | não existe: o canal já é a sessão |
| Papeleta (PDF) | download por HTTP + chamada de exclusão | o AdvPL gera o ZIP, copia para a máquina do usuário e abre |
| Link do Salesforce | domínio fixo no código | base vem do Protheus (parâmetro) na abertura |

## Contrato das mensagens

Definido em [`src/app/core/webchannel/contrato.ts`](src/app/core/webchannel/contrato.ts):

| Ida (`jsToAdvpl`) | Volta (`advplToJs`) |
|---|---|
| `jstoadvplPar1` (uma vez, ao conectar) | `rcapInicio` → empresa, filial, usuário, base do Salesforce |
| `rcapConsultar` + filtros (período, tipo, liquidado, nota, fornecedor, papeleta...) | `rcapConsulta` → `{sucesso, mensagem, dados[], papeleta?}` |
| `abrirSalesforce` `{tipo, id}` | — (o AdvPL abre no navegador padrão) |
| `close` | — (tratado pelo `FwCallApp`) |

A ponte fica em [`src/main.ts`](src/main.ts) e o serviço que a tela usa em
[`protheus-canal.service.ts`](src/app/core/webchannel/protheus-canal.service.ts) (promessas com tempo
limite; um Filtrar novo descarta a resposta do anterior).

## Builds

| Configuração | Uso |
|---|---|
| `protheus` | conecta o WebChannel de verdade; `npm run protheus:build` gera `Protheus/Resource/poui-invoice-report-v2.app` (fora do Git) |
| `demo` | troca `modo.ts` por `modo.demo.ts` e carrega `src/demo/protheus-simulado.ts`, que responde às mesmas mensagens com dados fictícios |

```bash
npm ci
npx ng serve -c demo        # demonstração em http://localhost:4200
npm run protheus:build      # pacote .app para o RPO
```

No Protheus, o launcher chama `FwCallApp("poui-invoice-report-v2")` e trata as mensagens acima numa
`Static Function JsToAdvpl` no mesmo fonte `.prw`.

---

Michel Alves · Desenvolvedor TOTVS Protheus (AdvPL/TLPP) e Angular
