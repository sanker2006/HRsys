<template>
  <div class="page">
    <EvaluationStickyHeader :title="targetName" @back="router.back()">
      <section v-if="relation" class="score-dock">
        <div>
          <div class="dock-kicker">{{ sceneTitle }} · 综合评价</div>
          <div class="dock-title">{{ targetName }}</div>
          <div class="dock-meta">{{ relation.target_department }} · {{ relation.target_position || roleText(relation.target_level) }}</div>
        </div>
        <div class="dock-score">
          <b>{{ displayTotal }}</b>
          <span>分</span>
        </div>
      </section>
    </EvaluationStickyHeader>

    <PersonalSummaryDownload :relation-id="props.relationId" :summary="personalSummary" />
    <GradePolicyPanel :policy="gradePolicy" />

    <section v-if="questions.length" class="question-group">
      <div class="group-title">综合评价</div>
      <article v-for="q in questions" :key="q.answer_seq" class="question-card">
        <div class="card-head">
          <div class="question-text">{{ q.content }}</div>
          <div class="score-pill">{{ formatNumber(answers[q.answer_seq] ?? 0) }}</div>
        </div>
        <div class="meta-line">
          <span>满分 {{ formatNumber(q.weight) }} 分</span>
        </div>
        <van-slider v-model="answers[q.answer_seq]" :min="0" :max="q.weight" :step="0.1" :disabled="isReadonly" />
      </article>
    </section>

    <van-empty v-if="!loading && !questions.length" description="暂无综合评价题目" />
    <div v-if="isCompleted" class="completed">当前对象已完成提交</div>

    <div class="actions">
      <template v-if="!isCompleted">
        <van-button class="btn secondary" :disabled="isReadonly" :loading="drafting" @click="submit(true)">保存草稿</van-button>
        <van-button class="btn primary" type="primary" :disabled="isReadonly" :loading="submitting" @click="submit(false)">正式提交</van-button>
        <van-button class="btn ghost" :loading="nexting" @click="goNext">下一个人</van-button>
      </template>
      <template v-else>
        <van-button class="btn danger" :loading="revoking" @click="revokeScore">撤销评分</van-button>
        <van-button class="btn primary" type="primary" :loading="nexting" @click="goNext">下一个人</van-button>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { closeToast, showConfirmDialog, showDialog, showLoadingToast, showToast } from 'vant'
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { h5Api } from '../api'
import PersonalSummaryDownload from '../components/PersonalSummaryDownload.vue'
import GradePolicyPanel from '../components/GradePolicyPanel.vue'
import EvaluationStickyHeader from '../components/EvaluationStickyHeader.vue'
import { reportClientPerformance } from '../utils/performance'
import { gradeBlockedMessage, gradeConfirmMessage } from '../utils/gradePreview'
import { evaluationPath, evaluationScene, requiresGradePreview, sceneLabel } from '../utils/relationScene'

const props = defineProps<{ batchId: string; relationId: string }>()
const router = useRouter()
const route = useRoute()

const loading = ref(false)
const relation = ref<any>(null)
const personalSummary = ref<any>(null)
const gradePolicy = ref<any>(null)
const list = ref<any[]>([])
const questions = ref<any[]>([])
const answers = reactive<Record<number, number>>({})
const drafting = ref(false)
const submitting = ref(false)
const nexting = ref(false)
const revoking = ref(false)
const savedSnapshot = ref('')
let listPromise: Promise<void> | null = null

const scene = computed(() => relation.value
  ? evaluationScene(relation.value)
  : route.name === 'UpwardEval' ? 'upward' : 'peer')
const sceneTitle = computed(() => sceneLabel(scene.value))
const targetName = computed(() => relation.value?.target_name || sceneTitle.value)
const isCompleted = computed(() => relation.value?.status === 'completed')
const isReadonly = computed(() => isCompleted.value)
const displayTotal = computed(() => Number(Object.values(answers).reduce((sum, value) => sum + Number(value || 0), 0).toFixed(1)))
const hasDirty = computed(() => snapshotAnswers() !== savedSnapshot.value)

function roleText(role: string) {
  if (role === 'manager') return '部门负责人'
  if (role === 'staff') return '员工'
  return role || '-'
}

function formatNumber(value: number | string | null | undefined) {
  const numberValue = Number(value ?? 0)
  return Number.isFinite(numberValue) ? numberValue.toFixed(1) : '0.0'
}

function snapshotAnswers() {
  return JSON.stringify(Object.keys(answers).sort().map(key => [key, answers[Number(key)]]))
}

function collectAnswers() {
  return questions.value.map(q => ({
    seq: q.answer_seq,
    score: Number(answers[q.answer_seq] ?? 0),
  }))
}

