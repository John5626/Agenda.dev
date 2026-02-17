<script lang="ts">
  import type { Recurrence } from "$lib/api";
  import type { MiniDay } from "$lib/utils/week";
  import type { AgendaTheme } from "$lib/utils/theme";

  export let createOpen = true;
  export let title = "";
  export let startLocal = "";
  export let endLocal = "";
  export let color = "#3b82f6";
  export let recurrence: Recurrence = "none";
  export let recurrenceUntilLocal = "";
  export let loading = false;
  export let recurrenceOptions: { value: Recurrence; label: string }[] = [];
  export let miniMonthTitle = "";
  export let miniWeekdayHeader: readonly string[] = [];
  export let miniDays: MiniDay[] = [];
  export let onSubmit: () => void = () => {};
  export let onShiftMiniMonth: (months: number) => void = () => {};
  export let onPickMiniDay: (day: MiniDay) => void = () => {};
  export let resolvedTheme: AgendaTheme = "corporate";
  export let onToggleTheme: () => void = () => {};
</script>

<div class="drawer-side z-50">
  <label for="agenda-drawer" class="drawer-overlay"></label>

  <aside class="agenda-sidebar w-80 min-h-full bg-base-100 border-r border-base-300 p-4 flex flex-col gap-4">
    <div class="space-y-4">
      <div class="create-panel border border-base-300">
        <button
          class="create-pill-btn"
          type="button"
          aria-expanded={createOpen}
          aria-controls="create-form-panel"
          on:click={() => (createOpen = !createOpen)}
        >
          <span class="create-plus-mark" aria-hidden="true">+</span>
          <span class="create-pill-label">Criar</span>
          <span class="create-pill-caret" aria-hidden="true">▾</span>
        </button>

        {#if createOpen}
          <div id="create-form-panel" class="create-form-wrap">
            <form class="space-y-3" on:submit|preventDefault={onSubmit}>
              <label class="form-control">
                <div class="label"><span class="label-text">Título</span></div>
                <input
                  class="input input-bordered input-sm"
                  data-testid="appt-title"
                  bind:value={title}
                  placeholder="Ex: Reunião de status"
                  required
                />
              </label>

              <label class="form-control">
                <div class="label"><span class="label-text">Início</span></div>
                <input
                  class="input input-bordered input-sm"
                  data-testid="appt-start"
                  type="datetime-local"
                  bind:value={startLocal}
                  required
                />
              </label>

              <label class="form-control">
                <div class="label"><span class="label-text">Fim</span></div>
                <input
                  class="input input-bordered input-sm"
                  data-testid="appt-end"
                  type="datetime-local"
                  bind:value={endLocal}
                  required
                />
              </label>

              <label class="form-control">
                <div class="label"><span class="label-text">Cor</span></div>
                <input
                  class="h-10 w-full rounded-md border border-base-300 bg-base-100"
                  data-testid="appt-color"
                  type="color"
                  bind:value={color}
                />
              </label>

              <label class="form-control">
                <div class="label"><span class="label-text">Repetição</span></div>
                <select class="select select-bordered select-sm" bind:value={recurrence}>
                  {#each recurrenceOptions as option}
                    <option value={option.value}>{option.label}</option>
                  {/each}
                </select>
              </label>

              {#if recurrence !== "none"}
                <label class="form-control">
                  <div class="label"><span class="label-text">Repetir até</span></div>
                  <input class="input input-bordered input-sm" type="date" bind:value={recurrenceUntilLocal} required={true} />
                </label>
              {/if}

              <div class="pt-2">
                <button class="btn btn-primary btn-sm w-full" data-testid="appt-submit" type="submit" disabled={loading}>
                  Salvar compromisso
                </button>
              </div>
            </form>
          </div>
        {/if}
      </div>

      <section class="mini-calendar-card card bg-base-100 border border-base-300 shadow-sm">
        <div class="card-body p-4 gap-3">
          <div class="mini-month-head flex items-center justify-between">
            <button class="mini-month-btn" type="button" aria-label="Mês anterior" on:click={() => onShiftMiniMonth(-1)}>
              ‹
            </button>
            <strong class="mini-month-title text-sm">{miniMonthTitle}</strong>
            <button class="mini-month-btn" type="button" aria-label="Próximo mês" on:click={() => onShiftMiniMonth(1)}>
              ›
            </button>
          </div>

          <div class="grid grid-cols-7 gap-1 text-center">
            {#each miniWeekdayHeader as dayName}
              <div class="mini-weekday text-[11px] font-medium text-base-content/60">{dayName}</div>
            {/each}

            {#each miniDays as day}
              <button
                type="button"
                class="mini-day-btn"
                class:is-today={day.isToday}
                class:is-week={day.inCurrentWeek && !day.isToday}
                class:is-outside={!day.inMonth}
                on:click={() => onPickMiniDay(day)}
              >
                {day.date.getDate()}
              </button>
            {/each}
          </div>
        </div>
      </section>
    </div>

    <div class="sidebar-footer mt-auto">
      <button
        type="button"
        class="theme-toggle-btn"
        aria-label="Alternar tema"
        title={resolvedTheme === "night" ? "Mudar para tema claro" : "Mudar para tema escuro"}
        on:click={onToggleTheme}
      >
        {#if resolvedTheme === "night"}
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M12 4v2m0 12v2m6.36-14.36-1.41 1.41M7.05 16.95l-1.41 1.41M20 12h-2M6 12H4m14.36 6.36-1.41-1.41M7.05 7.05 5.64 5.64" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
            <circle cx="12" cy="12" r="4.2" stroke="currentColor" stroke-width="1.8"/>
          </svg>
          <span>Claro</span>
        {:else}
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a7 7 0 1 0 10.5 10.5Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>
          </svg>
          <span>Escuro</span>
        {/if}
      </button>
    </div>
  </aside>
</div>
