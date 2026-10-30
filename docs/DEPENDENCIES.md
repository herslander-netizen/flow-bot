# Dependências e licenças (fixadas em 30/10/2026)

Versões exatas, publicadas há pelo menos duas semanas na data da escolha. O runtime de produção ainda não existe;
só `zod` é dependência de execução (do pacote de contratos).

| Pacote            | Versão  | Licença    | Uso                                                                        |
| ----------------- | ------- | ---------- | -------------------------------------------------------------------------- |
| zod               | 4.6.7   | MIT        | Schemas da DSL, validação e geração do JSON Schema (`@flow-bot/contracts`) |
| typescript        | 6.0.3   | Apache-2.0 | Compilação (dev)                                                           |
| vitest            | 4.1.12  | MIT        | Testes (dev)                                                               |
| eslint            | 10.12.0 | MIT        | Lint (dev)                                                                 |
| @eslint/js        | 10.0.1  | MIT        | Regras base (dev)                                                          |
| typescript-eslint | 8.71.2  | MIT        | Lint de TypeScript (dev)                                                   |
| globals           | 17.13.0 | MIT        | Globais do Node no lint (dev)                                              |
| prettier          | 3.9.10  | MIT        | Formatação (dev)                                                           |
| @types/node       | 26.6.5  | MIT        | Tipos do Node (dev)                                                        |

Avaliadas e **não instaladas** ainda: `@xyflow/react` 12.12.0 (MIT, editor — Fase 4), `xstate` 5.33.3 (MIT, sessão —
Fase 2).

Observação de ambiente: o `npm install` do npm 10.9 falhou ao resolver dependências opcionais (`edgesOut`); o
`package-lock.json` foi gerado com npm 11.6.2 e o `npm ci` do npm 10 (usado no CI com Node 22) instala normalmente.
