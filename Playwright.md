# Requisitos de Cobertura de Testes (Playwright) — Desafio Agenda

> Objetivo: garantir que **todos os requisitos do desafio** estejam cobertos por testes automatizados em Playwright.
> Execução obrigatória: `npx playwright test browser.spec.ts` (com navegador visível / headed).

---

## 1) Execução e Setup dos Testes

- [ ] **R1 — Comando único de execução**
  - Todos os testes devem executar com **exatamente**: `npx playwright test browser.spec.ts`.
  - O arquivo `browser.spec.ts` deve estar no local adequado para esse comando funcionar.

- [ ] **R2 — Navegador visível**
  - Playwright deve rodar com `headless: false` (Chromium visível durante a execução).

- [ ] **R3 — Infra sob teste sobe automaticamente (ou é reutilizada)**
  - Antes dos testes, o sistema deve estar acessível no frontend.
  - Preferência: usar `webServer` no `playwright.config.ts` para rodar `docker compose up -d --build` e `reuseExistingServer: true`.

---

## 2) Requisitos de Infra (Docker / Compose)

- [ ] **R4 — Subida via Docker Compose**
  - Ao extrair o zip e executar `docker compose up --build`, o sistema sobe sem steps manuais adicionais.

- [ ] **R5 — Exatamente 3 containers**
  - Deve haver 3 serviços: `frontend`, `api` (backend .NET/C#), `mongo` (MongoDB).

- [ ] **R6 — Frontend na porta correta**
  - App acessível em: `http://localhost:5174`.

- [ ] **R7 — Frontend é SPA estático**
  - Frontend SvelteKit rodando como SPA (adapter-static) e servido pronto ao abrir `localhost:5174`.

---

## 3) Requisitos de Integração (Front ↔ API ↔ Mongo)

- [ ] **R8 — Frontend comunica com Backend**
  - Ações no frontend acionam requisições ao backend (criar/editar/deletar/mover).

- [ ] **R9 — Backend é .NET/C# e responde às operações**
  - API deve responder corretamente às ações do app (CRUD).

- [ ] **R10 — Persistência em MongoDB**
  - Dados são armazenados no MongoDB enquanto o compose está rodando.
  - Recarregar a página deve buscar dados do backend e renderizar.

---

## 4) Requisitos de Persistência “Descartável” (Sem Volume)

- [ ] **R11 — Mongo não grava no disco do host**
  - Não deve haver volume montado no host para o Mongo.
  - Não deve sobrar arquivo após `docker compose down`.

- [ ] **R12 — Dados somem após down/up**
  - Fluxo: criar compromisso → confirmar que existe → `docker compose down` → `docker compose up -d --build` → abrir app → compromisso **não existe mais**.

> Observação: incluir pelo menos **1 teste** que execute `docker compose down/up` (via `child_process.execSync`) e valide o reset do banco.

---

## 5) Requisitos de UI/Funcional (Tipo Google Agenda)

- [ ] **R13 — Visualização semanal**
  - Deve existir uma visualização de calendário semanal (“janelinha do calendário”) com navegação entre semanas.

- [ ] **R14 — Adicionar compromisso**
  - UI para adicionar compromisso (form/modal).
  - Teste: criar compromisso via UI e ver aparecer no calendário/lista.

- [ ] **R15 — Feedback de sucesso**
  - Após salvar/alterar (create/update/move/delete), mostrar um aviso (toast/banner) indicando sucesso (backend respondeu e gravou).

- [ ] **R16 — Reload (F5) carrega do backend**
  - Teste: criar → `page.reload()` → compromisso continua aparecendo (enquanto compose está ativo).

- [ ] **R17 — Deletar compromisso**
  - Deve existir ação/botão para deletar.
  - Teste: deletar → compromisso some → reload → continua ausente.

- [ ] **R18 — Mudar cor do compromisso**
  - Deve ser possível alterar cor do compromisso.
  - Teste: mudar cor → verificar que UI reflete → reload → cor persiste (preferência: validar via atributo `data-color`/estilo).

- [ ] **R19 — Drag & Drop salva ao soltar**
  - Deve ser possível arrastar compromisso para outro horário/dia.
  - Ao soltar: salvar no backend.
  - Teste: drag → soltar → feedback sucesso → reload → compromisso permanece na nova posição.

- [ ] **R20 — Trocar semana ao encostar na borda (edge-week) com animação**
  - Durante a interação (idealmente durante drag), ao “encostar na pontinha” da área, deve mudar automaticamente para próxima/semana anterior.
  - Deve ocorrer uma pequena animação.
  - Teste: iniciar drag → mover cursor para borda → semana muda (validar `week-label` mudou) e a navegação automática funcionou.

---

## 6) Regras de Implementação dos Testes (obrigatórias)

- [ ] **R21 — Seletores estáveis via data-testid**
  - O frontend deve expor `data-testid` para:
    - Form: `appt-title`, `appt-start`, `appt-end`, `appt-color`, `appt-submit`
    - Toast: `toast`
    - Item: `appt-item` + `data-id="<id>"`
    - Deletar: `appt-delete`
    - Editar cor: `appt-color-edit`
    - Semana: `week-prev`, `week-next`, `week-label`
    - Grid/slots (para DnD): padrão consistente (ex: `slot-YYYY-MM-DDTHH:00`) e evento `event-item`.

- [ ] **R22 — Cada requisito deve ter teste explícito**
  - Mapear cada requisito (R1..R20) a pelo menos um teste.
  - Evitar testes “implícitos” (ex: “funciona” sem assert).

- [ ] **R23 — Testes seriais**
  - Usar `workers: 1` e/ou `test.describe.configure({ mode: 'serial' })` para evitar flakiness.

- [ ] **R24 — Evidência de sucesso**
  - Sempre validar visualmente/por DOM:
    - toast aparece após operação
    - item aparece/desaparece
    - week-label muda na navegação
    - posição/horário muda após DnD (via atributos `data-start` / `data-slot`)

---

## 7) Saída Esperada (para o agente entregar)

- [ ] `playwright.config.ts` alinhado com o ambiente Docker (porta 5174, headed)
- [ ] `browser.spec.ts` cobrindo R1..R20
- [ ] Frontend com `data-testid` estáveis para suportar testes
- [ ] Execução comprovada via comando: `npx playwright test browser.spec.ts`

---
