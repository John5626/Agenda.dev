import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "playwright/test";

const BASE_URL = "http://localhost:5174";
const API_WEEK_CHECK = `${BASE_URL}/api/appointments?from=2026-01-01T00:00:00.000Z&to=2026-01-08T00:00:00.000Z`;
const DOCKER_UP = "docker compose up -d --build";
const DOCKER_DOWN = "docker compose down";
const VISUAL_HOLD_MS = 2_000;
const RUN_ID = Date.now();

const titles = {
  create: `PW-CREATE-${RUN_ID}`,
  drag: `PW-DRAG-${RUN_ID}`,
  reset: `PW-RESET-${RUN_ID}`
};

const state: { createId: string; dragId: string } = {
  createId: "",
  dragId: ""
};

test.describe.configure({ mode: "serial" });

function run(command: string): string {
  return execSync(command, { encoding: "utf8", shell: true }).trim();
}

function runInherit(command: string): void {
  execSync(command, { stdio: "inherit", shell: true });
}

function lines(value: string): string[] {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function pad2(value: number): string {
  return value.toString().padStart(2, "0");
}

function startOfWeekSunday(date: Date): Date {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  copy.setDate(copy.getDate() - copy.getDay());
  return copy;
}

function weekDate(dayOffset: number, hour: number, minute = 0): Date {
  const weekStart = startOfWeekSunday(new Date());
  const next = new Date(weekStart);
  next.setDate(weekStart.getDate() + dayOffset);
  next.setHours(hour, minute, 0, 0);
  return next;
}

function toInputDateTimeLocal(value: Date): string {
  return `${value.getFullYear()}-${pad2(value.getMonth() + 1)}-${pad2(value.getDate())}T${pad2(value.getHours())}:${pad2(value.getMinutes())}`;
}

function toLocalSlotKey(value: Date): string {
  return `${value.getFullYear()}-${pad2(value.getMonth() + 1)}-${pad2(value.getDate())}T${pad2(value.getHours())}:${pad2(value.getMinutes())}`;
}

function eventById(page: Page, id: string) {
  return page.locator(`[data-testid="event-item"][data-id="${id}"]`).first();
}

function apptById(page: Page, id: string) {
  return page.locator(`[data-testid="appt-item"][data-id="${id}"]`).first();
}

function composeServiceBlock(composeText: string, serviceName: string): string {
  const list = composeText.split(/\r?\n/);
  const startMarker = `  ${serviceName}:`;
  const startIndex = list.findIndex((line) => line === startMarker);
  if (startIndex < 0) return "";

  let endIndex = list.length;
  for (let i = startIndex + 1; i < list.length; i++) {
    if (/^  [a-zA-Z0-9_-]+:/.test(list[i])) {
      endIndex = i;
      break;
    }
  }

  return list.slice(startIndex, endIndex).join("\n");
}

async function waitForHttp(url: string, timeoutMs = 240_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      // Aguarda compose subir os serviços.
    }
    await new Promise((resolve) => setTimeout(resolve, 2_000));
  }
  throw new Error(`Timeout aguardando URL: ${url}`);
}

async function ensureCreateFormOpen(page: Page): Promise<void> {
  const titleInput = page.getByTestId("appt-title");
  if (await titleInput.isVisible()) return;
  await page.getByRole("button", { name: "Criar" }).click();
  await expect(titleInput).toBeVisible();
}

async function createViaSidebar(page: Page, payload: { title: string; start: Date; end: Date; color: string }): Promise<string> {
  await ensureCreateFormOpen(page);

  await page.getByTestId("appt-title").fill(payload.title);
  await page.getByTestId("appt-start").fill(toInputDateTimeLocal(payload.start));
  await page.getByTestId("appt-end").fill(toInputDateTimeLocal(payload.end));
  await page.getByTestId("appt-color").fill(payload.color);

  const createResponsePromise = page.waitForResponse((response) => {
    return response.request().method() === "POST" && /\/api\/appointments(?:\?|$)/.test(response.url());
  });

  await page.getByTestId("appt-submit").click();

  const createResponse = await createResponsePromise;
  expect(createResponse.status(), "POST /api/appointments deve retornar 201").toBe(201);

  const created = (await createResponse.json()) as { id?: string };
  expect(created.id, "Resposta do backend precisa conter id").toBeTruthy();
  const id = created.id!;

  await expect(page.getByTestId("toast")).toContainText("Compromisso criado e salvo");
  await expect(eventById(page, id)).toBeVisible();
  await expect(apptById(page, id)).toContainText(payload.title);

  return id;
}

test.beforeAll(async () => {
  await waitForHttp(BASE_URL);
  await waitForHttp(API_WEEK_CHECK);
});

test.afterEach(async ({ page }) => {
  await page.waitForTimeout(VISUAL_HOLD_MS);
});

