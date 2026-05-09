<template>
  <div class="progress-page">
    <el-card v-loading="loading">
      <template #header>
        <div class="header">
          <span>进度监控</span>
          <el-button size="small" @click="$router.back()">返回</el-button>
        </div>
      </template>

      <div v-if="batch" class="batch-info">
        <div class="batch-title-row">
          <span class="batch-name">{{ batch.name }}</span>
          <span class="batch-period">{{ batch.period }}</span>
          <el-tag :type="statusType[batch.status] || 'info'" size="small">{{ statusText[batch.status] || batch.status }}</el-tag>
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

      <div v-if="!loading" class="type-stats">
        <button class="type-card type-self" :class="{ active: activeTab === 'self' }" @click="activeTab = 'self'">
          <div class="type-icon">自</div>
          <div class="type-body">
            <div class="type-name">自评</div>
            <div class="type-nums">{{ typeStats.self.completed }}已完成 · {{ typeStats.self.pending }}待评 · {{ typeStats.self.total }}总计</div>
          </div>
        </button>
        <button class="type-card type-peer" :class="{ active: activeTab === 'peer' }" @click="activeTab = 'peer'">
          <div class="type-icon">互</div>
          <div class="type-body">
            <div class="type-name">互评</div>
            <div class="type-nums">{{ typeStats.peer.completed }}已完成 · {{ typeStats.peer.pending }}待评 · {{ typeStats.peer.total }}总计</div>
          </div>
        </button>
        <button class="type-card type-down" :class="{ active: activeTab === 'downward' }" @click="activeTab = 'downward'">
          <div class="type-icon">下</div>
          <div class="type-body">
            <div class="type-name">向下评估</div>
            <div class="type-nums">{{ typeStats.downward.completed }}已完成 · {{ typeStats.downward.pending }}待评 · {{ typeStats.downward.total }}总计</div>
          </div>
        </button>
      </div>
    </el-card>

    <el-card class="table-card">
      <el-tabs v-model="activeTab">
        <el-tab-pane name="self" label="自评进度">
          <ProgressTable
            :rows="selfList"
            mode="self"
            :page="selfPage"
            :page-size="selfPageSize"
            @update:page="selfPage = $event"
            @update:page-size="selfPageSize = $event"
          />
        </el-tab-pane>

        <el-tab-pane name="peer" label="互评进度">
          <ProgressTable
            :rows="peerList"
            mode="peer"
            :page="peerPage"
            :page-size="peerPageSize"
            @update:page="peerPage = $event"
            @update:page-size="peerPageSize = $event"
          />
        </el-tab-pane>

        <el-tab-pane name="downward" label="向下评估">
          <ProgressTable
            :rows="downwardList"
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
import { computed, defineComponent, h, onMounted, ref } from 'vue'
import { ElEmpty, ElPagination, ElTable, ElTableColumn, ElTag } from 'element-plus'
import { answerApi, batchApi } from '../api'

type TagType = 'primary' | 'success' | 'warning' | 'info' | 'danger'

const props = defineProps<{ batchId: string }>()
const loading = ref(false)
const batch = ref<any>(null)
const selfList = ref<any[]>([])
const peerList = ref<any[]>([])
const downwardList = ref<any[]>([])
const selfPage = ref(1)
const selfPageSize = ref(20)
const peerPage = ref(1)
const peerPageSize = ref(20)
const downwardPage = ref(1)
const downwardPageSize = ref(20)
const activeTab = ref('self')

const statusType: Record<string, TagType> = { draft: 'warning', active: 'success', closed: 'info' }
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
  downward: { total: 0, completed: 0, draft: 0, pending: 0 },
})

const totalStats = computed(() => ({
  total: typeStats.value.self.total + typeStats.value.peer.total + typeStats.value.downward.total,
  completed: typeStats.value.self.completed + typeStats.value.peer.completed + typeStats.value.downward.completed,
}))
const totalProgress = computed(() => totalStats.value.total ? Math.round((totalStats.value.completed / totalStats.value.total) * 100) : 0)
const progressColor = computed(() => totalProgress.value >= 80 ? '#67c23a' : totalProgress.value >= 40 ? '#e6a23c' : '#909399')

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
    downwardList.value = d?.downward?.list || []
    typeStats.value = {
      self: d?.self?.stats || typeStats.value.self,
      peer: d?.peer?.stats || typeStats.value.peer,
      downward: d?.downward?.stats || typeStats.value.downward,
    }
  } finally {
    loading.value = false
  }
})
</script>

<style scoped>
.progress-page { min-height: 100%; }
.header { display: flex; justify-content: space-between; align-items: center; font-size: 15px; font-weight: 600; }
.batch-info { padding: 4px 0 16px; }
.batch-title-row { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; }
.batch-name { font-size: 18px; font-weight: 700; color: #1a2332; }
.batch-period { font-size: 13px; color: #666; background: #f1f3f4; padding: 2px 8px; border-radius: 4px; }
.batch-meta { font-size: 13px; color: #888; margin-bottom: 14px; }
.overall-bar { background: #f8f9fb; border-radius: 10px; padding: 12px 16px 8px; margin-top: 6px; }
.bar-label { display: flex; align-items: baseline; gap: 8px; margin-bottom: 8px; font-size: 13px; color: #555; }
.bar-label b { font-size: 18px; color: #1a2332; }
.bar-sub { font-size: 12px; color: #999; }
.type-stats { display: flex; gap: 10px; margin-top: 4px; }
.type-card { flex: 1; display: flex; align-items: center; gap: 12px; padding: 14px 16px; border-radius: 10px; cursor: pointer; border: 1.5px solid transparent; text-align: left; background: #fff; }
.type-card.active { box-shadow: 0 4px 12px rgba(0,0,0,0.08); }
.type-self { background: linear-gradient(135deg, #e6f0ff 0%, #dbeeff 100%); border-color: #bfd9ff; }
.type-peer { background: linear-gradient(135deg, #e8f7e8 0%, #d8f0d8 100%); border-color: #bde8bd; }
.type-down { background: linear-gradient(135deg, #fff4e6 0%, #ffefdf 100%); border-color: #ffd9a8; }
.type-icon { width: 32px; height: 32px; border-radius: 8px; display: flex; align-items: center; justify-content: center; background: rgba(255,255,255,.7); font-weight: 700; }
.type-name { font-size: 15px; font-weight: 700; color: #1a2332; margin-bottom: 4px; }
.type-nums { font-size: 12px; color: #666; }
.table-card { margin-top: 12px; }
.eval-table { font-size: 13px; border-radius: 8px; overflow: hidden; }
.total-val { color: #1a2332; font-size: 13px; }
.pagination-wrap { margin-top: 14px; display: flex; justify-content: flex-end; align-items: center; gap: 12px; }
.total-hint { font-size: 13px; color: #888; }
</style>
