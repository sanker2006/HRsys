<template>
  <div class="admin-page progress-page">
    <section class="admin-hero">
      <div v-if="batch" class="batch-info">
        <div class="batch-title-row">
          <span class="batch-name">{{ batch.name }}</span>
          <span class="batch-period">{{ batch.period }}</span>
          <span class="status-chip" :class="statusClass(batch.status)">{{ statusText[batch.status] || batch.status }}</span>
        </div>
        <div class="batch-meta">{{ batch.start_time }} ~ {{ batch.end_time }}</div>
        <div class="overall-bar">
          <div class="bar-label">
            <span>总体完成率</span>
            <b>{{ totalProgress }}%</b>
            <span class="bar-sub">({{ totalStats.completed }}/{{ totalStats.total }} 条)</span>
          </div>
          <el-progress :percentage="totalProgress" :stroke-width="14" :color="progressColor" />
        </div>
      </div>
      <div class="hero-actions">
        <el-button @click="$router.back()">返回批次</el-button>
      </div>
    </section>

    <el-card v-loading="loading" class="work-card">
      <div v-if="!loading" class="type-stats">
        <button class="type-card type-self" type="button" aria-label="查看自评进度" :class="{ active: activeTab === 'self' }" @click="activeTab = 'self'">
          <div class="type-icon">自</div>
          <div class="type-body">
            <div class="type-name">自评</div>
            <div class="type-nums">{{ typeStats.self.completed }}已完成 · {{ typeStats.self.pending }}待评 · {{ typeStats.self.total }}总计</div>
          </div>
        </button>
        <button class="type-card type-peer" type="button" aria-label="查看互评进度" :class="{ active: activeTab === 'peer' }" @click="activeTab = 'peer'">
          <div class="type-icon">互</div>
          <div class="type-body">
            <div class="type-name">互评</div>
            <div class="type-nums">{{ typeStats.peer.completed }}已完成 · {{ typeStats.peer.pending }}待评 · {{ typeStats.peer.total }}总计</div>
          </div>
        </button>
        <button class="type-card type-upward" type="button" aria-label="查看向上评价进度" :class="{ active: activeTab === 'upward' }" @click="activeTab = 'upward'">
          <div class="type-icon">上</div>
          <div class="type-body">
            <div class="type-name">向上评价</div>
            <div class="type-nums">{{ typeStats.upward.completed }}已完成 · {{ typeStats.upward.pending }}待评 · {{ typeStats.upward.total }}总计</div>
          </div>
        </button>
        <button class="type-card type-down" type="button" aria-label="查看向下评价进度" :class="{ active: activeTab === 'downward' }" @click="activeTab = 'downward'">
          <div class="type-icon">下</div>
          <div class="type-body">
            <div class="type-name">向下评估</div>
            <div class="type-nums">{{ typeStats.downward.completed }}已完成 · {{ typeStats.downward.pending }}待评 · {{ typeStats.downward.total }}总计</div>
          </div>
        </button>
      </div>
    </el-card>

    <el-card class="work-card table-card">
      <div class="progress-filters">
        <el-select v-model="filterEvaluatorIds" placeholder="姓名" multiple filterable clearable collapse-tags collapse-tags-tooltip>
          <el-option v-for="option in evaluatorOptions" :key="option.value" :label="option.label" :value="option.value" />
        </el-select>
        <el-select v-model="filterDepartments" placeholder="部门" multiple filterable clearable collapse-tags collapse-tags-tooltip>
          <el-option v-for="department in departmentOptions" :key="department" :label="department" :value="department" />
        </el-select>
        <el-select v-model="filterStatuses" placeholder="状态" multiple clearable collapse-tags collapse-tags-tooltip>
          <el-option label="待评" value="pending" />
          <el-option label="草稿" value="draft" />
          <el-option label="已完成" value="completed" />
        </el-select>
      </div>
      <el-tabs v-model="activeTab">
        <el-tab-pane name="self" label="自评进度">
          <ProgressTable
            :rows="filteredSelfList"
            mode="self"
            :page="selfPage"
            :page-size="selfPageSize"
            @update:page="selfPage = $event"
            @update:page-size="selfPageSize = $event"
          />
        </el-tab-pane>

        <el-tab-pane name="peer" label="互评进度">
          <ProgressTable
            :rows="filteredPeerList"
            mode="peer"
            :page="peerPage"
            :page-size="peerPageSize"
            @update:page="peerPage = $event"
            @update:page-size="peerPageSize = $event"
          />
        </el-tab-pane>

        <el-tab-pane name="upward" label="向上评价">
          <ProgressTable
            :rows="filteredUpwardList"
            mode="upward"
            :page="upwardPage"
            :page-size="upwardPageSize"
            @update:page="upwardPage = $event"
            @update:page-size="upwardPageSize = $event"
          />
        </el-tab-pane>

        <el-tab-pane name="downward" label="向下评估">
          <ProgressTable
            :rows="filteredDownwardList"
            mode="downward"
            :page="downwardPage"
            :page-size="downwardPageSize"
            @update:page="downwardPage = $event"
            @update:page-size="downwardPageSize = $event"
          />
        </el-tab-pane>
      </el-tabs>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { computed, defineComponent, h, onMounted, ref, watch } from 'vue'
