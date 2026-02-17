<script lang="ts">
  import type { Recurrence } from "$lib/api";
  import type { MiniDay } from "$lib/utils/week";

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
</script>

<div class="drawer-side z-50">
  <label for="agenda-drawer" class="drawer-overlay"></label>

  <aside class="agenda-sidebar w-80 min-h-full bg-base-100 border-r border-base-300 p-4 space-y-4">
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
              <input class="input input-bordered input-sm" bind:value={title} placeholder="Ex: Reunião de status" required />
            </label>

            <label class="form-control">
              <div class="label"><span class="label-text">Início</span></div>
              <input class="input input-bordered input-sm" type="datetime-local" bind:value={startLocal} required />
            </label>

            <label class="form-control">
              <div class="label"><span class="label-text">Fim</span></div>
              <input class="input input-bordered input-sm" type="datetime-local" bind:value={endLocal} required />
            </label>

            <label class="form-control">
              <div class="label"><span class="label-text">Cor</span></div>
              <input class="h-10 w-full rounded-md border border-base-300 bg-base-100" type="color" bind:value={color} />
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
              <button class="btn btn-primary btn-sm w-full" type="submit" disabled={loading}>Salvar compromisso</button>
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
  </aside>
</div>
