<script setup lang="ts">
/** Constrains and pads every page identically so views can't drift apart. */
</script>

<template>
  <div class="page">
    <div class="page__inner"><slot /></div>
  </div>
</template>

<style scoped>
.page {
  padding: var(--s-6);
}

.page__inner {
  max-width: var(--content-max);
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: var(--s-5);
}

@media (max-width: 900px) {
  .page {
    padding: var(--s-4);
    /* respect the notch in landscape and the home indicator at the foot */
    padding-left: max(var(--s-4), env(safe-area-inset-left));
    padding-right: max(var(--s-4), env(safe-area-inset-right));
    padding-bottom: calc(var(--s-8) + env(safe-area-inset-bottom));
  }

  .page__inner {
    gap: var(--s-4);
  }
}

@media (max-width: 420px) {
  .page {
    padding-left: max(var(--s-3), env(safe-area-inset-left));
    padding-right: max(var(--s-3), env(safe-area-inset-right));
  }
}
</style>
