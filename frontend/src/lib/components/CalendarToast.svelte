<script lang="ts">
  export let message = "";
</script>

{#if message}
  <div class="toast toast-top toast-end z-50" data-testid="toast">
    <div class="alert alert-info shadow">
      <span>{message}</span>
    </div>
  </div>
{/if}
