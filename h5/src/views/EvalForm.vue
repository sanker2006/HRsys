<template>
  <div class="page">
    <van-nav-bar :title="targetName" left-arrow @click-left="router.back()" class="nav" />

    <van-notice-bar v-if="blockedReason && !isCompleted" color="#8a5a00" background="#fff7e0">
      {{ blockedReason }}
    </van-notice-bar>

    <section class="score-dock">
      <div>
        <div class="dock-kicker">{{ relationLabel }}</div>
        <div class="dock-title">{{ targetName }}</div>
      </div>
      <div class="dock-score">
        <b>{{ displayTotal }}</b>
        <span>分</span>
      </div>
    </section>

    <section v-if="mode === 'leader_staff_total'" class="question-card total-card">
      <div class="card-head">
        <div>
          <div class="card-kicker">领导综合评分</div>
          <div class="question-text">只需输入综合评价总分，满分 30 分。</div>
        </div>
        <div class="score-pill">{{ totalScore.toFixed(1) }}</div>
      </div>
      <van-slider v-model="totalScore" :min="0" :max="30" :step="0.1" :disabled="isReadonly" />
    </section>

    <template v-else>
      <section v-if="performanceQuestions.length" class="question-group">
        <div class="group-title">业绩评价</div>
        <article v-for="q in performanceQuestions" :key="q.answer_seq" class="question-card">
          <div class="card-head">
            <div class="question-text">{{ q.content }}</div>
            <div class="score-pill">{{ formatNumber(answers[q.answer_seq] ?? 0) }}</div>
          </div>
          <div class="meta-line">
            <span>满分 {{ formatNumber(q.weight) }} 分</span>
            <span v-if="q.self_score !== null && q.self_score !== undefined">自评 {{ formatNumber(q.self_score) }} 分</span>
            <span v-if="q.manager_score !== null && q.manager_score !== undefined">主管 {{ formatNumber(q.manager_score) }} 分</span>
          </div>
          <van-slider v-model="answers[q.answer_seq]" :min="0" :max="q.weight" :step="0.1" :disabled="isReadonly" />
        </article>
      </section>

      <section v-if="comprehensiveQuestions.length" class="question-group">
        <div class="group-title">综合评价</div>
        <article v-for="q in comprehensiveQuestions" :key="q.answer_seq" class="question-card">
          <div class="card-head">
            <div class="question-text">{{ q.content }}</div>
            <div class="score-pill">{{ formatNumber(answers[q.answer_seq] ?? 0) }}</div>
          </div>
          <div class="meta-line">
            <span>满分 {{ formatNumber(q.weight) }} 分</span>
            <span v-if="q.self_score !== null && q.self_score !== undefined">自评 {{ formatNumber(q.self_score) }} 分</span>
            <span v-if="q.manager_score !== null && q.manager_score !== undefined">主管 {{ formatNumber(q.manager_score) }} 分</span>
          </div>
          <van-slider v-model="answers[q.answer_seq]" :min="0" :max="q.weight" :step="0.1" :disabled="isReadonly" />
        </article>
      </section>
    </template>

    <div v-if="isCompleted" class="completed">当前评价已完成提交</div>

    <div v-if="!isCompleted" class="actions">
      <van-button class="btn secondary" :disabled="isReadonly" :loading="drafting" @click="submit(true)">保存草稿</van-button>
      <van-button class="btn primary" type="primary" :disabled="!!blockedReason" :loading="submitting" @click="confirmSubmit = true">
        正式提交
      </van-button>
    </div>

    <van-dialog
      v-model:show="confirmSubmit"
      title="确认提交"
      :message="`本次评分合计 ${displayTotal} 分，提交后将标记为已完成。`"
      show-cancel-button
      confirm-button-text="确认提交"
      cancel-button-text="取消"
      @confirm="submit(false)"
    />
  </div>
</template>

