# Decisions — registration-backoffice

Mais recente primeiro.

## Conteúdo: renomeação, textos e campos exibidos (pós sub-tarefa 7)

- **Fonte:** decisão do stakeholder. Pedido explícito: "não é necessário testes e etc, é só
  alteração de conteúdo" — mudanças tratadas diretamente, sem passar pelo pipeline
  spec-first/change-spec completo, mas registradas aqui para manter o histórico.
- **Decisão:**
  - Nome da app trocado de "Raio" para "AppJA - IASD AMADORA" em todos os títulos
    (`app/layout.tsx`, `components/Topbar.tsx`).
  - `/cadastro` ganhou um título ("Cadastro JA - IASD Amadora") e uma mensagem de boas-vindas.
  - Tela de detalhe (`/backoffice/[id]`): campo "Nome completo" adicionado à grade; campos
    "Criado em" e o bloco de rótulo "Status" (redundante) removidos da grade — a ação de
    aprovar/rejeitar continua funcionando, só que reposicionada para junto do badge, no
    cabeçalho. Botão "Voltar para Home" adicionado.
  - Lista (`/backoffice`): coluna Status removida da tabela; coluna Telefone adicionada. O
    filtro por Status no formulário de busca **não** foi removido (só a coluna da tabela).
- **Consequências:** AC33 (badges de status visíveis na lista) deixou de se aplicar e foi
  removido de `spec.md` §8 e do teste correspondente em
  `tests/e2e/backoffice-redesign.spec.ts` — decisão explícita do usuário ao ser perguntado se
  preferia mover o teste para a tela de detalhe ou removê-lo. AC30-AC32, AC34-AC37 não são
  afetados.

## Redesign visual e busca mais amigável (mudança de spec pós sub-tarefa 6)

- **Fonte:** decisão do stakeholder. O usuário pediu para "clonar" a estilização do projeto de
  referência `doctorapp-fe` (`/home/rx/Documents/doctorapp-fe`, React+Vite+Tailwind) para este
  projeto, e tornar o dashboard do administrador "mais amigável para busca de pessoas que se
  cadastraram na app".
- **Contexto:** a sub-tarefa 6 (concluída) entregou uma folha de estilo mínima e deliberadamente
  sem framework (ver decisão "Estilo visual básico" abaixo). `doctorapp-fe` usa Tailwind CSS com
  uma linguagem visual específica: cards `rounded-2xl` com `border-gray-200`/`shadow-sm`, cabeçalho
  de tabela `bg-gray-50/70` com labels em uppercase, linhas com `divide-y` e hover, avatares com
  iniciais, badges de status como pill colorido, `gray-900` como cor de destaque. O analógo mais
  próximo da nossa listagem é `src/pages/admin/AdminPatients.tsx`.
- **Decisões confirmadas com o usuário:**
  - Instalar Tailwind CSS (não replicar os tokens à mão em CSS puro) — clone mais fiel e mais fácil
    de manter alinhado com a referência.
  - Escopo de "busca mais amigável", além do restyling: contagem de resultados visível, paginação,
    badges de status coloridos, avatar com iniciais por linha.
  - Sem sidebar — só uma topbar simples (nome da app + logout); o backoffice atual tem uma única
    seção, diferente do `doctorapp-fe` (múltiplas seções), então uma sidebar ficaria sem propósito.
- **Consequências:** spec.md §2 ganha um goal de redesign visual + busca amigável; §5.3 ganha as
  decisões de Tailwind, ausência de sidebar, cores dos badges (`pendente`=amarelo,
  `aprovado`=verde, `rejeitado`=vermelho) e tamanho de página (20, default não confirmado
  explicitamente); §6 ganha paginação opcional em `GET /api/registrations` (backward-compatible com
  AC12–AC16 já cobertos); §8 ganha AC32–AC37. `status.md` ganha a sub-tarefa 7, dependente das
  sub-tarefas 3 (listagem/busca) e 6 (estilo visual básico) — ambas já concluídas, então nenhuma
  sub-tarefa concluída é reaberta. Custo/risco reconhecido: nova dependência (Tailwind) e mais uma
  volta pelo pipeline test-first; risco de regressão nas sub-tarefas 1–6 é mitigado por manter
  `GET /api/registrations` backward-compatible sem `page`/`limit` e por preservar `.btn-primary`
  (AC30/AC31) com o mesmo comportamento computado.

## Estilo visual básico (mudança de spec pós sub-tarefas 1–5)

- **Fonte:** decisão do stakeholder. O usuário, ao abrir a app já em produção
  (`https://appja.vercel.app`), reportou "não tem estilo, não tem nada, só o formulário" e, ao
  perguntado, confirmou explicitamente: "Sim, adiciona styling básico".
- **Contexto:** confirmado que `app/layout.tsx` não importa nenhum CSS e não existe
  `globals.css`/Tailwind em nenhum ponto do projeto — as sub-tarefas 1–5 cobriram apenas
  comportamento (nenhum AC até aqui menciona aparência visual).
