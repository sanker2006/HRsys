<template>
  <div class="page">
    <van-nav-bar :title="pageTitle" left-arrow @click-left="router.back()" class="nav" />

    <section class="summary">
      <div>
        <div class="summary-kicker">{{ props.type === 'downward' ? '先看状态，再逐人评分' : '按人员逐一完成综合评价' }}</div>
        <div class="summary-title">{{ pageTitle }}</div>
        <div class="summary-meta">{{ completedCount }} 人已完成，{{ currentList.length - completedCount }} 人待处理</div>
      </div>
      <div class="summary-count">{{ completedCount }}/{{ currentList.length }}</div>
    </section>

    <section v-if="props.type === 'downward' && quota" class="quota-note">
      <div class="quota-title">部门分档名额</div>
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

    <section class="person-list">
      <button
        v-for="item in currentList"
        :key="item.id"
        class="person-row"
        :class="{ blocked: props.type === 'downward' && !item.can_submit && item.status !== 'completed' }"
        type="button"
        :aria-label="`${item.target_name}，${rowStatusText(item)}`"
        @click="openPerson(item)"
      >
        <div class="avatar">{{ item.target_name?.charAt(0) || '?' }}</div>
        <div class="person-main">
          <div class="person-top">
            <div class="person-name">{{ item.target_name }}</div>
            <span class="status" :class="statusClass(item)">{{ rowStatusText(item) }}</span>
          </div>
          <div class="person-meta">{{ item.target_department }} · {{ item.target_position || roleText(item.target_level) }}</div>
          <div class="score-line">
            <span v-if="props.type === 'downward'">自评 {{ formatScore(item.self_total) }}</span>
            <span>{{ props.type === 'downward' ? '主管' : '互评' }} {{ formatScore(item.manager_total ?? item.totalScore) }}</span>
          </div>
        </div>
        <svg class="chevron" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
          <polyline points="9 18 15 12 9 6" />
        </svg>
      </button>
    </section>

    <van-empty v-if="!loading && currentList.length === 0" :description="props.type === 'downward' ? '暂无向下评价对象' : '暂无同级互评对象'" />
  </div>
</template>

<script setup lang="ts">
import { closeToast, showLoadingToast, showToast } from 'vant'
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { h5Api } from '../api'

const props = defineProps<{ batchId: string; type: string }>()
const router = useRouter()

const loading = ref(false)
const peerList = ref<any[]>([])
const downwardList = ref<any[]>([])
const quota = ref<any>(null)

const pageTitle = computed(() => props.type === 'downward' ? '向下评价' : '同级互评')
const currentList = computed(() => props.type === 'downward' ? downwardList.value : peerList.value)
const completedCount = computed(() => currentList.value.filter(item => item.status === 'completed').length)

function roleText(role: string) {
  if (role === 'manager') return '部门负责人'
  if (role === 'staff') return '员工'
  if (role === 'main_leader') return '主要领导'
  if (role === 'division_leader') return '分管领导'
  return role || '-'
}

function formatScore(score: number | string | null | undefined) {
  if (score === null || score === undefined || score === '') return '-'
  const value = Number(score)
  return Number.isFinite(value) ? `${value.toFixed(1)} 分` : '-'
}

function statusClass(item: any) {
  if (item.status === 'completed') return 'completed'
  if (props.type === 'downward' && !item.can_submit) return 'blocked'
  if (item.status === 'draft') return 'draft'
  return 'pending'
}

function rowStatusText(item: any) {
  if (item.status === 'completed') return '已完成'
  if (props.type === 'downward' && !item.can_submit) return '待员工自评'
  if (item.status === 'draft') return '草稿'
  return '可评分'
}

function openPerson(item: any) {
  if (props.type === 'downward') {
    if (!item.can_submit && item.status !== 'completed') {
      showToast(item.blocked_reason || '员工完成自评后才能评分')
      return
    }
    router.push(`/downward-eval/${props.batchId}/${item.id}`)
    return
  }
  router.push(`/peer-eval/${props.batchId}/${item.id}`)
}

