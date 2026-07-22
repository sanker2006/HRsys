<template>
  <div class="page">
    <van-nav-bar :title="pageTitle" left-arrow @click-left="handleBack" class="nav" />

    <section class="summary">
      <div>
        <div class="summary-kicker">{{ summaryKicker }}</div>
        <div class="summary-title">{{ summaryTitle }}</div>
        <div class="summary-meta">{{ summaryMeta }}</div>
      </div>
      <div class="summary-count">{{ summaryCount }}</div>
    </section>

    <GradePolicyPanel v-if="props.type === 'downward' && quota && !isLeaderDownward" :policy="quota" />

    <section v-if="showDepartmentList" class="department-list">
      <button
        v-for="dept in departmentRows"
        :key="dept.name"
        class="department-row"
        type="button"
        :aria-label="`进入${dept.name}`"
        @click="selectedDepartment = dept.name"
      >
        <div class="department-mark">{{ dept.name.charAt(0) }}</div>
        <div class="department-main">
          <div class="department-top">
            <div class="department-name">{{ dept.name }}</div>
            <span class="department-status">{{ dept.completed }}/{{ dept.total }}</span>
          </div>
          <div class="department-meta">
            <span>负责人 {{ dept.managerCount }}</span>
            <span>员工 {{ dept.staffCount }}</span>
            <span>可评 {{ dept.available }}</span>
            <span>受限 {{ dept.blocked }}</span>
          </div>
        </div>
        <svg class="chevron" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
          <polyline points="9 18 15 12 9 6" />
        </svg>
      </button>
    </section>

    <section v-else class="person-list">
      <button v-if="isLeaderDownward && selectedDepartment" class="back-row" type="button" @click="selectedDepartment = ''">
        返回部门清单
      </button>

      <button
        v-for="item in visibleList"
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
            <span v-if="props.type === 'downward' && item.target_level === 'staff'">主管 {{ formatScore(item.manager_total) }}</span>
            <span v-if="props.type !== 'downward'">互评 {{ formatScore(item.totalScore) }}</span>
          </div>
          <div v-if="props.type === 'downward' && !item.can_submit && item.status !== 'completed'" class="blocked-reason">
            {{ item.blocked_reason || '暂不可评价' }}
          </div>
        </div>
        <svg class="chevron" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
          <polyline points="9 18 15 12 9 6" />
        </svg>
      </button>
    </section>

    <van-empty
      v-if="!loading && !showDepartmentList && visibleList.length === 0"
      :description="props.type === 'downward' ? '暂无向下评价对象' : '暂无同级互评对象'"
    />
  </div>
</template>

<script setup lang="ts">
import { closeToast, showLoadingToast, showToast } from 'vant'
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { h5Api } from '../api'
import GradePolicyPanel from '../components/GradePolicyPanel.vue'

const props = defineProps<{ batchId: string; type: string }>()
const router = useRouter()

const loading = ref(false)
const peerList = ref<any[]>([])
const downwardList = ref<any[]>([])
const quota = ref<any>(null)
const selectedDepartment = ref('')

const pageTitle = computed(() => props.type === 'downward' ? '向下评价' : '同级互评')
const currentList = computed(() => props.type === 'downward' ? downwardList.value : peerList.value)
const isLeaderDownward = computed(() => (
  props.type === 'downward' &&
  downwardList.value.some(item => ['main_leader', 'division_leader'].includes(item.evaluator_level))
))
const showDepartmentList = computed(() => isLeaderDownward.value && !selectedDepartment.value)
const visibleList = computed(() => {
  if (isLeaderDownward.value && selectedDepartment.value) {
    return downwardList.value.filter(item => item.target_department === selectedDepartment.value)
  }
  return currentList.value
})
const completedCount = computed(() => visibleList.value.filter(item => item.status === 'completed').length)

const departmentRows = computed(() => {
  const map = new Map<string, any>()
  for (const item of downwardList.value) {
    const name = item.target_department || '未分部门'
    if (!map.has(name)) {
      map.set(name, { name, total: 0, completed: 0, available: 0, blocked: 0, managerCount: 0, staffCount: 0 })
    }
    const row = map.get(name)
    row.total += 1
    if (item.status === 'completed') row.completed += 1
    if (item.can_submit || item.status === 'completed') row.available += 1
    else row.blocked += 1
    if (item.target_level === 'manager') row.managerCount += 1
    if (item.target_level === 'staff') row.staffCount += 1
  }
  return Array.from(map.values())
})

const summaryKicker = computed(() => {
  if (showDepartmentList.value) return '先选择部门，再评价人员'
  if (props.type === 'downward') return '先看状态，再逐人评分'
  return '按人员逐一完成综合评价'
})
const summaryTitle = computed(() => selectedDepartment.value || pageTitle.value)
const summaryMeta = computed(() => {
  if (showDepartmentList.value) return `${departmentRows.value.length} 个部门待处理`
  return `${completedCount.value} 人已完成，${visibleList.value.length - completedCount.value} 人待处理`
})
const summaryCount = computed(() => showDepartmentList.value ? String(departmentRows.value.length) : `${completedCount.value}/${visibleList.value.length}`)

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
  if (props.type === 'downward' && !item.can_submit) return '暂不可评'
  if (item.status === 'draft') return '草稿'
  return '可评分'
}

