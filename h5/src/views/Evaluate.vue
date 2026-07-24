<template>
  <div class="evaluate-page">
    <van-nav-bar :title="batch?.name || '评价任务'" left-arrow @click-left="router.back()" class="nav-bar" />

    <section class="task-hero">
      <div>
        <span>本批次进度</span>
        <strong>{{ totalCompleted }}/{{ relations.length }}</strong>
      </div>
      <div class="hero-progress">
        <div :style="{ width: `${relations.length ? Math.round((totalCompleted / relations.length) * 100) : 0}%` }" />
      </div>
    </section>

    <van-pull-refresh v-model="refreshing" @refresh="loadRelations" class="content">
      <section v-for="type in visibleTypes" :key="type" class="task-section">
        <div class="section-head">
          <div>
            <strong>{{ typeLabel[type] }}</strong>
            <span>{{ typeHelp[type] }}</span>
          </div>
          <b>{{ completedCount(grouped[type]) }}/{{ grouped[type].length }}</b>
        </div>

        <button v-if="type !== 'self'" class="task-card" type="button" :aria-label="`进入${typeLabel[type]}`" @click="goBatch(type)">
          <div class="task-icon" :class="type">{{ typeIcon[type] }}</div>
          <div class="task-main">
            <div class="task-title">{{ typeLabel[type] }}</div>
            <div class="task-meta">需评价 {{ grouped[type].length }} 人，已完成 {{ completedCount(grouped[type]) }} 人</div>
            <div class="mini-track"><div :style="{ width: progressPercent(grouped[type]) + '%' }" /></div>
          </div>
          <span class="state-pill" :class="groupStatusClass(grouped[type])">{{ groupStatusText(grouped[type]) }}</span>
        </button>

        <div v-else class="self-list">
          <button v-for="r in grouped[type]" :key="r.id" class="self-row" type="button" :aria-label="`评价${r.target_name}`" @click="goForm(r)">
            <div class="avatar" :class="statusClass(r)">{{ r.target_name.charAt(0) }}</div>
            <div class="self-main">
              <strong>{{ r.target_name }}</strong>
              <span>{{ r.target_department }} · {{ r.target_position || '自我评价' }}</span>
            </div>
            <span class="state-pill" :class="statusClass(r)">{{ statusText(r.status) }}</span>
          </button>
        </div>
      </section>

      <div v-if="Object.keys(grouped).length === 0 && !loading" class="empty-card">
        <h2>暂无可评价对象</h2>
        <p>当前批次暂无分配给你的评价任务。</p>
      </div>
    </van-pull-refresh>
  </div>
</template>

<script setup lang="ts">
import { closeToast, showLoadingToast } from 'vant'
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { h5Api } from '../api'
import { preloadWhenIdle } from '../router/loaders'
import { evaluationScene } from '../utils/relationScene'

const props = defineProps<{ batchId: string }>()
const router = useRouter()
const loading = ref(false)
const refreshing = ref(false)
const relations = ref<any[]>([])
const batch = ref<any>(null)

const typeLabel: Record<string, string> = { self: '自我评价', peer: '同级互评', upward: '向上评价', downward: '向下评价' }
const typeHelp: Record<string, string> = {
  self: '完成本人业绩与综合评分',
  peer: '按人员逐一评价综合题目',
  upward: '评议本部门负责人综合表现',
  downward: '查看下属状态后逐人评分',
}
const typeIcon: Record<string, string> = { self: '自', peer: '互', upward: '上', downward: '下' }
const visibleTypes = computed(() => ['self', 'peer', 'upward', 'downward'].filter(type => grouped.value[type]?.length))

const grouped = computed(() => {
  const g: Record<string, any[]> = {}
  for (const r of relations.value) {
    const scene = evaluationScene(r)
    if (!g[scene]) g[scene] = []
    g[scene].push(r)
  }
  return g
})
const totalCompleted = computed(() => relations.value.filter(r => r.status === 'completed').length)

function completedCount(items: any[] = []) {
  return items.filter(r => r.status === 'completed').length
}
function statusClass(r: any) {
  if (r.status === 'completed') return 'done'
  if (r.status === 'draft') return 'draft'
  return 'pending'
}
function statusText(status: string) {
  if (status === 'completed') return '已完成'
  if (status === 'draft') return '草稿'
  return '待评'
}
function progressPercent(items: any[]) {
  return items.length ? Math.round((completedCount(items) / items.length) * 100) : 0
}
function groupStatusClass(items: any[]) {
  const completed = completedCount(items)
  if (completed === items.length && items.length > 0) return 'done'
  if (items.some(r => r.status === 'draft')) return 'draft'
  return 'pending'
}
function groupStatusText(items: any[]) {
  const completed = completedCount(items)
  if (completed === items.length && items.length > 0) return '已完成'
  if (items.some(r => r.status === 'draft')) return '有草稿'
  return '待评分'
}
function goForm(relation: any) {
  router.push(`/eval-form/${relation.id}`)
}
function goBatch(type: string) {
  router.push(`/batch-eval/${props.batchId}/${type}`)
}
async function loadRelations() {
  loading.value = true
  try {
    const [r, b] = await Promise.all([
      h5Api.getMyRelations(parseInt(props.batchId)),
      (async () => {
        const res: any = await h5Api.getProgress(parseInt(props.batchId))
        return res.data?.batch || null
      })(),
    ])
    relations.value = r.data?.list || []
    batch.value = await b
    if (relations.value.some(item => item.eval_type === 'self')) preloadWhenIdle('self-detail')
    if (relations.value.some(item => item.eval_type !== 'self')) preloadWhenIdle('batch')
  } finally {
    loading.value = false
    refreshing.value = false
  }
}
onMounted(async () => {
  showLoadingToast({ message: '加载中...', forbidClick: true })
  try { await loadRelations() }
  finally { closeToast() }
})
</script>

