<template>
  <section v-if="policy" class="policy-panel">
    <div class="policy-head">
      <strong>ABCDE分档</strong>
      <span>{{ policy.completed }}/{{ policy.group_size }} 已提交</span>
    </div>
    <div class="grade-grid">
      <div v-for="grade in GRADES" :key="grade" class="grade-item" :class="grade.toLowerCase()">
        <span>{{ grade }}级</span>
        <small>{{ policy.ranges?.[grade]?.label || '-' }}</small>
        <b>{{ policy.counts?.[grade] || 0 }} 人</b>
        <em class="rule">{{ gradeRuleText(policy, grade) }}</em>
        <em>{{ gradeProgressText(policy, grade) }}</em>
      </div>
    </div>
    <p v-if="explanation" class="policy-note">{{ explanation }}</p>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import {
  GRADES,
  gradePolicyExplanation,
  gradeProgressText,
  gradeRuleText,
} from '../utils/gradePolicyDisplay'

const props = defineProps<{ policy: any }>()
const explanation = computed(() => gradePolicyExplanation(props.policy))
</script>

<style scoped>
.policy-panel { margin: 14px 16px; padding: 14px; border: 1px solid #aebfd0; border-radius: 8px; background: var(--hr-surface-raised); box-shadow: var(--hr-shadow-soft); }
.policy-head { display: flex; justify-content: space-between; gap: 12px; align-items: center; }
.policy-head span { color: var(--hr-muted); font-size: 12px; }
.grade-grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 6px; margin-top: 10px; }
.grade-item { min-width: 0; padding: 8px 3px; border: 1px solid var(--hr-border); text-align: center; background: #f6f9fc; }
.grade-item span, .grade-item small, .grade-item b, .grade-item em { display: block; }
.grade-item span { font-size: 11px; font-weight: 800; }
.grade-item small { min-height: 28px; margin-top: 3px; color: var(--hr-muted); font-size: 9px; line-height: 1.35; }
.grade-item b { margin-top: 3px; font-size: 14px; }
.grade-item em { min-height: 13px; margin-top: 2px; color: var(--hr-muted); font-size: 9px; font-style: normal; line-height: 1.35; }
.grade-item em.rule { color: var(--hr-text); font-weight: 700; }
.grade-item.a { border-color: #80bca0; background: #e5f3ec; }.grade-item.b { border-color: #78a9cb; background: #e5f0f7; }
.grade-item.c { border-color: #d0ad67; background: #f6edd8; }.grade-item.d { border-color: #ca916b; background: #f4e6dc; }.grade-item.e { border-color: #bb7d7d; background: #f4e1e1; }
.policy-note { margin: 8px 0 0; color: var(--hr-muted); font-size: 11px; line-height: 1.5; }
</style>