async function loadData() {
  loading.value = true
  try {
    if (props.type === 'downward') {
      const res: any = await h5Api.getDownwardOverview(Number(props.batchId))
      downwardList.value = res.data?.list || []
      quota.value = res.data?.quota || null
    } else {
      const res: any = await h5Api.getMyRelations(Number(props.batchId))
      peerList.value = (res.data?.list || []).filter((r: any) => r.eval_type === 'peer')
    }
  } finally {
    loading.value = false
  }
}

onMounted(async () => {
  showLoadingToast({ message: '加载中...', forbidClick: true })
  try {
    await loadData()
  } finally {
    closeToast()
  }
})
</script>

<style scoped>
.page {
  min-height: 100dvh;
  background:
    radial-gradient(circle at 100% 18%, rgba(3, 100, 134, .10), transparent 34%),
    var(--hr-bg);
  padding-bottom: 28px;
}
.nav { position: sticky; top: 0; z-index: 40; background: #f6f9fc; }
.summary {
  position: sticky;
  top: 46px;
  z-index: 35;
  margin: 0;
  padding: 18px 16px;
  color: #fff;
  background: linear-gradient(145deg, #0f3b5f 0%, #0369a1 100%);
  display: flex;
  align-items: center;
  justify-content: space-between;
  box-shadow: 0 10px 26px rgba(15, 23, 42, .14);
}
.summary-kicker { font-size: 12px; color: rgba(255,255,255,.72); }
.summary-title { margin-top: 4px; font-size: 22px; font-weight: 900; }
.summary-meta { margin-top: 5px; font-size: 13px; color: rgba(255,255,255,.78); }
.summary-count { font-size: 30px; font-weight: 900; font-variant-numeric: tabular-nums; }
.quota-note {
  margin: 14px 16px;
  padding: 14px;
  border-radius: 14px;
  background: linear-gradient(180deg, var(--hr-surface-raised), var(--hr-surface));
  border: 1px solid #aebfd0;
  box-shadow: var(--hr-shadow-soft);
}
.quota-title { font-size: 14px; font-weight: 900; color: var(--hr-text); margin-bottom: 10px; }
.quota-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
.quota-grid div { border-radius: 10px; background: var(--hr-surface-strong); padding: 10px; border: 1px solid rgba(201, 215, 229, .75); }
.quota-grid span, .quota-grid em { display: block; font-size: 11px; color: var(--hr-muted); font-style: normal; }
.quota-grid b { display: block; margin: 4px 0 2px; font-size: 18px; color: var(--hr-text); font-variant-numeric: tabular-nums; }
.person-list { margin: 14px 16px; display: grid; gap: 12px; }
.person-row {
  width: 100%;
  border: 1px solid var(--hr-border-strong);
  border-radius: 14px;
  background: linear-gradient(180deg, var(--hr-surface-raised), var(--hr-surface));
  padding: 15px;
  display: grid;
  grid-template-columns: 46px 1fr 18px;
  align-items: center;
  gap: 12px;
  text-align: left;
  box-shadow: 0 9px 22px rgba(8, 31, 49, .11);
}
.person-row:active { transform: scale(.986); }
.person-row.blocked { opacity: .72; background: var(--hr-surface-strong); }
.avatar {
  width: 46px;
  height: 46px;
  border-radius: 14px;
  background: var(--hr-primary-soft);
  color: var(--hr-accent-strong);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  font-weight: 900;
}
.person-main { min-width: 0; }
.person-top { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.person-name { font-size: 17px; font-weight: 900; color: var(--hr-text); }
.person-meta { margin-top: 4px; font-size: 12px; color: var(--hr-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.score-line { margin-top: 7px; display: flex; gap: 10px; color: var(--hr-muted); font-size: 12px; font-variant-numeric: tabular-nums; }
.status { flex: 0 0 auto; font-size: 12px; padding: 5px 9px; border-radius: 999px; font-weight: 900; }
.status.completed { color: var(--hr-success); background: #d9f0e4; }
.status.draft { color: var(--hr-accent-strong); background: var(--hr-primary-soft); }
.status.pending { color: #8a4d00; background: #f5e4bd; }
.status.blocked { color: #9a3412; background: #f0d8c7; }
.chevron { color: var(--hr-faint); }
</style>
