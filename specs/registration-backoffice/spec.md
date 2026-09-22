---
status: ready
profile: feature
unit_of_work: repository (raio)
issue_id: none
key_files_in_scope:
  - app/cadastro/** (novo)
  - app/backoffice/** (novo)
  - app/api/registrations/** (novo)
  - app/api/admin/** (novo)
  - lib/** (novo)
  - middleware.ts (novo)
  - supabase/migrations/** (novo)
  - CLAUDE.md (novo)
  - app/globals.css (novo)
  - tailwind.config.ts (novo, sub-tarefa 7)
  - postcss.config.js (novo, sub-tarefa 7)
  - components/Topbar.tsx (novo, sub-tarefa 7)
  - lib/registrations/query.ts (paginação, sub-tarefa 7)
---

# Cadastro público + backoffice de administração

## 1 · Summary

Uma web app com duas superfícies: (a) um formulário público de cadastro, onde uma pessoa preenche
seus dados e envia uma foto; (b) um backoffice protegido por senha, onde administradores veem cada
cadastro (formulário + foto), buscam/filtram pessoas, e marcam um status de aprovação. Deploy
gratuito em Vercel (Next.js) + Supabase (Postgres + Storage).

## 2 · Goals

- Formulário público em `/cadastro` que colete: Nome, Telefone, Data de Nascimento, Ano Escolar,
  Localidade, Email (opcional), Instagram (opcional), TikTok (opcional), Observações (opcional), e
  Foto (upload, obrigatório).
- Cada envio grava um registro com status inicial `pendente`.
- A pessoa deve marcar um consentimento explícito para o envio e tratamento dos seus dados e da
  sua foto antes de conseguir submeter o formulário.
- Fotos enviadas são comprimidas/redimensionadas automaticamente antes de armazenar, para não
  esgotar o espaço de armazenamento gratuito com fotos de alta resolução vindas de telemóveis mais
  recentes.
- Backoffice em `/backoffice`, protegido por senha única compartilhada, que lista todos os
  cadastros e permite buscar/filtrar por nome, localidade, ano escolar e status.
- Tela de detalhe do cadastro mostrando todos os campos + foto, com controle para alterar o status
  (`pendente` / `aprovado` / `rejeitado`).
- Deploy simples e gratuito: Vercel (free tier) para o app, Supabase (free tier) para banco de
  dados e storage de fotos.
- Estilo visual básico e consistente (uma folha de estilo partilhada) em todas as páginas — decisão
  do stakeholder após ver a app em produção sem nenhum CSS aplicado (ver `decisions.md`).
- Redesign visual do backoffice clonando a linguagem visual do projeto de referência
  `doctorapp-fe` (Tailwind CSS: cards arredondados, tabela com cabeçalho cinza claro, badges de
  status coloridos, avatares com iniciais, topbar simples) e busca de cadastros mais amigável
  (contagem de resultados visível, paginação) — decisão do stakeholder pós sub-tarefa 6 (ver
  `decisions.md` "Redesign visual e busca mais amigável").

## 3 · Non-goals

- Conta/login para a pessoa que se cadastra (ela não edita o próprio cadastro depois de enviado).
- Contas individuais de administrador ou trilha de auditoria de quem alterou o quê — decisão do
  usuário foi por senha única compartilhada.
- Exportação (CSV/Excel) dos cadastros — não foi pedido; pode ser adicionado depois via
  `change-spec` se necessário.
- Internacionalização — a interface é em português.
- Verificação de telefone/e-mail por SMS ou link de confirmação — apenas validação de formato.
- Qualquer migração de dados da planilha existente para o novo banco — fora de escopo deste spec
  (a planilha foi usada só como referência dos campos).

## 4 · Current state

Projeto novo, diretório vazio até este planejamento. Não há código, nem app, nem banco de dados
ainda. `.claude/dev-profile.md` foi criado nesta sessão para fixar stack, topology e bindings de
agente (ver decisions.md).

## 4.5 · Behaviour preservation contract

N/A — feature spec; behaviour change is the point.

## 5 · Proposed design

### 5.1 Data model (Supabase / Postgres)

Tabela `registrations`:

| Coluna | Tipo | Obrigatório | Notas |
|---|---|---|---|
| `id` | `uuid` | sim (PK, `gen_random_uuid()`) | |
| `nome` | `text` | sim | |
| `telefone` | `text` | sim | validado no servidor contra o padrão de telemóvel PT |
| `data_nascimento` | `date` | sim | idade é **calculada**, nunca armazenada |
| `ano_escolar` | `text` | sim | `CHECK` contra lista fixa — ver 5.3 (lista dos níveis de ensino em Portugal) |
| `localidade` | `text` | sim | texto livre, sem `CHECK` — busca por substring no backoffice (ver 5.3) |
| `email` | `text` | não | |
| `instagram` | `text` | não | |
| `tiktok` | `text` | não | |
| `observacoes` | `text` | não | |
| `foto_path` | `text` | sim | caminho no bucket privado do Supabase Storage; arquivo já comprimido/redimensionado (ver 5.3) |
| `consentimento` | `boolean` | sim | `CHECK (consentimento = true)` — não é possível gravar uma linha sem consentimento |
| `status` | `text` | sim | `CHECK IN ('pendente','aprovado','rejeitado')`, default `'pendente'` |
| `created_at` | `timestamptz` | sim | default `now()` |

Storage: bucket privado `fotos` (não listável publicamente); acesso do backoffice via signed URL
de curta duração.

`idade` **não é uma coluna** — é calculada em runtime a partir de `data_nascimento` sempre que o
backoffice lista ou exibe um registro.

### 5.2 Use cases

1. **Submeter cadastro** (público) — `GET /cadastro` renderiza o formulário, incluindo o texto e
   o checkbox de consentimento; `POST /api/registrations` valida os campos e exige o
   consentimento marcado, sobe a foto para o Storage, insere a linha com `status='pendente'`.
2. **Login admin** — `GET /backoffice/login` mostra o formulário de senha; `POST
   /api/admin/login` confere a senha contra `ADMIN_PASSWORD` e, se correta, define um cookie de
   sessão assinado e `httpOnly`.
3. **Listar/buscar cadastros** (admin) — `GET /backoffice` (server component) e/ou `GET
   /api/registrations` lista os registros com filtro exato por `ano_escolar` e `status`, e busca
   por substring de `nome` e de `localidade` (ambos texto livre).
4. **Ver detalhe** (admin) — `GET /backoffice/[id]` mostra todos os campos, a idade calculada, e a
   foto via signed URL.
5. **Atualizar status** (admin) — `PATCH /api/registrations/[id]/status` grava o novo status.
6. **Logout admin** — `POST /api/admin/logout` limpa o cookie de sessão.

### 5.3 Key decisions

- **Lista fixa de `ano_escolar`** — resolvida: níveis de ensino oficiais em Portugal, do
  pré-escolar ao doutoramento, mais uma opção para quem não estuda:
  `Pré-escolar`, `1º ano`, `2º ano`, `3º ano`, `4º ano`, `5º ano`, `6º ano`, `7º ano`, `8º ano`,
  `9º ano`, `10º ano`, `11º ano`, `12º ano`, `Ensino Superior — Licenciatura`,
  `Ensino Superior — Mestrado`, `Ensino Superior — Doutoramento`, `Não estudante`. (A planilha de
  referência tinha valores como `"1º Ano de TAS"`, que não corresponde a um nível de ensino oficial
  — não entra na lista; se representar uma turma interna de algum programa específico, avise para
  tratarmos como um campo separado.)
- **`localidade` é texto livre** — decidido: sem lista fixa, sem `CHECK`. O backoffice busca por
  substring (como já faz para `nome`), não por igualdade exata.
- **Validação de `telefone`** — decidido: 9 dígitos, sem prefixo de país, começando por `9`
  (`^9\d{8}$`). Telefones fixos ou outros prefixos não são aceitos.
- **Duração da sessão admin** — proposta: cookie de sessão válido por 8 horas, renovado a cada
  requisição autenticada. Sem decisão explícita do usuário; segue como default razoável, ajustável
  sem impacto em outras partes do design.
- **Compressão de fotos** — o servidor (não o navegador da pessoa) redimensiona/comprime toda foto
  recebida antes de gravar no Storage: redimensiona para no máximo 1600px no lado maior e
  reencoda como JPEG (qualidade ~80%). Isso normaliza o tamanho final independentemente do
  dispositivo de origem. Arquivo original aceito até 20MB (fotos de câmaras de telemóveis recentes
  costumam ultrapassar os 5MB antes de comprimir); acima disso é rejeitado (AC28). O resultado
  comprimido é o que é armazenado (AC29).
- **Formato da foto** — aceitar `image/jpeg`, `image/png`, `image/webp` como entrada; a saída
  armazenada é sempre JPEG comprimido (ver acima). Sem decisão explícita do usuário; default
  razoável.
- **Texto de consentimento** — decidido: "Ao submeter este formulário, autorizo o envio e o
  tratamento dos meus dados pessoais e da minha fotografia para efeitos deste cadastro." Texto
  ajustável livremente sem impacto no resto do design — só o comportamento (obrigatório, bloqueia
  submissão se não marcado) está fixado pelas AC26/AC27.
- **Consentimento de menores de idade** — decidido: o mesmo checkbox de consentimento vale para
  qualquer idade, sem campo ou mecanismo adicional para encarregado de educação. O risco fica
  documentado (9 · Risks) como aceito conscientemente, não como pendência de implementação.
- **Tailwind CSS como base do redesign** — decidido: instalar Tailwind CSS (mesma stack usada por
  `doctorapp-fe`) em vez de replicar os tokens visuais à mão em CSS puro, para um clone fiel e mais
  fácil de manter alinhado com a referência no futuro. `app/globals.css` (sub-tarefa 6) é
  substituído/complementado pelas diretivas `@tailwind` + a stylesheet compilada; `.btn-primary`
  (AC30/AC31) deve continuar existindo com o mesmo comportamento computado, agora definida via
  Tailwind (`@apply` ou classes utilitárias diretas) em vez de CSS manual.
- **Sem sidebar** — decidido: só uma topbar simples (nome da app + logout), sem navegação lateral —
  o backoffice atual tem uma única seção (listagem/detalhe), diferente do `doctorapp-fe` que tem
  múltiplas (agendamentos, financeiro, etc.); sidebar ficaria sem propósito hoje.
- **Cores dos badges de status** — decidido: `pendente` = amarelo, `aprovado` = verde, `rejeitado` =
  vermelho (mesmo padrão de pill badge com ponto colorido usado em `doctorapp-fe`
  `AdminPatients.tsx`, estendido com uma terceira cor para `rejeitado`).
- **Tamanho de página da paginação** — proposto: 20 cadastros por página. Sem decisão explícita do
  usuário; default razoável, ajustável sem impacto no resto do design.

## 6 · Interface impact

Páginas: `/cadastro`, `/backoffice/login`, `/backoffice`, `/backoffice/[id]`.

Rotas de API: `POST /api/registrations`, `GET /api/registrations` (admin), `GET
/api/registrations/[id]` (admin), `PATCH /api/registrations/[id]/status` (admin), `POST
/api/admin/login`, `POST /api/admin/logout`.

`middleware.ts` protege todas as rotas sob `/backoffice` e `/api/registrations` (GET/PATCH) e
`/api/registrations/[id]/**`, redirecionando para `/backoffice/login` quando não há sessão válida.

`GET /api/registrations` (sub-tarefa 7) ganha os parâmetros opcionais de paginação `page`/`limit`;
quando ausentes, o comportamento existente (lista completa) é preservado para não quebrar as
sub-tarefas 3/4 já concluídas. A resposta paginada inclui o total de resultados que casam os
filtros atuais.

## 7 · Migration plan

Greenfield — não há dados ou usuários existentes no sistema novo. Passos operacionais (cobertos na
sub-tarefa 5, não uma migração de dados):

1. Criar projeto Supabase (free tier); aplicar a migration SQL que cria a tabela `registrations` e
   o bucket `fotos`.
2. Criar projeto Vercel (free tier) conectado ao repositório; configurar variáveis de ambiente
   (`NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `ADMIN_PASSWORD`, segredo de
   assinatura do cookie).
3. Deploy automático a cada push na branch principal.

## 8 · Test plan

Critérios de aceitação — cada um é o contrato que as sub-tarefas devem satisfazer (Validate Tests
gate). Só o que está aqui conta para o gate.

- AC1 — Enviar o formulário com todos os campos obrigatórios (nome, telefone, data_nascimento,
  ano_escolar, localidade, foto) e nenhum opcional cria uma linha em `registrations` com
  `status='pendente'` e os valores exatamente submetidos — type: route
- AC2 — Enviar o formulário sem um campo obrigatório (ex.: sem `nome`) é rejeitado com resposta 400
  que nomeia o campo ausente, e nenhuma linha é criada — type: route
- AC3 — Enviar o formulário com `telefone` inválido (não casa o padrão) é rejeitado com resposta
  400 que nomeia `telefone` como inválido, e nenhuma linha é criada — type: route
- AC4 — Enviar o formulário com `ano_escolar` fora da lista fixa (5.3) é rejeitado com resposta
  400 que nomeia `ano_escolar` como inválido — type: route
- AC5 — Enviar o formulário com `localidade` vazio (string vazia) é rejeitado com resposta 400 que
  nomeia `localidade` como obrigatório, e nenhuma linha é criada — type: route
- AC6 — Enviar o formulário sem arquivo de foto é rejeitado com resposta 400 que nomeia `foto`
  como obrigatório, e nenhuma linha é criada — type: route
- AC7 — Enviar o formulário com foto sobe o arquivo para o bucket privado e grava seu caminho na
  linha criada — type: integration
- AC8 — Enviar o formulário sem os campos opcionais (email, instagram, tiktok, observacoes) cria
  uma linha com essas colunas nulas, sem erro — type: route
- AC9 — Acessar `/backoffice` (ou sua rota de dados) sem sessão admin válida redireciona para
  `/backoffice/login`, não mostra a lista — type: route
- AC10 — Autenticar com a senha correta define um cookie de sessão válido e concede acesso a
  `/backoffice` — type: route
- AC11 — Autenticar com senha incorreta retorna resposta de falha de autenticação que nomeia
  credenciais inválidas, sem definir cookie de sessão — type: route
- AC12 — Com sessão admin válida, listar os cadastros retorna a lista completa incluindo uma
  `idade` calculada a partir de `data_nascimento` (não uma coluna armazenada) — type: route
- AC13 — Buscar a lista por substring de `localidade` (case-insensitive) retorna só cadastros
  cujo `localidade` contém essa substring — type: db
- AC14 — Filtrar a lista por `ano_escolar` retorna só cadastros cujo `ano_escolar` casa exatamente
  o valor selecionado — type: db
- AC15 — Filtrar a lista por `status` retorna só cadastros cujo `status` casa o valor selecionado
  — type: db
- AC16 — Buscar a lista por substring do nome (case-insensitive) retorna só cadastros cujo `nome`
  contém essa substring — type: db
- AC17 — Com sessão admin válida, obter o detalhe de um cadastro pelo seu id retorna todos os
  campos mais uma signed URL de curta duração para a foto — type: route
- AC18 — Requisitar o detalhe de um id inexistente retorna resposta "não encontrado" que nomeia
  explicitamente que não existe cadastro para esse id — type: route
- AC19 — Com sessão admin válida, atualizar o status de um cadastro para `aprovado` persiste esse
  valor e é refletido numa leitura subsequente desse cadastro — type: route
- AC20 — Tentar atualizar o status para um valor fora de `{pendente, aprovado, rejeitado}` é
  rejeitado com resposta 400 que nomeia o status inválido, e o status armazenado não muda —
  type: route
- AC21 — Fazer logout limpa a sessão admin, e uma requisição subsequente a `/backoffice`
  redireciona novamente para `/backoffice/login` — type: route
- AC22 — O componente do formulário público renderiza todos os campos obrigatórios mais os
  selects de opção fixa para `ano_escolar` e `localidade`, populados com as listas configuradas —
  type: component
- AC23 — Submeter o formulário público no navegador com todos os campos obrigatórios preenchidos
  mostra uma confirmação de sucesso e limpa/reseta o formulário — type: component
- AC24 — No ambiente de produção implantado, `GET /cadastro` responde 200 e renderiza o
  formulário — type: integration
- AC25 — No ambiente de produção implantado, acessar `/backoffice` sem autenticação redireciona
  para `/backoffice/login` — type: integration
- AC26 — Enviar o formulário sem marcar o consentimento é rejeitado com resposta 400 que nomeia o
  consentimento como obrigatório, e nenhuma linha é criada — type: route
- AC27 — O componente do formulário público renderiza o texto de consentimento e seu checkbox,
  desmarcado por padrão — type: component
- AC28 — Enviar uma foto maior que o limite máximo aceito (20MB) é rejeitada com resposta 400 que
  nomeia o tamanho do arquivo como inválido, e nenhuma linha é criada — type: route
- AC29 — Enviar uma foto grande dentro do limite aceito resulta num arquivo armazenado no Storage
  estritamente menor (em bytes) que o arquivo original enviado — type: integration
- AC30 — Ao visitar `/cadastro` no browser, o botão "Submeter" tem uma `background-color`
  computada diferente do valor por defeito do browser para um `<button>` sem estilo, provando que
  uma folha de estilo real foi carregada e aplicada (não apenas HTML nu) — type: integration
- AC31 — Ao visitar `/backoffice/login` no browser, o botão "Entrar" tem a mesma `background-color`
  computada que o botão "Submeter" de `/cadastro`, provando uma folha de estilo partilhada entre as
  duas superfícies (não estilos ad-hoc e divergentes por página) — type: integration
- AC32 — Uma topbar com o nome da aplicação está presente em `/backoffice/login`, `/backoffice` e
  `/backoffice/[id]`, com o mesmo `background-color` computado nas três páginas, provando um shell
  de navegação partilhado — type: integration
- ~~AC33~~ — **Removido** (decisão do stakeholder pós sub-tarefa 7, ver `decisions.md`
  "Conteúdo: renomeação, textos e campos exibidos" — a coluna Status foi retirada da lista de
  `/backoffice`, então este critério deixou de se aplicar; o teste correspondente foi removido).
  Texto original: numa lista de `/backoffice` com cadastros em pelo menos dois status diferentes
  (ex.: `pendente` e `aprovado`), os badges de status correspondentes têm `background-color`
  computada diferente entre si — type: integration
- AC34 — A listagem em `/backoffice` exibe um texto com a contagem de resultados retornados pela
  busca/filtro atual, e esse número muda quando um filtro que reduz o conjunto é aplicado —
  type: component
- AC35 — Quando o número de cadastros que casam os filtros atuais excede o tamanho de página (20),
  a listagem em `/backoffice` exibe no máximo 20 linhas por vez e oferece um controle para avançar
  à próxima página, que carrega o próximo conjunto de cadastros — type: component
- AC36 — `GET /api/registrations` aceita os parâmetros `page` e `limit`; quando fornecidos, a
  resposta inclui o total de resultados que casam os filtros atuais além da página pedida; quando
  ausentes, o comportamento é o já coberto por AC12–AC16 (lista completa) — type: route
- AC37 — Cada linha da tabela de cadastros em `/backoffice` exibe um avatar circular com as
  iniciais do nome da pessoa (ex.: "João Silva" → "JS") — type: component

## 8.1 · Effective testing contract

`L1 ⊕ L2` (sem L3 ainda). Disciplina: test-first (default L1, não re-vinculada). Vocabulário de
teste efetivo: `unit`, `integration` (L1) + `route`, `component`, `db` (L2, extend — ver
`.claude/dev-profile.md` §3). Runner: Vitest (unit/component) + Playwright (route/e2e). Recursos
de teste locais: instância local do Supabase (`supabase start`) ou schema de teste dedicado —
nunca o projeto free-tier compartilhado. `red-criterion`: a falha do teste nomeia explicitamente o
comportamento ausente (um campo/status/linha específico), nunca um erro genérico de módulo
ausente. `authorship-separation`: `specification-author` (`ecc:tdd-guide`) e `implementer`
(`general-purpose`) são agentes distintos.

## 9 · Risks

- **Lista fixa de `ano_escolar` incompleta** — se algum nível de ensino real não estiver na lista
  de 5.3 (ex.: uma turma interna como a "TAS" vista na planilha de referência), a pessoa não
  consegue se cadastrar corretamente. Mitigável adicionando valores à lista depois via
  `change-spec`.
- **Limites do free tier** — Supabase free tier tem 1GB de storage e 500MB de banco. Com a
  compressão de fotos (5.3, alvo tipicamente bem abaixo de 1MB por foto após comprimir), o volume
  suportado antes de esgotar o storage é bem maior do que sem compressão. Aceitável para volume
  inicial; se crescer muito, é preciso upgrade de plano (fora de escopo deste spec).
- **Tempo de execução da função serverless** — o Vercel free tier tem limite de duração para
  funções serverless; comprimir uma foto de até 20MB no servidor deve ficar bem dentro desse
  limite, mas a sub-tarefa 1 deve validar isso com uma foto de teste grande, não assumir.
- **Senha única compartilhada** — sem rastreabilidade de qual admin fez qual alteração de status;
  decisão explícita do usuário, registrada em decisions.md.
- **Signed URLs de foto** — se mal configuradas (expiração longa demais, ou bucket público por
  engano), fotos poderiam vazar. Sub-tarefa 3 deve testar explicitamente que o bucket é privado.
- **Cadastros de menores de idade** — a amostra de dados usada para definir os campos tem idades
  como 0, 15, 16 e 17 anos. Decisão explícita do usuário (5.3): o checkbox de consentimento da
  própria pessoa vale para qualquer idade, sem mecanismo adicional de encarregado de educação.
  Risco aceito conscientemente, não uma lacuna de implementação.

## 10 · Open questions

Nenhuma pendência bloqueante — todas as decisões de 5.3 foram confirmadas pelo usuário. Duração de
sessão admin e limites de compressão de foto (1600px / qualidade ~80% / 20MB máximo de entrada)
seguem como defaults razoáveis, ajustáveis sem impacto no resto do design se o usuário discordar
mais tarde.
