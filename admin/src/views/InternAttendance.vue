<template>
  <section class="admin-page attendance-page">
    <div class="admin-hero attendance-hero">
      <div>
        <h1>实习生打卡</h1>
        <p>月度统计、月度日历、年度日历统一查看；所有下载均为 Excel。</p>
      </div>
      <div class="hero-actions">
        <el-button @click="openMakeup">补卡</el-button>
        <el-button type="primary" @click="downloadCurrent">下载当前视图</el-button>
      </div>
    </div>

    <el-card class="work-card">
      <div class="toolbar-row filters">
        <el-date-picker v-model="filters.month" type="month" value-format="YYYY-MM" placeholder="月份" @change="loadAll" />
        <el-input v-model="filters.department" clearable placeholder="部门" @keyup.enter="loadAll" />
        <el-input v-model="filters.keyword" clearable placeholder="编号 / 姓名" @keyup.enter="loadAll" />
        <el-select v-model="filters.status" clearable placeholder="实习生状态" @change="loadAll">
          <el-option label="启用" value="active" />
          <el-option label="停用" value="inactive" />
        </el-select>
        <el-input v-model="year" placeholder="年度" @keyup.enter="loadYear" />
        <el-button type="primary" @click="loadAll">查询</el-button>
      </div>

      <div class="metric-grid attendance-metrics">
        <div class="metric-card"><div class="metric-label">实习生</div><div class="metric-value">{{ monthSummary.interns }}</div><div class="metric-note">当前筛选范围</div></div>
        <div class="metric-card"><div class="metric-label">应出勤</div><div class="metric-value">{{ monthSummary.expected }}</div><div class="metric-note">自然日统计</div></div>
        <div class="metric-card"><div class="metric-label">出勤</div><div class="metric-value success">{{ monthSummary.present }}</div><div class="metric-note">2 次及以上</div></div>
        <div class="metric-card"><div class="metric-label">缺勤</div><div class="metric-value danger">{{ monthSummary.absent }}</div><div class="metric-note">0 或 1 次</div></div>
        <div class="metric-card"><div class="metric-label">异常</div><div class="metric-value warning">{{ monthSummary.exception }}</div><div class="metric-note">补卡/驳回</div></div>
      </div>
    </el-card>

    <el-card class="work-card content-panel">
      <el-tabs v-model="activeTab" @tab-change="handleTabChange">
        <el-tab-pane label="月度统计" name="summary">
          <div class="card-titlebar section-title">
            <div class="card-title">
              <strong>月度统计</strong>
              <span>按实习生汇总当月应出勤、出勤、缺勤和异常。</span>
            </div>
            <div class="hero-actions"><el-button @click="exportMonthSummary">下载月度统计</el-button></div>
          </div>
          <div class="table-scroll">
            <el-table v-loading="loading" :data="filteredStatsRows" border min-width="1050">
              <el-table-column type="index" width="64" label="序号" />
              <el-table-column prop="intern.intern_no" label="编号" width="120" />
              <el-table-column prop="intern.name" label="姓名" width="110" />
              <el-table-column prop="intern.department" label="部门" min-width="150" />
              <el-table-column prop="intern.mentor" label="负责人" width="110" />
              <el-table-column prop="summary.expected_days" label="应出勤" width="100" />
              <el-table-column prop="summary.present_days" label="出勤" width="90" />
              <el-table-column prop="summary.absent_days" label="缺勤" width="90" />
              <el-table-column prop="summary.exception_days" label="异常" width="90" />
              <el-table-column prop="summary.makeup_count" label="补卡" width="90" />
              <el-table-column prop="summary.rejected_count" label="驳回/作废" width="110" />
            </el-table>
          </div>

          <div class="card-titlebar section-title records-title">
            <div class="card-title">
              <strong>原始打卡记录</strong>
              <span>原始记录不直接覆盖，管理员调整通过事件追加。</span>
            </div>
          </div>
          <div class="table-scroll">
            <el-table v-loading="loading" :data="records" border min-width="1200">
              <el-table-column prop="punch_date" label="日期" width="110" />
              <el-table-column prop="punch_time" label="服务器时间" min-width="180" />
              <el-table-column prop="intern_no" label="编号" width="120" />
              <el-table-column prop="intern_name" label="姓名" width="110" />
              <el-table-column prop="department" label="部门" min-width="140" />
              <el-table-column label="证据" width="120">
                <template #default="{ row }">{{ evidenceLabel(row.evidence_type, row.has_photo) }}</template>
              </el-table-column>
              <el-table-column label="经纬度" min-width="210">
                <template #default="{ row }">
                  <span v-if="row.latitude !== null && row.longitude !== null">{{ Number(row.latitude).toFixed(6) }}, {{ Number(row.longitude).toFixed(6) }}</span>
                  <span v-else>-</span>
                </template>
              </el-table-column>
              <el-table-column label="精度" width="90">
                <template #default="{ row }">{{ row.accuracy == null ? '-' : `${Number(row.accuracy).toFixed(1)}m` }}</template>
              </el-table-column>
              <el-table-column label="操作" width="180" fixed="right">
                <template #default="{ row }">
                  <el-button link type="danger" @click="openAdjust('reject', row)">驳回</el-button>
                  <el-button link @click="openAdjust('restore', row)">恢复</el-button>
                  <el-button link type="warning" @click="openAdjust('void', row)">作废</el-button>
                </template>
              </el-table-column>
            </el-table>
          </div>
        </el-tab-pane>

        <el-tab-pane label="月度日历" name="month-calendar">
          <div class="card-titlebar section-title">
            <div class="card-title">
              <strong>{{ filters.month }} 月度日历</strong>
              <span>每个实习生一张日历卡，出勤/缺勤/异常状态直接铺开。</span>
            </div>
            <div class="hero-actions"><el-button @click="exportMonthCalendar">下载月度日历</el-button></div>
          </div>
          <div class="calendar-list" v-loading="loading">
            <article v-for="row in filteredStatsRows" :key="row.intern.id" class="calendar-card">
              <header>
                <div>
                  <strong>{{ row.intern.name }}</strong>
                  <span>{{ row.intern.intern_no }} · {{ row.intern.department }} · {{ row.intern.mentor || '无负责人' }}</span>
                </div>
                <el-tag :type="row.summary.absent_days > 0 ? 'warning' : 'success'">
                  出勤 {{ row.summary.present_days }}/{{ row.summary.expected_days }}
                </el-tag>
              </header>
              <div class="day-grid">
                <div v-for="day in row.days" :key="day.date" class="day-cell" :class="[day.status, { exception: day.makeup_count || day.rejected_count }]">
                  <b>{{ day.date.slice(8) }}</b>
                  <span>{{ day.status === 'present' ? '出勤' : '缺勤' }}</span>
                  <small>{{ day.valid_count }} 次</small>
                </div>
              </div>
            </article>
            <el-empty v-if="!filteredStatsRows.length" description="没有匹配的实习生" />
          </div>
        </el-tab-pane>

        <el-tab-pane label="年度日历" name="year-calendar">
          <div class="card-titlebar section-title">
            <div class="card-title">
              <strong>{{ year }} 年度日历</strong>
              <span>按 12 个月展示年度应出勤、出勤、缺勤和异常。</span>
            </div>
            <div class="hero-actions"><el-button @click="exportYearCalendar">下载年度日历</el-button></div>
          </div>
          <div class="year-metrics">
            <div v-for="month in filteredYearMonths" :key="month.month" class="year-metric">
              <span>{{ month.month.slice(5) }}月</span>
              <strong>{{ month.summary.present_days }}/{{ month.summary.expected_days }}</strong>
              <small>缺勤 {{ month.summary.absent_days }} · 异常 {{ month.summary.exception_days }}</small>
            </div>
          </div>
          <div class="table-scroll">
            <el-table v-loading="yearLoading" :data="filteredYearRows" border min-width="1200">
              <el-table-column prop="intern.intern_no" label="编号" width="120" fixed="left" />
              <el-table-column prop="intern.name" label="姓名" width="110" fixed="left" />
              <el-table-column prop="intern.department" label="部门" width="140" />
              <el-table-column v-for="month in yearColumns" :key="month" :label="`${Number(month.slice(5))}月`" width="150">
                <template #default="{ row }">
                  <span>{{ monthText(row.months.find((item: any) => item.month === month)?.summary) }}</span>
                </template>
              </el-table-column>
              <el-table-column label="全年汇总" width="180" fixed="right">
                <template #default="{ row }">
                  <strong>出 {{ row.summary.present_days }}</strong>
                  <span class="year-total"> / 应 {{ row.summary.expected_days }} / 缺 {{ row.summary.absent_days }}</span>
                </template>
              </el-table-column>
            </el-table>
          </div>
        </el-tab-pane>
      </el-tabs>
    </el-card>

    <el-dialog v-model="adjustVisible" :title="adjustTitle" width="min(520px, 92vw)" class="safe-dialog">
      <el-form :model="adjustForm" label-width="90px">
        <el-form-item v-if="adjustForm.action === 'makeup'" label="实习生" required>
          <el-select v-model="adjustForm.intern_id" filterable placeholder="选择实习生" style="width: 100%">
            <el-option v-for="row in filteredStatsRows" :key="row.intern.id" :label="`${row.intern.name} · ${row.intern.department}`" :value="row.intern.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="日期" required>
          <el-date-picker v-model="adjustForm.target_date" value-format="YYYY-MM-DD" type="date" style="width: 100%" />
        </el-form-item>
        <el-form-item label="原因" required>
          <el-input v-model="adjustForm.reason" type="textarea" :rows="3" maxlength="160" show-word-limit />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="adjustVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="submitAdjust">确认</el-button>
      </template>
    </el-dialog>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { internApi } from '../api'