<style scoped>
.evaluate-page {
  min-height: 100dvh;
  background:
    linear-gradient(180deg, transparent 0 162px, var(--hr-bg) 162px 100%),
    var(--hr-bg);
}
.nav-bar { position: sticky; top: 0; z-index: 40; background: #f6f9fc; }

.task-hero {
  padding: 18px 16px 20px;
  color: #fff;
  background: linear-gradient(145deg, #0f3b5f, #0369a1);
  box-shadow: var(--hr-shadow-soft);
}
.task-hero span { display: block; color: rgba(255,255,255,.70); font-size: 12px; }
.task-hero strong { display: block; margin-top: 5px; font-size: 34px; line-height: 1; font-weight: 900; }
.hero-progress { margin-top: 14px; height: 8px; border-radius: 999px; background: rgba(255,255,255,.20); overflow: hidden; }
.hero-progress div { height: 100%; border-radius: inherit; background: #67e8f9; }

.content {
  padding: 16px 16px 96px;
  background:
    radial-gradient(circle at 100% 0%, rgba(3, 100, 134, .10), transparent 34%),
    var(--hr-bg);
}
.task-section { margin-bottom: 18px; }
.section-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  margin: 0 2px 10px;
}
.section-head strong { display: block; font-size: 17px; color: var(--hr-text); }
.section-head span { display: block; margin-top: 3px; font-size: 12px; color: var(--hr-muted); }
.section-head b { color: var(--hr-accent-strong); font-size: 16px; }

.task-card,
.self-row,
.empty-card {
  width: 100%;
  border: 1px solid #aebfd0 !important;
  border-radius: 14px;
  background: linear-gradient(180deg, var(--hr-surface-raised), var(--hr-surface));
  border-color: var(--hr-border-strong);
  box-shadow: 0 9px 22px rgba(8, 31, 49, .11);
}
.task-card {
  display: grid;
  grid-template-columns: 48px minmax(0, 1fr) auto;
  gap: 12px;
  align-items: center;
  padding: 15px;
  text-align: left;
}
.task-icon,
.avatar {
  width: 48px;
  height: 48px;
  border-radius: 13px;
  display: grid;
  place-items: center;
  font-weight: 900;
}
.task-icon.peer { color: var(--hr-accent-strong); background: #dbeafe; }
.task-icon.upward { color: #17643a; background: #d9f0e4; }
.task-icon.downward { color: #8a4d00; background: #f5e4bd; }
.task-title { color: var(--hr-text); font-size: 16px; font-weight: 900; }
.task-meta { margin-top: 4px; color: var(--hr-muted); font-size: 12px; }
.mini-track { margin-top: 9px; height: 6px; border-radius: 999px; background: #c9d7e5; overflow: hidden; }
.mini-track div { height: 100%; background: linear-gradient(90deg, var(--hr-accent-strong), #38bdf8); }

.self-list { display: grid; gap: 10px; }
.self-row {
  display: grid;
  grid-template-columns: 44px minmax(0, 1fr) auto;
  gap: 12px;
  align-items: center;
  padding: 14px;
  text-align: left;
}
.avatar { width: 44px; height: 44px; color: var(--hr-accent-strong); background: #dbeafe; }
.avatar.done { color: var(--hr-success); background: #d9f0e4; }
.avatar.draft { color: var(--hr-accent-strong); background: #dbeafe; }
.avatar.pending { color: #8a4d00; background: #f5e4bd; }
.self-main { min-width: 0; }
.self-main strong { display: block; color: var(--hr-text); font-size: 16px; }
.self-main span { display: block; margin-top: 3px; color: var(--hr-muted); font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.state-pill {
  min-height: 26px;
  padding: 5px 9px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 900;
  white-space: nowrap;
}
.state-pill.done { color: var(--hr-success); background: #d9f0e4; }
.state-pill.draft { color: var(--hr-accent-strong); background: #dbeafe; }
.state-pill.pending { color: #8a4d00; background: #f5e4bd; }
.empty-card { padding: 42px 20px; text-align: center; }
.empty-card h2 { margin: 0 0 6px; font-size: 17px; color: var(--hr-text); }
.empty-card p { margin: 0; font-size: 13px; color: var(--hr-muted); }
</style>
