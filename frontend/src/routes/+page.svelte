<script lang="ts">
  import { onMount, tick } from "svelte";
  import type { Appointment, DeleteScope, Recurrence } from "$lib/api";
  import { createAppointment, deleteAppointment, listAppointments, updateAppointment } from "$lib/api";

  const WEEKDAY_HEADER = ["DOM.", "SEG.", "TER.", "QUA.", "QUI.", "SEX.", "SAB."];
  const MINI_WEEKDAY_HEADER = ["D", "S", "T", "Q", "Q", "S", "S"];
  const MONTHS_SHORT = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
  const MONTHS_LONG = [
    "Janeiro",
    "Fevereiro",
    "Março",
    "Abril",
    "Maio",
    "Junho",
    "Julho",
    "Agosto",
    "Setembro",
    "Outubro",
    "Novembro",
    "Dezembro"
  ];

  const HOUR_HEIGHT = 56;
  const DAY_MINUTES = 24 * 60;
  const DAY_HEIGHT = 24 * HOUR_HEIGHT;
  const SNAP_MINUTES = 15;
  const PX_PER_MINUTE = HOUR_HEIGHT / 60;
  const HOUR_ROWS = Array.from({ length: 24 }, (_, idx) => idx);
  const EDGE_SWITCH_THRESHOLD = 64;
  const EDGE_SWITCH_DELAY_MS = 420;
  const RECURRENCE_OPTIONS: { value: Recurrence; label: string }[] = [
    { value: "none", label: "Nao repete" },
    { value: "daily", label: "Diariamente" },
    { value: "weekly", label: "Semanalmente" },
    { value: "monthly", label: "Mensalmente" }
  ];
  const ONE_DAY_MS = 24 * 60 * 60 * 1000;
  const MAX_EDITOR_WIDTH = 430;
  const EDITOR_VERTICAL_FALLBACK = 360;

  type RenderedAppointment = {
    id: string;
    segmentKey: string;
    title: string;
    color: string;
    startIso: string;
    endIso: string;
    recurrence: Recurrence;
    recurrenceUntilIso: string | null;
    seriesId: string | null;
    dayIndex: number;
    top: number;
    height: number;
    fullDurationMs: number;
    segmentDurationMs: number;
    canDrag: boolean;
  };

  type MultiDayAppointment = {
    id: string;
    title: string;
    color: string;
    startIso: string;
    endIso: string;
    recurrence: Recurrence;
    recurrenceUntilIso: string | null;
    seriesId: string | null;
    fullDurationMs: number;
    startDayIndex: number;
    endDayIndex: number;
    row: number;
    canDrag: boolean;
  };

  type MiniDay = {
    date: Date;
    inMonth: boolean;
    isToday: boolean;
    inCurrentWeek: boolean;
  };

  type DragMeta = {
    id: string;
    title: string;
    color: string;
    startIso: string;
    endIso: string;
    recurrence: Recurrence;
    recurrenceUntilIso: string | null;
    seriesId: string | null;
    durationMs: number;
  };

  let items: Appointment[] = [];
  let loading = true;
  let error = "";
  let toast = "";
  let toastTimer: ReturnType<typeof setTimeout> | undefined;

  let title = "";
  let startLocal = "";
  let endLocal = "";
  let color = "#3b82f6";
  let recurrence: Recurrence = "none";
  let recurrenceUntilLocal = "";
  let createOpen = true;
  let sidebarOpen = true;

  let weekAnchor = new Date();
  let weekStart = startOfWeekSunday(weekAnchor);
  let weekDays: Date[] = [];

  let miniMonthCursor = new Date(weekAnchor.getFullYear(), weekAnchor.getMonth(), 1);
  let miniDays: MiniDay[] = [];

  let monthTitle = "";
  let miniMonthTitle = "";

  let renderedItems: RenderedAppointment[] = [];
  let multiDayItems: MultiDayAppointment[] = [];
  let multiDayRows = 0;
  let itemsByDay: RenderedAppointment[][] = Array.from({ length: 7 }, () => []);
  let renderedById = new Map<string, Appointment>();
  let selectedItem: Appointment | null = null;
  let selectedEventId = "";
  let editorTop = 14;
  let editorLeft = 14;
  let editTitle = "";
  let editStartLocal = "";
  let editEndLocal = "";
  let editColor = "#3b82f6";
  let editRecurrence: Recurrence = "none";
  let editRecurrenceUntilLocal = "";
  let editError = "";
  let deleteModalOpen = false;
  let deleteScope: DeleteScope = "single";

  let deletingId = "";
  let savingEditId = "";
  let savingDragId = "";
  let draggingId = "";
  let dragOffsetY = 0;
  let dragMeta: DragMeta | null = null;
  let edgeHint: "" | "left" | "right" = "";
  let edgeSwitchDirection: -1 | 0 | 1 = 0;
  let edgeSwitchTimer: ReturnType<typeof setTimeout> | undefined;
  let weekSlideDirection: "" | "next" | "prev" = "";
  let weekSlideTimer: ReturnType<typeof setTimeout> | undefined;

  let dropPreview: { dayIndex: number; top: number; height: number; color: string } | null = null;

  let gridScrollEl: HTMLDivElement | null = null;
  let calendarPanelEl: HTMLElement | null = null;

  $: weekDays = buildWeekDays(weekStart);
  $: monthTitle = `${MONTHS_SHORT[weekAnchor.getMonth()]} de ${weekAnchor.getFullYear()}`;
  $: miniMonthTitle = `${MONTHS_LONG[miniMonthCursor.getMonth()]} de ${miniMonthCursor.getFullYear()}`;
  $: miniDays = buildMiniDays(miniMonthCursor, weekStart);
  $: renderedItems = buildRenderedItems(items, weekDays);
  $: multiDayItems = buildMultiDayItems(items, weekDays);
  $: multiDayRows = multiDayItems.reduce((max, item) => Math.max(max, item.row + 1), 0);
  $: itemsByDay = Array.from({ length: 7 }, (_, dayIndex) =>
    renderedItems.filter((item) => item.dayIndex === dayIndex)
  );
  $: renderedById = new Map(items.filter((item) => !!item.id).map((item) => [item.id!, item]));
  $: selectedItem = selectedEventId ? renderedById.get(selectedEventId) ?? null : null;

  function showToast(message: string) {
    toast = message;
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (toast = ""), 2600);
  }

  function pad2(value: number) {
    return value.toString().padStart(2, "0");
  }

  function clamp(value: number, min: number, max: number) {
    return Math.min(max, Math.max(min, value));
  }

  function toLocalInputValue(date: Date) {
    const year = date.getFullYear();
    const month = pad2(date.getMonth() + 1);
    const day = pad2(date.getDate());
    const hours = pad2(date.getHours());
    const minutes = pad2(date.getMinutes());
    return `${year}-${month}-${day}T${hours}:${minutes}`;
  }

  function toUtcIso(localDatetime: string) {
    return new Date(localDatetime).toISOString();
  }

  function toUtcIsoEndOfDay(localDate: string) {
    const end = new Date(`${localDate}T23:59`);
    return end.toISOString();
  }

  function toLocalDateValueFromIso(iso: string | null | undefined) {
    if (!iso) return "";
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return "";
    return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
  }

  function startOfWeekSunday(date: Date) {
    const copy = new Date(date);
    copy.setHours(0, 0, 0, 0);
    copy.setDate(copy.getDate() - copy.getDay());
    return copy;
  }

  function buildWeekDays(start: Date) {
    return Array.from({ length: 7 }, (_, idx) => {
      const d = new Date(start);
      d.setDate(start.getDate() + idx);
      d.setHours(0, 0, 0, 0);
      return d;
    });
  }

  function sameDay(a: Date, b: Date) {
    return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  }

  function hexToRgba(hex: string, alpha: number) {
    const normalized = hex.replace("#", "").trim();
    if (normalized.length !== 6) return `rgba(59, 130, 246, ${alpha})`;
    const r = Number.parseInt(normalized.slice(0, 2), 16);
    const g = Number.parseInt(normalized.slice(2, 4), 16);
    const b = Number.parseInt(normalized.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  function formatRange(startIso: string, endIso: string) {
    const start = new Date(startIso);
    const end = new Date(endIso);
    return `${pad2(start.getHours())}:${pad2(start.getMinutes())} - ${pad2(end.getHours())}:${pad2(end.getMinutes())}`;
  }

  function setCreateDefaults(base = new Date()) {
    const start = new Date(base);
    const roundedMinutes = Math.ceil(start.getMinutes() / 30) * 30;
    start.setMinutes(roundedMinutes, 0, 0);

    const end = new Date(start);
    end.setHours(end.getHours() + 1);

    startLocal = toLocalInputValue(start);
    endLocal = toLocalInputValue(end);
    recurrence = "none";
    recurrenceUntilLocal = "";
  }

  function buildMiniDays(cursor: Date, selectedWeekStart: Date): MiniDay[] {
    const firstOfMonth = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const gridStart = startOfWeekSunday(firstOfMonth);
    const selectedWeekDays = buildWeekDays(selectedWeekStart);

    return Array.from({ length: 42 }, (_, idx) => {
      const cellDate = new Date(gridStart);
      cellDate.setDate(gridStart.getDate() + idx);
      cellDate.setHours(0, 0, 0, 0);
      return {
        date: cellDate,
        inMonth: cellDate.getMonth() === cursor.getMonth(),
        isToday: sameDay(cellDate, new Date()),
        inCurrentWeek: selectedWeekDays.some((d) => sameDay(d, cellDate))
      };
    });
  }

  function buildRenderedItems(source: Appointment[], week: Date[]): RenderedAppointment[] {
    return source.flatMap((item) => {
      if (!item.id) return [];

      const startDate = new Date(item.start);
      const endDate = new Date(item.end);
      if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) return [];
      if (endDate.getTime() <= startDate.getTime()) return [];
      if (!sameDay(startDate, endDate)) return [];

      const fullDurationMs = Math.max(15 * 60_000, endDate.getTime() - startDate.getTime());
      const canDrag = true;
      const recurrence = item.recurrence ?? "none";
      const recurrenceUntilIso = item.recurrenceUntil ?? null;
      const seriesId = item.seriesId ?? null;

      const segments: RenderedAppointment[] = [];

      for (let dayIndex = 0; dayIndex < week.length; dayIndex++) {
        const dayStart = new Date(week[dayIndex]);
        dayStart.setHours(0, 0, 0, 0);
        const dayEnd = new Date(dayStart);
        dayEnd.setDate(dayEnd.getDate() + 1);

        if (startDate >= dayEnd || endDate <= dayStart) continue;

        const segmentStart = startDate > dayStart ? startDate : dayStart;
        const segmentEnd = endDate < dayEnd ? endDate : dayEnd;
        const segmentDurationMinutes = Math.max(15, Math.round((segmentEnd.getTime() - segmentStart.getTime()) / 60_000));
        const startMinutes = segmentStart.getHours() * 60 + segmentStart.getMinutes();
        const boundedStartMinutes = clamp(startMinutes, 0, DAY_MINUTES - 15);
        const boundedDurationMinutes = Math.max(
          15,
          Math.min(segmentDurationMinutes, DAY_MINUTES - boundedStartMinutes)
        );

        segments.push({
          id: item.id,
          segmentKey: `${item.id}-${dayStart.toISOString()}`,
          title: item.title,
          color: item.color || "#3b82f6",
          startIso: item.start,
          endIso: item.end,
          recurrence,
          recurrenceUntilIso,
          seriesId,
          dayIndex,
          top: boundedStartMinutes * PX_PER_MINUTE,
          height: Math.max(32, boundedDurationMinutes * PX_PER_MINUTE),
          fullDurationMs,
          segmentDurationMs: boundedDurationMinutes * 60_000,
          canDrag
        });
      }

      return segments;
    });
  }

  function buildMultiDayItems(source: Appointment[], week: Date[]): MultiDayAppointment[] {
    if (week.length !== 7) return [];

    const weekStart = new Date(week[0]);
    weekStart.setHours(0, 0, 0, 0);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 7);

    const base: MultiDayAppointment[] = source.flatMap((item) => {
      if (!item.id) return [];

      const startDate = new Date(item.start);
      const endDate = new Date(item.end);
      if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) return [];
      if (endDate.getTime() <= startDate.getTime()) return [];
      if (sameDay(startDate, endDate)) return [];

      if (endDate <= weekStart || startDate >= weekEnd) return [];

      const visibleStart = startDate > weekStart ? startDate : weekStart;
      const visibleEnd = endDate < weekEnd ? endDate : weekEnd;
      const visibleEndInclusive = new Date(visibleEnd.getTime() - 1);

      const startDay = new Date(visibleStart);
      startDay.setHours(0, 0, 0, 0);
      const endDay = new Date(visibleEndInclusive);
      endDay.setHours(0, 0, 0, 0);

      const startDayIndex = clamp(Math.round((startDay.getTime() - weekStart.getTime()) / ONE_DAY_MS), 0, 6);
      const endDayIndex = clamp(Math.round((endDay.getTime() - weekStart.getTime()) / ONE_DAY_MS), 0, 6);
      if (endDayIndex < startDayIndex) return [];

      return [
        {
          id: item.id,
          title: item.title,
          color: item.color || "#3b82f6",
          startIso: item.start,
          endIso: item.end,
          recurrence: item.recurrence ?? "none",
          recurrenceUntilIso: item.recurrenceUntil ?? null,
          seriesId: item.seriesId ?? null,
          fullDurationMs: endDate.getTime() - startDate.getTime(),
          startDayIndex,
          endDayIndex,
          row: 0,
          canDrag: true
        }
      ];
    });

    base.sort((a, b) => {
      if (a.startDayIndex !== b.startDayIndex) return a.startDayIndex - b.startDayIndex;
      return b.endDayIndex - a.endDayIndex;
    });

    const rowEndByIndex: number[] = [];
    for (const item of base) {
      let row = 0;
      while (row < rowEndByIndex.length && rowEndByIndex[row] >= item.startDayIndex) {
        row++;
      }
      item.row = row;
      rowEndByIndex[row] = item.endDayIndex;
    }

    return base;
  }

  async function load() {
    loading = true;
    error = "";

    const from = new Date(weekStart);
    const to = new Date(weekStart);
    to.setDate(to.getDate() + 7);

    try {
      items = await listAppointments(from.toISOString(), to.toISOString());
      if (selectedEventId && !items.some((item) => item.id === selectedEventId)) {
        closeEditor();
      }
    } catch (e: any) {
      error = e?.message ?? "Erro ao carregar compromissos";
    } finally {
      loading = false;
    }
  }

  async function goToday() {
    const now = new Date();
    weekAnchor = now;
    weekStart = startOfWeekSunday(now);
    miniMonthCursor = new Date(now.getFullYear(), now.getMonth(), 1);
    await load();
  }

  async function shiftWeek(days: number) {
    const next = new Date(weekStart);
    next.setDate(next.getDate() + days);
    weekAnchor = next;
    weekStart = startOfWeekSunday(next);
    await load();
  }

  function setWeekWithoutLoad(daysDelta: number) {
    const next = new Date(weekStart);
    next.setDate(next.getDate() + daysDelta);
    weekAnchor = next;
    weekStart = startOfWeekSunday(next);
    miniMonthCursor = new Date(next.getFullYear(), next.getMonth(), 1);
  }

  function playWeekSlide(direction: "next" | "prev") {
    if (weekSlideTimer) clearTimeout(weekSlideTimer);
    weekSlideDirection = direction;
    weekSlideTimer = setTimeout(() => {
      weekSlideDirection = "";
    }, 240);
  }

  function clearEdgeSwitchState() {
    if (edgeSwitchTimer) clearTimeout(edgeSwitchTimer);
    edgeSwitchTimer = undefined;
    edgeSwitchDirection = 0;
    edgeHint = "";
  }

  function scheduleEdgeSwitch(direction: -1 | 0 | 1) {
    if (!draggingId) {
      clearEdgeSwitchState();
      return;
    }

    if (direction === 0) {
      clearEdgeSwitchState();
      return;
    }

    if (direction === edgeSwitchDirection && edgeSwitchTimer) return;

    if (edgeSwitchTimer) clearTimeout(edgeSwitchTimer);
    edgeSwitchDirection = direction;
    edgeHint = direction === -1 ? "left" : "right";

    edgeSwitchTimer = setTimeout(() => {
      const currentDirection = edgeSwitchDirection;
      clearEdgeSwitchState();
      if (!draggingId || currentDirection === 0) return;

      setWeekWithoutLoad(currentDirection * 7);
      playWeekSlide(currentDirection === 1 ? "next" : "prev");
      dropPreview = null;
    }, EDGE_SWITCH_DELAY_MS);
  }

  function maybeSwitchWeekByEdge(clientX: number) {
    if (!draggingId || !calendarPanelEl) return;

    const rect = calendarPanelEl.getBoundingClientRect();
    const leftLimit = rect.left + EDGE_SWITCH_THRESHOLD;
    const rightLimit = rect.right - EDGE_SWITCH_THRESHOLD;

    let direction: -1 | 0 | 1 = 0;
    if (clientX <= leftLimit) direction = -1;
    if (clientX >= rightLimit) direction = 1;

    scheduleEdgeSwitch(direction);
  }

  function onPanelDragOver(ev: DragEvent) {
    if (!draggingId) return;
    ev.preventDefault();
    maybeSwitchWeekByEdge(ev.clientX);
    if (ev.dataTransfer) ev.dataTransfer.dropEffect = "move";
  }

  function shiftMiniMonth(months: number) {
    miniMonthCursor = new Date(miniMonthCursor.getFullYear(), miniMonthCursor.getMonth() + months, 1);
  }

  async function pickMiniDay(day: MiniDay) {
    weekAnchor = day.date;
    weekStart = startOfWeekSunday(day.date);
    miniMonthCursor = new Date(day.date.getFullYear(), day.date.getMonth(), 1);
    await load();
  }

  async function submit() {
    error = "";

    if (!title.trim()) {
      error = "Titulo obrigatorio.";
      return;
    }

    if (!startLocal || !endLocal) {
      error = "Preencha inicio e fim.";
      return;
    }

    if (recurrence !== "none" && !recurrenceUntilLocal) {
      error = "Para repeticao, preencha ate quando repetir.";
      return;
    }

    const payload = {
      title: title.trim(),
      start: toUtcIso(startLocal),
      end: toUtcIso(endLocal),
      color,
      recurrence,
      recurrenceUntil: recurrence === "none" ? null : toUtcIsoEndOfDay(recurrenceUntilLocal)
    };

    try {
      await createAppointment(payload);
      title = "";
      setCreateDefaults();
      showToast("Compromisso criado e salvo");
      await load();
    } catch (e: any) {
      error = e?.message ?? "Falha ao salvar compromisso";
    }
  }

  function positionEditorNearEvent(eventEl: HTMLElement) {
    if (!calendarPanelEl) return;

    const panelRect = calendarPanelEl.getBoundingClientRect();
    const eventRect = eventEl.getBoundingClientRect();
    const horizontalGap = 10;
    const safeGap = 12;

    let left = eventRect.right - panelRect.left + horizontalGap;
    if (left + MAX_EDITOR_WIDTH > panelRect.width - safeGap) {
      left = eventRect.left - panelRect.left - MAX_EDITOR_WIDTH - horizontalGap;
    }

    left = clamp(left, safeGap, Math.max(safeGap, panelRect.width - MAX_EDITOR_WIDTH - safeGap));

    const maxTop = Math.max(safeGap, panelRect.height - EDITOR_VERTICAL_FALLBACK);
    const top = clamp(eventRect.top - panelRect.top, safeGap, maxTop);

    editorLeft = left;
    editorTop = top;
  }

  function selectEvent(item: RenderedAppointment | MultiDayAppointment, ev: MouseEvent) {
    const card = ev.currentTarget as HTMLElement | null;
    if (card) positionEditorNearEvent(card);

    selectedEventId = item.id;
    editTitle = item.title;
    editStartLocal = toLocalInputValue(new Date(item.startIso));
    editEndLocal = toLocalInputValue(new Date(item.endIso));
    editColor = item.color;
    editRecurrence = item.recurrence;
    editRecurrenceUntilLocal = toLocalDateValueFromIso(item.recurrenceUntilIso);
    editError = "";
    deleteModalOpen = false;
    deleteScope = "single";
  }

  function closeEditor() {
    selectedEventId = "";
    editError = "";
    deleteModalOpen = false;
    deleteScope = "single";
  }

  async function saveSelectedEdit() {
    const id = selectedEventId;
    if (!id) return;

    editError = "";

    const trimmedTitle = editTitle.trim();
    if (!trimmedTitle) {
      editError = "Titulo obrigatorio.";
      return;
    }

    if (!editStartLocal || !editEndLocal) {
      editError = "Preencha inicio e fim.";
      return;
    }

    if (editRecurrence !== "none" && !editRecurrenceUntilLocal) {
      editError = "Para repeticao, preencha ate quando repetir.";
      return;
    }

    const startDate = new Date(editStartLocal);
    const endDate = new Date(editEndLocal);
    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
      editError = "Data/hora invalida.";
      return;
    }

    if (endDate.getTime() <= startDate.getTime()) {
      editError = "Fim deve ser maior que inicio.";
      return;
    }

    savingEditId = id;
    error = "";

    try {
      await updateAppointment(id, {
        title: trimmedTitle,
        start: toUtcIso(editStartLocal),
        end: toUtcIso(editEndLocal),
        color: editColor,
        recurrence: editRecurrence,
        recurrenceUntil: editRecurrence === "none" ? null : toUtcIsoEndOfDay(editRecurrenceUntilLocal)
      });
      showToast("Compromisso atualizado");
      closeEditor();
      await load();
    } catch (e: any) {
      editError = e?.message ?? "Falha ao atualizar compromisso";
    } finally {
      savingEditId = "";
    }
  }

  async function removeSelected() {
    if (!selectedItem?.id) return;
    if ((selectedItem.recurrence ?? "none") !== "none" && selectedItem.seriesId) {
      deleteModalOpen = true;
      deleteScope = "single";
      return;
    }

    const ok = window.confirm(`Deseja deletar "${selectedItem.title}"?`);
    if (!ok) return;
    await remove(selectedItem, "single");
  }

  function cancelDeleteModal() {
    deleteModalOpen = false;
    deleteScope = "single";
  }

  async function confirmRecurringDelete() {
    if (!selectedItem?.id) return;
    await remove(selectedItem, deleteScope);
    cancelDeleteModal();
  }

  function isLocked(id: string) {
    return deletingId === id || savingEditId === id || savingDragId === id;
  }

  function isSaving(id: string) {
    return savingDragId === id || savingEditId === id;
  }

  async function remove(item: Appointment, scope: DeleteScope) {
    if (!item.id) return;
    deletingId = item.id;
    error = "";

    try {
      await deleteAppointment(item.id, scope);
      showToast("Compromisso deletado");
      if (selectedEventId === item.id) closeEditor();
      await load();
    } catch (e: any) {
      error = e?.message ?? "Falha ao deletar";
    } finally {
      deletingId = "";
    }
  }

  function beginDrag(item: RenderedAppointment | MultiDayAppointment, ev: DragEvent) {
    if (isLocked(item.id) || !item.canDrag) {
      ev.preventDefault();
      return;
    }

    if (selectedEventId === item.id) closeEditor();

    draggingId = item.id;
    dragMeta = {
      id: item.id,
      title: item.title,
      color: item.color,
      startIso: item.startIso,
      endIso: item.endIso,
      recurrence: item.recurrence,
      recurrenceUntilIso: item.recurrenceUntilIso,
      seriesId: item.seriesId,
      durationMs: item.fullDurationMs
    };
    const card = ev.currentTarget as HTMLElement;
    const rect = card.getBoundingClientRect();
    dragOffsetY = ev.clientY - rect.top;

    if (ev.dataTransfer) {
      ev.dataTransfer.effectAllowed = "move";
      ev.dataTransfer.setData("text/plain", item.id);
    }
  }

  function endDrag() {
    draggingId = "";
    dragOffsetY = 0;
    dropPreview = null;
    dragMeta = null;
    clearEdgeSwitchState();
  }

  function resolveDropPosition(
    dayIndex: number,
    clientY: number,
    columnEl: HTMLElement,
    item: { durationMs: number }
  ) {
    const rect = columnEl.getBoundingClientRect();
    const durationMinutes = Math.max(15, Math.round(item.durationMs / 60_000));
    const maxStartMinutes =
      durationMinutes >= DAY_MINUTES ? DAY_MINUTES - SNAP_MINUTES : Math.max(0, DAY_MINUTES - durationMinutes);

    const rawMinutes = (clientY - rect.top - dragOffsetY) / PX_PER_MINUTE;
    const snappedMinutes = Math.round(rawMinutes / SNAP_MINUTES) * SNAP_MINUTES;
    const startMinutes = clamp(snappedMinutes, 0, maxStartMinutes);
    const previewDurationMinutes = Math.min(durationMinutes, DAY_MINUTES - startMinutes);

    return {
      dayIndex,
      startMinutes,
      top: startMinutes * PX_PER_MINUTE,
      height: Math.max(32, previewDurationMinutes * PX_PER_MINUTE)
    };
  }

  function onGridDragOver(dayIndex: number, ev: DragEvent) {
    if (!draggingId) return;
    ev.preventDefault();
    maybeSwitchWeekByEdge(ev.clientX);

    const item =
      dragMeta && dragMeta.id === draggingId
        ? dragMeta
        : (() => {
            const base = renderedById.get(draggingId);
            if (!base?.id) return null;
            return {
              id: base.id,
              title: base.title,
              color: base.color,
              startIso: base.start,
              endIso: base.end,
              recurrence: base.recurrence ?? "none",
              recurrenceUntilIso: base.recurrenceUntil ?? null,
              seriesId: base.seriesId ?? null,
              durationMs: Math.max(15 * 60_000, new Date(base.end).getTime() - new Date(base.start).getTime())
            } satisfies DragMeta;
          })();
    if (!item) return;

    const columnEl = ev.currentTarget as HTMLElement;
    const position = resolveDropPosition(dayIndex, ev.clientY, columnEl, item);
    dropPreview = {
      dayIndex,
      top: position.top,
      height: position.height,
      color: item.color
    };

    if (ev.dataTransfer) ev.dataTransfer.dropEffect = "move";
  }

  async function onGridDrop(dayIndex: number, ev: DragEvent) {
    ev.preventDefault();
    clearEdgeSwitchState();

    const id = draggingId;
    if (!id) return;

    const item =
      dragMeta && dragMeta.id === id
        ? dragMeta
        : (() => {
            const base = renderedById.get(id);
            if (!base?.id) return null;
            return {
              id: base.id,
              title: base.title,
              color: base.color,
              startIso: base.start,
              endIso: base.end,
              recurrence: base.recurrence ?? "none",
              recurrenceUntilIso: base.recurrenceUntil ?? null,
              seriesId: base.seriesId ?? null,
              durationMs: Math.max(15 * 60_000, new Date(base.end).getTime() - new Date(base.start).getTime())
            } satisfies DragMeta;
          })();
    if (!item) {
      endDrag();
      return;
    }

    const columnEl = ev.currentTarget as HTMLElement;
    const position = resolveDropPosition(dayIndex, ev.clientY, columnEl, item);

    const nextStart = new Date(weekDays[dayIndex]);
    nextStart.setHours(0, 0, 0, 0);
    nextStart.setMinutes(position.startMinutes);

    const nextEnd = new Date(nextStart.getTime() + item.durationMs);

    const previousStart = new Date(item.startIso).getTime();
    const previousEnd = new Date(item.endIso).getTime();
    const nextStartMs = nextStart.getTime();
    const nextEndMs = nextEnd.getTime();

    if (previousStart === nextStartMs && previousEnd === nextEndMs) {
      endDrag();
      return;
    }

    const nextStartIso = nextStart.toISOString();
    const nextEndIso = nextEnd.toISOString();

    savingDragId = id;
    error = "";
    endDrag();

    // Otimista: atualiza localmente antes de confirmar no backend.
    items = items.map((existing) =>
      existing.id === id ? { ...existing, start: nextStartIso, end: nextEndIso } : existing
    );

    try {
      await updateAppointment(id, {
        title: item.title,
        start: nextStartIso,
        end: nextEndIso,
        color: item.color,
        recurrence: item.recurrence,
        recurrenceUntil: item.recurrenceUntilIso
      });
      showToast("Compromisso movido e salvo");
      void load();
    } catch (e: any) {
      error = e?.message ?? "Falha ao mover compromisso";
      await load();
    } finally {
      savingDragId = "";
    }
  }

  onMount(async () => {
    setCreateDefaults();
    await load();
    await tick();
    if (gridScrollEl) gridScrollEl.scrollTop = HOUR_HEIGHT * 6;
  });