function currentMonth() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

const loading = ref(false)
const yearLoading = ref(false)
const saving = ref(false)
const activeTab = ref('summary')
const statsRows = ref<any[]>([])
const records = ref<any[]>([])
const yearData = ref<any>({ months: [], rows: [] })
const adjustVisible = ref(false)
const filters = reactive({ month: currentMonth(), department: '', keyword: '', status: '' })
const year = ref(String(new Date().getFullYear()))
const adjustForm = reactive<any>({ action: 'makeup', intern_id: null, record_id: null, target_date: '', reason: '' })

const filteredStatsRows = computed(() => statsRows.value.filter(matchesIntern))
const filteredYearRows = computed(() => (yearData.value.rows || []).filter(matchesIntern))
const yearColumns = computed(() => Array.from({ length: 12 }, (_, index) => `${year.value}-${String(index + 1).padStart(2, '0')}`))
const filteredYearMonths = computed(() => {
  const rows = filteredYearRows.value
  return yearColumns.value.map(month => {
    const summary = rows.reduce((acc: any, row: any) => {
      const item = row.months.find((m: any) => m.month === month)?.summary || {}
      acc.expected_days += item.expected_days || 0
      acc.present_days += item.present_days || 0
      acc.absent_days += item.absent_days || 0
      acc.exception_days += item.exception_days || 0
      return acc
    }, { expected_days: 0, present_days: 0, absent_days: 0, exception_days: 0 })
    return { month, summary }
  })
})

