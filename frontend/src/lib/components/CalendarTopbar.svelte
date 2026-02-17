<script lang="ts">
  export let monthTitle = "";
  export let weekLabel = "";
  export let todayDate = new Date().getDate();
  export let onGoToday: () => void = () => {};
  export let onShiftWeek: (days: number) => void = () => {};
</script>

<header class="navbar agenda-topbar bg-base-100 border-b border-base-300 sticky top-0 z-40">
  <div class="navbar-start gap-1 sm:gap-2">
    <label for="agenda-drawer" class="menu-toggle-btn btn btn-ghost btn-circle" aria-label="Menu">
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"></path>
      </svg>
    </label>

    <div class="brand-lockup flex items-center gap-2">
      <div class="gcal-mark" aria-hidden="true">
        <span class="gcal-tab"></span>
        <span class="gcal-day">{todayDate}</span>
      </div>
      <span class="brand-title text-lg font-semibold tracking-tight">Agenda</span>
    </div>
  </div>

  <div class="navbar-center flex-1 hidden md:flex justify-center"></div>

  <div class="navbar-end gap-2 lg:gap-3">
    <button class="btn btn-sm today-btn hidden md:inline-flex" type="button" on:click={onGoToday}>Hoje</button>

    <div class="week-nav hidden md:flex">
      <button
        class="btn btn-sm btn-ghost week-nav-btn"
        data-testid="week-prev"
        type="button"
        aria-label="Semana anterior"
        on:click={() => onShiftWeek(-7)}
      >
        ‹
      </button>
      <button
        class="btn btn-sm btn-ghost week-nav-btn"
        data-testid="week-next"
        type="button"
        aria-label="Próxima semana"
        on:click={() => onShiftWeek(7)}
      >
        ›
      </button>
    </div>

    <h1 class="month-label text-base font-semibold text-base-content/80 hidden md:block" data-testid="week-label">
      {weekLabel || monthTitle}
    </h1>

    <button class="btn btn-sm today-btn md:hidden" type="button" on:click={onGoToday}>Hoje</button>
  </div>
</header>