test("R1-R3 | config da suíte: comando alvo, headed e webServer compose", async () => {
  const config = readFileSync("playwright.config.ts", "utf8");
  const specFile = readFileSync("browser.spec.ts", "utf8");

  expect(config).toContain("testMatch: ['browser.spec.ts']");
  expect(config).toContain("headless: false");
  expect(config).toContain("docker compose up -d --build");
  expect(config).toContain("reuseExistingServer: true");
  expect(specFile.length).toBeGreaterThan(0);
});

test("R4-R7 + R11 | compose com 3 containers, porta 5174, SPA estática e mongo sem volume de host", async ({ page, baseURL }) => {
  expect(baseURL).toBe(BASE_URL);

  const runningServices = lines(run("docker compose ps --services --status running")).sort();
  expect(runningServices).toEqual(["api", "frontend", "mongo"]);

  const composeText = readFileSync("docker-compose.yml", "utf8");
  const mongoBlock = composeServiceBlock(composeText, "mongo");
  expect(mongoBlock).toContain("tmpfs:");
  expect(mongoBlock).not.toContain("volumes:");

  const definedVolumes = lines(run("docker compose config --volumes"));
  expect(definedVolumes).toHaveLength(0);

  const rootResponse = await page.goto("/");
  expect(rootResponse?.ok()).toBeTruthy();
  await expect(page.getByText("Agenda")).toBeVisible();

  const svelteConfig = readFileSync("frontend/svelte.config.js", "utf8");
  expect(svelteConfig).toContain("adapter-static");
  expect(svelteConfig).toContain("fallback: 'index.html'");

  const nginxConfig = readFileSync("frontend/nginx.conf", "utf8");
  expect(nginxConfig).toContain("listen 5174;");
  expect(nginxConfig).toContain("try_files $uri $uri/ /index.html;");
});

test("R8-R10 + R13-R16 | cria compromisso com integração API, toast, visão semanal e persistência no reload", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByTestId("week-label")).toBeVisible();
  await expect(page.getByTestId("week-prev")).toBeVisible();
  await expect(page.getByTestId("week-next")).toBeVisible();

  state.createId = await createViaSidebar(page, {
    title: titles.create,
    start: weekDate(1, 9, 0),
    end: weekDate(1, 10, 0),
    color: "#3b82f6"
  });

  const listResponsePromise = page.waitForResponse((response) => {
    return response.request().method() === "GET" && response.url().includes("/api/appointments?");
  });

  await page.reload();

  const listResponse = await listResponsePromise;
  expect(listResponse.ok(), "GET /api/appointments no reload deve retornar 2xx").toBeTruthy();
  await expect(eventById(page, state.createId)).toBeVisible();
  await expect(apptById(page, state.createId)).toContainText(titles.create);
});

test("R18 | altera cor do compromisso e mantém após reload", async ({ page }) => {
  await page.goto("/");
  await expect(eventById(page, state.createId)).toBeVisible();

  await eventById(page, state.createId).click();
  await expect(page.getByTestId("appt-color-edit")).toBeVisible();

  const nextColor = "#ef4444";
  const updateResponsePromise = page.waitForResponse((response) => {
    return response.request().method() === "PUT" && response.url().includes(`/api/appointments/${state.createId}`);
  });

  await page.getByTestId("appt-color-edit").fill(nextColor);
  await page.locator('section[aria-label="Editar compromisso"]').getByRole("button", { name: "Salvar", exact: true }).click();

  const updateResponse = await updateResponsePromise;
  expect(updateResponse.ok()).toBeTruthy();
  await expect(page.getByTestId("toast")).toContainText("Compromisso atualizado");

  await expect.poll(async () => (await eventById(page, state.createId).getAttribute("data-color")) ?? "").toBe(nextColor);

  await page.reload();
  await expect.poll(async () => (await eventById(page, state.createId).getAttribute("data-color")) ?? "").toBe(nextColor);
});

test("R17 | deleta compromisso e ele permanece ausente após reload", async ({ page }) => {
  await page.goto("/");
  await expect(eventById(page, state.createId)).toBeVisible();

  await eventById(page, state.createId).click();
  page.once("dialog", async (dialog) => {
    await dialog.accept();
  });

  const deleteResponsePromise = page.waitForResponse((response) => {
    return response.request().method() === "DELETE" && response.url().includes(`/api/appointments/${state.createId}`);
  });

  await page.getByTestId("appt-delete").click();

  const deleteResponse = await deleteResponsePromise;
  expect(deleteResponse.status()).toBe(204);
  await expect(page.getByTestId("toast")).toContainText("Compromisso deletado");
  await expect(eventById(page, state.createId)).toHaveCount(0);

  await page.reload();
  await expect(eventById(page, state.createId)).toHaveCount(0);
});

