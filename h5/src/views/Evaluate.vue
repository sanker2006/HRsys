<template>
  <div class="evaluate-page">
    <van-nav-bar
      :title="batch?.name || '评价任务'"
      left-arrow
      @click-left="router.back()"
      class="nav-bar"
    />

    <van-pull-refresh v-model="refreshing" @refresh="loadRelations">
      <div v-for="(items, type) in grouped" :key="type" class="section">
        <div class="section-header">
          <div class="section-title">
            <div class="section-icon">
              <svg v-if="type === 'self'" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7"/>
              </svg>
              <svg v-else-if="type === 'peer'" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                <circle cx="9" cy="7" r="4"/>
                <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
                <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
              </svg>
              <svg v-else width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="17 11 12 6 7 11"/><polyline points="17 18 12 13 7 18"/>
              </svg>
            </div>
            <span>{{ typeLabel[type] }}</span>
          </div>
          <div class="section-count">
            <span class="count-done">{{ completedCount(items) }}</span>
            <span class="count-sep">/</span>
            <span class="count-total">{{ items.length }}</span>
          </div>
        </div>

        <div v-if="type !== 'self'" class="batch-entry" @click="goBatch(type as string)">
          <div class="batch-entry-icon" :class="type as string">
            <svg v-if="type === 'peer'" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
              <circle cx="9" cy="7" r="4"/>
              <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
              <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
            </svg>
            <svg v-else width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="17 11 12 6 7 11"/><polyline points="17 18 12 13 7 18"/>
            </svg>
          </div>
          <div class="batch-entry-main">
            <div class="batch-entry-title">{{ typeLabel[type] }}</div>
            <div class="batch-entry-meta">需打分 {{ items.length }} 人 · 已打分 {{ completedCount(items) }} 人</div>
            <div class="batch-progress">
              <div class="batch-progress-fill" :style="{ width: progressPercent(items) + '%' }" />
            </div>
          </div>
          <div class="batch-entry-side">
            <div class="status-tag" :class="groupStatusClass(items)">{{ groupStatusText(items) }}</div>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="arrow-icon">
              <polyline points="9 18 15 12 9 6"/>
            </svg>
          </div>
        </div>

        <div v-else class="eval-list">
          <div
            v-for="r in items"
            :key="r.id"
            class="eval-item"
            @click="goForm(r)"
          >
            <div class="eval-avatar" :class="statusClass(r)">{{ r.target_name.charAt(0) }}</div>
            <div class="eval-info">
              <div class="eval-name">{{ r.target_name }}</div>
              <div class="eval-meta">{{ r.target_department }} · {{ r.target_position }}</div>
            </div>
            <div class="eval-status">
              <div class="status-tag" :class="statusClass(r)">{{ statusText(r.status) }}</div>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="arrow-icon">
                <polyline points="9 18 15 12 9 6"/>
              </svg>
            </div>
          </div>
        </div>
      </div>

      <div v-if="Object.keys(grouped).length === 0 && !loading" class="empty">
        <div class="empty-icon">
          <svg width="56" height="56" viewBox="0 0 56 56" fill="none">
            <circle cx="28" cy="28" r="28" fill="#f5f7fa"/>
            <path d="M20 28h16M28 20v16" stroke="#c0cdd9" stroke-width="2.5" stroke-linecap="round"/>
          </svg>
        </div>
        <p class="empty-title">暂无可评价对象</p>
        <p class="empty-desc">当前批次暂无评价任务</p>
      </div>
    </van-pull-refresh>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { showLoadingToast, closeToast } from 'vant'
import { h5Api } from '../api'

const props = defineProps<{ batchId: string }>()
const router = useRouter()
const loading = ref(false)
const refreshing = ref(false)
const relations = ref<any[]>([])
const batch = ref<any>(null)

const typeLabel: Record<string, string> = {
  self: '自我评价',
  peer: '同层互评',
  downward: '向下评价',
}

