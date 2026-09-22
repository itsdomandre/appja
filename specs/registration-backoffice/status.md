# Status — registration-backoffice

Profile: `feature`

Executor flow: `botelho-dev:work-spec`

## Role bindings (from `.claude/dev-profile.md` §5)

| Role | Allowed agent(s) | Notes |
|---|---|---|
| `specification-author` | `ecc:tdd-guide` | must differ from `implementer` |
| `validate-tests` | `ecc:pr-test-analyzer` | must differ from `specification-author` |
| `implementer` | `general-purpose` | forbidden from editing specification artifacts |
| `validate-code` | `ecc:code-reviewer`, `ecc:react-reviewer`, `ecc:typescript-reviewer` | run all three where the diff touches `.tsx`/`.ts` |
| `refactor` | `ecc:code-simplifier` | no edits to specification artifacts |
| `validate-refactor` | `ecc:code-reviewer` | re-run DoD, re-assert empty spec-artifact diff |
| `explore` | `Explore` | never the implementer of record |

## Sub-tasks (ordered)

| # | Sub-task | File | Depends on | AC covered | State |
|---|---|---|---|---|---|
| 1 | Submissão pública do cadastro | `tasks/01-submissao-cadastro.md` | — | AC1–AC8, AC22, AC23, AC26–AC29 | done |
| 2 | Autenticação do backoffice | `tasks/02-autenticacao-admin.md` | 1 | AC9–AC11, AC21 | done |
| 3 | Listagem, busca e detalhe do backoffice | `tasks/03-listagem-busca-detalhe.md` | 1, 2 | AC12–AC18 | done |
| 4 | Fluxo de status (aprovar/rejeitar) | `tasks/04-fluxo-status.md` | 3 | AC19–AC20 | done |
| 5 | Deploy em produção (Vercel + Supabase) | `tasks/05-deploy-producao.md` | 1, 2, 3, 4 | AC24–AC25 | done |
| 6 | Estilo visual básico | `tasks/06-estilo-visual.md` | 1, 2, 3, 4 | AC30–AC31 | done |
| 7 | Redesign visual (Tailwind) e busca amigável | `tasks/07-redesign-visual-busca.md` | 3, 6 | AC32–AC37 | done |

## Document index

- `spec.md` — spec completa (goals, design, plano de testes)
- `decisions.md` — log de decisões
- `status.md` — este arquivo
- `tasks/01-submissao-cadastro.md`
- `tasks/02-autenticacao-admin.md`
- `tasks/03-listagem-busca-detalhe.md`
- `tasks/04-fluxo-status.md`
- `tasks/05-deploy-producao.md`
- `tasks/06-estilo-visual.md`
- `tasks/07-redesign-visual-busca.md`

## Bloqueios antes da execução

Nenhum — todas as decisões pendentes foram confirmadas (ver `decisions.md`). Spec aprovada
(`spec.md` frontmatter: `status: ready`), pronta para o `botelho-dev:work-spec`.
