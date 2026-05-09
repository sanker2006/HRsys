<template>
  <div class="my-page">
    <!-- 头部 -->
    <div class="header">
      <h2>我的评价</h2>
      <p>历史记录与草稿</p>
    </div>

    <van-pull-refresh v-model="refreshing" @refresh="loadAll" class="content">

      <div v-if="history.length === 0 && !loading" class="empty">
        <div class="empty-icon">
          <svg width="64" height="64" viewBox="0 0 64 64" fill="none">
            <circle cx="32" cy="32" r="28" fill="#f0f4f8"/>
            <rect x="18" y="20" width="28" height="24" rx="3" stroke="#c0cdd9" stroke-width="2"/>
            <line x1="24" y1="28" x2="40" y2="28" stroke="#c0cdd9" stroke-width="2" stroke-linecap="round"/>
            <line x1="24" y1="34" x2="36" y2="34" stroke="#c0cdd9" stroke-width="2" stroke-linecap="round"/>
          </svg>
        </div>
        <p class="empty-title">暂无评价记录</p>
        <p class="empty-desc">完成评价后将在这里显示</p>
      </div>

      <!-- 批次分组 -->
      <div v-for="h in history" :key="h.batchId" class="batch-block">
        <div class="batch-title">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
            <line x1="16" y1="2" x2="16" y2="6"/>
            <line x1="8" y1="2" x2="8" y2="6"/>
            <line x1="3" y1="10" x2="21" y2="10"/>
          </svg>
          {{ h.batchName }}
        </div>

        <div class="eval-list">
          <div
            v-for="r in h.relations"
            :key="r.id"
            class="eval-item"
          >
            <div class="eval-left">
              <div class="eval-avatar" :class="avatarClass(r.status)">
                {{ r.target_name.charAt(0) }}
              </div>
            </div>
            <div class="eval-info">
              <div class="eval-name">{{ r.target_name }}</div>
              <div class="eval-type">{{ r.eval_type_text }}</div>
            </div>
            <div class="eval-right">
              <div class="status-text" :class="statusClass(r.status)">
                {{ statusText(r.status) }}
              </div>
              <van-button
                v-if="r.status !== 'completed'"
                size="small"
                :type="r.status === 'draft' ? 'default' : 'primary'"
                :plain="r.status === 'draft'"
                @click="router.push(evalPath(r))"
                class="action-btn"
              >
                {{ r.status === 'draft' ? '继续' : '去评价' }}
              </van-button>
              <div v-else class="done-icon">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                  <polyline points="22 4 12 14.01 9 11.01"/>
                </svg>
              </div>
            </div>
          </div>
        </div>
      </div>

    </van-pull-refresh>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { showLoadingToast, closeToast } from 'vant'
import { h5Api } from '../api'

const router = useRouter()
const loading = ref(false)
const refreshing = ref(false)
const history = ref<any[]>([])

function avatarClass(status: string) {
  if (status === 'completed') return 'done'
  if (status === 'draft') return 'draft'
  return 'pending'
}
function statusClass(status: string) {
  if (status === 'completed') return 'done'
  if (status === 'draft') return 'draft'
  return 'pending'
}
function statusText(status: string) {
  if (status === 'completed') return '已完成'
  if (status === 'draft') return '草稿'
  return '待评'
}

function evalPath(row: any) {
  if (row.eval_type === 'peer') return `/peer-eval/${row.batchId}/${row.id}`
  if (row.eval_type === 'downward') return `/downward-eval/${row.batchId}/${row.id}`
  return `/eval-form/${row.id}`
}

async function loadAll() {
  loading.value = true
  try {
    const res: any = await h5Api.getBatches()
    const batches: any[] = res.data || []
    const results = await Promise.all(
      batches.map(async (b) => {
        try {
          const relRes: any = await h5Api.getMyRelations(b.id)
          const flat = (relRes.data?.list || []).map((r: any) => ({
            ...r,
            batchId: b.id,
            batchName: b.name,
            eval_type_text: evalTypeText(r.eval_type),
          }))
          return flat.length > 0 ? { batchId: b.id, batchName: b.name, relations: flat } : null
        } catch {
          return null
        }
      })
    )
    history.value = results.filter(Boolean)
  } finally {
    loading.value = false
    refreshing.value = false
  }
}

function evalTypeText(type: string) {
  if (type === 'self') return '自评'
  if (type === 'peer') return '同级互评'
  if (type === 'downward') return '向下评价'
  return type || '评价'
}

onMounted(async () => {
  showLoadingToast({ message: '加载中...', forbidClick: true })
  try { await loadAll() }
  finally { closeToast() }
})
</script>

<style scoped>
.my-page {
  min-height: 100dvh;
  background: var(--hr-bg);
}
.header {
  background: linear-gradient(145deg, #0f172a 0%, #075985 100%);
  color: #fff;
  padding: calc(env(safe-area-inset-top) + 20px) 20px 24px;
  border-radius: 0 0 22px 22px;
  box-shadow: var(--hr-shadow);
}
.header h2 {
  font-size: 22px;
  font-weight: 900;
  margin-bottom: 4px;
}
.header p {
  font-size: 13px;
  opacity: 0.7;
  margin: 0;
}
.content {
  padding: 16px 16px 100px;
}
.batch-block {
  margin-bottom: 20px;
}
.batch-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  font-weight: 800;
  color: var(--hr-muted);
  margin-bottom: 8px;
  padding-left: 4px;
}
.eval-list {
  background: var(--hr-surface);
  border: 1px solid rgba(226,232,240,.92);
  border-radius: 10px;
  overflow: hidden;
  box-shadow: var(--hr-shadow-soft);
}
.eval-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 16px;
  border-bottom: 1px solid var(--hr-border);
}
.eval-item:last-child { border-bottom: none; }
.eval-avatar {
  width: 40px;
  height: 40px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
  font-weight: 900;
  flex-shrink: 0;
}
.eval-avatar.done { background: rgba(7,193,96,0.1); color: var(--hr-success); }
.eval-avatar.draft { background: var(--hr-primary-soft); color: var(--hr-accent-strong); }
.eval-avatar.pending { background: rgba(232,191,90,0.12); color: #b88a1e; }
.eval-info { flex: 1; min-width: 0; }
.eval-name { font-size: 16px; font-weight: 800; color: var(--hr-text); margin-bottom: 3px; }
.eval-type { font-size: 12px; color: var(--hr-muted); }
.eval-right {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
}
.status-text {
  font-size: 12px;
  font-weight: 800;
}
.status-text.done { color: var(--hr-success); }
.status-text.draft { color: var(--hr-accent-strong); }
.status-text.pending { color: #b88a1e; }
.action-btn {
  border-radius: 999px !important;
  font-size: 12px;
  height: 30px;
  padding: 0 12px;
}
.done-icon {
  width: 32px;
  height: 32px;
  border-radius: 10px;
  background: rgba(7,193,96,0.1);
  color: var(--hr-success);
  display: flex;
  align-items: center;
  justify-content: center;
}
.empty { text-align: center; padding: 48px 24px; }
.empty-icon { margin-bottom: 16px; }
.empty-title { font-size: 16px; font-weight: 800; color: var(--hr-text); margin: 0 0 6px; }
.empty-desc { font-size: 13px; color: var(--hr-muted); margin: 0; }
</style>