test("R19 | drag&drop salva ao soltar e persiste no reload", async ({ page }) => {
  await page.goto("/");

  state.dragId = await createViaSidebar(page, {
    title: titles.drag,
    start: weekDate(2, 11, 0),
    end: weekDate(2, 12, 0),
    color: "#10b981"
  });

  const beforeStart = (await eventById(page, state.dragId).getAttribute("data-start")) ?? "";
  const targetDate = weekDate(4, 15, 0);
  const targetSlot = toLocalSlotKey(targetDate);
  const targetSlotLocator = page.locator(`[data-testid="slot-${targetSlot}"]`);
  await expect(targetSlotLocator).toBeVisible();
  const source = eventById(page, state.dragId);
  const sourceBox = await source.boundingBox();
  const targetSlotBox = await targetSlotLocator.boundingBox();
  expect(sourceBox).not.toBeNull();
  expect(targetSlotBox).not.toBeNull();
  const dataTransfer = await page.evaluateHandle(() => new DataTransfer());

  const moveResponsePromise = page.waitForResponse((response) => {
    return response.request().method() === "PUT" && response.url().includes(`/api/appointments/${state.dragId}`);
  });

  await source.dispatchEvent("dragstart", {
    dataTransfer,
    bubbles: true,
    clientY: sourceBox!.y + sourceBox!.height / 2
  });
  await targetSlotLocator.dispatchEvent("dragover", {
    dataTransfer,
    bubbles: true,
    clientX: targetSlotBox!.x + targetSlotBox!.width / 2,
    clientY: targetSlotBox!.y + targetSlotBox!.height / 2
  });
  await targetSlotLocator.dispatchEvent("drop", {
    dataTransfer,
    bubbles: true,
    clientX: targetSlotBox!.x + targetSlotBox!.width / 2,
    clientY: targetSlotBox!.y + targetSlotBox!.height / 2
  });
  await source.dispatchEvent("dragend", { dataTransfer, bubbles: true });

  const moveResponse = await moveResponsePromise;
  expect(moveResponse.ok()).toBeTruthy();
  await expect(page.getByTestId("toast")).toContainText("Compromisso movido e salvo");
  await expect.poll(async () => (await eventById(page, state.dragId).getAttribute("data-start")) ?? "").not.toBe(beforeStart);
  await expect.poll(async () => (await eventById(page, state.dragId).getAttribute("data-slot")) ?? "").toBe(targetSlot);

  await page.reload();
  await expect.poll(async () => (await eventById(page, state.dragId).getAttribute("data-slot")) ?? "").toBe(targetSlot);
});

test("R20 | edge-week troca semana automaticamente durante drag e aplica animação", async ({ page }) => {
  await page.goto("/");
  await expect(eventById(page, state.dragId)).toBeVisible();

  const weekLabelBefore = (await page.getByTestId("week-label").innerText()).trim();
  const panel = page.getByTestId("calendar-frame");
  await expect(panel).toBeVisible();

  const sourceBox = await eventById(page, state.dragId).boundingBox();
  const panelBox = await panel.boundingBox();
  expect(sourceBox).not.toBeNull();
  expect(panelBox).not.toBeNull();

  const dataTransfer = await page.evaluateHandle(() => new DataTransfer());

  await eventById(page, state.dragId).dispatchEvent("dragstart", {
    dataTransfer,
    clientY: sourceBox!.y + 10
  });

  await panel.dispatchEvent("dragover", {
    dataTransfer,
    clientX: panelBox!.x + panelBox!.width - 2,
    clientY: panelBox!.y + panelBox!.height / 2
  });

  const layoutCss = readFileSync("frontend/src/routes/layout.css", "utf8");
  expect(layoutCss).toContain(".calendar-frame.slide-next");
  expect(layoutCss).toContain(".calendar-frame.slide-prev");
  expect(layoutCss).toContain("@keyframes week-slide-next");
  expect(layoutCss).toContain("@keyframes week-slide-prev");

  await expect
    .poll(async () => (await page.getByTestId("week-label").innerText()).trim(), { timeout: 3_000 })
    .not.toBe(weekLabelBefore);

  await page.reload();
});

test("R12 + R11 | docker compose down/up reinicia banco e apaga os dados criados", async ({ page }) => {
  test.setTimeout(20 * 60_000);
  await page.goto("/");

  const resetId = await createViaSidebar(page, {
    title: titles.reset,
    start: weekDate(3, 16, 0),
    end: weekDate(3, 17, 0),
    color: "#f97316"
  });
  await expect(apptById(page, resetId)).toContainText(titles.reset);

  runInherit(DOCKER_DOWN);

  const projectPrefix = `${path.basename(process.cwd()).toLowerCase()}_`;
  const volumesAfterDown = lines(run('docker volume ls --format "{{.Name}}"'));
  expect(volumesAfterDown.some((name) => name.startsWith(projectPrefix))).toBeFalsy();

  runInherit(DOCKER_UP);
  await waitForHttp(BASE_URL, 300_000);
  await waitForHttp(API_WEEK_CHECK, 300_000);

  const runningServices = lines(run("docker compose ps --services --status running")).sort();
  expect(runningServices).toEqual(["api", "frontend", "mongo"]);

  await page.goto("/");
  await expect(page.locator(`[data-testid="appt-item"][data-id="${resetId}"]`)).toHaveCount(0);
  await expect(page.locator('[data-testid="appt-item"]', { hasText: titles.reset })).toHaveCount(0);
});