</script>

<div class="app-shell">
  {#if toast}
    <div class="toast">{toast}</div>
  {/if}

  <header class="topbar">
    <div class="topbar-left">
      <button
        class="icon-btn"
        type="button"
        aria-label="Menu"
        aria-expanded={sidebarOpen}
        on:click={() => (sidebarOpen = !sidebarOpen)}
      >
        ☰
      </button>
      <div class="brand-icon">31</div>
      <div class="brand-title">Agenda</div>
    </div>

    <div class="topbar-center">
      <button class="today-btn" type="button" on:click={() => void goToday()}>Hoje</button>
      <button class="icon-btn" type="button" aria-label="Semana anterior" on:click={() => void shiftWeek(-7)}>‹</button>
      <button class="icon-btn" type="button" aria-label="Proxima semana" on:click={() => void shiftWeek(7)}>›</button>
      <h1 class="month-title">{monthTitle}</h1>
    </div>
  </header>

  <div class="workspace" class:is-collapsed={!sidebarOpen}>
    <aside class="sidebar" class:is-hidden={!sidebarOpen}>
      <button class="create-pill" type="button" on:click={() => (createOpen = !createOpen)}>
        <span class="create-plus">+</span>
        <span>Criar</span>
        <span class="create-caret">▾</span>
      </button>

      {#if createOpen}
        <form class="create-form" on:submit|preventDefault={() => void submit()}>
          <label>
            <span>Titulo</span>
            <input bind:value={title} placeholder="Ex: Reuniao de status" required />
          </label>

          <label>
            <span>Inicio</span>
            <input type="datetime-local" bind:value={startLocal} required />
          </label>

          <label>
            <span>Fim</span>
            <input type="datetime-local" bind:value={endLocal} required />
          </label>

          <label>
            <span>Cor</span>
            <input type="color" bind:value={color} />
          </label>

          <label>
            <span>Repeticao</span>
            <select bind:value={recurrence}>
              {#each RECURRENCE_OPTIONS as option}
                <option value={option.value}>{option.label}</option>
              {/each}
            </select>
          </label>

          {#if recurrence !== "none"}
            <label>
              <span>Repetir ate</span>
              <input type="date" bind:value={recurrenceUntilLocal} required={true} />
              <!--<input type="date" bind:value={recurrenceUntilLocal} required={recurrence !== "none"} /> -->

            </label>
          {/if}

          <button class="save-btn" type="submit" disabled={loading}>Salvar compromisso</button>
        </form>
      {/if}

      <section class="mini-calendar">
        <div class="mini-header">
          <button class="mini-nav" type="button" aria-label="Mes anterior" on:click={() => shiftMiniMonth(-1)}>‹</button>
          <strong>{miniMonthTitle}</strong>
          <button class="mini-nav" type="button" aria-label="Proximo mes" on:click={() => shiftMiniMonth(1)}>›</button>
        </div>

        <div class="mini-grid">
          {#each MINI_WEEKDAY_HEADER as dayName}
            <div class="mini-weekday">{dayName}</div>
          {/each}

          {#each miniDays as day}
            <button
              class="mini-day {day.inMonth ? '' : 'is-outside'} {day.isToday ? 'is-today' : ''} {day.inCurrentWeek ? 'is-week' : ''}"
              type="button"
              on:click={() => void pickMiniDay(day)}
            >
              {day.date.getDate()}
            </button>
          {/each}
        </div>
      </section>
    </aside>

    <div
      class="calendar-panel"
      role="group"
      aria-label="Calendario semanal"
      class:slide-next={weekSlideDirection === "next"}
      class:slide-prev={weekSlideDirection === "prev"}
      bind:this={calendarPanelEl}
      on:dragover={onPanelDragOver}
    >
      {#if error}
        <div class="error-banner">{error}</div>
      {/if}

      <div class="edge-switch edge-left" class:is-visible={edgeHint === "left" && !!draggingId}></div>
      <div class="edge-switch edge-right" class:is-visible={edgeHint === "right" && !!draggingId}></div>

      <div class="calendar-head">
        <div class="timezone-head">GMT-03</div>
        {#each weekDays as day, dayIndex (day.toISOString())}
          <div class="day-head {sameDay(day, new Date()) ? 'is-today' : ''}">
            <span>{WEEKDAY_HEADER[dayIndex]}</span>
            <strong>{day.getDate()}</strong>
          </div>
        {/each}
      </div>

      {#if multiDayItems.length > 0}
        <div class="multiday-strip" style={`height: ${Math.max(38, multiDayRows * 30 + 8)}px;`}>
          <div class="multiday-timepad">Multi-dia</div>
          <div class="multiday-grid">
            {#each multiDayItems as item (`multi-${item.id}-${item.startDayIndex}-${item.endDayIndex}-${item.row}`)}
              <button
                type="button"
                class="multiday-card {draggingId === item.id ? 'is-dragging' : ''} {isSaving(item.id) ? 'is-saving' : ''} {selectedEventId === item.id ? 'is-selected' : ''}"
                style={`grid-column: ${item.startDayIndex + 1} / ${item.endDayIndex + 2}; grid-row: ${item.row + 1}; background: ${hexToRgba(item.color, 0.2)}; border-left-color: ${item.color};`}
                aria-label={`Editar compromisso multi-dia ${item.title}`}
                draggable={!isLocked(item.id) && item.canDrag}
                on:click|stopPropagation={(ev) => selectEvent(item, ev)}
                on:dragstart={(ev) => beginDrag(item, ev)}
                on:dragend={endDrag}
              >
                <div class="multiday-title">{item.title}</div>
                <div class="multiday-time">{formatRange(item.startIso, item.endIso)}</div>
              </button>
            {/each}
          </div>
        </div>
      {/if}

      <div class="calendar-body" bind:this={gridScrollEl}>
        <div class="hours-column">
          {#each HOUR_ROWS as hour}
            <div class="hour-slot">{hour > 0 ? `${pad2(hour)}:00` : ""}</div>
          {/each}
        </div>

        <div class="days-scroll">
          <div class="days-canvas" style={`height: ${DAY_HEIGHT}px;`}>
            <div class="hour-lines"></div>

            <div class="day-columns">
              {#each weekDays as day, dayIndex (day.toISOString())}
                <div
                  class="day-column"
                  role="gridcell"
                  tabindex="-1"
                  aria-label={`Coluna ${WEEKDAY_HEADER[dayIndex]} ${day.getDate()}`}
                  on:mousedown={closeEditor}
                  on:dragover={(ev) => onGridDragOver(dayIndex, ev)}
                  on:drop={(ev) => void onGridDrop(dayIndex, ev)}
                >
                  {#if dropPreview && dropPreview.dayIndex === dayIndex}
                    <div
                      class="drop-preview"
                      style={`top: ${dropPreview.top}px; height: ${dropPreview.height}px; background: ${hexToRgba(dropPreview.color, 0.2)}; border-color: ${dropPreview.color};`}
                    ></div>
                  {/if}

                  {#each itemsByDay[dayIndex] ?? [] as item (item.segmentKey)}
                    <button
                      class="event-card {draggingId === item.id ? 'is-dragging' : ''} {isSaving(item.id) ? 'is-saving' : ''} {selectedEventId === item.id ? 'is-selected' : ''}"
                      type="button"
                      aria-label={`Editar compromisso ${item.title}`}
                      draggable={!isLocked(item.id) && item.canDrag}
                      on:click|stopPropagation={(ev) => selectEvent(item, ev)}
                      on:dragstart={(ev) => beginDrag(item, ev)}
                      on:dragend={endDrag}
                      style={`top: ${item.top}px; background: ${hexToRgba(item.color, 0.2)}; border-left-color: ${item.color};`}
                    >
                      <div class="event-main">
                        <div class="event-title">{item.title}</div>
                        <div class="event-time">{formatRange(item.startIso, item.endIso)}</div>
                      </div>
                    </button>
                  {/each}
                </div>
              {/each}
            </div>
          </div>
        </div>
      </div>

      {#if selectedItem}
        <section class="event-editor" aria-label="Editar compromisso" style={`top: ${editorTop}px; left: ${editorLeft}px;`}>
          <div class="event-editor-head">
            <strong>Editar compromisso</strong>
            <button class="editor-close" type="button" aria-label="Fechar editor" on:click={closeEditor}>✕</button>
          </div>

          {#if editError}
            <div class="editor-error">{editError}</div>
          {/if}

          <label>
            <span>Titulo</span>
            <input type="text" bind:value={editTitle} disabled={isLocked(selectedEventId)} />
          </label>

          <div class="event-editor-row">
            <label>
              <span>Inicio</span>
              <input type="datetime-local" bind:value={editStartLocal} disabled={isLocked(selectedEventId)} />
            </label>
            <label>
              <span>Fim</span>
              <input type="datetime-local" bind:value={editEndLocal} disabled={isLocked(selectedEventId)} />
            </label>
          </div>

          <div class="event-editor-row">
            <label>
              <span>Repeticao</span>
              <select bind:value={editRecurrence} disabled={isLocked(selectedEventId)}>
                {#each RECURRENCE_OPTIONS as option}
                  <option value={option.value}>{option.label}</option>
                {/each}
              </select>
            </label>
            {#if editRecurrence !== "none"}
              <label>
                <span>Repetir ate</span>
                <input type="date" bind:value={editRecurrenceUntilLocal} disabled={isLocked(selectedEventId)} />
              </label>
            {/if}
          </div>

          <div class="event-editor-actions">
            <label class="event-editor-color">
              <span>Cor</span>
              <input class="event-color-input" type="color" bind:value={editColor} disabled={isLocked(selectedEventId)} />
            </label>

            <button
              class="editor-delete-btn"
              type="button"
              disabled={isLocked(selectedEventId)}
              on:click={() => void removeSelected()}
            >
              Excluir
            </button>

            <button
              class="editor-save-btn"
              type="button"
              disabled={isLocked(selectedEventId)}
              on:click={() => void saveSelectedEdit()}
            >
              Salvar
            </button>
          </div>
        </section>
      {/if}

      {#if deleteModalOpen && selectedItem}
        <div class="delete-modal-backdrop">
          <div class="delete-modal" aria-label="Excluir evento recorrente">
            <h3>Excluir evento recorrente</h3>
            <p>Escolha como deseja excluir "{selectedItem.title}".</p>

            <label class="delete-scope-option">
              <input type="radio" bind:group={deleteScope} value="single" />
              <span>Este evento</span>
            </label>
            <label class="delete-scope-option">
              <input type="radio" bind:group={deleteScope} value="following" />
              <span>Este e os seguintes</span>
            </label>
            <label class="delete-scope-option">
              <input type="radio" bind:group={deleteScope} value="all" />
              <span>Todos os eventos</span>
            </label>

            <div class="delete-modal-actions">
              <button class="delete-cancel-btn" type="button" on:click={cancelDeleteModal}>Cancelar</button>
              <button
                class="delete-confirm-btn"
                type="button"
                disabled={isLocked(selectedEventId)}
                on:click={() => void confirmRecurringDelete()}
              >
                Excluir
              </button>
            </div>
          </div>
        </div>
      {/if}

      {#if !loading && renderedItems.length === 0 && multiDayItems.length === 0}
        <div class="empty-state">Nenhum compromisso nesta semana.</div>
      {/if}

      <p class="helper-text">
        Clique em um compromisso para editar titulo, horario, cor ou excluir. Arraste e solte para mover e salvar.
      </p>
    </div>
  </div>
</div>

<style>
  :global(*) {
    box-sizing: border-box;
  }

  :global(body) {
    margin: 0;
    color: #1f2937;
    font-family: "Nunito Sans", "Segoe UI", sans-serif;
    background:
      radial-gradient(circle at 15% -5%, #dbeafe 0%, transparent 38%),
      radial-gradient(circle at 84% 8%, #e0f2fe 0%, transparent 34%),
      #f4f7fb;
  }

  .app-shell {
    min-height: 100vh;
    padding: 14px 18px 20px;
  }

  .toast {
    position: fixed;
    top: 18px;
    right: 20px;
    z-index: 30;
    padding: 10px 14px;
    border-radius: 12px;
    font-weight: 700;
    color: #fff;
    background: #0f172a;
    box-shadow: 0 18px 30px rgba(2, 8, 23, 0.26);
    animation: slide-in 0.22s ease-out;
  }

  .topbar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
    margin-bottom: 14px;
    padding: 8px 6px;
  }

  .topbar-left,
  .topbar-center {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .brand-icon {
    width: 30px;
    height: 30px;
    border-radius: 8px;
    display: grid;
    place-items: center;
    color: #fff;
    font-size: 13px;
    font-weight: 800;
    background: linear-gradient(145deg, #2563eb, #3b82f6);
  }

  .brand-title {
    font-size: 22px;
    font-weight: 750;
    color: #334155;
    letter-spacing: 0.2px;
  }

  .month-title {
    margin: 0 0 0 10px;
    font-size: 22px;
    color: #0f172a;
    font-weight: 760;
  }

  .icon-btn,
  .today-btn {
    border: 1px solid #d6deef;
    border-radius: 10px;
    color: #334155;
    background: #ffffff;
    cursor: pointer;
    transition: transform 0.12s ease, box-shadow 0.12s ease, background 0.12s ease;
  }

  .icon-btn {
    width: 34px;
    height: 34px;
    font-size: 18px;
    line-height: 1;
  }

  .today-btn {
    height: 34px;
    padding: 0 16px;
    font-weight: 700;
  }

  .icon-btn:hover,
  .today-btn:hover {
    transform: translateY(-1px);
    background: #f8fafc;
    box-shadow: 0 6px 16px rgba(30, 41, 59, 0.08);
  }

  .workspace {
    display: grid;
    grid-template-columns: 296px 1fr;
    gap: 16px;
    min-height: calc(100vh - 92px);
    transition: grid-template-columns 0.22s ease, gap 0.22s ease;
  }

  .workspace.is-collapsed {
    grid-template-columns: 0 minmax(0, 1fr);
    gap: 0;
  }

  .sidebar {
    border-radius: 20px;
    border: 1px solid #dbe3f3;
    background: linear-gradient(180deg, rgba(255, 255, 255, 0.96), rgba(246, 249, 255, 0.94));
    padding: 16px;
    box-shadow: 0 18px 34px rgba(15, 23, 42, 0.08);
    min-width: 0;
    transform-origin: left center;
    transition:
      width 0.22s ease,
      padding 0.22s ease,
      border-width 0.22s ease,
      opacity 0.22s ease,
      transform 0.22s ease;
  }

  .sidebar.is-hidden {
    width: 0;
    padding: 0;
    border-width: 0;
    opacity: 0;
    transform: translateX(-10px);
    overflow: hidden;
    pointer-events: none;
  }

  .create-pill {
    width: 100%;
    height: 52px;
    border-radius: 999px;
    border: 0;
    display: grid;
    grid-template-columns: auto 1fr auto;
    align-items: center;
    gap: 10px;
    padding: 0 16px;
    font-weight: 730;
    color: #0f172a;
    background: linear-gradient(145deg, #f8fafc, #e2e8f0);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.9), 0 8px 18px rgba(148, 163, 184, 0.26);
    cursor: pointer;
  }

  .create-plus {
    color: #3b82f6;
    font-size: 22px;
    line-height: 1;
    font-weight: 900;
  }

  .create-caret {
    opacity: 0.7;
  }

  .create-form {
    margin-top: 12px;
    border: 1px solid #dbe3f3;
    border-radius: 16px;
    padding: 12px;
    display: grid;
    gap: 10px;
    background: #ffffffd8;
  }

  .create-form label {
    display: grid;
    gap: 5px;
    font-size: 12px;
    font-weight: 700;
    color: #475569;
  }

  .create-form input {
    width: 100%;
    border: 1px solid #d1d9eb;
    border-radius: 9px;
    height: 36px;
    padding: 0 10px;
    color: #0f172a;
    background: #fff;
  }

  .create-form input[type="color"] {
    padding: 4px;
    cursor: pointer;
  }

  .create-form select {
    width: 100%;
    border: 1px solid #d1d9eb;
    border-radius: 9px;
    height: 36px;
    padding: 0 10px;
    color: #0f172a;
    background: #fff;
  }

  .save-btn {
    margin-top: 3px;
    height: 38px;
    border: 0;
    border-radius: 10px;
    color: #fff;
    font-weight: 760;
    cursor: pointer;
    background: linear-gradient(135deg, #2563eb, #3b82f6);
    box-shadow: 0 10px 22px rgba(37, 99, 235, 0.25);
  }

  .save-btn:disabled {
    opacity: 0.65;
    cursor: not-allowed;
  }

  .mini-calendar {
    margin-top: 14px;
    padding: 12px 10px;
    border-radius: 16px;
    border: 1px solid #dbe3f3;
    background: #ffffffd8;
  }

  .mini-header {
    display: grid;
    grid-template-columns: 28px 1fr 28px;
    align-items: center;
    margin-bottom: 8px;
    text-align: center;
    gap: 8px;
    font-size: 14px;
    color: #334155;
  }

  .mini-nav {
    width: 28px;
    height: 28px;
    border: 0;
    border-radius: 8px;
    font-size: 17px;
    cursor: pointer;
    color: #475569;
    background: #eef2ff;
  }

  .mini-grid {
    display: grid;
    grid-template-columns: repeat(7, 1fr);
    gap: 4px;
  }

  .mini-weekday {
    text-align: center;
    font-size: 11px;
    font-weight: 780;
    color: #64748b;
    padding: 4px 0;
  }

  .mini-day {
    height: 28px;
    border: 0;
    border-radius: 8px;
    font-size: 12px;
    cursor: pointer;
    color: #0f172a;
    background: transparent;
  }

  .mini-day.is-outside {
    opacity: 0.36;
  }

  .mini-day.is-week {
    background: #e2e8f0;
  }

  .mini-day.is-today {
    color: #fff;
    background: #2563eb;
    font-weight: 760;
  }

  .calendar-panel {
    position: relative;
    border-radius: 20px;
    border: 1px solid #dbe3f3;
    background: #ffffffea;
    box-shadow: 0 22px 36px rgba(30, 41, 59, 0.08);
    overflow: hidden;
  }

  .calendar-panel.slide-next .calendar-head,
  .calendar-panel.slide-next .calendar-body {
    animation: week-slide-next 0.24s ease;
  }

  .calendar-panel.slide-prev .calendar-head,
  .calendar-panel.slide-prev .calendar-body {
    animation: week-slide-prev 0.24s ease;
  }

  .error-banner {
    margin: 12px;
    border-radius: 10px;
    border: 1px solid #fecaca;
    color: #b91c1c;
    background: #fff1f2;
    padding: 10px 12px;
    font-size: 13px;
    font-weight: 650;
  }

  .edge-switch {
    position: absolute;
    top: 0;
    bottom: 0;
    width: 40px;
    z-index: 8;
    pointer-events: none;
    opacity: 0;
    transition: opacity 0.16s ease;
  }

  .edge-switch.edge-left {
    left: 0;
    background: linear-gradient(90deg, rgba(37, 99, 235, 0.28), rgba(37, 99, 235, 0));
  }

  .edge-switch.edge-right {
    right: 0;
    background: linear-gradient(270deg, rgba(37, 99, 235, 0.28), rgba(37, 99, 235, 0));
  }

  .edge-switch.is-visible {
    opacity: 1;
  }

  .calendar-head {
    display: grid;
    grid-template-columns: 88px repeat(7, minmax(0, 1fr));
    border-bottom: 1px solid #dbe3f3;
    background: linear-gradient(180deg, #ffffff, #f8fbff);
    min-width: 0;
  }

  .timezone-head,
  .day-head {
    padding: 10px 10px 11px;
  }

  .timezone-head {
    font-size: 11px;
    font-weight: 720;
    color: #64748b;
    display: flex;
    align-items: flex-end;
    justify-content: flex-end;
  }

  .day-head {
    text-align: center;
    border-left: 1px solid #e4ebf8;
    color: #334155;
    display: grid;
    gap: 3px;
  }

  .day-head span {
    font-size: 11px;
    letter-spacing: 0.5px;
    font-weight: 780;
  }

  .day-head strong {
    font-size: 24px;
    line-height: 1;
    font-weight: 770;
  }

  .day-head.is-today strong {
    color: #2563eb;
  }

  .multiday-strip {
    display: grid;
    grid-template-columns: 88px minmax(0, 1fr);
    border-bottom: 1px solid #dbe3f3;
    background: #f8fbff;
  }

  .multiday-timepad {
    border-right: 1px solid #dbe3f3;
    color: #64748b;
    font-size: 11px;
    font-weight: 700;
    display: flex;
    align-items: center;
    justify-content: flex-end;
    padding: 0 8px 0 0;
  }

  .multiday-grid {
    display: grid;
    grid-template-columns: repeat(7, minmax(0, 1fr));
    grid-auto-rows: 28px;
    gap: 2px;
    padding: 4px 6px 4px 6px;
  }

  .multiday-card {
    appearance: none;
    border: 1px solid rgba(255, 255, 255, 0.92);
    border-left: 4px solid #3b82f6;
    border-radius: 10px;
    padding: 4px 8px;
    text-align: left;
    font: inherit;
    color: #0f172a;
    cursor: grab;
    box-shadow: 0 8px 14px rgba(15, 23, 42, 0.12);
    overflow: hidden;
  }

  .multiday-title {
    font-size: 12px;
    font-weight: 760;
    line-height: 1.1;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .multiday-time {
    margin-top: 2px;
    font-size: 10px;
    opacity: 0.76;
    white-space: nowrap;
  }

  .multiday-card.is-dragging {
    opacity: 0.48;
    transform: scale(0.98);
  }

  .multiday-card.is-saving {
    box-shadow: 0 0 0 2px rgba(37, 99, 235, 0.34), 0 8px 14px rgba(15, 23, 42, 0.12);
  }

  .multiday-card.is-selected {
    box-shadow: 0 0 0 2px rgba(37, 99, 235, 0.42), 0 10px 18px rgba(15, 23, 42, 0.16);
  }

  .calendar-body {
    display: grid;
    grid-template-columns: 88px minmax(0, 1fr);
    max-height: calc(100vh - 210px);
    overflow-y: auto;
    overflow-x: hidden;
  }

  .hours-column {
    display: grid;
    grid-template-rows: repeat(24, 56px);
    border-right: 1px solid #dbe3f3;
    background: #fbfdff;
  }

  .hour-slot {
    display: flex;
    justify-content: flex-end;
    align-items: flex-start;
    padding: 2px 8px 0 0;
    font-size: 11px;
    color: #64748b;
    border-top: 1px solid #f1f5f9;
  }

  .days-scroll {
    min-width: 0;
  }

  .days-canvas {
    position: relative;
  }

  .hour-lines {
    position: absolute;
    inset: 0;
    background-image: repeating-linear-gradient(
      to bottom,
      transparent 0,
      transparent 55px,
      #e7edf8 55px,
      #e7edf8 56px
    );
    pointer-events: none;
  }

  .day-columns {
    position: absolute;
    inset: 0;
    display: grid;
    grid-template-columns: repeat(7, minmax(0, 1fr));
  }

  .day-column {
    position: relative;
    border-left: 1px solid #edf1f9;
  }

  .event-card {
    appearance: none;
    position: absolute;
    left: 6px;
    right: 6px;
    border-radius: 12px;
    border: 1px solid rgba(255, 255, 255, 0.92);
    border-left: 4px solid #3b82f6;
    padding: 8px 9px;
    text-align: left;
    font: inherit;
    color: #0f172a;
    cursor: grab;
    box-shadow: 0 10px 18px rgba(15, 23, 42, 0.14);
    transition: transform 0.12s ease, box-shadow 0.12s ease, opacity 0.12s ease;
  }

  .event-card:hover {
    transform: translateY(-1px);
    box-shadow: 0 14px 25px rgba(15, 23, 42, 0.18);
  }

  .event-card.is-dragging {
    opacity: 0.45;
    transform: scale(0.98);
  }

  .event-card.is-saving {
    box-shadow: 0 0 0 2px rgba(37, 99, 235, 0.38), 0 10px 18px rgba(15, 23, 42, 0.14);
  }

  .event-card.is-selected {
    box-shadow: 0 0 0 2px rgba(37, 99, 235, 0.45), 0 14px 26px rgba(15, 23, 42, 0.18);
  }

  .event-card:focus-visible {
    outline: none;
    box-shadow: 0 0 0 2px rgba(37, 99, 235, 0.45), 0 14px 26px rgba(15, 23, 42, 0.18);
  }

  .event-main {
    overflow: hidden;
  }

  .event-title {
    font-size: 12px;
    font-weight: 780;
    line-height: 1.2;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .event-time {
    margin-top: 2px;
    font-size: 11px;
    opacity: 0.78;
    white-space: nowrap;
  }

  .event-editor {
    position: absolute;
    top: 14px;
    left: 14px;
    z-index: 20;
    width: min(430px, calc(100% - 24px));
    border-radius: 14px;
    border: 1px solid #dbe3f3;
    background: #ffffff;
    box-shadow: 0 20px 34px rgba(15, 23, 42, 0.2);
    padding: 12px;
    display: grid;
    gap: 10px;
    animation: slide-in 0.18s ease-out;
  }

  .event-editor-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
  }

  .event-editor-head strong {
    font-size: 14px;
    color: #0f172a;
  }

  .editor-close {
    width: 30px;
    height: 30px;
    border: 1px solid #d6deef;
    border-radius: 9px;
    background: #fff;
    color: #334155;
    cursor: pointer;
    font-size: 15px;
    line-height: 1;
  }

  .editor-error {
    border-radius: 8px;
    border: 1px solid #fecaca;
    color: #b91c1c;
    background: #fff1f2;
    padding: 8px 10px;
    font-size: 12px;
    font-weight: 650;
  }

  .event-editor label {
    display: grid;
    gap: 5px;
    font-size: 12px;
    font-weight: 700;
    color: #475569;
  }

  .event-editor input[type="text"],
  .event-editor input[type="datetime-local"] {
    width: 100%;
    border: 1px solid #d1d9eb;
    border-radius: 9px;
    height: 36px;
    padding: 0 10px;
    color: #0f172a;
    background: #fff;
  }

  .event-editor select {
    width: 100%;
    border: 1px solid #d1d9eb;
    border-radius: 9px;
    height: 36px;
    padding: 0 10px;
    color: #0f172a;
    background: #fff;
  }

  .event-editor-row {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
  }

  .event-editor-actions {
    display: flex;
    align-items: flex-end;
    justify-content: flex-end;
    gap: 8px;
    flex-wrap: wrap;
  }

  .event-editor-color {
    margin-right: auto;
  }

  .event-color-input {
    width: 46px;
    height: 34px;
    border: 1px solid rgba(15, 23, 42, 0.18);
    border-radius: 8px;
    padding: 2px;
    background: #fff;
    cursor: pointer;
  }

  .editor-delete-btn {
    height: 34px;
    border: 0;
    border-radius: 8px;
    color: #fff;
    background: rgba(190, 24, 93, 0.9);
    cursor: pointer;
    font-size: 12px;
    font-weight: 700;
    padding: 0 12px;
  }

  .editor-save-btn {
    height: 34px;
    border: 0;
    border-radius: 8px;
    color: #fff;
    background: linear-gradient(135deg, #2563eb, #3b82f6);
    cursor: pointer;
    font-size: 12px;
    font-weight: 700;
    padding: 0 14px;
  }

  .editor-delete-btn:disabled,
  .editor-save-btn:disabled,
  .event-color-input:disabled {
    opacity: 0.48;
    cursor: not-allowed;
  }

  .delete-modal-backdrop {
    position: absolute;
    inset: 0;
    z-index: 24;
    display: grid;
    place-items: center;
    background: rgba(15, 23, 42, 0.25);
  }

  .delete-modal {
    width: min(360px, calc(100% - 20px));
    border-radius: 14px;
    border: 1px solid #dbe3f3;
    background: #fff;
    box-shadow: 0 20px 34px rgba(15, 23, 42, 0.22);
    padding: 14px;
    display: grid;
    gap: 10px;
  }

  .delete-modal h3 {
    margin: 0;
    font-size: 16px;
    color: #0f172a;
  }

  .delete-modal p {
    margin: 0;
    font-size: 13px;
    color: #475569;
  }

  .delete-scope-option {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
    color: #334155;
  }

  .delete-modal-actions {
    margin-top: 2px;
    display: flex;
    justify-content: flex-end;
    gap: 8px;
  }

  .delete-cancel-btn,
  .delete-confirm-btn {
    height: 34px;
    border: 0;
    border-radius: 8px;
    padding: 0 12px;
    font-size: 12px;
    font-weight: 700;
    cursor: pointer;
  }

  .delete-cancel-btn {
    color: #334155;
    background: #e2e8f0;
  }

  .delete-confirm-btn {
    color: #fff;
    background: rgba(190, 24, 93, 0.9);
  }

  .delete-confirm-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .drop-preview {
    position: absolute;
    left: 6px;
    right: 6px;
    border-radius: 12px;
    border: 2px dashed #3b82f6;
    pointer-events: none;
  }

  .empty-state {
    position: absolute;
    top: 68px;
    left: 50%;
    transform: translateX(-50%);
    border: 1px solid #dbe3f3;
    background: #f8fafc;
    border-radius: 999px;
    padding: 8px 14px;
    font-size: 12px;
    color: #64748b;
    font-weight: 680;
  }

  .helper-text {
    margin: 10px 14px 12px;
    font-size: 12px;
    color: #64748b;
  }

  @media (max-width: 1180px) {
    .workspace {
      grid-template-columns: 1fr;
    }

    .workspace.is-collapsed {
      grid-template-columns: 1fr;
    }

    .sidebar {
      order: 2;
    }

    .sidebar.is-hidden {
      display: none;
    }

    .calendar-panel {
      order: 1;
      min-height: 560px;
    }
  }

  @media (max-width: 820px) {
    .app-shell {
      padding: 8px;
    }

    .topbar {
      flex-direction: column;
      align-items: flex-start;
    }

    .topbar-center {
      flex-wrap: wrap;
    }

    .month-title {
      margin-left: 0;
      width: 100%;
      font-size: 20px;
    }

    .calendar-body {
      max-height: 62vh;
    }

    .event-editor {
      top: auto;
      left: 8px;
      width: auto;
      bottom: 8px;
    }

    .event-editor-row {
      grid-template-columns: 1fr;
    }
  }

  @keyframes week-slide-next {
    from {
      transform: translateX(18px);
      opacity: 0.86;
    }

    to {
      transform: translateX(0);
      opacity: 1;
    }
  }

  @keyframes week-slide-prev {
    from {
      transform: translateX(-18px);
      opacity: 0.86;
    }

    to {
      transform: translateX(0);
      opacity: 1;
    }
  }

  @keyframes slide-in {
    from {
      opacity: 0;
      transform: translateY(-8px);
    }

    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
</style>
