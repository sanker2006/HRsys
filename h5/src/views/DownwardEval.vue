<template>
  <div class="page">
    <van-nav-bar :title="targetName" left-arrow @click-left="router.back()" class="nav" />

    <section v-if="relation" class="score-dock">
      <div>
        <div class="dock-kicker">向下评价</div>
        <div class="dock-title">{{ targetName }}</div>
        <div class="dock-meta">{{ relation.target_department }} · {{ relation.target_position || roleText(relation.target_level) }}</div>
      </div>
      <div class="dock-score">
        <b>{{ displayTotal }}</b>
        <span>分</span>
      </div>
    </section>

    <section v-if="quota" class="quota-note">
      <div class="quota-title">当前部门分档</div>
      <div class="quota-grid">
        <div>
          <span>81-100</span>
          <b>{{ quota.high }}/{{ quota.highMax }}</b>
          <em>剩 {{ quota.highRemain }}</em>
        </div>
        <div>
          <span>71-80</span>
          <b>{{ quota.mid }}/{{ quota.midMax }}</b>
          <em>剩 {{ quota.midRemain }}</em>
        </div>
        <div>
          <span>0-70</span>
          <b>{{ quota.low }}</b>
          <em>还需 {{ quota.lowNeed }}</em>
        </div>
      </div>
    </section>

    <van-notice-bar v-if="blockedReason && !isCompleted" color="#7c4a03" background="#f5e4bd">
      {{ blockedReason }}
    </van-notice-bar>

    <section v-if="relation" class="person-card">
      <div class="person-line">
        <div class="avatar">{{ targetName.charAt(0) }}</div>
        <div class="person-main">
          <div class="person-name">{{ targetName }}</div>
          <div class="person-meta">员工自评 {{ formatScore(selfTotal) }}</div>
        </div>
        <span class="status" :class="relation.status">{{ statusText(relation.status) }}</span>
      </div>
    </section>

    <section v-if="performanceQuestions.length" class="question-group">
      <div class="group-title">业绩评价</div>
      <article v-for="q in performanceQuestions" :key="q.answer_seq" class="question-card">
        <div class="card-head">
          <div class="question-text">{{ q.content }}</div>
          <div class="score-pill">{{ formatNumber(answers[q.answer_seq] ?? 0) }}</div>
        </div>
        <div class="meta-line">
          <span>满分 {{ formatNumber(q.weight) }} 分</span>
          <span v-if="q.self_score !== null && q.self_score !== undefined">员工自评 {{ formatNumber(q.self_score) }} 分</span>
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
          <span v-if="q.self_score !== null && q.self_score !== undefined">员工自评 {{ formatNumber(q.self_score) }} 分</span>
        </div>
        <van-slider v-model="answers[q.answer_seq]" :min="0" :max="q.weight" :step="0.1" :disabled="isReadonly" />
      </article>
    </section>

    <div v-if="isCompleted" class="completed">当前对象已完成提交</div>

    <div class="actions">
      <template v-if="!isCompleted">
        <van-button class="btn secondary" :disabled="isReadonly" :loading="drafting" @click="submit(true)">保存草稿</van-button>
        <van-button class="btn primary" type="primary" :disabled="isReadonly" :loading="submitting" @click="submit(false)">正式提交</van-button>
        <van-button class="btn ghost" :loading="nexting" @click="goNext">下一个人</van-button>
      </template>
      <template v-else>
        <van-button class="btn secondary" @click="router.back()">返回目录</van-button>
        <van-button class="btn primary" type="primary" :loading="nexting" @click="goNext">下一个人</van-button>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { closeToast, showConfirmDialog, showLoadingToast, showToast } from 'vant'
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { h5Api } from '../api'

const props = defineProps<{ batchId: string; relationId: string }>()
const router = useRouter()

const relation = ref<any>(null)
const quota = ref<any>(null)
const list = ref<any[]>([])
const performanceQuestions = ref<any[]>([])
const comprehensiveQuestions = ref<any[]>([])
const answers = reactive<Record<number, number>>({})
const blockedReason = ref('')
const selfTotal = ref<number | null>(null)
const drafting = ref(false)
const submitting = ref(false)
const nexting = ref(false)
const savedSnapshot = ref('')