const monthSummary = computed(() => filteredStatsRows.value.reduce((acc, row) => {
  acc.interns += 1
  acc.expected += row.summary.expected_days || 0
  acc.present += row.summary.present_days || 0
  acc.absent += row.summary.absent_days || 0
  acc.exception += row.summary.exception_days || 0
  return acc
}, { interns: 0, expected: 0, present: 0, absent: 0, exception: 0 }))

const adjustTitle = computed(() => ({
  makeup: '管理员补卡',
  reject: '驳回打卡记录',
  restore: '恢复打卡记录',
  void: '作废打卡记录',
} as Record<string, string>)[adjustForm.action] || '调整记录')

function matchesIntern(row: any) {
  const intern = row.intern || {}
  const keyword = filters.keyword.trim()
  if (filters.department && intern.department !== filters.department) return false
  if (filters.status && intern.status !== filters.status) return false
  if (keyword && !`${intern.name || ''} ${intern.intern_no || ''}`.includes(keyword)) return false
  return true
}

async function loadAll() {
  loading.value = true
  try {
    const params = { month: filters.month, department: filters.department, status: filters.status }
    const [statsRes, recordsRes]: any[] = await Promise.all([
      internApi.statistics({ month: filters.month }),
      internApi.records(params),
    ])
    statsRows.value = statsRes.data?.rows || []
    records.value = (recordsRes.data || []).filter((row: any) => {
      const keyword = filters.keyword.trim()
      return !keyword || `${row.intern_name || ''} ${row.intern_no || ''}`.includes(keyword)
    })
  } finally {
    loading.value = false
  }
}

async function loadYear() {
  if (!/^\d{4}$/.test(year.value)) {
    ElMessage.warning('请输入 4 位年份')
    return
  }
  yearLoading.value = true
  try {
    const res: any = await internApi.yearStatistics({ year: year.value })
    yearData.value = res.data || { months: [], rows: [] }
  } finally {
    yearLoading.value = false
  }
}

function handleTabChange(name: string | number) {
  if (name === 'year-calendar' && !(yearData.value.rows || []).length) loadYear()
}

function evidenceLabel(type: string, hasPhoto: boolean) {
  if (type === 'gps_photo') return 'GPS+照片'
  if (type === 'gps') return 'GPS'
  if (type === 'photo') return '照片'
  if (hasPhoto) return '照片'
  return type || '-'
}

function monthText(summary: any) {
  if (!summary) return '-'
  return `应${summary.expected_days || 0} 出${summary.present_days || 0} 缺${summary.absent_days || 0} 异${summary.exception_days || 0}`
}

