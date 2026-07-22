<template>
  <div class="my-page">
    <section class="work-hero">
      <h1>我的评价</h1>
      <p>查看所有分配给你的评价任务，草稿和待评可以继续处理。</p>
    </section>

    <van-pull-refresh v-model="refreshing" @refresh="loadAll" class="content">
      <div v-if="history.length === 0 && !loading" class="empty-card">
        <h2>暂无评价记录</h2>
        <p>完成评价后将在这里显示历史记录。</p>
      </div>

      <section v-for="h in history" :key="h.batchId" class="batch-block">
        <div class="batch-head">
          <strong>{{ h.batchName }}</strong>
          <span>{{ h.relations.length }} 项任务</span>
        </div>

        <div class="eval-list">
          <button v-for="r in h.relations" :key="r.id" class="eval-row" type="button" :aria-label="`查看${r.target_name}的评价`" @click="router.push(evalPath(r))">
            <div class="avatar" :class="statusClass(r.status)">{{ r.target_name.charAt(0) }}</div>
            <div class="eval-info">
              <strong>{{ r.target_name }}</strong>
              <span>{{ r.eval_type_text }} · {{ r.target_department || '' }}</span>
            </div>
            <div class="eval-side">
              <span class="state-pill" :class="statusClass(r.status)">{{ statusText(r.status) }}</span>
              <van-button size="small" :type="r.status === 'completed' ? 'default' : 'primary'" :plain="r.status !== 'pending'">
                {{ r.status === 'completed' ? '查看' : r.status === 'draft' ? '继续' : '去评价' }}
              </van-button>
            </div>
          </button>
        </div>
      </section>
    </van-pull-refresh>
  </div>
</template>

<script setup lang="ts">
import { closeToast, showLoadingToast } from 'vant'
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { h5Api } from '../api'

const router = useRouter()
const loading = ref(false)
const refreshing = ref(false)
const history = ref<any[]>([])

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
  if (type === 'self') return '自我评价'
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
  background:
    radial-gradient(circle at 100% 18%, rgba(3, 100, 134, .10), transparent 34%),
    var(--hr-bg);
}
.work-hero {
  padding: calc(env(safe-area-inset-top) + 20px) 18px 22px;
  color: #fff;
  background: linear-gradient(145deg, #0f3b5f, #0369a1);
  border-radius: 0 0 24px 24px;
  box-shadow: var(--hr-shadow);
}
.work-hero h1 { margin: 0; font-size: 22px; line-height: 1.2; font-weight: 900; }
.work-hero p { margin: 7px 0 0; font-size: 12px; line-height: 1.5; color: rgba(255,255,255,.72); }
.content { padding: 16px 16px 96px; }
.batch-block { margin-bottom: 18px; }
.batch-head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  margin: 0 2px 10px;
}
.batch-head strong { color: var(--hr-text); font-size: 17px; }
.batch-head span { color: var(--hr-muted); font-size: 12px; }
.eval-list { display: grid; gap: 10px; }
.eval-row,
.empty-card {
  width: 100%;
  border: 1px solid #aebfd0;
  border-radius: 14px;
  background: linear-gradient(180deg, var(--hr-surface-raised), var(--hr-surface));
  border-color: var(--hr-border-strong);
  box-shadow: 0 9px 22px rgba(8, 31, 49, .11);
}
.eval-row {
  display: grid;
  grid-template-columns: 44px minmax(0, 1fr) auto;
  gap: 12px;
  align-items: center;
  padding: 14px;
  text-align: left;
}
.avatar {
  width: 44px;
  height: 44px;
  display: grid;
  place-items: center;
  border-radius: 13px;
  font-weight: 900;
}
.avatar.done { color: var(--hr-success); background: #d9f0e4; }
.avatar.draft { color: var(--hr-accent-strong); background: #dbeafe; }
.avatar.pending { color: #8a4d00; background: #f5e4bd; }
.eval-info { min-width: 0; }
.eval-info strong { display: block; color: var(--hr-text); font-size: 16px; }
.eval-info span { display: block; margin-top: 4px; color: var(--hr-muted); font-size: 12px; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.eval-side { display: flex; align-items: center; gap: 8px; }
.state-pill { min-height: 26px; padding: 5px 9px; border-radius: 999px; font-size: 12px; font-weight: 900; white-space: nowrap; }
.state-pill.done { color: var(--hr-success); background: #d9f0e4; }
.state-pill.draft { color: var(--hr-accent-strong); background: #dbeafe; }
.state-pill.pending { color: #8a4d00; background: #f5e4bd; }
.empty-card { padding: 42px 20px; text-align: center; }
.empty-card h2 { margin: 0 0 6px; font-size: 17px; color: var(--hr-text); }
.empty-card p { margin: 0; font-size: 13px; color: var(--hr-muted); }
</style>
