<template>
  <label class="score-input" :class="{ disabled }">
    <span class="input-label">输入分数</span>
    <span class="input-shell">
      <input
        ref="inputRef"
        :value="text"
        type="text"
        inputmode="decimal"
        enterkeyhint="done"
        autocomplete="off"
        :disabled="disabled"
        :aria-label="`输入分数，满分${formatMax}分`"
        @focus="handleFocus"
        @input="handleInput"
        @blur="commit"
        @keydown.enter="commitAndBlur"
      />
      <span class="unit">分</span>
    </span>
    <span class="max-score">满分 {{ formatMax }}</span>
  </label>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { clampScore, formatScoreInput, sanitizeScoreInput } from '../utils/scoreInput'

const props = withDefaults(defineProps<{
  modelValue?: number
  max: number
  disabled?: boolean
}>(), {
  modelValue: 0,
  disabled: false,
})

const emit = defineEmits<{ 'update:modelValue': [value: number] }>()
const inputRef = ref<HTMLInputElement | null>(null)
const editing = ref(false)
const text = ref(formatScoreInput(Number(props.modelValue || 0), Number(props.max)))
const formatMax = computed(() => Number(props.max || 0).toFixed(1))

watch(() => [props.modelValue, props.max] as const, ([value, max]) => {
  if (!editing.value) text.value = formatScoreInput(Number(value || 0), Number(max))
})

function handleFocus(event: FocusEvent) {
  editing.value = true
  const input = event.target as HTMLInputElement
  requestAnimationFrame(() => input.select())
}

function handleInput(event: Event) {
  const input = event.target as HTMLInputElement
  const normalized = sanitizeScoreInput(input.value, Number(props.max))
  text.value = normalized.text
  input.value = normalized.text
  emit('update:modelValue', normalized.value)
}

function commit() {
  editing.value = false
  const value = clampScore(Number(text.value || 0), Number(props.max))
  text.value = formatScoreInput(value, Number(props.max))
  emit('update:modelValue', value)
}

function commitAndBlur() {
  commit()
  inputRef.value?.blur()
}
</script>

<style scoped>
.score-input {
  display: grid;
  grid-template-columns: auto minmax(112px, 150px) 1fr;
  align-items: center;
  gap: 10px;
  min-height: 54px;
  padding: 8px 10px 8px 12px;
  border: 1px solid #9fb8ca;
  border-radius: 12px;
  background: #e7f0f6;
  transition: border-color .16s ease, box-shadow .16s ease, background .16s ease;
}
.score-input:focus-within {
  border-color: var(--hr-accent);
  background: #f4f9fc;
  box-shadow: 0 0 0 3px rgba(3, 100, 134, .14);
}
.input-label {
  color: var(--hr-text);
  font-size: 13px;
  font-weight: 800;
}
.input-shell {
  display: flex;
  align-items: baseline;
  min-width: 0;
  padding: 4px 9px;
  border-bottom: 2px solid var(--hr-accent);
}
input {
  width: 100%;
  min-width: 0;
  padding: 0;
  border: 0;
  outline: 0;
  color: var(--hr-accent-strong);
  background: transparent;
  font: 900 24px/1.2 "DIN Alternate", "Arial Narrow", sans-serif;
  font-variant-numeric: tabular-nums;
  text-align: right;
}
.unit {
  margin-left: 4px;
  color: var(--hr-muted);
  font-size: 12px;
  font-weight: 800;
}
.max-score {
  color: var(--hr-muted);
  font-size: 12px;
  font-weight: 700;
  white-space: nowrap;
}
.disabled {
  opacity: .72;
  background: var(--hr-surface-strong);
}
.disabled .input-shell { border-bottom-color: var(--hr-border-strong); }
@media (max-width: 360px) {
  .score-input { grid-template-columns: auto minmax(96px, 1fr); }
  .max-score { grid-column: 1 / -1; justify-self: end; }
}
</style>