const targetName = computed(() => relation.value?.target_name || '向下评价')
const isCompleted = computed(() => relation.value?.status === 'completed')
const isReadonly = computed(() => isCompleted.value || !!blockedReason.value)
const displayTotal = computed(() => Number(Object.values(answers).reduce((sum, value) => sum + Number(value || 0), 0).toFixed(1)))
const hasDirty = computed(() => snapshotAnswers() !== savedSnapshot.value)

function roleText(role: string) {
  if (role === 'manager') return '部门负责人'
  if (role === 'staff') return '员工'
  return role || '-'
}

function statusText(status: string) {
  if (status === 'completed') return '已完成'
  if (status === 'draft') return '草稿'
  return '待评'
}

function formatScore(score: number | null | undefined) {
  return score === null || score === undefined ? '-' : `${Number(score).toFixed(1)} 分`
}

function formatNumber(value: number | string | null | undefined) {
  const numberValue = Number(value ?? 0)
  return Number.isFinite(numberValue) ? numberValue.toFixed(1) : '0.0'
}

function snapshotAnswers() {
  return JSON.stringify(Object.keys(answers).sort().map(key => [key, answers[Number(key)]]))
}

function collectAnswers() {
  return [...performanceQuestions.value, ...comprehensiveQuestions.value].map(q => ({
    seq: q.answer_seq,
    score: Number(answers[q.answer_seq] ?? 0),
  }))
}

async function loadOverview() {
  const res: any = await h5Api.getDownwardOverview(Number(props.batchId))
  quota.value = res.data?.quota || null
  list.value = res.data?.list || []
}

async function loadDetail() {
  const res: any = await h5Api.getRelationDetail(Number(props.relationId))
  const data = res.data || {}
  relation.value = data.relation
  blockedReason.value = data.can_submit === false ? data.blocked_reason || '当前暂不能提交' : ''
  selfTotal.value = data.self_total ?? null
  performanceQuestions.value = data.performance_questions || []
  comprehensiveQuestions.value = data.comprehensive_questions || []
  const questions = [...performanceQuestions.value, ...comprehensiveQuestions.value]
  for (const key of Object.keys(answers)) delete answers[Number(key)]
  for (const q of questions) answers[q.answer_seq] = 0
  for (const a of data.answers || []) {
    if (!a.is_total && a.question_seq !== null) answers[a.question_seq] = Number(a.score || 0)
  }
  savedSnapshot.value = snapshotAnswers()
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
    showLoadingToast({ message: draft ? '保存中...' : '提交中...', forbidClick: true })
    await h5Api.submitDetail({ relation_id: Number(props.relationId), answers: collectAnswers(), draft })
    closeToast()
    showToast(draft ? '草稿已保存' : '提交成功')
    await loadOverview()
    await loadDetail()
  } finally {
    drafting.value = false
    submitting.value = false
  }
}

async function goNext() {
  if (hasDirty.value && !isReadonly.value) {
    try {
      await showConfirmDialog({
        title: '存在未保存评分',
        message: '请先保存草稿或正式提交，再切换到下一个人。',
        confirmButtonText: '知道了',
        showCancelButton: false,
      })
    } catch {}
    return
  }
  nexting.value = true
  try {
    if (list.value.length === 0) await loadOverview()
    const current = Number(props.relationId)
    const start = list.value.findIndex(item => item.id === current)
    const ordered = [...list.value.slice(start + 1), ...list.value.slice(0, Math.max(0, start + 1))]
    const next = ordered.find(item => item.status !== 'completed' && item.can_submit)
    if (!next) {
      showToast('没有下一个可评分对象')
      return
    }
    router.replace(`/downward-eval/${props.batchId}/${next.id}`)
  } finally {
    nexting.value = false
  }
}

async function loadPage() {
  showLoadingToast({ message: '加载中...', forbidClick: true })
  try {
    await Promise.all([loadOverview(), loadDetail()])
  } finally {
    closeToast()
  }
}

onMounted(loadPage)
watch(() => props.relationId, loadPage)
</script>

