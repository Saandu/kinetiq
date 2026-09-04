<script setup lang="ts">
defineProps<{ label?: string; disabled?: boolean }>()
const model = defineModel<boolean>({ default: false })
</script>

<template>
  <button
    type="button"
    role="switch"
    :aria-checked="model"
    :aria-label="label"
    :disabled="disabled"
    class="switch"
    :class="{ 'switch--on': model }"
    @click="model = !model"
  >
    <span class="switch__thumb" />
  </button>
</template>

<style scoped>
.switch {
  position: relative;
  flex: none;
  width: 40px;
  height: 23px;
  padding: 2px;
  background: var(--border-strong);
  border-radius: var(--r-full);
  transition: background-color var(--dur) var(--ease);
}

/*
 * The track is 40x23 by design -- a 44px-tall pill would look clumsy. Instead
 * the *hit area* is extended past the visual with a transparent overlay, so
 * the target is thumb-sized without the control growing.
 */
.switch::after {
  content: '';
  position: absolute;
  left: 50%;
  top: 50%;
  width: 100%;
  height: 100%;
  min-width: 44px;
  min-height: 44px;
  transform: translate(-50%, -50%);
}

.switch--on {
  background: var(--accent);
}

.switch:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.switch__thumb {
  display: block;
  width: 19px;
  height: 19px;
  background: #fff;
  border-radius: var(--r-full);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.25);
  transform: translateX(0);
  transition: transform var(--dur) var(--ease-out);
}

.switch--on .switch__thumb {
  transform: translateX(17px);
}
</style>
