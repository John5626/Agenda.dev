export type ThemePreference = "system" | "light" | "dark";
export type AgendaTheme = "corporate" | "night";

export const THEME_STORAGE_KEY = "agenda.theme.preference";

export function parseThemePreference(value: string | null | undefined): ThemePreference {
  if (value === "light" || value === "dark" || value === "system") return value;
  return "system";
}

export function resolveAgendaTheme(preference: ThemePreference, prefersDark: boolean): AgendaTheme {
  if (preference === "light") return "corporate";
  if (preference === "dark") return "night";
  return prefersDark ? "night" : "corporate";
}