- **Decisão:** adicionar uma sub-tarefa 6 que introduz uma folha de estilo básica e partilhada
  (`app/globals.css`) aplicada a todas as páginas (formulário público, login do backoffice,
  listagem, detalhe).
- **Consequências:** spec.md §2 ganha um goal de estilo visual; §8 ganha AC30–AC31 (prova
  mecânica de que uma folha de estilo real foi carregada e é partilhada entre `/cadastro` e
  `/backoffice/login`, sem exigir um veredicto subjetivo de "bonito"). `status.md` ganha a
  sub-tarefa 6, dependente das páginas já existentes (sub-tarefas 1–4). Custo/risco reconhecido:
  mais uma volta pelo pipeline test-first (specification-author → implementer → validate-code →
  refactor) antes de fechar; risco de regressão visual é baixo dado o escopo mínimo (uma folha de
  estilo global, sem biblioteca de componentes).

## Validação de telefone, texto de consentimento, e menores de idade

- **Contexto:** três itens ficaram como `[DECISION NEEDED]`/open question após o rascunho inicial
  da spec: o padrão de validação de `telefone`, o texto exato do consentimento, e se pessoas
  menores de idade precisam de consentimento adicional de um encarregado de educação.
- **Opções (telefone):** aceitar só `^9\d{8}$` vs. aceitar outros prefixos/fixos.
- **Opções (menores):** (a) checkbox da própria pessoa basta para qualquer idade; (b) segundo
  checkbox reforçando responsabilidade; (c) campo de nome+contacto de encarregado quando menor.
- **Decisão:** telefone — `^9\d{8}$` confirmado. Texto de consentimento — confirmado como
  proposto em spec.md §5.3. Menores de idade — opção (a): checkbox único vale para qualquer idade,
  sem campo ou mecanismo adicional; risco aceito conscientemente (spec.md §9).
- **Consequências:** spec.md §10 (Open questions) fica sem pendências bloqueantes; `status.md`
  remove o bloqueio à sub-tarefa 1; frontmatter de `spec.md` passa de `draft` para `ready`.

## Compressão de fotos

- **Contexto:** fotos vindas de telemóveis com câmaras de alta resolução podem chegar com dezenas
  de MB, esgotando rapidamente o storage gratuito.
- **Opções:** (a) comprimir/redimensionar no servidor antes de armazenar; (b) comprimir no
  navegador antes do upload; (c) não comprimir, só limitar o tamanho aceito.
- **Decisão:** (a) — compressão/redimensionamento no servidor (independente do dispositivo/browser
  de origem), para no máximo 1600px no lado maior, reencodado como JPEG (~80% qualidade). Arquivo
  original aceito até 20MB de entrada.
- **Consequências:** `foto_path` (5.1) sempre aponta para o arquivo já comprimido; AC28 (rejeita
  acima de 20MB) e AC29 (arquivo salvo menor que o original) cobrem o comportamento; sub-tarefa 1
  ganha `lib/images/compress.ts` no escopo. Risco de tempo de execução da função serverless
  anotado em spec.md §9.

## Localidade: texto livre (revisão da decisão anterior)

- **Contexto:** decisão anterior ("Tipo de campo para Ano Escolar e Localidade", abaixo) havia
  fixado `localidade` como lista fixa (dropdown). O usuário pediu para reverter isso.
- **Decisão:** `localidade` passa a ser texto livre, sem `CHECK` no banco. Busca no backoffice por
  substring (case-insensitive), igual ao campo `nome` — não mais por igualdade exata.
- **Consequências:** AC5 (validação de localidade) e AC13 (filtro de localidade) reescritos em
  spec.md §8 para refletir texto livre + busca por substring. `ano_escolar` continua como lista
  fixa (ver decisão seguinte).

## Lista fixa de Ano Escolar definida

- **Contexto:** a lista de `ano_escolar` estava `[DECISION NEEDED]`; o usuário pediu os níveis de
  ensino oficiais disponíveis em Portugal.
- **Decisão:** lista fixa do pré-escolar ao doutoramento, mais "Não estudante" — valores completos
  em spec.md §5.3. O valor "1º Ano de TAS" visto na planilha de referência não corresponde a um
  nível oficial e não entrou na lista (registrado como risco em spec.md §9, ajustável depois via
  `change-spec` se necessário).
- **Consequências:** `[DECISION NEEDED]` de `ano_escolar` resolvido; migration da sub-tarefa 1 usa
  essa lista no `CHECK` de `ano_escolar`.

## Consentimento de envio de dados e foto

- **Contexto:** o formulário coleta dados pessoais e uma fotografia; o usuário pediu uma frase de
  consentimento explícito antes do envio.
- **Opções:** (a) checkbox obrigatório + texto de consentimento, bloqueando a submissão se não
  marcado, com o consentimento também gravado no banco; (b) apenas um aviso textual, sem checkbox
  nem bloqueio.