import { ElEmpty, ElPagination, ElTable, ElTableColumn, ElTag } from 'element-plus'
import { answerApi, batchApi } from '../api'
import { buildDepartmentOptions, buildPersonOptions, filterProgressRows } from '../utils/relationFilters'

type TagType = 'primary' | 'success' | 'warning' | 'info' | 'danger'

const props = defineProps<{ batchId: string }>()
const loading = ref(false)
const batch = ref<any>(null)
const selfList = ref<any[]>([])
const peerList = ref<any[]>([])
const upwardList = ref<any[]>([])
const downwardList = ref<any[]>([])
const selfPage = ref(1)
const selfPageSize = ref(20)
const peerPage = ref(1)
const peerPageSize = ref(20)
const upwardPage = ref(1)
const upwardPageSize = ref(20)
const downwardPage = ref(1)
const downwardPageSize = ref(20)
const activeTab = ref('self')
const filterEvaluatorIds = ref<number[]>([])
const filterDepartments = ref<string[]>([])
const filterStatuses = ref<string[]>([])

const statusText: Record<string, string> = { draft: '草稿', active: '进行中', closed: '已结束' }
const statusTag: Record<string, TagType> = { completed: 'success', draft: 'warning', pending: 'info' }
const statusTagText: Record<string, string> = { completed: '已完成', draft: '草稿', pending: '待评' }
const roleText: Record<string, string> = {
  main_leader: '主要领导',
  division_leader: '分管领导',
  manager: '部门负责人',
  staff: '员工',
}

const typeStats = ref({
  self: { total: 0, completed: 0, draft: 0, pending: 0 },
  peer: { total: 0, completed: 0, draft: 0, pending: 0 },
  upward: { total: 0, completed: 0, draft: 0, pending: 0 },
  downward: { total: 0, completed: 0, draft: 0, pending: 0 },
})

const totalStats = computed(() => ({
  total: typeStats.value.self.total + typeStats.value.peer.total + typeStats.value.upward.total + typeStats.value.downward.total,
  completed: typeStats.value.self.completed + typeStats.value.peer.completed + typeStats.value.upward.completed + typeStats.value.downward.completed,
}))
const totalProgress = computed(() => totalStats.value.total ? Math.round((totalStats.value.completed / totalStats.value.total) * 100) : 0)
const progressColor = computed(() => totalProgress.value >= 80 ? '#67c23a' : totalProgress.value >= 40 ? '#e6a23c' : '#909399')
const allProgressRows = computed(() => [...selfList.value, ...peerList.value, ...upwardList.value, ...downwardList.value])
const evaluatorOptions = computed(() => buildPersonOptions(allProgressRows.value, 'evaluator'))
const departmentOptions = computed(() => buildDepartmentOptions(allProgressRows.value, 'evaluator'))
const progressFilters = computed(() => ({
  evaluatorIds: filterEvaluatorIds.value,
  evaluatorDepartments: filterDepartments.value,
  statuses: filterStatuses.value,
}))
const filteredSelfList = computed(() => filterProgressRows(selfList.value, progressFilters.value))
const filteredPeerList = computed(() => filterProgressRows(peerList.value, progressFilters.value))
const filteredUpwardList = computed(() => filterProgressRows(upwardList.value, progressFilters.value))
const filteredDownwardList = computed(() => filterProgressRows(downwardList.value, progressFilters.value))

