<template>
  <div class="home-page">
    <section class="work-hero">
      <div class="hero-top">
        <div class="user-avatar">{{ userName.charAt(0) }}</div>
        <div class="user-copy">
          <h1>{{ userName || '用户' }}</h1>
          <p>{{ greeting }}</p>
        </div>
        <button class="icon-btn" type="button" aria-label="退出登录" @click="handleLogout">
          <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
            <polyline points="16 17 21 12 16 7"/>
            <line x1="21" y1="12" x2="9" y2="12"/>
          </svg>
        </button>
      </div>

      <div class="summary-panel" v-if="summary">
        <div>
          <span>待完成</span>
          <b>{{ summary.total - summary.completed }}</b>
        </div>
        <div>
          <span>已完成</span>
          <b>{{ summary.completed }}</b>
        </div>
        <div>
          <span>总任务</span>
          <b>{{ summary.total }}</b>
        </div>
      </div>
    </section>

    <van-pull-refresh v-model="refreshing" @refresh="loadBatches" class="content">
      <div class="section-title">
        <strong>评价批次</strong>
        <span>{{ batches.length }} 个批次</span>
      </div>

      <div v-if="batches.length === 0 && !loading" class="empty-card">
        <div class="empty-icon">
          <svg width="52" height="52" viewBox="0 0 64 64" fill="none">
            <circle cx="32" cy="32" r="28" fill="#eef6fb"/>
            <path d="M22 32l8 8 12-14" stroke="#7aa9c7" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </div>
        <h2>暂无待评价任务</h2>
        <p>有新的评比活动后，会在这里显示入口。</p>
      </div>

      <button
        v-for="batch in batches"
        :key="batch.id"
        class="batch-card"
        :class="batchStatusClass(batch)"
        type="button"
        :aria-label="`进入${batch.name}`"
        @click="goEvaluate(batch)"
      >
        <div class="batch-head">
          <div>
            <h2>{{ batch.name }}</h2>
            <p>{{ formatDate(batch.start_time) }} - {{ formatDate(batch.end_time) }}</p>
          </div>
          <span class="state-pill">{{ batchStatusText(batch) }}</span>
        </div>

        <div class="task-row">
          <div>
            <span>已完成</span>
            <b>{{ batch.completed || 0 }}</b>
          </div>
          <div>
            <span>待完成</span>
            <b>{{ Math.max((batch.total || 0) - (batch.completed || 0), 0) }}</b>
          </div>
          <div>
            <span>完成率</span>
            <b>{{ batch.progress || 0 }}%</b>
          </div>
        </div>

        <div class="progress-track">
          <div class="progress-fill" :style="{ width: `${batch.progress || 0}%` }" />
        </div>
      </button>
    </van-pull-refresh>
  </div>
</template>

<script setup lang="ts">
import { closeToast, showLoadingToast, showToast } from 'vant'
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { h5Api } from '../api'

const router = useRouter()
const batches = ref<any[]>([])
const loading = ref(false)
const refreshing = ref(false)
const userName = ref('')

const greeting = computed(() => {
  const h = new Date().getHours()
  if (h < 12) return '上午好，先处理最紧急的评价任务'
  if (h < 18) return '下午好，继续完成当前批次评价'
  return '晚上好，提交前请确认评分是否准确'
})

const summary = computed(() => {
  if (!batches.value.length) return null
  const total = batches.value.reduce((s, b) => s + (b.total || 0), 0)
  const completed = batches.value.reduce((s, b) => s + (b.completed || 0), 0)
  return { total, completed }
})

function batchStatusClass(batch: any) {
  if (batch.progress >= 100) return 'done'
  if (batch.progress > 0) return 'active'
  return 'pending'
}

function batchStatusText(batch: any) {
  if (batch.progress >= 100) return '已完成'
  if (batch.progress > 0) return '进行中'
  return '待开始'
}

function handleLogout() {
  localStorage.removeItem('h5_token')
  showToast('已退出')
  router.replace('/login')
}

async function loadBatches() {
  loading.value = true
  try {
    const res: any = await h5Api.getBatches()
    const all: any[] = res.data || []
    const progressResults = await Promise.allSettled(all.map(b => h5Api.getProgress(b.id)))
    batches.value = all.map((b, i) => {
      const r = progressResults[i]
      if (r.status === 'fulfilled') {
        const p = (r as PromiseFulfilledResult<any>).value?.data
        const total = p?.total || 0
        const completed = p?.completed || 0
        return { ...b, total, completed, progress: total ? Math.round((completed / total) * 100) : 0 }
      }
      return { ...b, total: 0, completed: 0, progress: 0 }
    })
  } finally {
    loading.value = false
    refreshing.value = false
  }
}

