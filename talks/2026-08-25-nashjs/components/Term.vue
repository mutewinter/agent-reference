<script setup lang="ts">
defineProps<{ title?: string }>()
</script>

<template>
  <div class="term">
    <div class="term-bar">
      <span class="term-dot" />
      <span class="term-dot" />
      <span class="term-dot" />
      <span class="term-name">{{ title ?? "zsh" }}</span>
    </div>
    <div class="term-body">
      <slot />
    </div>
  </div>
</template>

<style scoped>
.term {
  border-radius: 10px;
  overflow: hidden;
  background: #0d0d0d;
  box-shadow: 0 24px 48px -12px rgb(0 0 0 / 0.45);
}

.term-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  background: #1c1c1c;
  border-bottom: 1px solid #2a2a2a;
}

.term-dot {
  width: 11px;
  height: 11px;
  border-radius: 50%;
  background: #3a3a3a;
}

.term-name {
  margin-left: 8px;
  font-family: "JetBrains Mono", "SF Mono", Monaco, monospace;
  font-size: 13px;
  color: #8a8a8a;
}

.term-body :deep(.slidev-code) {
  background: transparent !important;
  margin: 0;
}
</style>
