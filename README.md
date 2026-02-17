# Agenda Like Google Calendar

Aplicação full-stack de agenda semanal inspirada no Google Calendar, com frontend em SvelteKit, API em .NET e persistência em MongoDB.

## Visão Geral

O projeto foi construído para rodar 100% com Docker Compose e cobre os fluxos principais de uma agenda semanal:

- Criar compromisso
- Editar título, horário, cor e recorrência
- Excluir compromisso (simples ou recorrente com escopo)
- Drag and drop para mover compromisso com salvamento no backend
- Troca de semana por borda durante drag (edge-week) com animação
- Persistência enquanto os containers estão ativos
- Reset completo de dados após `docker compose down` + `up`

## Arquitetura

- `frontend`: SvelteKit (SPA estática com `adapter-static`) servida por Nginx
- `api`: ASP.NET Core Web API (C#)
- `mongo`: MongoDB 7 (armazenamento temporário via `tmpfs`)

### Containers e portas

| Serviço | Porta | Função |
|---|---:|---|
| `frontend` | `5174` | UI web e proxy `/api` |
| `api` | `8080` | Endpoints REST de compromissos |
| `mongo` | interna | Persistência dos compromissos |

## Requisitos

- Docker Desktop (ou Docker Engine + Compose v2)
- Node.js 20+ (para Playwright local)
- npm

## Como Executar

Na raiz do projeto:

```bash
docker compose up --build
```

A aplicação ficará disponível em:

- `http://localhost:5174`

Para parar:

```bash
docker compose down
```

## Persistência de Dados (Importante)

O Mongo está configurado com `tmpfs` em `/data/db` (sem volume em disco do host).  
Isso significa:

- enquanto o compose está ativo, os dados persistem normalmente
- após `docker compose down`, os dados são descartados

## API (Resumo)

Base path: `/api/appointments`

- `GET /api/appointments?from=<iso>&to=<iso>`
- `POST /api/appointments`
- `PUT /api/appointments/{id}`
- `DELETE /api/appointments/{id}?scope=single|following|all`

### Campos aceitos em create/update

- `title: string`
- `start: string (ISO UTC)`
- `end: string (ISO UTC)`
- `color: string` (ex.: `#3b82f6`)
- `recurrence: "none" | "daily" | "weekly" | "monthly"`
- `recurrenceUntil: string | null` (ISO UTC)

## Testes End-to-End (Playwright)

Os testes estão no arquivo raiz `browser.spec.ts`, com execução serial (`workers: 1`) e navegador visível (`headless: false`).

### Instalar dependências de teste

```bash
npm ci
npx playwright install
```

### Executar

```bash
npx playwright test browser.spec.ts
```

Observações:

- o `playwright.config.ts` usa `webServer` com `docker compose up -d --build`
- os testes estão desacelerados para visualização (`slowMo` + pausa entre cenários)
- há teste explícito que roda `docker compose down`/`up` e valida reset do banco

## Estrutura do Projeto

```text
.
├── backend/
│   ├── Dockerfile
│   └── CalendarApi/
├── frontend/
│   ├── Dockerfile
│   ├── nginx.conf
│   └── src/
├── browser.spec.ts
├── playwright.config.ts
└── docker-compose.yml
```

## Comandos Úteis

Subir em segundo plano:

```bash
docker compose up -d --build
```

Ver status dos serviços:

```bash
docker compose ps
```

Derrubar tudo:

```bash
docker compose down
```