watch([filterEvaluatorIds, filterDepartments, filterStatuses], () => {
  selfPage.value = 1
  peerPage.value = 1
  upwardPage.value = 1
  downwardPage.value = 1
}, { deep: true })

function statusClass(status: string) {
  if (status === 'active') return 'success'
  if (status === 'draft') return 'warning'
  return 'info'
}

const ProgressTable = defineComponent({
  props: {
    rows: { type: Array, required: true },
    mode: { type: String, required: true },
    page: { type: Number, required: true },
    pageSize: { type: Number, required: true },
  },
  emits: ['update:page', 'update:page-size'],
  setup(tableProps, { emit }) {
    const pagedRows = computed(() => {
      const start = (tableProps.page - 1) * tableProps.pageSize
      return (tableProps.rows as any[]).slice(start, start + tableProps.pageSize)
    })

    function statusCell(row: any) {
      return h(ElTag, { size: 'small', type: statusTag[row.status] || 'info' }, () => statusTagText[row.status] || row.status)
    }

    function scoreCell(row: any) {
      return h('b', { class: 'total-val' }, formatScore(row.totalScore))
    }

    function formatScore(score: number | string | null | undefined) {
      if (score === null || score === undefined || score === '') return '-'
      const value = Number(score)
      return Number.isFinite(value) ? value.toFixed(1) : '-'
    }

    return () => {
      if ((tableProps.rows as any[]).length === 0) return h(ElEmpty, { description: '暂无数据' })
      const commonColumns = [
        h(ElTableColumn, { type: 'index', label: '#', width: 60, align: 'center' }),
      ]
      const targetColumns = tableProps.mode === 'self'
        ? [
            h(ElTableColumn, { prop: 'target_name', label: '姓名', width: 120 }),
            h(ElTableColumn, { prop: 'target_department', label: '部门', minWidth: 140 }),
            h(ElTableColumn, { prop: 'target_level', label: '角色', width: 120, formatter: (_row: any, _col: any, value: string) => roleText[value] || value || '-' }),
          ]
        : [
            h(ElTableColumn, { prop: 'evaluator_name', label: '评价人', width: 120 }),
            h(ElTableColumn, { prop: 'evaluator_department', label: '评价部门', minWidth: 140 }),
            h(ElTableColumn, { prop: 'evaluator_level', label: '评价角色', width: 120, formatter: (_row: any, _col: any, value: string) => roleText[value] || value || '-' }),
            h(ElTableColumn, { prop: 'target_name', label: '被评人', width: 120 }),
            h(ElTableColumn, { prop: 'target_department', label: '被评部门', minWidth: 140 }),
            h(ElTableColumn, { prop: 'target_level', label: '被评角色', width: 120, formatter: (_row: any, _col: any, value: string) => roleText[value] || value || '-' }),
          ]

      return h('div', [
        h(ElTable, { data: pagedRows.value, stripe: true, class: 'eval-table', rowKey: 'id' }, () => [
          ...commonColumns,
          ...targetColumns,
          h(ElTableColumn, { label: '状态', width: 100, align: 'center' }, { default: ({ row }: any) => statusCell(row) }),
          h(ElTableColumn, { label: '总分', width: 90, align: 'center' }, { default: ({ row }: any) => scoreCell(row) }),
        ]),
        h('div', { class: 'pagination-wrap' }, [
          h('span', { class: 'total-hint' }, `共 ${(tableProps.rows as any[]).length} 条`),
          h(ElPagination, {
            currentPage: tableProps.page,
            pageSize: tableProps.pageSize,
            pageSizes: [20, 50, 100],
            total: (tableProps.rows as any[]).length,
            layout: 'sizes, prev, pager, next',
            background: true,
            'onUpdate:currentPage': (value: number) => emit('update:page', value),
            'onUpdate:pageSize': (value: number) => emit('update:page-size', value),
          }),
        ]),
      ])
    }
  },
})