<script setup lang="ts">
import { closeToast, showLoadingToast, showToast } from 'vant'
import { computed, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { h5Api } from '../api'

const props = defineProps<{ relationId: string }>()
const router = useRouter()

const relation = ref<any>(null)
const mode = ref('detail')
const blockedReason = ref('')
const performanceQuestions = ref<any[]>([])
const comprehensiveQuestions = ref<any[]>([])
const answers = reactive<Record<number, number>>({})
const totalScore = ref(0)
const drafting = ref(false)
const submitting = ref(false)
const confirmSubmit = ref(false)

const targetName = computed(() => relation.value?.target_name || '评价')
const isCompleted = computed(() => relation.value?.status === 'completed')
const isReadonly = computed(() => isCompleted.value || !!blockedReason.value)
const relationLabel = computed(() => {
  if (relation.value?.eval_type === 'self') return '自我评价'
  if (relation.value?.eval_type === 'peer') return '同级互评'
  return '向下评价'
})
const detailedTotal = computed(() => Object.values(answers).reduce((sum, value) => sum + Number(value || 0), 0))
const displayTotal = computed(() => Number((mode.value === 'leader_staff_total' ? totalScore.value : detailedTotal.value).toFixed(1)))

function collectAnswers() {
  return [...performanceQuestions.value, ...comprehensiveQuestions.value].map((q: any) => ({
    seq: q.answer_seq,
    score: Number(answers[q.answer_seq] ?? 0),
  }))
}

function formatNumber(value: number | string | null | undefined) {
  const numberValue = Number(value ?? 0)
  return Number.isFinite(numberValue) ? numberValue.toFixed(1) : '0.0'
}

async function submit(draft: boolean) {
  if (drafting.value || submitting.value) return
  if (blockedReason.value) {
    showToast(blockedReason.value)
    return
  }
  if (draft) drafting.value = true
  else submitting.value = true
  try {
    if (!draft && mode.value !== 'leader_staff_total') {
      const missing = collectAnswers().filter(a => answers[a.seq] === undefined)
      if (missing.length) {
        showToast(`还有 ${missing.length} 道题未评分`)
        return
      }
    }
    showLoadingToast({ message: draft ? '保存中...' : '提交中...', forbidClick: true })
    if (mode.value === 'leader_staff_total') {
      await h5Api.submitTotal({ relation_id: Number(props.relationId), score: totalScore.value, draft })
    } else if (relation.value?.eval_type === 'self') {
      await h5Api.submitSelf({ relation_id: Number(props.relationId), answers: collectAnswers(), draft })
    } else {
      await h5Api.submitDetail({ relation_id: Number(props.relationId), answers: collectAnswers(), draft })
    }
    closeToast()
    showToast(draft ? '草稿已保存' : '提交成功')
    if (!draft) router.back()
  } finally {
    drafting.value = false
    submitting.value = false
  }
}

onMounted(async () => {
  showLoadingToast({ message: '加载中...', forbidClick: true })
  try {
    const res: any = await h5Api.getRelationDetail(Number(props.relationId))
    const data = res.data || {}
    relation.value = data.relation
    mode.value = data.mode || 'detail'
    blockedReason.value = data.can_submit === false ? data.blocked_reason || '当前暂不能提交' : ''
    performanceQuestions.value = data.performance_questions || []
    comprehensiveQuestions.value = data.comprehensive_questions || []
    for (const a of data.answers || []) {
      if (a.is_total) totalScore.value = Number(a.score || 0)
      else if (a.question_seq !== null) answers[a.question_seq] = Number(a.score || 0)
    }
  } finally {
    closeToast()
  }
})
</script>

<style scoped>
.page {
  min-height: 100dvh;
  background: var(--hr-bg);
  padding-top: 150px;
  padding-bottom: calc(104px + env(safe-area-inset-bottom, 0px));
}
.nav {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 60;
  height: 46px;
  background: #fff;
}
.score-dock {
  position: fixed;
  top: 46px;
  left: 0;
  right: 0;
  z-index: 55;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  padding: 14px 16px 16px;
  color: #fff;
  background: linear-gradient(145deg, #0f3b5f 0%, #0369a1 100%);
  box-shadow: 0 10px 26px rgba(15, 23, 42, .14);
}
.dock-kicker { font-size: 12px; color: rgba(255,255,255,.72); }
.dock-title { margin-top: 3px; font-size: 18px; line-height: 1.25; font-weight: 900; }
.dock-score { flex: 0 0 auto; display: flex; align-items: baseline; gap: 3px; }
.dock-score b { font-size: 36px; line-height: 1; font-weight: 900; font-variant-numeric: tabular-nums; }
.dock-score span { font-size: 13px; color: rgba(255,255,255,.78); }
.question-group { margin: 16px; }
.group-title { margin: 18px 2px 10px; font-size: 17px; color: var(--hr-text); font-weight: 900; }
.question-card {
  margin-bottom: 12px;
  padding: 18px;
  border-radius: 14px;
  background: var(--hr-surface);
  border: 1px solid rgba(226,232,240,.95);
  box-shadow: var(--hr-shadow-soft);
}
.total-card { margin: 16px; }
.card-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; margin-bottom: 14px; }
.card-kicker { color: var(--hr-muted); font-size: 12px; font-weight: 800; margin-bottom: 6px; }
.question-text { flex: 1; min-width: 0; font-size: 16px; line-height: 1.58; color: var(--hr-text); font-weight: 700; }
.score-pill {
  min-width: 58px;
  padding: 7px 10px;
  border-radius: 12px;
  text-align: center;
  color: var(--hr-accent-strong);
  background: var(--hr-primary-soft);
  font-size: 19px;
  font-weight: 900;
  font-variant-numeric: tabular-nums;
}
.meta-line { display: flex; flex-wrap: wrap; gap: 8px; margin: 0 0 18px; }
.meta-line span { padding: 6px 10px; border-radius: 999px; background: #f1f5f9; color: var(--hr-muted); font-size: 12px; font-weight: 700; }
.completed { margin: 16px; padding: 13px; border-radius: 12px; text-align: center; color: var(--hr-success); background: #e8f8ef; font-weight: 900; border: 1px solid #bbf7d0; }
.actions {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 40;
  display: flex;
  gap: 12px;
  padding: 14px 16px calc(14px + env(safe-area-inset-bottom, 0px));
  background: rgba(255,255,255,.98);
  backdrop-filter: blur(12px);
  border-top: 1px solid var(--hr-border);
  box-shadow: 0 -8px 24px rgba(15,23,42,.10);
}
.btn { flex: 1; height: 52px; border-radius: 12px; font-size: 15px; font-weight: 900; }
.secondary { color: var(--hr-accent-strong) !important; border: 1px solid #7dd3fc !important; background: #e0f2fe !important; }
.primary { color: #fff !important; background: #0369a1 !important; border: 1px solid #0369a1 !important; box-shadow: 0 10px 22px rgba(3,105,161,.28); }
</style>