- **Decisão:** (a) — checkbox obrigatório, submissão bloqueada sem ele (AC26, AC27), e o valor é
  persistido na coluna `consentimento` com `CHECK (consentimento = true)` como última linha de
  defesa no banco (mesmo padrão usado para `status`).
- **Consequências:** modelo de dados ganha a coluna `consentimento` (5.1); sub-tarefa 1 passa a
  cobrir AC26–AC27 além dos critérios já atribuídos. Texto exato do consentimento e a questão de
  consentimento adicional para menores de idade ficam como open question (spec.md §9, §10).

## Campos obrigatórios do formulário

- **Contexto:** a planilha de referência tinha células em branco em Instagram, TikTok e
  Observações, sugerindo que são opcionais.
- **Opções:** (a) só Nome/Telefone/Data Nasc./Ano Esc./Localidade/Foto obrigatórios; (b) também
  tornar Instagram, TikTok ou Observações obrigatórios.
- **Decisão:** (a) — Nome, Telefone, Data de Nascimento, Ano Escolar, Localidade e Foto são
  obrigatórios; Email, Instagram, TikTok e Observações são opcionais.
- **Consequências:** validação do formulário e do endpoint de submissão (AC2, AC6, AC8) segue essa
  divisão.

## Colunas ocultas F e G da planilha

- **Contexto:** a planilha de referência tinha duas colunas ocultas entre "Localidade" e
  "Instagram".
- **Opções:** (a) ignorar, são cálculo interno da planilha; (b) incluir no formulário.
- **Decisão:** (b), parcialmente — coluna F é **Email** (campo opcional do formulário); coluna G
  não é necessária e foi descartada.
- **Consequências:** `email` entra no modelo de dados (5.1) como coluna opcional.

## Cálculo da idade

- **Contexto:** a planilha tinha uma coluna "Idade" ao lado da Data de Nascimento.
- **Opções:** (a) campo calculado a partir da Data de Nascimento; (b) campo preenchido
  manualmente pela pessoa.
- **Decisão:** (a) — `idade` é sempre calculada em runtime, nunca armazenada nem preenchida pela
  pessoa.
- **Consequências:** não há coluna `idade` na tabela `registrations` (5.1); AC12 cobre o cálculo.

## Tipo de campo para Ano Escolar e Localidade

- **Contexto:** a busca no backoffice precisa ser fácil e confiável; a planilha de referência
  tinha esses valores digitados livremente e de forma inconsistente (ex.: "11 ano", "Mestre",
  "Ens. Sup.").
- **Opções:** (a) lista fixa (dropdown); (b) texto livre.
- **Decisão:** (a) — ambos os campos são selects de lista fixa. As listas exatas ainda precisam de
  confirmação (`[DECISION NEEDED]` em spec.md §5.3).
- **Consequências:** filtro por esses campos no backoffice é por igualdade exata (AC13, AC14), não
  busca textual aproximada.
- **Revisão posterior:** ver "Localidade: texto livre" acima — esta decisão foi parcialmente
  revertida para `localidade`; `ano_escolar` manteve-se como lista fixa.

## Autenticação do backoffice

- **Contexto:** o backoffice precisa restringir acesso a administradores.
- **Opções:** (a) contas individuais por e-mail/senha; (b) senha única compartilhada.
- **Decisão:** (b) — senha única compartilhada (`ADMIN_PASSWORD`), sem contas individuais nem
  trilha de auditoria de quem alterou o quê.
- **Consequências:** não há tabela de usuários admin; cobertura de teste (AC9–AC11, AC21) valida
  o fluxo de sessão via cookie assinado, não identidade individual.

## Fluxo de status dos cadastros

- **Contexto:** o usuário quer poder validar cadastros manualmente.
- **Opções:** (a) somente visualizar/buscar; (b) também marcar aprovado/rejeitado/pendente.
- **Decisão:** (b) — cada cadastro tem um status editável pelo admin, default `pendente` na
  criação.
- **Consequências:** modelo de dados inclui coluna `status` com `CHECK` (5.1); AC19, AC20 cobrem
  a atualização.

## Stack e hospedagem

- **Contexto:** deploy precisa ser gratuito e simples.
- **Opções:** (a) Next.js no Vercel + Supabase (Postgres + Storage); (b) frontend estático +
  Firebase; (c) outra stack.
- **Decisão:** (a) — Next.js (frontend + API routes) no Vercel free tier; Supabase Postgres +
  Storage no free tier.
- **Consequências:** toda a arquitetura (rotas de API, migrations SQL, storage) segue o
  ecossistema Supabase/Vercel; registrado em `.claude/dev-profile.md` §1 e §4.

## Topology (forma do repositório)

- **Contexto:** projeto novo, diretório `/home/rx/Documents/raio` vazio.
- **Opções:** (a) repositório único; (b) repositórios/serviços separados para público e
  backoffice.
- **Decisão:** (a) — repositório único cobrindo formulário público, backoffice e API.
- **Consequências:** `.claude/dev-profile.md` §1 declara `Unit of work: repository`; spec folders
  em `specs/<slug>/` na raiz do repositório.
