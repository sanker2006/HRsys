<template>
  <div class="home-page">
    <!-- 沉浸式头部 -->
    <div class="header">
      <div class="user-card">
        <div class="user-avatar">{{ userName.charAt(0) }}</div>
        <div class="user-info">
          <h2>{{ userName }}</h2>
          <p>{{ greeting }}</p>
        </div>
        <button class="logout-btn" @click="handleLogout">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
            <polyline points="16 17 21 12 16 7"/>
            <line x1="21" y1="12" x2="9" y2="12"/>
          </svg>
        </button>
      </div>
      <!-- 摘要数字 -->
      <div class="summary-strip" v-if="summary">
        <div class="summary-item">
          <span class="summary-num">{{ summary.total }}</span>
          <span class="summary-label">总任务</span>
        </div>
        <div class="summary-divider" />
        <div class="summary-item">
          <span class="summary-num done">{{ summary.completed }}</span>
          <span class="summary-label">已完成</span>
        </div>
        <div class="summary-divider" />
        <div class="summary-item">
          <span class="summary-num pending">{{ summary.total - summary.completed }}</span>
          <span class="summary-label">待完成</span>
        </div>
      </div>
    </div>

    <!-- 批次列表 -->
    <van-pull-refresh v-model="refreshing" @refresh="loadBatches" class="batch-list">
      <div v-if="batches.length === 0 && !loading" class="empty">
        <div class="empty-icon">
          <svg width="64" height="64" viewBox="0 0 64 64" fill="none">
            <circle cx="32" cy="32" r="28" fill="#f0f4f8"/>
            <path d="M22 32l8 8 12-14" stroke="#c0cdd9" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </div>
        <p class="empty-title">暂无待评价任务</p>
        <p class="empty-desc">完成当前批次后，将在这里查看结果</p>
      </div>

      <div
        v-for="batch in batches"
        :key="batch.id"
        class="batch-item"
        :class="batchStatusClass(batch)"
        @click="goEvaluate(batch)"
      >
        <!-- 左侧状态色条 -->
        <div class="batch-accent" />

        <!-- 主内容区 -->
        <div class="batch-body">
          <div class="batch-header">
            <h3 class="batch-name">{{ batch.name }}</h3>
            <div class="batch-badge" :class="batchStatusClass(batch)">
              {{ batchStatusText(batch) }}
            </div>
          </div>

          <div class="batch-meta">
            <span class="batch-period">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                <line x1="16" y1="2" x2="16" y2="6"/>
                <line x1="8" y1="2" x2="8" y2="6"/>
                <line x1="3" y1="10" x2="21" y2="10"/>
              </svg>
              {{ formatDate(batch.start_time) }} - {{ formatDate(batch.end_time) }}
            </span>
          </div>

          <!-- 进度条 -->
          <div class="batch-progress" v-if="batch.progress !== undefined">
            <van-progress
              :percentage="batch.progress"
              :pivot-text="`${batch.progress}%`"
              :color="batch.progress >= 100 ? '#07c160' : '#2c5282'"
              :track-color="'rgba(0,0,0,0.08)'"
              :pivot-color="batch.progress >= 100 ? '#07c160' : '#2c5282'"
            />
            <span class="progress-label">{{ batch.completed || 0 }}/{{ batch.total || 0 }} 项已完成</span>
          </div>
        </div>

        <!-- 箭头 -->
        <div class="batch-arrow">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="9 18 15 12 9 6"/>
          </svg>
        </div>
      </div>
    </van-pull-refresh>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { showLoadingToast, closeToast, showToast } from 'vant'
import { h5Api } from '../api'

const router = useRouter()
const batches = ref<any[]>([])
const loading = ref(false)
const refreshing = ref(false)
const userName = ref('')

const greeting = computed(() => {
  const h = new Date().getHours()
  if (h < 12) return '上午好，今日工作加油 👋'
  if (h < 18) return '下午好，继续保持 ✨'
  return '晚上好，辛苦啦 🌙'
})

const summary = computed(() => {
  if (!batches.value.length) return null
  const total = batches.value.reduce((s, b) => s + (b.total || 0), 0)
  const completed = batches.value.reduce((s, b) => s + (b.completed || 0), 0)
  return { total, completed }
})

function batchStatusClass(batch: any) {
  if (batch.progress >= 100) return 'status-done'
  if (batch.progress > 0) return 'status-active'
  return 'status-pending'
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
    const progressResults = await Promise.allSettled(
      all.map(b => h5Api.getProgress(b.id))
    )
    const withProgress = all.map((b, i) => {
      const r = progressResults[i]
      if (r.status === 'fulfilled') {
        const p = (r as PromiseFulfilledResult<any>).value?.data
        const total = p?.total || 0
        const completed = p?.completed || 0
        return { ...b, total, completed, progress: total ? Math.round((completed / total) * 100) : 0 }
      }
      return { ...b, total: 0, completed: 0, progress: 0 }
    })
    batches.value = withProgress
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
  background: #f5f7fa;
}

