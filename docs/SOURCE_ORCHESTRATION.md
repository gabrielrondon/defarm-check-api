# Source Orchestration (Foco em Fontes)

Este fluxo padroniza o núcleo da API:

1. Receber `input`
2. Descobrir fontes aplicáveis
3. Executar fontes/checkers
4. Interpretar e retornar `sources[]` no output

## Contrato mínimo de fonte

Cada fonte segue o contrato `SourceHandler`:

- `canHandle(input)`: diz se a fonte deve rodar para aquele input/pais.
- `fetch(input)`: executa a coleta/consulta na fonte.
- `interpret(result)`: converte para `SourceResult` padrão da API.

## Onde está implementado

- Contrato: `src/types/source.ts`
- Orquestrador: `src/services/source-orchestrator.ts`
- Integração no endpoint `/check`: `src/services/orchestrator.ts`

## Como adicionar uma nova fonte

1. Criar checker em `src/checkers/<categoria>/...` (ou adaptar existente).
2. Garantir metadados corretos:
- `name`
- `category`
- `supportedInputTypes`
- `supportedCountries` (se não preencher, assume `BR` por padrão)
3. Registrar em `src/checkers/index.ts`.
4. Validar com teste do checker e/ou teste de integração do `/check`.

## Exemplos de fontes já plugadas

- `IBAMA Embargoes`
- `DETER Real-Time Alerts`
- `CAR Registry`

Essas fontes já passam pelo mesmo pipeline `input -> seleção -> execução -> output`.