function formatDate(d: string) {
  if (!d) return ''
  return d.slice(0, 10)
}

function goEvaluate(batch: any) {
  router.push(`/evaluate/${batch.id}`)
}

onMounted(async () => {
  showLoadingToast({ message: '加载中...', forbidClick: true })
  try {
    const me: any = await h5Api.me()
    userName.value = me.data?.name || '用户'
    await loadBatches()
  } finally {
    closeToast()
  }
})
</script>

<style scoped>
.home-page {
  min-height: 100dvh;
  background:
    radial-gradient(circle at 100% 28%, rgba(3, 100, 134, .10), transparent 34%),
    var(--hr-bg);
}

.work-hero {
  padding: calc(env(safe-area-inset-top) + 18px) 18px 20px;
  color: #fff;
  background:
    linear-gradient(145deg, rgba(15, 59, 95, .98), rgba(3, 105, 161, .94)),
    #0f3b5f;
  border-radius: 0 0 24px 24px;
  box-shadow: var(--hr-shadow);
}

.hero-top {
  display: flex;
  align-items: center;
  gap: 12px;
}

.user-avatar {
  width: 48px;
  height: 48px;
  border-radius: 14px;
  display: grid;
  place-items: center;
  background: rgba(255,255,255,.16);
  border: 1px solid rgba(255,255,255,.24);
  font-size: 22px;
  font-weight: 900;
}

.user-copy { flex: 1; min-width: 0; }
.user-copy h1 { margin: 0; font-size: 21px; line-height: 1.2; font-weight: 900; }
.user-copy p { margin: 5px 0 0; font-size: 12px; color: rgba(255,255,255,.70); }

.icon-btn {
  width: 44px;
  height: 44px;
  border: 1px solid rgba(255,255,255,.18);
  border-radius: 12px;
  background: rgba(255,255,255,.10);
  color: #fff;
}

.summary-panel {
  margin-top: 18px;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
}

.summary-panel div {
  padding: 12px;
  border-radius: 12px;
  background: rgba(255,255,255,.10);
  border: 1px solid rgba(255,255,255,.14);
}

.summary-panel span { display: block; font-size: 11px; color: rgba(255,255,255,.62); }
.summary-panel b { display: block; margin-top: 6px; font-size: 24px; line-height: 1; font-weight: 900; font-variant-numeric: tabular-nums; }

.content {
  padding: 16px 16px 96px;
  background: var(--hr-bg);
}

.section-title {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin: 2px 2px 12px;
}
.section-title strong { font-size: 18px; color: var(--hr-text); }
.section-title span { font-size: 12px; color: var(--hr-muted); }

.batch-card,
.empty-card {
  width: 100%;
  margin-bottom: 13px;
  padding: 16px;
  border: 1px solid #aebfd0;
  border-radius: 14px;
  background: linear-gradient(180deg, var(--hr-surface-raised), var(--hr-surface));
  border-color: var(--hr-border-strong);
  box-shadow: 0 9px 22px rgba(8, 31, 49, .11);
  text-align: left;
}

.batch-card {
  display: grid;
  gap: 14px;
}

.batch-head {
  display: flex;
  justify-content: space-between;
  gap: 12px;
}
.batch-head h2 { margin: 0; color: var(--hr-text); font-size: 17px; line-height: 1.35; font-weight: 900; }
.batch-head p { margin: 5px 0 0; color: var(--hr-muted); font-size: 12px; }

.state-pill {
  align-self: flex-start;
  min-height: 26px;
  padding: 5px 9px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 900;
  white-space: nowrap;
}
.batch-card.active .state-pill { color: var(--hr-accent-strong); background: #dbeafe; }
.batch-card.done .state-pill { color: var(--hr-success); background: #d9f0e4; }
.batch-card.pending .state-pill { color: #8a4d00; background: #f5e4bd; }

.task-row {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
}
.task-row div { padding: 10px; border-radius: 10px; background: var(--hr-surface-strong); border: 1px solid rgba(201, 215, 229, .75); }
.task-row span { display: block; color: var(--hr-muted); font-size: 11px; }
.task-row b { display: block; margin-top: 5px; color: var(--hr-text); font-size: 18px; line-height: 1; font-weight: 900; }

.progress-track {
  height: 7px;
  border-radius: 999px;
  background: #c9d7e5;
  overflow: hidden;
}
.progress-fill {
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, var(--hr-accent-strong), #38bdf8);
}

.empty-card { text-align: center; padding: 42px 20px; }
.empty-card h2 { margin: 10px 0 5px; font-size: 17px; color: var(--hr-text); }
.empty-card p { margin: 0; font-size: 13px; color: var(--hr-muted); }
</style>