async function loadList() {
  const res: any = await h5Api.getMyRelations(Number(props.batchId))
  list.value = (res.data?.list || []).filter((r: any) => evaluationScene(r) === scene.value)
}

async function ensureList(force = false) {
  if (!force && list.value.length > 0) return
  if (listPromise) {
    if (!force) return listPromise
    try { await listPromise } catch {}
  }
  listPromise = loadList().finally(() => { listPromise = null })
  return listPromise
}

async function loadDetail() {
  loading.value = true
  try {
    const res: any = await h5Api.getRelationDetail(Number(props.relationId))
    const data = res.data || {}
    relation.value = data.relation
    personalSummary.value = data.personal_summary || null
    gradePolicy.value = data.grade_policy || null
    questions.value = data.comprehensive_questions || []
    for (const key of Object.keys(answers)) delete answers[Number(key)]
    for (const q of questions.value) answers[q.answer_seq] = 0
    for (const a of data.answers || []) {
      if (!a.is_total && a.question_seq !== null) answers[a.question_seq] = Number(a.score || 0)
    }
    savedSnapshot.value = snapshotAnswers()
  } finally {
    loading.value = false
  }
}

async function revokeScore() {
  try {
    await showConfirmDialog({ title: '撤销评分', message: '撤销后将退回草稿，可修改后重新提交。', confirmButtonText: '确认撤销', showCancelButton: true })
  } catch { return }
  revoking.value = true
  try {
    await h5Api.revoke(Number(props.relationId))
    showToast('已撤销，评分已退回草稿')
    await Promise.all([ensureList(true), loadDetail()])
  } finally { revoking.value = false }
}

async function submit(draft: boolean) {
  if (drafting.value || submitting.value) return
  if (draft) drafting.value = true
  else submitting.value = true
  try {
    if (!draft) {
      if (requiresGradePreview(relation.value || {})) {
        const previewRes: any = await h5Api.previewSubmit(Number(props.relationId), collectAnswers())
        const preview = previewRes.data
        if (!preview.can_submit) {
          await showDialog({
            title: '当前评分不能提交',
            message: gradeBlockedMessage(preview),
            confirmButtonText: '知道了',
          })
          return
        }
        try {
          await showConfirmDialog({
            title: '确认正式提交',
            message: gradeConfirmMessage(preview),
            confirmButtonText: '确认提交',
            cancelButtonText: '返回检查',
          })
        } catch {
          return
        }
      } else {
        try {
          await showConfirmDialog({
            title: '确认正式提交',
            message: `本次评分合计 ${displayTotal.value.toFixed(1)} 分，正式提交后不能直接修改，请认真确认。`,
            confirmButtonText: '确认提交',
            cancelButtonText: '返回检查',
          })
        } catch {
          return
        }
      }
    }
    showLoadingToast({ message: draft ? '保存中...' : '提交中...', forbidClick: true })
    await h5Api.submitDetail({ relation_id: Number(props.relationId), answers: collectAnswers(), draft })
    closeToast()
    showToast(draft ? '草稿已保存' : '提交成功')
    await Promise.all([ensureList(true), loadDetail()])
  } catch (error: any) {
    if (!draft && requiresGradePreview(relation.value || {}) && error?.response?.status === 409) {
      try {
        const latest: any = await h5Api.previewSubmit(Number(props.relationId), collectAnswers())
        const value = latest.data
        await showDialog({
          title: '档位状态已更新',
          message: `${value.reason || '其他评价已先提交，请按最新档位重新确认。'}\n当前评分属于${value.grade}级。`,
        })
      } catch {}
    }
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
    if (!list.value.length) await ensureList()
    const current = Number(props.relationId)
    const start = list.value.findIndex(item => item.id === current)
    const ordered = [...list.value.slice(start + 1), ...list.value.slice(0, Math.max(0, start + 1))]
    const next = ordered.find(item => item.status !== 'completed')
    if (!next) {
      showToast('没有下一个可评分对象')
      return
    }
    router.replace(evaluationPath(next, props.batchId))
  } finally {
    nexting.value = false
  }
}

async function loadPage() {
  const startedAt = performance.now()
  showLoadingToast({ message: '加载中...', forbidClick: true })
  void ensureList().catch(() => {})
  try {
    await loadDetail()
    reportClientPerformance({
      kind: 'view',
      name: '/peer-eval/detail-ready',
      duration_ms: performance.now() - startedAt,
    })
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
  padding-bottom: calc(108px + env(safe-area-inset-bottom, 0px));
}
.score-dock {
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
.danger { color: #9f1239 !important; border: 1px solid #d59aaa !important; background: #fff1f2 !important; }
</style>
