import { sameDay } from "$lib/utils/date";

export const WEEKDAY_HEADER = ["DOM.", "SEG.", "TER.", "QUA.", "QUI.", "SEX.", "SAB."] as const;
export const MINI_WEEKDAY_HEADER = ["D", "S", "T", "Q", "Q", "S", "S"] as const;
export const MONTHS_SHORT = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"] as const;
export const MONTHS_LONG = [
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
] as const;

export type MiniDay = {
  date: Date;
  inMonth: boolean;
  isToday: boolean;
  inCurrentWeek: boolean;
};

export function startOfWeekSunday(date: Date): Date {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  copy.setDate(copy.getDate() - copy.getDay());
  return copy;
}

export function buildWeekDays(start: Date): Date[] {
  return Array.from({ length: 7 }, (_, idx) => {
    const day = new Date(start);
    day.setDate(start.getDate() + idx);
    day.setHours(0, 0, 0, 0);
    return day;
  });
}

export function buildMiniDays(cursor: Date, selectedWeekStart: Date): MiniDay[] {
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
      inCurrentWeek: selectedWeekDays.some((day) => sameDay(day, cellDate))
    };
  });
}

export function formatMonthTitle(anchor: Date): string {
  return `${MONTHS_SHORT[anchor.getMonth()]} de ${anchor.getFullYear()}`;
}

export function formatMiniMonthTitle(cursor: Date): string {
  return `${MONTHS_LONG[cursor.getMonth()]} de ${cursor.getFullYear()}`;
}
