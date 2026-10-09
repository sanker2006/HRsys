<template>
  <label class="score-input" :class="{ disabled, editing }">
    <span class="input-heading">
      <span class="input-label">本题评分</span>
      <span class="max-score">满分 {{ formatMax }} 分</span>
    </span>
    <span class="input-shell">
      <van-icon v-if="!disabled" name="edit" class="edit-icon" aria-hidden="true" />
      <span v-if="!disabled" class="input-prompt">点击输入</span>
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
  display: block;
  padding: 12px;
  border: 2px solid #7ea9c4;
  border-radius: 12px;
  background: #eaf4fa;
  cursor: text;
  transition: border-color .16s ease, box-shadow .16s ease, background .16s ease, transform .16s ease;
}
.score-input:focus-within {
  border-color: #007da5;
  background: #f2f9fc;
  box-shadow: 0 0 0 4px rgba(0, 125, 165, .16);
}
.input-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 9px;
}
.input-label {
  color: var(--hr-text);
  font-size: 14px;
  font-weight: 900;
}
.input-shell {
  display: flex;
  align-items: center;
  min-width: 0;
  min-height: 52px;
  padding: 0 13px;
  border: 2px solid var(--hr-accent);
  border-radius: 10px;
  background: #fff;
  box-shadow: inset 0 1px 2px rgba(8, 31, 49, .08);
  transition: border-color .16s ease, box-shadow .16s ease;
}
.editing .input-shell {
  border-color: #007da5;
  box-shadow: inset 0 1px 2px rgba(8, 31, 49, .06), 0 0 0 3px rgba(0, 125, 165, .12);
}
.edit-icon {
  flex: 0 0 auto;
  margin-right: 7px;
  color: var(--hr-accent-strong);
  font-size: 20px;
}
.input-prompt {
  flex: 0 0 auto;
  color: var(--hr-accent-strong);
  font-size: 13px;
  font-weight: 900;
}
input {
  flex: 1;
  width: 0;
  min-width: 0;
  padding: 0 8px;
  border: 0;
  outline: 0;
  color: var(--hr-accent-strong);
  background: transparent;
  caret-color: #007da5;
  font: 900 28px/1.2 "DIN Alternate", "Arial Narrow", sans-serif;
  font-variant-numeric: tabular-nums;
  text-align: right;
}
.unit {
  flex: 0 0 auto;
  color: var(--hr-text);
  font-size: 14px;
  font-weight: 900;
}
.max-score {
  color: var(--hr-muted);
  font-size: 12px;
  font-weight: 800;
  white-space: nowrap;
}
.disabled {
  opacity: .72;
  background: var(--hr-surface-strong);
  cursor: default;
}
.disabled .input-shell { border-color: var(--hr-border-strong); background: var(--hr-surface-raised); }
@media (max-width: 360px) {
  .score-input { padding: 10px; }
  .input-shell { padding: 0 10px; }
  .input-prompt { font-size: 12px; }
  input { padding: 0 6px; font-size: 26px; }
}
</style>