<style scoped>
.page {
  min-height: 100dvh;
  background:
    radial-gradient(circle at 100% 12%, rgba(3, 100, 134, .10), transparent 34%),
    var(--hr-bg);
  padding-top: 150px;
  padding-bottom: calc(108px + env(safe-area-inset-bottom, 0px));
}
.nav {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 60;
  height: 46px;
  background: #f6f9fc;
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
.dock-meta { margin-top: 3px; color: rgba(255,255,255,.70); font-size: 12px; }
.dock-score { flex: 0 0 auto; display: flex; align-items: baseline; gap: 3px; }
.dock-score b { font-size: 36px; line-height: 1; font-weight: 900; font-variant-numeric: tabular-nums; }
.dock-score span { font-size: 13px; color: rgba(255,255,255,.78); }
.quota-note, .person-card {
  margin: 14px 16px;
  padding: 14px;
  border-radius: 14px;
  background: linear-gradient(180deg, var(--hr-surface-raised), var(--hr-surface));
  border: 1px solid var(--hr-border-strong);
  box-shadow: var(--hr-shadow-soft);
}
.quota-title { font-size: 14px; font-weight: 900; color: var(--hr-text); margin-bottom: 10px; }
.quota-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
.quota-grid div { border-radius: 12px; background: var(--hr-surface-strong); padding: 10px; border: 1px solid rgba(201,215,229,.9); }
.quota-grid span, .quota-grid em { display: block; font-size: 11px; color: var(--hr-muted); font-style: normal; }
.quota-grid b { display: block; margin: 4px 0 2px; font-size: 18px; color: var(--hr-text); font-variant-numeric: tabular-nums; }
.person-line { display: flex; align-items: center; gap: 12px; }
.avatar {
  width: 48px;
  height: 48px;
  border-radius: 14px;
  background: var(--hr-primary-soft);
  color: var(--hr-accent-strong);
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 900;
  font-size: 19px;
}
.person-main { flex: 1; min-width: 0; }
.person-name { font-size: 18px; font-weight: 900; color: var(--hr-text); }
.person-meta { margin-top: 5px; font-size: 13px; color: var(--hr-muted); }
.status { font-size: 12px; padding: 4px 9px; border-radius: 999px; white-space: nowrap; font-weight: 800; }
.status.completed { color: var(--hr-success); background: #d9f0e4; }
.status.draft { color: var(--hr-accent-strong); background: var(--hr-primary-soft); }
.status.pending { color: #8a4d00; background: #f5e4bd; }
.question-group { margin: 16px; }
.group-title { margin: 18px 2px 10px; font-size: 17px; color: var(--hr-text); font-weight: 900; }
.question-card {
  position: relative;
  margin-bottom: 12px;
  padding: 18px;
  border-radius: 14px;
  background: var(--hr-surface-raised);
  border: 1px solid #aebfd0;
  box-shadow: 0 9px 22px rgba(8, 31, 49, .12);
  overflow: hidden;
}
.question-card::before {
  content: "";
  position: absolute;
  inset: 0 auto 0 0;
  width: 4px;
  background: linear-gradient(180deg, #036486, #67e8f9);
}
.card-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; margin-bottom: 14px; }
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
.meta-line span { padding: 6px 10px; border-radius: 999px; background: var(--hr-surface-strong); color: var(--hr-muted); font-size: 12px; font-weight: 700; border: 1px solid rgba(201, 215, 229, .70); }
.completed { margin: 16px; padding: 13px; border-radius: 12px; text-align: center; color: var(--hr-success); background: #d9f0e4; font-weight: 900; border: 1px solid #a7dfbf; }
.actions {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 40;
  display: flex;
  gap: 10px;
  padding: 14px 16px calc(14px + env(safe-area-inset-bottom, 0px));
  background: rgba(237,244,249,.96);
  backdrop-filter: blur(12px);
  border-top: 1px solid var(--hr-border);
  box-shadow: 0 -8px 24px rgba(15,23,42,.10);
}
.btn { flex: 1; height: 52px; border-radius: 12px; font-size: 15px; font-weight: 900; }
.secondary { color: var(--hr-accent-strong) !important; border: 1px solid #8eb9d4 !important; background: #dbeafe !important; }
.ghost { color: var(--hr-text) !important; border: 1px solid #b8c9da !important; background: var(--hr-surface-strong) !important; }
.primary { color: #fff !important; background: #036486 !important; border: 1px solid #036486 !important; box-shadow: 0 10px 22px rgba(3,100,134,.30); }
</style>