function openMakeup() {
  Object.assign(adjustForm, { action: 'makeup', intern_id: null, record_id: null, target_date: `${filters.month}-01`, reason: '' })
  adjustVisible.value = true
}

function openAdjust(action: string, row: any) {
  Object.assign(adjustForm, {
    action,
    intern_id: row.intern_id,
    record_id: row.id,
    target_date: row.punch_date,
    reason: '',
  })
  adjustVisible.value = true
}

async function submitAdjust() {
  if (!adjustForm.intern_id || !adjustForm.target_date || !adjustForm.reason.trim()) {
    ElMessage.warning('请选择实习生、日期并填写原因')
    return
  }
  saving.value = true
  try {
    await internApi.adjust(adjustForm)
    ElMessage.success('调整已记录')
    adjustVisible.value = false
    await Promise.all([loadAll(), activeTab.value === 'year-calendar' ? loadYear() : Promise.resolve()])
  } finally {
    saving.value = false
  }
}

function downloadBlob(res: any, filename: string) {
  const blob = new Blob([res], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

async function exportMonthSummary() {
  const res: any = await internApi.export({ month: filters.month })
  downloadBlob(res, `实习生打卡统计-${filters.month}.xlsx`)
}

async function exportMonthCalendar() {
  const res: any = await internApi.exportCalendar({ month: filters.month })
  downloadBlob(res, `实习生月度日历-${filters.month}.xlsx`)
}

async function exportYearCalendar() {
  const res: any = await internApi.exportYear({ year: year.value })
  downloadBlob(res, `实习生年度日历-${year.value}.xlsx`)
}

function downloadCurrent() {
  if (activeTab.value === 'year-calendar') return exportYearCalendar()
  if (activeTab.value === 'month-calendar') return exportMonthCalendar()
  return exportMonthSummary()
}

onMounted(async () => {
  await loadAll()
})
</script>

<style scoped>
.attendance-page {
  min-width: 0;
  padding-bottom: 28px;
}
.attendance-hero {
  align-items: center;
}
.content-panel :deep(.el-card__body) { padding-top: 10px; }
.filters {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 12px;
  align-items: center;
}
.attendance-metrics {
  gap: 12px;
  margin-top: 18px;
}
.metric-value.success { color: var(--admin-success); }
.metric-value.warning { color: var(--admin-warning); }
.metric-value.danger { color: var(--admin-danger); }
.section-title {
  margin: 8px 0 14px;
}
.records-title { margin-top: 24px; }
.table-scroll {
  width: 100%;
  min-width: 0;
  overflow-x: auto;
  padding-bottom: 4px;
}
.table-scroll :deep(.el-table) {
  min-width: 100%;
}
.calendar-list {
  display: grid;
  gap: 14px;
}
.calendar-card {
  padding: 16px;
  border: 1px solid rgba(223, 231, 241, 0.95);
  border-radius: 12px;
  background: var(--admin-surface);
  box-shadow: var(--admin-shadow-soft);
}
.calendar-card header {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 14px;
}
.calendar-card header strong { display: block; font-size: 16px; }
.calendar-card header span { display: block; margin-top: 4px; color: var(--admin-muted); font-size: 13px; }
.day-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(76px, 1fr));
  gap: 8px;
}
.day-cell {
  min-height: 72px;
  padding: 8px;
  border-radius: 10px;
  border: 1px solid var(--admin-border);
  background: var(--admin-surface-soft);
  display: grid;
  gap: 2px;
}
.day-cell b { color: var(--admin-text); }
.day-cell span, .day-cell small { color: var(--admin-muted); font-size: 12px; font-weight: 700; }
.day-cell.present { border-color: #a7f3d0; background: #ecfdf5; }
.day-cell.absent { border-color: #fecaca; background: #fff1f2; }
.day-cell.exception { box-shadow: inset 0 0 0 2px rgba(183, 121, 31, .42); }
.year-metrics {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 10px;
  margin-bottom: 16px;
}
.year-metric {
  padding: 12px;
  border: 1px solid var(--admin-border);
  border-radius: 12px;
  background: var(--admin-surface-soft);
}
.year-metric span { color: var(--admin-muted); font-weight: 800; }
.year-metric strong { display: block; margin: 5px 0; font-size: 22px; color: var(--admin-primary-2); }
.year-metric small { color: var(--admin-muted); }
.year-total { color: var(--admin-muted); }
:deep(.safe-dialog .el-dialog__body) {
  max-height: 68vh;
  overflow-y: auto;
}
@media (max-width: 760px) {
  .section-title { align-items: flex-start; flex-direction: column; }
  .calendar-card header { flex-direction: column; }
}
</style>
