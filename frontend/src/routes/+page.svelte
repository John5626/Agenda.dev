<script lang="ts">
  import { onMount, tick } from "svelte";
  import type { Appointment, DeleteScope, Recurrence } from "$lib/api";
  import { createAppointment, deleteAppointment, listAppointments, updateAppointment } from "$lib/api";
  import CalendarSidebar from "$lib/components/CalendarSidebar.svelte";
  import CalendarToast from "$lib/components/CalendarToast.svelte";
  import CalendarTopbar from "$lib/components/CalendarTopbar.svelte";
  import {
    clamp,
    formatRange,
    hexToRgba,
    pad2,
    sameDay,
    toLocalDateValueFromIso,
    toLocalInputValue,
    toUtcIso,
    toUtcIsoEndOfDay
  } from "$lib/utils/date";
  import {
    buildMiniDays,
    buildWeekDays,
    formatMiniMonthTitle,
    formatMonthTitle,
    MINI_WEEKDAY_HEADER,
    startOfWeekSunday,
    type MiniDay,
    WEEKDAY_HEADER
  } from "$lib/utils/week";

  const HOUR_HEIGHT = 48;
  const DAY_MINUTES = 24 * 60;
  const DAY_HEIGHT = 24 * HOUR_HEIGHT;
  const SNAP_MINUTES = 15;
  const PX_PER_MINUTE = HOUR_HEIGHT / 60;
  const WEEK_TIME_AXIS_WIDTH_PX = 72;
  const WEEK_DAY_MIN_WIDTH_PX = 160;
  const WEEK_CONTENT_MIN_WIDTH_PX = WEEK_TIME_AXIS_WIDTH_PX + WEEK_DAY_MIN_WIDTH_PX * 7;
  const DAY_EVENT_HORIZONTAL_INSET_PX = 4;
  const DAY_EVENT_OVERLAP_RATIO = 0.18;
  const DAY_EVENT_MIN_HEIGHT_WITH_TIME = 46;
  const DAY_EVENT_MAX_COLUMNS_WITH_TIME = 2;
  const HOUR_ROWS = Array.from({ length: 24 }, (_, idx) => idx);
  const MULTI_DAY_ROW_HEIGHT = 36;
  const MULTI_DAY_ROW_GAP = 8;
  const MULTI_DAY_VERTICAL_PADDING = 16;
  const MULTI_DAY_MIN_HEIGHT = 44;
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
    startMinutes: number;
    endMinutes: number;
    top: number;
    height: number;
    fullDurationMs: number;
    segmentDurationMs: number;
    canDrag: boolean;
    column: number;
    columnsCount: number;
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
    isMultiDay: boolean;
  };

  type CreateSelectionPreview = {
    dayIndex: number;
    startMinutes: number;
    endMinutes: number;
    top: number;
    height: number;
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
  let multiDayRenderRows = 0;
  let multiDayStripHeight = MULTI_DAY_MIN_HEIGHT;
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

  let createEditorOpen = false;
  let createEditorTop = 14;
  let createEditorLeft = 14;
  let createDraftTitle = "";
  let createDraftStartLocal = "";
  let createDraftEndLocal = "";
  let createDraftColor = "#3b82f6";
  let createDraftRecurrence: Recurrence = "none";
  let createDraftRecurrenceUntilLocal = "";
  let createDraftError = "";
  let savingCreate = false;

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
  let multiDayDropPreview: { startDayIndex: number; endDayIndex: number; row: number; color: string; title: string } | null = null;
  let createSelectionPreview: CreateSelectionPreview | null = null;
  let creatingBySelection = false;
  let createSelectionDayIndex = -1;
  let createSelectionStartMinutes = 0;
  let createSelectionColumnEl: HTMLElement | null = null;
  let createSelectionStartClientY = 0;
  let createSelectionHasDragged = false;

  let gridScrollEl: HTMLDivElement | null = null;
  let calendarPanelEl: HTMLElement | null = null;

  $: weekDays = buildWeekDays(weekStart);
  $: monthTitle = formatMonthTitle(weekAnchor);
  $: miniMonthTitle = formatMiniMonthTitle(miniMonthCursor);
  $: miniDays = buildMiniDays(miniMonthCursor, weekStart);
  $: renderedItems = buildRenderedItems(items, weekDays);
  $: multiDayItems = buildMultiDayItems(items, weekDays);
  $: multiDayRows = multiDayItems.reduce((max, item) => Math.max(max, item.row + 1), 0);
  $: {
    const previewRows = multiDayDropPreview ? multiDayDropPreview.row + 1 : 0;
    multiDayRenderRows = Math.max(multiDayRows, previewRows);
  }
  $: multiDayStripHeight =
    multiDayRenderRows > 0
      ? Math.max(
          MULTI_DAY_MIN_HEIGHT,
          multiDayRenderRows * MULTI_DAY_ROW_HEIGHT +
            Math.max(0, multiDayRenderRows - 1) * MULTI_DAY_ROW_GAP +
            MULTI_DAY_VERTICAL_PADDING
        )
      : MULTI_DAY_MIN_HEIGHT;
  $: itemsByDay = Array.from({ length: 7 }, (_, dayIndex) =>
    renderedItems
      .filter((item) => item.dayIndex === dayIndex)
      .sort((a, b) => {
        if (a.startMinutes !== b.startMinutes) return a.startMinutes - b.startMinutes;
        if (a.column !== b.column) return a.column - b.column;
        if (a.endMinutes !== b.endMinutes) return b.endMinutes - a.endMinutes;
        return a.id.localeCompare(b.id);
      })
  );
  $: renderedById = new Map(items.filter((item) => !!item.id).map((item) => [item.id!, item]));
  $: selectedItem = selectedEventId ? renderedById.get(selectedEventId) ?? null : null;

  function showToast(message: string) {
    toast = message;
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (toast = ""), 2600);
  }

  function isMultiDaySpan(startIso: string, endIso: string) {
    const start = new Date(startIso);
    const end = new Date(endIso);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return false;
    return !sameDay(start, end);
  }

  function resolveActiveDragMeta(id: string): DragMeta | null {
    if (dragMeta && dragMeta.id === id) return dragMeta;

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
      durationMs: Math.max(15 * 60_000, new Date(base.end).getTime() - new Date(base.start).getTime()),
      isMultiDay: isMultiDaySpan(base.start, base.end)
    } satisfies DragMeta;
  }

  function resolveMultiDayRow(startDayIndex: number, endDayIndex: number, excludedId: string) {
    let row = 0;

    while (
      multiDayItems.some(
        (item) =>
          item.id !== excludedId &&
          item.row === row &&
          !(item.endDayIndex < startDayIndex || item.startDayIndex > endDayIndex)
      )
    ) {
      row++;
    }

    return row;
  }

  function resolveMultiDayPlacement(item: DragMeta, dayIndex: number) {
    if (weekDays.length !== 7) return null;

    const originalStart = new Date(item.startIso);
    if (Number.isNaN(originalStart.getTime())) return null;

    const nextStart = new Date(weekDays[dayIndex]);
    nextStart.setHours(
      originalStart.getHours(),
      originalStart.getMinutes(),
      originalStart.getSeconds(),
      originalStart.getMilliseconds()
    );
    const nextEnd = new Date(nextStart.getTime() + item.durationMs);

    const visibleWeekStart = new Date(weekDays[0]);
    visibleWeekStart.setHours(0, 0, 0, 0);
    const visibleWeekEnd = new Date(visibleWeekStart);
    visibleWeekEnd.setDate(visibleWeekEnd.getDate() + 7);

    if (nextEnd <= visibleWeekStart || nextStart >= visibleWeekEnd) return null;

    const visibleStart = nextStart > visibleWeekStart ? nextStart : visibleWeekStart;
    const visibleEnd = nextEnd < visibleWeekEnd ? nextEnd : visibleWeekEnd;
    const visibleEndInclusive = new Date(visibleEnd.getTime() - 1);

    const spanStartDay = new Date(visibleStart);
    spanStartDay.setHours(0, 0, 0, 0);
    const spanEndDay = new Date(visibleEndInclusive);
    spanEndDay.setHours(0, 0, 0, 0);

    const startDayIndex = clamp(
      Math.round((spanStartDay.getTime() - visibleWeekStart.getTime()) / ONE_DAY_MS),
      0,
      6
    );
    const endDayIndex = clamp(
      Math.round((spanEndDay.getTime() - visibleWeekStart.getTime()) / ONE_DAY_MS),
      0,
      6
    );

    if (endDayIndex < startDayIndex) return null;

    return {
      startDayIndex,
      endDayIndex,
      row: resolveMultiDayRow(startDayIndex, endDayIndex, item.id),
      nextStart,
      nextEnd
    };
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

  function buildRenderedItems(source: Appointment[], week: Date[]): RenderedAppointment[] {
    const segments = source.flatMap((item) => {
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
        const rawStartMinutes = Math.floor((segmentStart.getTime() - dayStart.getTime()) / 60_000);
        const rawEndMinutes = Math.ceil((segmentEnd.getTime() - dayStart.getTime()) / 60_000);
        const boundedStartMinutes = clamp(rawStartMinutes, 0, DAY_MINUTES - 15);
        const boundedEndMinutes = clamp(rawEndMinutes, boundedStartMinutes + 15, DAY_MINUTES);
        const boundedDurationMinutes = Math.max(15, boundedEndMinutes - boundedStartMinutes);

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
          startMinutes: boundedStartMinutes,
          endMinutes: boundedEndMinutes,
          top: boundedStartMinutes * PX_PER_MINUTE,
          height: Math.max(32, boundedDurationMinutes * PX_PER_MINUTE),
          fullDurationMs,
          segmentDurationMs: boundedDurationMinutes * 60_000,
          canDrag,
          column: 0,
          columnsCount: 1
        });
      }

      return segments;
    });

    const segmentsByDay = Array.from({ length: 7 }, () => [] as RenderedAppointment[]);
    for (const segment of segments) {
      segmentsByDay[segment.dayIndex]?.push(segment);
    }

    for (const daySegments of segmentsByDay) {
      daySegments.sort((a, b) => {
        if (a.startMinutes !== b.startMinutes) return a.startMinutes - b.startMinutes;
        if (a.endMinutes !== b.endMinutes) return a.endMinutes - b.endMinutes;
        return a.id.localeCompare(b.id);
      });

      let active: Array<{ endMinutes: number; column: number }> = [];
      let cluster: RenderedAppointment[] = [];
      let clusterColumns = 1;

      const flushCluster = () => {
        const columnsCount = Math.max(1, clusterColumns);
        for (const segment of cluster) {
          segment.columnsCount = columnsCount;
        }
        cluster = [];
        clusterColumns = 1;
      };

      for (const segment of daySegments) {
        active = active.filter((lane) => lane.endMinutes > segment.startMinutes);

        if (active.length === 0 && cluster.length > 0) {
          flushCluster();
        }

        const usedColumns = new Set(active.map((lane) => lane.column));
        let nextColumn = 0;
        while (usedColumns.has(nextColumn)) {
          nextColumn++;
        }

        segment.column = nextColumn;
        active.push({ endMinutes: segment.endMinutes, column: nextColumn });
        cluster.push(segment);
        clusterColumns = Math.max(clusterColumns, nextColumn + 1);
      }

      if (cluster.length > 0) {
        flushCluster();
      }
    }

    return segments;
  }

  function buildDayItemInlineStyle(item: RenderedAppointment): string {
    const columns = Math.max(1, item.columnsCount);
    const slotWidthPercent = 100 / columns;
    const leftPercent = item.column * slotWidthPercent;
    const expandedWidthPercent =
      columns > 1 ? slotWidthPercent * (1 + DAY_EVENT_OVERLAP_RATIO) : slotWidthPercent;
    const clampedWidthPercent = Math.min(expandedWidthPercent, 100 - leftPercent);
    const zIndex = 10 + item.column;

    return [
      `top: ${item.top}px`,
      `height: ${item.height}px`,
      `left: calc(${leftPercent}% + ${DAY_EVENT_HORIZONTAL_INSET_PX}px)`,
      `width: calc(${clampedWidthPercent}% - ${DAY_EVENT_HORIZONTAL_INSET_PX * 2}px)`,
      `z-index: ${zIndex}`,
      `background: ${hexToRgba(item.color, 0.2)}`,
      `border-left: 4px solid ${item.color}`
    ].join("; ");
  }

  function shouldShowDayItemTime(item: RenderedAppointment): boolean {
    return item.height >= DAY_EVENT_MIN_HEIGHT_WITH_TIME && item.columnsCount <= DAY_EVENT_MAX_COLUMNS_WITH_TIME;
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
      multiDayDropPreview = null;
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

  function closeCreateEditor() {
    createEditorOpen = false;
    createDraftError = "";
  }

  function resolveSnappedMinutesFromClientY(clientY: number, columnEl: HTMLElement) {
    const rect = columnEl.getBoundingClientRect();
    const rawMinutes = (clientY - rect.top) / PX_PER_MINUTE;
    const snappedMinutes = Math.round(rawMinutes / SNAP_MINUTES) * SNAP_MINUTES;
    return clamp(snappedMinutes, 0, DAY_MINUTES - SNAP_MINUTES);
  }

  function buildCreateSelectionPreview(dayIndex: number, startMinutes: number, currentMinutes: number): CreateSelectionPreview {
    const from = clamp(Math.min(startMinutes, currentMinutes), 0, DAY_MINUTES - SNAP_MINUTES);
    const to = clamp(Math.max(startMinutes, currentMinutes) + SNAP_MINUTES, SNAP_MINUTES, DAY_MINUTES);
    const durationMinutes = Math.max(SNAP_MINUTES, to - from);

    return {
      dayIndex,
      startMinutes: from,
      endMinutes: to,
      top: from * PX_PER_MINUTE,
      height: durationMinutes * PX_PER_MINUTE
    };
  }

  function clearCreateSelectionState() {
    creatingBySelection = false;
    createSelectionDayIndex = -1;
    createSelectionStartMinutes = 0;
    createSelectionColumnEl = null;
    createSelectionStartClientY = 0;
    createSelectionHasDragged = false;
    createSelectionPreview = null;
  }

  function positionCreateEditorFromSelection(columnEl: HTMLElement, startMinutes: number, endMinutes: number) {
    if (!calendarPanelEl) return;

    const panelRect = calendarPanelEl.getBoundingClientRect();
    const columnRect = columnEl.getBoundingClientRect();
    const horizontalGap = 10;
    const safeGap = 12;

    let left = columnRect.right - panelRect.left + horizontalGap;
    if (left + MAX_EDITOR_WIDTH > panelRect.width - safeGap) {
      left = columnRect.left - panelRect.left - MAX_EDITOR_WIDTH - horizontalGap;
    }

    left = clamp(left, safeGap, Math.max(safeGap, panelRect.width - MAX_EDITOR_WIDTH - safeGap));

    const selectionMidOffset = ((startMinutes + endMinutes) / 2) * PX_PER_MINUTE;
    const estimatedEditorHeight = EDITOR_VERTICAL_FALLBACK;
    const maxTop = Math.max(safeGap, panelRect.height - estimatedEditorHeight);
    const top = clamp(selectionMidOffset - estimatedEditorHeight / 2, safeGap, maxTop);

    createEditorLeft = left;
    createEditorTop = top;
  }

  function openCreateEditorFromSelection(
    dayIndex: number,
    startMinutes: number,
    endMinutes: number,
    columnEl: HTMLElement
  ) {
    const start = new Date(weekDays[dayIndex]);
    start.setHours(0, 0, 0, 0);
    start.setMinutes(startMinutes);

    const end = new Date(weekDays[dayIndex]);
    end.setHours(0, 0, 0, 0);
    end.setMinutes(endMinutes);

    if (end.getTime() <= start.getTime()) {
      end.setTime(start.getTime() + SNAP_MINUTES * 60_000);
    }

    createDraftTitle = "";
    createDraftStartLocal = toLocalInputValue(start);
    createDraftEndLocal = toLocalInputValue(end);
    createDraftColor = color;
    createDraftRecurrence = "none";
    createDraftRecurrenceUntilLocal = "";
    createDraftError = "";
    createEditorOpen = true;

    closeEditor();
    positionCreateEditorFromSelection(columnEl, startMinutes, endMinutes);
  }

  async function saveCreateFromEditor() {
    createDraftError = "";

    const trimmedTitle = createDraftTitle.trim();
    if (!trimmedTitle) {
      createDraftError = "Titulo obrigatorio.";
      return;
    }

    if (!createDraftStartLocal || !createDraftEndLocal) {
      createDraftError = "Preencha inicio e fim.";
      return;
    }

    if (createDraftRecurrence !== "none" && !createDraftRecurrenceUntilLocal) {
      createDraftError = "Para repeticao, preencha ate quando repetir.";
      return;
    }

    const startDate = new Date(createDraftStartLocal);
    const endDate = new Date(createDraftEndLocal);
    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
      createDraftError = "Data/hora invalida.";
      return;
    }

    if (endDate.getTime() <= startDate.getTime()) {
      createDraftError = "Fim deve ser maior que inicio.";
      return;
    }

    savingCreate = true;
    error = "";

    try {
      await createAppointment({
        title: trimmedTitle,
        start: toUtcIso(createDraftStartLocal),
        end: toUtcIso(createDraftEndLocal),
        color: createDraftColor,
        recurrence: createDraftRecurrence,
        recurrenceUntil:
          createDraftRecurrence === "none" ? null : toUtcIsoEndOfDay(createDraftRecurrenceUntilLocal)
      });
      closeCreateEditor();
      showToast("Compromisso criado e salvo");
      await load();
    } catch (e: any) {
      createDraftError = e?.message ?? "Falha ao salvar compromisso";
    } finally {
      savingCreate = false;
    }
  }

  function onDayColumnMouseDown(dayIndex: number, ev: MouseEvent) {
    if (ev.button !== 0) return;
    if (draggingId || savingDragId || savingEditId || deletingId || savingCreate) return;

    const target = ev.target as HTMLElement | null;
    if (!target) return;
    if (target.closest(".event-pill")) return;
    if (target.closest(".event-editor")) return;
    if (target.closest("input, textarea, select, button, a, label")) return;

    closeEditor();
    closeCreateEditor();

    const columnEl = ev.currentTarget as HTMLElement;
    const startMinutes = resolveSnappedMinutesFromClientY(ev.clientY, columnEl);

    creatingBySelection = true;
    createSelectionDayIndex = dayIndex;
    createSelectionStartMinutes = startMinutes;
    createSelectionColumnEl = columnEl;
    createSelectionStartClientY = ev.clientY;
    createSelectionHasDragged = false;
    createSelectionPreview = buildCreateSelectionPreview(dayIndex, startMinutes, startMinutes);

    ev.preventDefault();
  }

  function onWindowMouseMove(ev: MouseEvent) {
    if (!creatingBySelection || !createSelectionColumnEl || createSelectionDayIndex < 0) return;

    const currentMinutes = resolveSnappedMinutesFromClientY(ev.clientY, createSelectionColumnEl);
    createSelectionPreview = buildCreateSelectionPreview(
      createSelectionDayIndex,
      createSelectionStartMinutes,
      currentMinutes
    );

    if (Math.abs(ev.clientY - createSelectionStartClientY) > 4) {
      createSelectionHasDragged = true;
    }
  }

  function onWindowMouseUp() {
    if (!creatingBySelection) return;

    const selection = createSelectionPreview;
    const columnEl = createSelectionColumnEl;
    const shouldOpenEditor = !!selection && !!columnEl && createSelectionHasDragged;

    clearCreateSelectionState();

    if (!shouldOpenEditor || !selection || !columnEl) return;
    openCreateEditorFromSelection(
      selection.dayIndex,
      selection.startMinutes,
      selection.endMinutes,
      columnEl
    );
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
    clearCreateSelectionState();
    closeCreateEditor();

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

    clearCreateSelectionState();
    closeCreateEditor();

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
      durationMs: item.fullDurationMs,
      isMultiDay: isMultiDaySpan(item.startIso, item.endIso)
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
    multiDayDropPreview = null;
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

  function resolveDayIndexFromClientX(clientX: number, zoneEl: HTMLElement) {
    const rect = zoneEl.getBoundingClientRect();
    if (rect.width <= 0) return null;

    const relativeX = clamp(clientX - rect.left, 0, rect.width - 1);
    const dayWidth = rect.width / 7;
    return clamp(Math.floor(relativeX / dayWidth), 0, 6);
  }

  async function persistDraggedMove(id: string, item: DragMeta, nextStart: Date, nextEnd: Date) {
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

  function onMultiDayStripDragOver(ev: DragEvent) {
    if (!draggingId) return;
    ev.preventDefault();
    maybeSwitchWeekByEdge(ev.clientX);

    const item = resolveActiveDragMeta(draggingId);
    if (!item) return;

    // A faixa superior só aceita preview de evento multi-dia.
    dropPreview = null;
    if (!item.isMultiDay) {
      multiDayDropPreview = null;
      return;
    }

    const zoneEl = ev.currentTarget as HTMLElement;
    const dayIndex = resolveDayIndexFromClientX(ev.clientX, zoneEl);
    if (dayIndex === null) {
      multiDayDropPreview = null;
      return;
    }

    const placement = resolveMultiDayPlacement(item, dayIndex);
    if (!placement) {
      multiDayDropPreview = null;
      return;
    }

    multiDayDropPreview = {
      startDayIndex: placement.startDayIndex,
      endDayIndex: placement.endDayIndex,
      row: placement.row,
      color: item.color,
      title: item.title
    };

    if (ev.dataTransfer) ev.dataTransfer.dropEffect = "move";
  }

  async function onMultiDayStripDrop(ev: DragEvent) {
    ev.preventDefault();
    clearEdgeSwitchState();

    const id = draggingId;
    if (!id) return;

    const item = resolveActiveDragMeta(id);
    if (!item || !item.isMultiDay) {
      endDrag();
      return;
    }

    const zoneEl = ev.currentTarget as HTMLElement;
    const dayIndex = resolveDayIndexFromClientX(ev.clientX, zoneEl);
    if (dayIndex === null) {
      endDrag();
      return;
    }

    const placement = resolveMultiDayPlacement(item, dayIndex);
    if (!placement) {
      endDrag();
      return;
    }

    await persistDraggedMove(id, item, placement.nextStart, placement.nextEnd);
  }

  function onGridDragOver(dayIndex: number, ev: DragEvent) {
    if (!draggingId) return;
    ev.preventDefault();
    maybeSwitchWeekByEdge(ev.clientX);

    const item = resolveActiveDragMeta(draggingId);
    if (!item) return;

    if (item.isMultiDay) {
      const placement = resolveMultiDayPlacement(item, dayIndex);
      if (!placement) {
        multiDayDropPreview = null;
        return;
      }

      multiDayDropPreview = {
        startDayIndex: placement.startDayIndex,
        endDayIndex: placement.endDayIndex,
        row: placement.row,
        color: item.color,
        title: item.title
      };
      dropPreview = null;
    } else {
      const columnEl = ev.currentTarget as HTMLElement;
      const position = resolveDropPosition(dayIndex, ev.clientY, columnEl, item);
      dropPreview = {
        dayIndex,
        top: position.top,
        height: position.height,
        color: item.color
      };
      multiDayDropPreview = null;
    }

    if (ev.dataTransfer) ev.dataTransfer.dropEffect = "move";
  }

  async function onGridDrop(dayIndex: number, ev: DragEvent) {
    ev.preventDefault();
    clearEdgeSwitchState();

    const id = draggingId;
    if (!id) return;

    const item = resolveActiveDragMeta(id);
    if (!item) {
      endDrag();
      return;
    }

    let nextStart: Date;
    let nextEnd: Date;

    if (item.isMultiDay) {
      const placement = resolveMultiDayPlacement(item, dayIndex);
      if (!placement) {
        endDrag();
        return;
      }
      nextStart = placement.nextStart;
      nextEnd = placement.nextEnd;
    } else {
      const columnEl = ev.currentTarget as HTMLElement;
      const position = resolveDropPosition(dayIndex, ev.clientY, columnEl, item);

      nextStart = new Date(weekDays[dayIndex]);
      nextStart.setHours(0, 0, 0, 0);
      nextStart.setMinutes(position.startMinutes);
      nextEnd = new Date(nextStart.getTime() + item.durationMs);
    }

    await persistDraggedMove(id, item, nextStart, nextEnd);
  }

  onMount(async () => {
    setCreateDefaults();
    await load();
    await tick();
    if (gridScrollEl) gridScrollEl.scrollTop = HOUR_HEIGHT * 6;
  });
</script>

<svelte:window on:mousemove={onWindowMouseMove} on:mouseup={onWindowMouseUp} />

<div class="app-shell" data-theme="corporate">
  <div class="app-stage min-h-screen bg-base-200">
    <CalendarToast message={toast} />

  <!-- Drawer (Sidebar) -->
  <div class={`agenda-drawer drawer ${sidebarOpen ? "drawer-open lg:drawer-open" : ""}`}>
    <input id="agenda-drawer" type="checkbox" class="drawer-toggle" bind:checked={sidebarOpen} />

    <!-- Conteúdo -->
    <div class="drawer-content agenda-content flex flex-col">
      <CalendarTopbar
        {monthTitle}
        onGoToday={() => void goToday()}
        onShiftWeek={(days) => void shiftWeek(days)}
      />

      <div class="calendar-stage p-3 sm:p-4">
        <div
          class="card calendar-frame bg-base-100 shadow-sm border border-base-300 overflow-hidden"
          class:slide-next={weekSlideDirection === "next"}
          class:slide-prev={weekSlideDirection === "prev"}
          role="group"
          aria-label="Calendário semanal"
          bind:this={calendarPanelEl}
          on:dragover={onPanelDragOver}
        >
          <!-- Erro -->
          {#if error}
            <div class="p-3">
              <div class="alert alert-error">
                <span>{error}</span>
              </div>
            </div>
          {/if}

          <!-- Edge hints -->
          <div
            class="pointer-events-none absolute inset-y-0 left-0 w-2 bg-primary/20 opacity-0 transition-opacity"
            class:opacity-100={edgeHint === "left" && !!draggingId}
          ></div>
          <div
            class="pointer-events-none absolute inset-y-0 right-0 w-2 bg-primary/20 opacity-0 transition-opacity"
            class:opacity-100={edgeHint === "right" && !!draggingId}
          ></div>

          <div class="week-main-scroll overflow-x-auto">
            <div class="week-main-content min-w-full" style={`min-width: ${WEEK_CONTENT_MIN_WIDTH_PX}px;`}>
              <!-- Cabeçalho dias -->
              <div class="week-header grid grid-cols-[72px_repeat(7,minmax(0,1fr))] border-b border-base-300 bg-base-100 sticky top-0 z-20">
                <div class="week-timezone flex items-center justify-center text-xs font-medium text-base-content/60 py-2">
                  GMT-03
                </div>

                {#each weekDays as day (day.getTime())}
                <div class="week-day-head flex flex-col items-center justify-center py-2 gap-0.5" class:today-col={sameDay(day, new Date())}>
                  <span class="week-day-label text-xs text-base-content/60">
                    {WEEKDAY_HEADER[day.getDay()]} </span>
                  <strong class="week-day-number text-sm">{day.getDate()}</strong>
                </div>
              {/each}
              </div>

              <!-- Multi-dia -->
              {#if multiDayItems.length > 0 || multiDayDropPreview}
                <div class="border-b border-base-300 bg-base-100" style={`height: ${multiDayStripHeight}px;`}>
                  <div class="grid grid-cols-[72px_1fr]">
                    <div class="p-2"></div>
                    <div
                      class="p-2"
                      role="region"
                      aria-label="Faixa de eventos multi-dia"
                      on:dragover={onMultiDayStripDragOver}
                      on:drop={(ev) => void onMultiDayStripDrop(ev)}
                    >
                      <div class="grid grid-cols-7 gap-2">
                        {#each multiDayItems as item (`multi-${item.id}-${item.startDayIndex}-${item.endDayIndex}-${item.row}`)}
                          <button
                            type="button"
                            class="event-pill multi-pill w-full text-left rounded-md border border-base-300 shadow-sm px-2 py-1 overflow-hidden transition
                                   hover:shadow-md hover:border-base-400"
                            class:opacity-70={draggingId === item.id}
                            class:animate-pulse={isSaving(item.id)}
                            class:ring-2={selectedEventId === item.id}
                            class:ring-primary={selectedEventId === item.id}
                            style={`grid-column: ${item.startDayIndex + 1} / ${item.endDayIndex + 2}; grid-row: ${item.row + 1};
                                    background: ${hexToRgba(item.color, 0.2)}; border-left: 4px solid ${item.color};`}
                            aria-label={`Editar compromisso multi-dia ${item.title}`}
                            draggable={!isLocked(item.id) && item.canDrag}
                            on:click|stopPropagation={(ev) => selectEvent(item, ev)}
                            on:dragstart={(ev) => beginDrag(item, ev)}
                            on:dragend={endDrag}
                          >
                            <div class="text-sm font-semibold truncate">{item.title}</div>
                            <div class="text-xs text-base-content/70">{formatRange(item.startIso, item.endIso)}</div>
                          </button>
                        {/each}

                        {#if multiDayDropPreview}
                          <div
                            class="event-pill multi-pill multi-day-drop-preview pointer-events-none w-full overflow-hidden px-2 py-1 text-left"
                            style={`grid-column: ${multiDayDropPreview.startDayIndex + 1} / ${multiDayDropPreview.endDayIndex + 2}; grid-row: ${multiDayDropPreview.row + 1};
                                    background: ${hexToRgba(multiDayDropPreview.color, 0.22)}; border-left: 4px solid ${multiDayDropPreview.color};`}
                          >
                            <div class="text-sm font-semibold truncate">{multiDayDropPreview.title}</div>
                          </div>
                        {/if}
                      </div>
                    </div>
                  </div>
                </div>
              {/if}

              <!-- Corpo -->
              <div class="grid grid-cols-[72px_1fr]">
                <!-- Coluna horas -->
                <div class="hour-axis border-r border-base-300 bg-base-100">
                  {#each HOUR_ROWS as hour}
                    <div class="hour-slot h-12 flex items-start justify-end pr-2 pt-1 text-xs text-base-content/50">
                      {hour > 0 ? `${pad2(hour)}:00` : ""}
                    </div>
                  {/each}
                </div>

                <!-- Grade dias -->
                <div class="week-grid-scroll relative overflow-y-auto overflow-x-hidden" bind:this={gridScrollEl}>
                  <div class="relative" style={`height: ${DAY_HEIGHT}px;`}>
                    <!-- linhas de hora (repeating gradient) -->
                    <div
                      class="absolute inset-0 pointer-events-none
                             bg-[repeating-linear-gradient(to_bottom,hsl(var(--bc)/0.06)_0,hsl(var(--bc)/0.06)_1px,transparent_1px,transparent_48px)]"
                    ></div>

                    <div class="grid grid-cols-7 h-full">
                      {#each weekDays as day, dayIndex (day.toISOString())}
                        <div
                          class="week-day-column relative h-full border-l border-base-300"
                          class:today-grid-col={sameDay(day, new Date())}
                          role="gridcell"
                          tabindex="-1"
                          aria-label={`Coluna ${WEEKDAY_HEADER[dayIndex]} ${day.getDate()}`}
                          on:mousedown={(ev) => onDayColumnMouseDown(dayIndex, ev)}
                          on:dragover={(ev) => onGridDragOver(dayIndex, ev)}
                          on:drop={(ev) => void onGridDrop(dayIndex, ev)}
                        >
                          {#if dropPreview && dropPreview.dayIndex === dayIndex}
                            <div
                              class="drop-preview absolute left-1 right-1 rounded-lg border border-base-300 shadow-sm"
                              style={`top: ${dropPreview.top}px; height: ${dropPreview.height}px;
                                      background: ${hexToRgba(dropPreview.color, 0.2)}; border-color: ${dropPreview.color};`}
                            ></div>
                          {/if}

                          {#if createSelectionPreview && createSelectionPreview.dayIndex === dayIndex}
                            <div
                              class="create-selection-preview absolute left-1 right-1 rounded-lg"
                              style={`top: ${createSelectionPreview.top}px; height: ${createSelectionPreview.height}px;`}
                            ></div>
                          {/if}

                          {#each itemsByDay[dayIndex] ?? [] as item (item.segmentKey)}
                            <button
                              type="button"
                              class="event-pill day-pill absolute overflow-hidden rounded-lg border border-base-300 shadow-sm px-2 py-1 text-left
                                     transition hover:shadow-md hover:border-base-400
                                     focus:outline-none focus:ring-2 focus:ring-primary"
                              class:opacity-70={draggingId === item.id}
                              class:animate-pulse={isSaving(item.id)}
                              class:ring-2={selectedEventId === item.id}
                              class:ring-primary={selectedEventId === item.id}
                              aria-label={`Editar compromisso ${item.title}`}
                              draggable={!isLocked(item.id) && item.canDrag}
                              on:click|stopPropagation={(ev) => selectEvent(item, ev)}
                              on:dragstart={(ev) => beginDrag(item, ev)}
                              on:dragend={endDrag}
                              style={buildDayItemInlineStyle(item)}
                            >
                              <div class="flex min-w-0 flex-col gap-0.5">
                                <div class="truncate text-sm font-semibold leading-tight">{item.title}</div>
                                {#if shouldShowDayItemTime(item)}
                                  <div class="truncate text-xs text-base-content/70 leading-tight">{formatRange(item.startIso, item.endIso)}</div>
                                {/if}
                              </div>
                            </button>
                          {/each}
                        </div>
                      {/each}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Editor flutuante -->
          {#if createEditorOpen}
            <section
              class="card event-editor w-96 bg-base-100 shadow-xl border border-base-300 absolute z-30"
              aria-label="Criar compromisso"
              style={`top: ${createEditorTop}px; left: ${createEditorLeft}px;`}
            >
              <div class="card-body p-4 gap-3">
                <div class="flex items-center justify-between">
                  <strong class="text-sm">Novo compromisso</strong>
                  <button
                    class="btn btn-ghost btn-sm btn-circle"
                    type="button"
                    aria-label="Fechar criação"
                    on:click={closeCreateEditor}
                  >
                    ✕
                  </button>
                </div>

                {#if createDraftError}
                  <div class="alert alert-error">
                    <span>{createDraftError}</span>
                  </div>
                {/if}

                <label class="form-control">
                  <div class="label"><span class="label-text">Título</span></div>
                  <input class="input input-bordered input-sm" type="text" bind:value={createDraftTitle} disabled={savingCreate} />
                </label>

                <div class="grid grid-cols-2 gap-2">
                  <label class="form-control">
                    <div class="label"><span class="label-text">Início</span></div>
                    <input
                      class="input input-bordered input-sm"
                      type="datetime-local"
                      bind:value={createDraftStartLocal}
                      disabled={savingCreate}
                    />
                  </label>
                  <label class="form-control">
                    <div class="label"><span class="label-text">Fim</span></div>
                    <input
                      class="input input-bordered input-sm"
                      type="datetime-local"
                      bind:value={createDraftEndLocal}
                      disabled={savingCreate}
                    />
                  </label>
                </div>

                <div class="grid grid-cols-2 gap-2">
                  <label class="form-control">
                    <div class="label"><span class="label-text">Repetição</span></div>
                    <select class="select select-bordered select-sm" bind:value={createDraftRecurrence} disabled={savingCreate}>
                      {#each RECURRENCE_OPTIONS as option}
                        <option value={option.value}>{option.label}</option>
                      {/each}
                    </select>
                  </label>

                  {#if createDraftRecurrence !== "none"}
                    <label class="form-control">
                      <div class="label"><span class="label-text">Repetir até</span></div>
                      <input
                        class="input input-bordered input-sm"
                        type="date"
                        bind:value={createDraftRecurrenceUntilLocal}
                        disabled={savingCreate}
                      />
                    </label>
                  {/if}
                </div>

                <div class="flex items-center gap-2 justify-between">
                  <label class="flex items-center gap-2">
                    <span class="text-xs text-base-content/70">Cor</span>
                    <input
                      class="h-8 w-10 rounded-md border border-base-300 bg-base-100"
                      type="color"
                      bind:value={createDraftColor}
                      disabled={savingCreate}
                    />
                  </label>

                  <div class="flex gap-2">
                    <button class="btn btn-ghost btn-sm" type="button" disabled={savingCreate} on:click={closeCreateEditor}>
                      Cancelar
                    </button>
                    <button
                      class="btn btn-primary btn-sm"
                      type="button"
                      disabled={savingCreate}
                      on:click={() => void saveCreateFromEditor()}
                    >
                      {savingCreate ? "Salvando..." : "Salvar"}
                    </button>
                  </div>
                </div>
              </div>
            </section>
          {/if}

          <!-- Editor flutuante -->
          {#if selectedItem}
            <section
              class="card event-editor w-96 bg-base-100 shadow-xl border border-base-300 absolute z-30"
              aria-label="Editar compromisso"
              style={`top: ${editorTop}px; left: ${editorLeft}px;`}
            >
              <div class="card-body p-4 gap-3">
                <div class="flex items-center justify-between">
                  <strong class="text-sm">Editar compromisso</strong>
                  <button class="btn btn-ghost btn-sm btn-circle" type="button" aria-label="Fechar editor" on:click={closeEditor}>
                    ✕
                  </button>
                </div>

                {#if editError}
                  <div class="alert alert-error">
                    <span>{editError}</span>
                  </div>
                {/if}

                <label class="form-control">
                  <div class="label"><span class="label-text">Título</span></div>
                  <input class="input input-bordered input-sm" type="text" bind:value={editTitle} disabled={isLocked(selectedEventId)} />
                </label>

                <div class="grid grid-cols-2 gap-2">
                  <label class="form-control">
                    <div class="label"><span class="label-text">Início</span></div>
                    <input class="input input-bordered input-sm" type="datetime-local" bind:value={editStartLocal} disabled={isLocked(selectedEventId)} />
                  </label>
                  <label class="form-control">
                    <div class="label"><span class="label-text">Fim</span></div>
                    <input class="input input-bordered input-sm" type="datetime-local" bind:value={editEndLocal} disabled={isLocked(selectedEventId)} />
                  </label>
                </div>

                <div class="grid grid-cols-2 gap-2">
                  <label class="form-control">
                    <div class="label"><span class="label-text">Repetição</span></div>
                    <select class="select select-bordered select-sm" bind:value={editRecurrence} disabled={isLocked(selectedEventId)}>
                      {#each RECURRENCE_OPTIONS as option}
                        <option value={option.value}>{option.label}</option>
                      {/each}
                    </select>
                  </label>

                  {#if editRecurrence !== "none"}
                    <label class="form-control">
                      <div class="label"><span class="label-text">Repetir até</span></div>
                      <input class="input input-bordered input-sm" type="date" bind:value={editRecurrenceUntilLocal} disabled={isLocked(selectedEventId)} />
                    </label>
                  {/if}
                </div>

                <div class="flex items-center gap-2 justify-between">
                  <label class="flex items-center gap-2">
                    <span class="text-xs text-base-content/70">Cor</span>
                    <input class="h-8 w-10 rounded-md border border-base-300 bg-base-100" type="color" bind:value={editColor} disabled={isLocked(selectedEventId)} />
                  </label>

                  <div class="flex gap-2">
                    <button class="btn btn-error btn-sm" type="button" disabled={isLocked(selectedEventId)} on:click={() => void removeSelected()}>
                      Excluir
                    </button>
                    <button class="btn btn-primary btn-sm" type="button" disabled={isLocked(selectedEventId)} on:click={() => void saveSelectedEdit()}>
                      Salvar
                    </button>
                  </div>
                </div>
              </div>
            </section>
          {/if}

          <!-- Modal excluir recorrente -->
          {#if deleteModalOpen && selectedItem}
            <div class="modal modal-open">
              <div class="modal-box">
                <h3 class="font-bold text-lg">Excluir evento recorrente</h3>
                <p class="py-2 text-base-content/80">Escolha como deseja excluir "{selectedItem.title}".</p>

                <div class="space-y-2">
                  <label class="flex items-center gap-2 cursor-pointer">
                    <input class="radio radio-primary" type="radio" bind:group={deleteScope} value="single" />
                    <span>Este evento</span>
                  </label>

                  <label class="flex items-center gap-2 cursor-pointer">
                    <input class="radio radio-primary" type="radio" bind:group={deleteScope} value="following" />
                    <span>Este e os seguintes</span>
                  </label>

                  <label class="flex items-center gap-2 cursor-pointer">
                    <input class="radio radio-primary" type="radio" bind:group={deleteScope} value="all" />
                    <span>Todos os eventos</span>
                  </label>
                </div>

                <div class="modal-action">
                  <button class="btn" type="button" on:click={cancelDeleteModal}>Cancelar</button>
                  <button
                    class="btn btn-error"
                    type="button"
                    disabled={isLocked(selectedEventId)}
                    on:click={() => void confirmRecurringDelete()}
                  >
                    Excluir
                  </button>
                </div>
              </div>

              <!-- clicar fora fecha -->
              <form method="dialog" class="modal-backdrop">
                <button type="button" on:click={cancelDeleteModal}>close</button>
              </form>
            </div>
          {/if}

          {#if !loading && renderedItems.length === 0 && multiDayItems.length === 0}
            <div class="p-6 text-center text-base-content/60">
              Nenhum compromisso nesta semana.
            </div>
          {/if}

          <div class="drag-tip p-3 text-xs text-base-content/60 border-t border-base-300 bg-base-100">
            Clique em um compromisso para editar título, horário, cor ou excluir. Arraste e solte para mover e salvar.
          </div>
        </div>
      </div>
    </div>

    <CalendarSidebar
      bind:createOpen
      bind:title
      bind:startLocal
      bind:endLocal
      bind:color
      bind:recurrence
      bind:recurrenceUntilLocal
      {loading}
      recurrenceOptions={RECURRENCE_OPTIONS}
      {miniMonthTitle}
      miniWeekdayHeader={MINI_WEEKDAY_HEADER}
      {miniDays}
      onSubmit={() => void submit()}
      onShiftMiniMonth={shiftMiniMonth}
      onPickMiniDay={(day) => void pickMiniDay(day)}
    />
  </div>
</div>

</div>