onMounted(async () => {
  loading.value = true
  try {
    const [batchRes, progressRes]: any = await Promise.all([
      batchApi.get(Number(props.batchId)),
      answerApi.getAdminProgress(Number(props.batchId)),
    ])
    batch.value = batchRes.data || progressRes.data?.batch || null
    const d = progressRes.data
    selfList.value = d?.self?.list || []
    peerList.value = d?.peer?.list || []
    upwardList.value = d?.upward?.list || []
    downwardList.value = d?.downward?.list || []
    typeStats.value = {
      self: d?.self?.stats || typeStats.value.self,
      peer: d?.peer?.stats || typeStats.value.peer,
      upward: d?.upward?.stats || typeStats.value.upward,
      downward: d?.downward?.stats || typeStats.value.downward,
    }
  } finally {
    loading.value = false
  }
})
</script>

<style scoped>
.progress-page { min-height: 100%; }
.batch-info { flex: 1; min-width: 0; }
.batch-title-row { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; }
.batch-name { font-size: 22px; font-weight: 900; color: #fff; }
.batch-period { font-size: 13px; color: rgba(255,255,255,.82); background: rgba(255,255,255,.12); padding: 3px 9px; border-radius: 999px; }
.batch-meta { font-size: 13px; color: rgba(255,255,255,.72); margin-bottom: 14px; }
.overall-bar { background: rgba(255,255,255,.12); border: 1px solid rgba(255,255,255,.16); border-radius: 12px; padding: 12px 16px 8px; margin-top: 6px; max-width: 720px; }
.bar-label { display: flex; align-items: baseline; gap: 8px; margin-bottom: 8px; font-size: 13px; color: rgba(255,255,255,.78); }
.bar-label b { font-size: 20px; color: #fff; }
.bar-sub { font-size: 12px; color: rgba(255,255,255,.62); }
.type-stats { display: flex; gap: 10px; margin-top: 4px; }
.type-card { flex: 1; display: flex; align-items: center; gap: 12px; padding: 16px; border-radius: 12px; cursor: pointer; border: 1.5px solid transparent; text-align: left; background: #fff; }
.type-card.active { box-shadow: 0 4px 12px rgba(0,0,0,0.08); }
.type-self { background: linear-gradient(135deg, #e6f0ff 0%, #dbeeff 100%); border-color: #bfd9ff; }
.type-peer { background: linear-gradient(135deg, #e8f7e8 0%, #d8f0d8 100%); border-color: #bde8bd; }
.type-upward { background: linear-gradient(135deg, #e7f5f2 0%, #d8eee8 100%); border-color: #b7ded4; }
.type-down { background: linear-gradient(135deg, #fff4e6 0%, #ffefdf 100%); border-color: #ffd9a8; }
.type-icon { width: 32px; height: 32px; border-radius: 8px; display: flex; align-items: center; justify-content: center; background: rgba(255,255,255,.7); font-weight: 700; }
.type-name { font-size: 15px; font-weight: 700; color: #1a2332; margin-bottom: 4px; }
.type-nums { font-size: 12px; color: #666; }
.table-card { margin-top: 0; }
.progress-filters { display: grid; grid-template-columns: repeat(3, minmax(180px, 1fr)); gap: 10px; margin-bottom: 14px; }
.progress-filters .el-select { width: 100%; }
.eval-table { font-size: 13px; border-radius: 8px; overflow: hidden; }
.total-val { color: #1a2332; font-size: 13px; }
.pagination-wrap { margin-top: 14px; display: flex; justify-content: flex-end; align-items: center; gap: 12px; }
.total-hint { font-size: 13px; color: #888; }
@media (max-width: 720px) {
  .progress-filters { grid-template-columns: 1fr; }
}
</style>
