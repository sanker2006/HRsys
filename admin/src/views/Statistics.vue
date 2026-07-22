<template>
  <div class="admin-page statistics-page">
    <section class="admin-hero statistics-hero">
      <div>
        <h1>数据统计和导出</h1>
        <p>{{ batch?.name || '当前批次' }} · 只统计部门负责人和员工，领导层仅作为评分来源。</p>
      </div>
      <div class="hero-actions">
        <el-button @click="$router.push('/batch')">返回批次</el-button>
        <el-button @click="loadData" :loading="loading">刷新</el-button>
        <el-button type="primary" @click="downloadExcel" :loading="exporting">导出 Excel</el-button>
      </div>
    </section>

    <section class="metric-grid">
      <div class="metric-card">
        <div class="metric-label">统计人数</div>
        <div class="metric-value">{{ summary.total }}</div>
        <div class="metric-note">部门负责人 + 员工</div>
      </div>
      <div class="metric-card">
        <div class="metric-label">数据完整</div>
        <div class="metric-value success">{{ summary.complete }}</div>
        <div class="metric-note">可计算最终总分</div>
      </div>
      <div class="metric-card">
        <div class="metric-label">数据缺失</div>
        <div class="metric-value warning">{{ summary.missing }}</div>
        <div class="metric-note">不折算，不生成最终分</div>
      </div>
      <div class="metric-card">
        <div class="metric-label">平均最终分</div>
        <div class="metric-value">{{ averageFinalScore }}</div>
        <div class="metric-note">仅统计完整数据</div>
      </div>
    </section>

    <el-alert
      v-if="summary.missing > 0"
      class="missing-alert"
      type="warning"
      :closable="false"
      show-icon
      title="存在缺失评分来源，相关人员最终总分显示为 -。请补齐评分后刷新。"
    />

    <el-card class="work-card">
      <template #header>
        <div class="card-titlebar">
          <div class="card-title">
            <strong>统计明细</strong>
            <span>领导对员工业绩已单独记录，暂不纳入现行业绩计算；最终分仍按当前公式计算。</span>
          </div>
        </div>
      </template>

      <el-table
        v-loading="loading"
        :data="rows"
        class="admin-table statistics-table"
        height="620"
        border
      >
        <el-table-column prop="index" label="序号" width="72" fixed />
        <el-table-column prop="department" label="部门" width="150" fixed />
        <el-table-column prop="employee_no" label="员工工号" width="130" fixed />
        <el-table-column prop="name" label="员工姓名" width="120" fixed />
        <el-table-column prop="role_label" label="角色" width="110" />

        <el-table-column label="业绩分">
          <el-table-column label="员工自评" width="110" align="center">
            <template #default="{ row }">{{ scoreText(row.performance_self_score) }}</template>
          </el-table-column>
          <el-table-column label="部门负责人" width="120" align="center">
            <template #default="{ row }">{{ scoreText(row.performance_manager_score) }}</template>
          </el-table-column>
          <el-table-column label="分管领导" width="110" align="center">
            <template #default="{ row }">{{ scoreText(row.performance_division_leader_score) }}</template>
          </el-table-column>
          <el-table-column label="主要领导" width="110" align="center">
            <template #default="{ row }">{{ scoreText(row.performance_main_leader_score) }}</template>
          </el-table-column>
          <el-table-column label="领导评价" width="110" align="center">
            <template #default="{ row }">{{ scoreText(row.performance_leader_score) }}</template>
          </el-table-column>
          <el-table-column label="计算分" width="100" align="center">
            <template #default="{ row }"><b>{{ scoreText(row.performance_score) }}</b></template>
          </el-table-column>
        </el-table-column>

        <el-table-column label="综合评分">
          <el-table-column label="主要领导" width="110" align="center">
            <template #default="{ row }">{{ scoreText(row.comprehensive_main_leader_score) }}</template>
          </el-table-column>
          <el-table-column label="分管领导" width="110" align="center">
            <template #default="{ row }">{{ scoreText(row.comprehensive_division_leader_score) }}</template>
          </el-table-column>
          <el-table-column label="部门负责人" width="120" align="center">
            <template #default="{ row }">{{ scoreText(row.comprehensive_manager_score) }}</template>
          </el-table-column>
          <el-table-column label="中层互评" width="110" align="center">
            <template #default="{ row }">{{ scoreText(row.comprehensive_manager_peer_score) }}</template>
          </el-table-column>
          <el-table-column label="员工评议" width="110" align="center">
            <template #default="{ row }">{{ scoreText(row.comprehensive_employee_review_score) }}</template>
          </el-table-column>
          <el-table-column label="员工互评" width="110" align="center">
            <template #default="{ row }">{{ scoreText(row.comprehensive_staff_peer_score) }}</template>
          </el-table-column>
          <el-table-column label="自评价" width="100" align="center">
            <template #default="{ row }">{{ scoreText(row.comprehensive_self_score) }}</template>
          </el-table-column>
          <el-table-column label="计算分" width="100" align="center">
            <template #default="{ row }"><b>{{ scoreText(row.comprehensive_score) }}</b></template>
          </el-table-column>
        </el-table-column>

        <el-table-column label="汇总">
          <el-table-column label="最终总分" width="110" align="center">
            <template #default="{ row }">
              <b class="final-score">{{ scoreText(row.final_score) }}</b>
            </template>
          </el-table-column>
          <el-table-column label="数据状态" width="120" align="center">
            <template #default="{ row }">
              <el-tag :type="row.data_status === 'complete' ? 'success' : 'warning'">
                {{ row.data_status === 'complete' ? '完整' : '数据缺失' }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column label="缺失项" min-width="260">
            <template #default="{ row }">
              <span v-if="!row.missing_items?.length" class="muted">-</span>
              <div v-else class="missing-list">
                <el-tag v-for="item in row.missing_items" :key="item" type="warning" size="small">{{ item }}</el-tag>
              </div>
            </template>
          </el-table-column>
        </el-table-column>
      </el-table>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { ElMessage } from 'element-plus'
import { computed, onMounted, ref } from 'vue'
import { answerApi } from '../api'

const props = defineProps<{ batchId: string }>()

const loading = ref(false)
const exporting = ref(false)
const batch = ref<any>(null)
const rows = ref<any[]>([])
const summary = ref({ total: 0, complete: 0, missing: 0 })

const averageFinalScore = computed(() => {
  const scores = rows.value
    .map(row => row.final_score)
    .filter(score => score !== null && score !== undefined && Number.isFinite(Number(score)))
    .map(Number)
  if (!scores.length) return '-'
  return (scores.reduce((sum, score) => sum + score, 0) / scores.length).toFixed(1)
})

function scoreText(score: number | string | null | undefined) {
  if (score === null || score === undefined || score === '') return '-'
  const value = Number(score)
  return Number.isFinite(value) ? value.toFixed(1) : '-'
}

function fileNameFromDisposition(disposition: string | null) {
  if (!disposition) return ''
  const match = disposition.match(/filename\*=UTF-8''([^;]+)/)
  return match ? decodeURIComponent(match[1]) : ''
}

async function loadData() {
  loading.value = true
  try {
    const res: any = await answerApi.statistics(Number(props.batchId))
    batch.value = res.data?.batch || null
    rows.value = res.data?.rows || []
    summary.value = res.data?.summary || { total: 0, complete: 0, missing: 0 }
  } finally {
    loading.value = false
  }
}

async function downloadExcel() {
  exporting.value = true
  try {
    const blob: any = await answerApi.exportStatistics(Number(props.batchId))
    const fileName = fileNameFromDisposition(blob?.headers?.['content-disposition'] || null)
      || `数据统计-${batch.value?.name || props.batchId}.xlsx`
    const data = blob instanceof Blob ? blob : new Blob([blob], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    const url = URL.createObjectURL(data)
    const a = document.createElement('a')
    a.href = url
    a.download = fileName
    a.click()
    URL.revokeObjectURL(url)
    ElMessage.success('导出完成')
  } finally {
    exporting.value = false
  }
}

onMounted(loadData)
</script>

<style scoped>
.statistics-hero {
  align-items: center;
}

.metric-value.success { color: var(--admin-success); }
.metric-value.warning { color: var(--admin-warning); }

.missing-alert {
  border-radius: 10px;
}

.statistics-table :deep(.el-table__cell) {
  font-variant-numeric: tabular-nums;
}

.final-score {
  color: var(--admin-primary-2);
  font-size: 14px;
}

.missing-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.muted {
  color: var(--admin-faint);
}
</style>