/* 头部 */
.header {
  background: linear-gradient(145deg, #0f2744 0%, #1a3a6b 40%, #1a365d 100%);
  color: #fff;
  padding: calc(env(safe-area-inset-top) + 20px) 20px 24px;
  border-radius: 0 0 24px 24px;
  box-shadow: 0 4px 20px rgba(15, 39, 68, 0.3);
}

.user-card {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 20px;
}

.user-avatar {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  background: linear-gradient(135deg, rgba(255,255,255,0.25), rgba(255,255,255,0.1));
  border: 2px solid rgba(255,255,255,0.3);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 22px;
  font-weight: 700;
  color: #fff;
  flex-shrink: 0;
  box-shadow: 0 2px 8px rgba(0,0,0,0.15);
}

.user-info {
  flex: 1;
}
.user-info h2 {
  font-size: 20px;
  font-weight: 600;
  margin-bottom: 3px;
}
.user-info p {
  font-size: 12px;
  opacity: 0.7;
}

.logout-btn {
  background: rgba(255,255,255,0.1);
  border: 1px solid rgba(255,255,255,0.2);
  border-radius: 8px;
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: rgba(255,255,255,0.8);
  cursor: pointer;
  flex-shrink: 0;
  transition: all 0.2s;
}
.logout-btn:active {
  background: rgba(255,255,255,0.2);
  transform: scale(0.95);
}

/* 摘要条 */
.summary-strip {
  display: flex;
  align-items: center;
  background: rgba(255,255,255,0.08);
  border-radius: 12px;
  padding: 14px 0;
  margin-top: 4px;
}
.summary-item {
  flex: 1;
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
}
.summary-num {
  font-size: 24px;
  font-weight: 700;
  color: #fff;
  line-height: 1;
}
.summary-num.done { color: #7dd87d; }
.summary-num.pending { color: #f0c27d; }
.summary-label {
  font-size: 11px;
  color: rgba(255,255,255,0.55);
  letter-spacing: 0.5px;
}
.summary-divider {
  width: 1px;
  height: 32px;
  background: rgba(255,255,255,0.15);
}

/* 批次列表 */
.batch-list {
  padding: 16px 16px 100px;
}

.batch-item {
  display: flex;
  align-items: center;
  background: #fff;
  border-radius: 14px;
  margin-bottom: 12px;
  overflow: hidden;
  box-shadow: 0 2px 12px rgba(0,0,0,0.06);
  cursor: pointer;
  transition: all 0.2s ease;
}
.batch-item:active {
  transform: scale(0.98);
  box-shadow: 0 1px 6px rgba(0,0,0,0.08);
}

.batch-accent {
  width: 4px;
  align-self: stretch;
  flex-shrink: 0;
}
.status-active .batch-accent { background: #2c5282; }
.status-done .batch-accent { background: #07c160; }
.status-pending .batch-accent { background: #e8bf5a; }

.batch-body {
  flex: 1;
  padding: 14px 12px;
  min-width: 0;
}

.batch-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 6px;
}
.batch-name {
  font-size: 15px;
  font-weight: 600;
  color: #1a2332;
  margin: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex: 1;
  margin-right: 8px;
}
.batch-badge {
  font-size: 11px;
  font-weight: 600;
  padding: 3px 8px;
  border-radius: 20px;
  flex-shrink: 0;
}
.status-active .batch-badge {
  background: rgba(44,82,130,0.1);
  color: #2c5282;
}
.status-done .batch-badge {
  background: rgba(7,193,96,0.1);
  color: #07c160;
}
.status-pending .batch-badge {
  background: rgba(232,191,90,0.12);
  color: #b88a1e;
}

.batch-meta {
  margin-bottom: 10px;
}
.batch-period {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: #8a96a6;
}

.batch-progress {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.progress-label {
  font-size: 11px;
  color: #8a96a6;
}

.batch-arrow {
  padding-right: 14px;
  color: #c0cdd9;
  flex-shrink: 0;
}

/* 空状态 */
.empty {
  text-align: center;
  padding: 48px 24px;
}
.empty-icon {
  margin-bottom: 16px;
}
.empty-title {
  font-size: 16px;
  font-weight: 600;
  color: #3a4555;
  margin: 0 0 6px;
}
.empty-desc {
  font-size: 13px;
  color: #9aa5b4;
  margin: 0;
}
</style>