function openPerson(item: any) {
  if (props.type === 'downward') {
    if (!item.can_submit && item.status !== 'completed') {
      showToast(item.blocked_reason || '当前对象暂不可评价')
      return
    }
    router.push(`/downward-eval/${props.batchId}/${item.id}`)
    return
  }
  router.push(`/peer-eval/${props.batchId}/${item.id}`)
}

function handleBack() {
  if (selectedDepartment.value) {
    selectedDepartment.value = ''
    return
  }
  router.back()
}

async function loadData() {
  loading.value = true
  try {
    if (props.type === 'downward') {
      const res: any = await h5Api.getDownwardOverview(Number(props.batchId))
      downwardList.value = res.data?.list || []
      quota.value = res.data?.quota || null
      if (selectedDepartment.value && !downwardList.value.some(item => item.target_department === selectedDepartment.value)) {
        selectedDepartment.value = ''
      }
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
  background:
    radial-gradient(circle at 92% 8%, rgba(103, 232, 249, .22), transparent 30%),
    linear-gradient(145deg, #0f3b5f 0%, #036486 100%);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  box-shadow: 0 10px 26px rgba(15, 23, 42, .14);
}
.summary-kicker { font-size: 12px; color: rgba(255,255,255,.72); }
.summary-title { margin-top: 4px; font-size: 22px; font-weight: 900; }
.summary-meta { margin-top: 5px; font-size: 13px; color: rgba(255,255,255,.78); }
.summary-count { font-size: 30px; font-weight: 900; font-variant-numeric: tabular-nums; white-space: nowrap; }
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
.quota-grid div { border-radius: 12px; padding: 10px; border: 1px solid rgba(201,215,229,.9); }
.quota-card.high { background: linear-gradient(180deg, #e6f4ee, #d5eadf); border-color: #9fd4b8; }
.quota-card.mid { background: linear-gradient(180deg, #f5ead0, #ecdbb8); border-color: #d1ae68; }
.quota-card.low { background: linear-gradient(180deg, #dceaf8, #cbdceb); border-color: #93b3ce; }
.quota-grid span, .quota-grid em { display: block; font-size: 11px; color: var(--hr-muted); font-style: normal; }
.quota-grid b { display: block; margin: 4px 0 2px; font-size: 18px; color: var(--hr-text); font-variant-numeric: tabular-nums; }
.department-list,
.person-list { margin: 14px 16px; display: grid; gap: 12px; }
.department-row,
.person-row {
  width: 100%;
  border: 1px solid var(--hr-border-strong);
  border-radius: 14px;
  background: linear-gradient(180deg, var(--hr-surface-raised), var(--hr-surface));
  padding: 15px;
  display: grid;
  align-items: center;
  gap: 12px;
  text-align: left;
  box-shadow: 0 9px 22px rgba(8, 31, 49, .11);
}
.department-row { grid-template-columns: 48px 1fr 18px; }
.person-row { grid-template-columns: 46px 1fr 18px; }
.department-row:active,
.person-row:active { transform: scale(.986); }
.person-row.blocked { opacity: .72; background: var(--hr-surface-strong); }
.department-mark,
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
.department-main,
.person-main { min-width: 0; }
.department-top,
.person-top { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.department-name,
.person-name { font-size: 17px; font-weight: 900; color: var(--hr-text); }
.department-status {
  color: var(--hr-accent-strong);
  background: var(--hr-primary-soft);
  border-radius: 999px;
  padding: 5px 10px;
  font-size: 12px;
  font-weight: 900;
}
.department-meta,
.person-meta { margin-top: 4px; font-size: 12px; color: var(--hr-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.department-meta,
.score-line { margin-top: 7px; display: flex; gap: 10px; color: var(--hr-muted); font-size: 12px; font-variant-numeric: tabular-nums; }
.blocked-reason { margin-top: 7px; color: #9a3412; font-size: 12px; line-height: 1.4; }
.status { flex: 0 0 auto; font-size: 12px; padding: 5px 9px; border-radius: 999px; font-weight: 900; }
.status.completed { color: var(--hr-success); background: #d9f0e4; }
.status.draft { color: var(--hr-accent-strong); background: var(--hr-primary-soft); }
.status.pending { color: #8a4d00; background: #f5e4bd; }
.status.blocked { color: #9a3412; background: #f0d8c7; }
.chevron { color: var(--hr-faint); }
.back-row {
  height: 46px;
  border: 1px solid #8eb9d4;
  border-radius: 12px;
  background: #dbeafe;
  color: var(--hr-accent-strong);
  font-weight: 900;
  font-size: 15px;
}
</style>
