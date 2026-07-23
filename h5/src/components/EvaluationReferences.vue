<template>
  <section v-if="visibleReferences.length" class="reference-panel">
    <div class="reference-title">参考评分</div>
    <div class="reference-grid">
      <div v-for="item in visibleReferences" :key="item.source_relation_id" class="reference-item">
        <span>{{ item.label }}</span>
        <b>{{ item.total === null || item.total === undefined ? '-' : Number(item.total).toFixed(1) }}</b>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{ references: any[] }>()
const visibleReferences = computed(() => (props.references || []).filter(item => item.total !== null && item.total !== undefined))
</script>

<style scoped>
.reference-panel {
  margin: 12px 16px 0;
  padding: 14px;
  border: 1px solid var(--hr-border);
  border-radius: 8px;
  background: var(--hr-surface-raised);
}

.reference-title { margin-bottom: 10px; color: var(--hr-text); font-size: 14px; font-weight: 900; }
.reference-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(92px, 1fr)); gap: 8px; }
.reference-item { padding: 10px; border: 1px solid var(--hr-border); background: var(--hr-surface-strong); }
.reference-item span { display: block; color: var(--hr-muted); font-size: 11px; }
.reference-item b { display: block; margin-top: 4px; color: var(--hr-text); font-size: 20px; font-variant-numeric: tabular-nums; }
</style>