const grouped = computed(() => {
  const g: Record<string, any[]> = {}
  for (const r of relations.value) {
    const key = r.eval_type
    if (!g[key]) g[key] = []
    g[key].push(r)
  }
  return g
})

function completedCount(items: any[]) {
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
  background: #f5f7fa;
}
.nav-bar {
  background: #fff;
  position: sticky;
  top: 0;
  z-index: 10;
}
.section { margin-top: 12px; padding: 0 16px; }
.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 4px 10px;
}
.section-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 15px;
  font-weight: 600;
  color: #1a2332;
}
.section-icon {
  width: 28px;
  height: 28px;
  border-radius: 8px;
  background: rgba(44,82,130,0.1);
  color: #2c5282;
  display: flex;
  align-items: center;
  justify-content: center;
}
.section-count { font-size: 13px; }
.count-done { color: #2c5282; font-weight: 700; }
.count-sep { color: #d0d5dd; margin: 0 2px; }
.count-total { color: #8a96a6; }
.batch-entry {
  display: flex;
  align-items: center;
  gap: 12px;
  background: #fff;
  border-radius: 14px;
  padding: 16px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.05);
  cursor: pointer;
}
.batch-entry:active { background: #f8f9fb; }
.batch-entry-icon {
  width: 46px;
  height: 46px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.batch-entry-icon.peer { color: #2c5282; background: rgba(44,82,130,0.1); }
.batch-entry-icon.downward { color: #6b5b18; background: rgba(232,191,90,0.14); }
.batch-entry-main { flex: 1; min-width: 0; }
.batch-entry-title { font-size: 16px; font-weight: 700; color: #1a2332; margin-bottom: 4px; }
.batch-entry-meta { font-size: 12px; color: #8a96a6; margin-bottom: 9px; }
.batch-entry-side { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }
.batch-progress {
  height: 5px;
  background: rgba(44,82,130,0.12);
  border-radius: 8px;
  overflow: hidden;
}
.batch-progress-fill {
  height: 100%;
  background: linear-gradient(90deg, #2c5282, #4a8fd4);
  border-radius: 8px;
  transition: width 0.2s ease;
}
.eval-list {
  background: #fff;
  border-radius: 14px;
  overflow: hidden;
  box-shadow: 0 2px 8px rgba(0,0,0,0.05);
}
.eval-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 16px;
  border-bottom: 1px solid #f5f7fa;
  cursor: pointer;
  transition: background 0.15s;
}
.eval-item:last-child { border-bottom: none; }
.eval-item:active { background: #f8f9fb; }
.eval-avatar {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  font-weight: 700;
  flex-shrink: 0;
}
.eval-avatar.done { background: rgba(7,193,96,0.1); color: #07c160; }
.eval-avatar.draft { background: rgba(44,82,130,0.1); color: #2c5282; }
.eval-avatar.pending { background: rgba(232,191,90,0.12); color: #b88a1e; }
.eval-info { flex: 1; min-width: 0; }
.eval-name { font-size: 15px; font-weight: 600; color: #1a2332; margin-bottom: 3px; }
.eval-meta { font-size: 12px; color: #8a96a6; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.eval-status { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }
.status-tag {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  font-weight: 500;
  padding: 3px 8px;
  border-radius: 20px;
  white-space: nowrap;
}
.status-tag.done { background: rgba(7,193,96,0.1); color: #07c160; }
.status-tag.draft { background: rgba(44,82,130,0.08); color: #2c5282; }
.status-tag.pending { background: rgba(232,191,90,0.12); color: #b88a1e; }
.arrow-icon { color: #c0cdd9; }
.empty { text-align: center; padding: 60px 24px; }
.empty-icon { margin-bottom: 12px; }
.empty-title { font-size: 16px; font-weight: 600; color: #3a4555; margin: 0 0 6px; }
.empty-desc { font-size: 13px; color: #9aa5b4; margin: 0; }
</style>
