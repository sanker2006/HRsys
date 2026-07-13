<template>
  <section class="admin-page attendance-page">
    <div class="admin-hero attendance-hero">
      <div>
        <h1>实习生打卡</h1>
        <p>按月或自定义日期核对出勤，并将统计与原始记录导出为同一份 Excel。</p>
      </div>
      <div class="hero-actions">
        <el-button @click="openMakeup">补卡</el-button>
        <el-button type="primary" :loading="exporting" @click="exportAttendance">导出 Excel</el-button>
      </div>
    </div>

    <el-card class="work-card filter-card">
      <div class="range-row">
        <el-segmented v-model="filters.mode" :options="rangeModes" @change="handleModeChange" />
        <el-date-picker
          v-if="filters.mode === 'month'"
          v-model="filters.month"
          type="month"
          value-format="YYYY-MM"
          :clearable="false"
          placeholder="选择月份"
        />
        <el-date-picker
          v-else
          v-model="filters.dateRange"
          type="daterange"
          value-format="YYYY-MM-DD"
          unlink-panels
          :clearable="false"
          range-separator="至"
          start-placeholder="开始日期"
          end-placeholder="结束日期"
        />
        <span class="range-hint">{{ rangeDescription }}</span>
      </div>
      <div class="toolbar-row filters">
        <el-input v-model="filters.department" clearable placeholder="部门" @keyup.enter="queryAll" />
        <el-input v-model="filters.keyword" clearable placeholder="实习生编号 / 姓名" @keyup.enter="queryAll" />
        <el-select v-model="filters.status" clearable placeholder="实习生状态">
          <el-option label="启用" value="active" />
          <el-option label="停用" value="inactive" />
        </el-select>
        <el-button type="primary" :loading="loading || recordsLoading" @click="queryAll">查询</el-button>
      </div>
    </el-card>

    <el-card class="work-card content-panel">
      <el-tabs v-model="activeTab">
        <el-tab-pane label="出勤统计" name="summary">
          <div class="metric-grid attendance-metrics">
            <div class="metric-card">
              <div class="metric-label">实习生</div>
              <div class="metric-value">{{ summary.interns }}</div>
              <div class="metric-note">当前筛选范围</div>
            </div>
            <div class="metric-card">
              <div class="metric-label">出勤人天</div>
              <div class="metric-value success">{{ summary.present }}</div>
              <div class="metric-note">有效打卡 2 次及以上</div>
            </div>
            <div class="metric-card">
              <div class="metric-label">缺勤人天</div>
              <div class="metric-value danger">{{ summary.absent }}</div>
              <div class="metric-note">有效打卡仅 1 次</div>
            </div>
            <div class="metric-card">
              <div class="metric-label">无打卡人天</div>
              <div class="metric-value muted">{{ summary.unrecorded }}</div>
              <div class="metric-note">不计入缺勤</div>
            </div>
          </div>

          <div class="card-titlebar section-title">
            <div class="card-title">
              <strong>出勤统计</strong>
              <span>{{ displayedRange }} · 0 次不计缺勤，详细时间按日写入导出文件。</span>
            </div>
          </div>
          <div class="table-scroll">
            <el-table v-loading="loading" :data="statsRows" border min-width="760">
              <el-table-column type="index" width="72" label="序号" />
              <el-table-column prop="intern.intern_no" label="实习生编号" width="150" />
              <el-table-column prop="intern.name" label="实习生姓名" width="140" />
              <el-table-column prop="intern.department" label="部门" min-width="190" />
              <el-table-column prop="summary.present_days" label="出勤天数" width="120" align="center" />
              <el-table-column prop="summary.absent_days" label="缺勤天数" width="120" align="center" />
            </el-table>
          </div>
        </el-tab-pane>

        <el-tab-pane label="原始打卡记录" name="records">
          <div class="card-titlebar section-title">
            <div class="card-title">
              <strong>原始打卡记录</strong>
              <span>{{ displayedRange }} · 原始记录保留不覆盖，调整状态单独记录。</span>
            </div>
            <span class="record-count">共 {{ recordTotal }} 条</span>
          </div>
          <div class="table-scroll">
            <el-table v-loading="recordsLoading" :data="records" border min-width="1280">
              <el-table-column prop="punch_date" label="日期" width="115" fixed="left" />
              <el-table-column prop="punch_time" label="服务器打卡时间" width="180" />
              <el-table-column prop="intern_no" label="实习生编号" width="140" />
              <el-table-column prop="intern_name" label="姓名" width="120" />
              <el-table-column prop="department" label="部门" min-width="160" />
              <el-table-column label="证据" width="180">
                <template #default="{ row }">
                  <div class="evidence-cell">
                    <span>{{ evidenceLabel(row.evidence_type, row.has_photo) }}</span>
                    <el-button v-if="row.has_photo" link type="primary" @click="openPhoto(row)">查看照片</el-button>
                  </div>
                </template>
              </el-table-column>
              <el-table-column label="经纬度" min-width="220">
                <template #default="{ row }">
                  <span v-if="row.latitude !== null && row.longitude !== null">
                    {{ Number(row.latitude).toFixed(6) }}, {{ Number(row.longitude).toFixed(6) }}
                  </span>
                  <span v-else>-</span>
                </template>
              </el-table-column>
              <el-table-column label="精度" width="95">
                <template #default="{ row }">{{ row.accuracy == null ? '-' : `${Number(row.accuracy).toFixed(1)}m` }}</template>
              </el-table-column>
              <el-table-column label="有效状态" width="105" align="center">
                <template #default="{ row }">
                  <el-tag :type="row.valid_status === 'invalid' ? 'danger' : 'success'" effect="light">
                    {{ row.valid_status === 'invalid' ? '无效' : '有效' }}
                  </el-tag>
                </template>
              </el-table-column>
              <el-table-column prop="adjustment_note" label="调整说明" min-width="190" show-overflow-tooltip />
              <el-table-column label="操作" width="180" fixed="right">
                <template #default="{ row }">
                  <el-button link type="danger" @click="openAdjust('reject', row)">驳回</el-button>
                  <el-button link @click="openAdjust('restore', row)">恢复</el-button>
                  <el-button link type="warning" @click="openAdjust('void', row)">作废</el-button>
                </template>
              </el-table-column>
            </el-table>
          </div>
          <div class="pagination-row">
            <el-pagination
              v-model:current-page="recordPage"
              v-model:page-size="recordPageSize"
              :page-sizes="[20, 50, 100]"
              :total="recordTotal"
              layout="total, sizes, prev, pager, next"
              @size-change="loadRecords"
              @current-change="loadRecords"
            />
          </div>
        </el-tab-pane>
      </el-tabs>
    </el-card>

    <el-dialog v-model="adjustVisible" :title="adjustTitle" width="min(520px, 92vw)" class="safe-dialog">
      <el-form :model="adjustForm" label-width="90px">
        <el-form-item v-if="adjustForm.action === 'makeup'" label="实习生" required>
          <el-select v-model="adjustForm.intern_id" filterable placeholder="选择实习生" style="width: 100%">
            <el-option
              v-for="row in statsRows"
              :key="row.intern.id"
              :label="`${row.intern.name} · ${row.intern.department}`"
              :value="row.intern.id"
            />
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

    <el-dialog
      v-model="photoVisible"
      :title="photoTitle"
      width="min(760px, 92vw)"
      class="safe-dialog photo-dialog"
      @closed="closePhoto"
    >
      <div v-loading="photoLoading" class="photo-viewer">
        <div v-if="photoRecord" class="photo-meta">
          <span>{{ photoRecord.intern_name }} · {{ photoRecord.department }}</span>
          <span>{{ recordDateTime(photoRecord) }}</span>
          <span>{{ evidenceLabel(photoRecord.evidence_type, photoRecord.has_photo) }}</span>
          <span v-if="photoRecord.latitude !== null && photoRecord.longitude !== null">
            {{ Number(photoRecord.latitude).toFixed(6) }}, {{ Number(photoRecord.longitude).toFixed(6) }}
          </span>
          <span v-if="photoRecord.accuracy != null">精度 {{ Number(photoRecord.accuracy).toFixed(1) }}m</span>
        </div>
        <div class="photo-frame">
          <img v-if="photoUrl" :src="photoUrl" alt="实习生打卡照片" />
          <el-empty v-else description="照片读取失败，请刷新后重试" />
        </div>
      </div>
      <template #footer>
        <el-button @click="closePhoto">关闭</el-button>
        <el-button :disabled="!photoUrl" @click="downloadPhoto">下载照片</el-button>
        <el-button v-if="photoRecord" type="danger" @click="adjustFromPhoto('reject')">驳回该记录</el-button>
        <el-button v-if="photoRecord" type="warning" @click="adjustFromPhoto('void')">作废该记录</el-button>
      </template>
    </el-dialog>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { internApi } from '../api'

function currentMonth() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function currentDate() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function monthDates(month: string): [string, string] {
  const [year, value] = month.split('-').map(Number)
  const last = new Date(Date.UTC(year, value, 0)).getUTCDate()
  return [`${month}-01`, `${month}-${String(last).padStart(2, '0')}`]
}

const rangeModes = [
  { label: '按月', value: 'month' },
  { label: '自定义日期', value: 'custom' },
]
const initialMonth = currentMonth()
const loading = ref(false)
const recordsLoading = ref(false)
const exporting = ref(false)
const saving = ref(false)
const activeTab = ref('summary')
const statsRows = ref<any[]>([])
const records = ref<any[]>([])
const statsRange = ref<any>(null)
const recordPage = ref(1)
const recordPageSize = ref(20)
const recordTotal = ref(0)
const adjustVisible = ref(false)
const photoVisible = ref(false)
const photoLoading = ref(false)
const photoRecord = ref<any>(null)
const photoUrl = ref('')
const filters = reactive({
  mode: 'month',
  month: initialMonth,
  dateRange: monthDates(initialMonth) as [string, string],
  department: '',
  keyword: '',
  status: '',
})
const adjustForm = reactive<any>({ action: 'makeup', intern_id: null, record_id: null, target_date: '', reason: '' })

const selectedRange = computed<[string, string]>(() => (
  filters.mode === 'month' ? monthDates(filters.month) : filters.dateRange
))
const displayedRange = computed(() => statsRange.value
  ? `${statsRange.value.start} 至 ${statsRange.value.end}`
  : `${selectedRange.value[0]} 至 ${selectedRange.value[1]}`)
const rangeDescription = computed(() => filters.mode === 'month'
  ? `统计 ${filters.month} 全月`
  : `包含首尾，共 ${rangeDayCount()} 天`)
const summary = computed(() => statsRows.value.reduce((acc, row) => {
  acc.interns += 1
  acc.present += row.summary.present_days || 0
  acc.absent += row.summary.absent_days || 0
  acc.unrecorded += row.summary.unrecorded_days || 0
  return acc
}, { interns: 0, present: 0, absent: 0, unrecorded: 0 }))
const adjustTitle = computed(() => ({
  makeup: '管理员补卡',
  reject: '驳回打卡记录',
  restore: '恢复打卡记录',
  void: '作废打卡记录',
} as Record<string, string>)[adjustForm.action] || '调整记录')
const photoTitle = computed(() => photoRecord.value
  ? `${photoRecord.value.intern_name} · ${photoRecord.value.punch_date} 打卡照片`
  : '打卡照片')

function rangeDayCount() {
  const [start, end] = selectedRange.value
  if (!start || !end) return 0
  return Math.floor((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86400000) + 1
}

function validateRange() {
  const [start, end] = selectedRange.value
  if (!start || !end) {
    ElMessage.warning('请选择完整的日期范围')
    return false
  }
  const days = rangeDayCount()
  if (days < 1) {
    ElMessage.warning('开始日期不能晚于结束日期')
    return false
  }
  if (days > 366) {
    ElMessage.warning('自定义日期范围最多支持 366 天')
    return false
  }
  return true
}

function requestParams(includePage = false) {
  const params: any = {
    department: filters.department.trim() || undefined,
    keyword: filters.keyword.trim() || undefined,
    status: filters.status || undefined,
  }
  if (filters.mode === 'month') params.month = filters.month
  else {
    params.start_date = filters.dateRange[0]
    params.end_date = filters.dateRange[1]
  }
  if (includePage) {
    params.page = recordPage.value
    params.pageSize = recordPageSize.value
  }
  return params
}

function handleModeChange() {
  if (filters.mode === 'custom') filters.dateRange = monthDates(filters.month)
}

async function loadStatistics() {
  loading.value = true
  try {
    const res: any = await internApi.statistics(requestParams())
    statsRows.value = res.data?.rows || []
    statsRange.value = res.data?.range || null
  } finally {
    loading.value = false
  }
}

async function loadRecords() {
  recordsLoading.value = true
  try {
    const res: any = await internApi.records(requestParams(true))
    records.value = res.data?.list || []
    recordTotal.value = Number(res.data?.total || 0)
  } finally {
    recordsLoading.value = false
  }
}

async function queryAll() {
  if (!validateRange()) return
  recordPage.value = 1
  await Promise.all([loadStatistics(), loadRecords()])
}

function evidenceLabel(type: string, hasPhoto: boolean) {
  if (type === 'gps_photo') return 'GPS+照片'
  if (type === 'gps') return 'GPS'
  if (type === 'photo') return '照片'
  if (hasPhoto) return '照片'
  return type || '-'
}

function recordDateTime(row: any) {
  const time = String(row?.punch_time || '')
  return time.startsWith(String(row?.punch_date || '')) ? time : `${row?.punch_date || ''} ${time}`.trim()
}

function defaultAdjustmentDate() {
  const today = currentDate()
  const [start, end] = selectedRange.value
  return today >= start && today <= end ? today : start
}

function openMakeup() {
  Object.assign(adjustForm, { action: 'makeup', intern_id: null, record_id: null, target_date: defaultAdjustmentDate(), reason: '' })
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

function revokePhotoUrl() {
  if (photoUrl.value) {
    URL.revokeObjectURL(photoUrl.value)
    photoUrl.value = ''
  }
}

async function openPhoto(row: any) {
  photoVisible.value = true
  photoLoading.value = true
  photoRecord.value = row
  revokePhotoUrl()
  try {
    const blob: any = await internApi.recordPhoto(row.id)
    photoUrl.value = URL.createObjectURL(blob)
  } catch {
    ElMessage.error('照片读取失败，请刷新后重试')
  } finally {
    photoLoading.value = false
  }
}

function closePhoto() {
  photoVisible.value = false
  photoRecord.value = null
  photoLoading.value = false
  revokePhotoUrl()
}

function downloadPhoto() {
  if (!photoUrl.value || !photoRecord.value) return
  const a = document.createElement('a')
  a.href = photoUrl.value
  a.download = `实习生打卡照片-${photoRecord.value.intern_name}-${photoRecord.value.punch_date}-${photoRecord.value.id}.jpg`
  a.click()
}

function adjustFromPhoto(action: string) {
  if (!photoRecord.value) return
  const row = photoRecord.value
  closePhoto()
  openAdjust(action, row)
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
    await Promise.all([loadStatistics(), loadRecords()])
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

async function exportAttendance() {
  if (!validateRange()) return
  exporting.value = true
  try {
    const res: any = await internApi.export(requestParams())
    const label = filters.mode === 'month' ? filters.month : `${filters.dateRange[0]}至${filters.dateRange[1]}`
    downloadBlob(res, `实习生考勤统计-${label}.xlsx`)
    ElMessage.success('Excel 已生成')
  } finally {
    exporting.value = false
  }
}

onMounted(queryAll)
onUnmounted(revokePhotoUrl)
</script>

<style scoped>
.attendance-page {
  min-width: 0;
  padding-bottom: 32px;
}
.attendance-hero { align-items: center; }
.filter-card :deep(.el-card__body) { display: grid; gap: 16px; }
.range-row {
  display: flex;
  align-items: center;
  gap: 14px;
  min-width: 0;
}
.range-row :deep(.el-date-editor) { width: min(360px, 100%); }
.range-hint {
  color: var(--admin-muted);
  font-size: 13px;
  font-weight: 700;
}
.filters {
  display: grid;
  grid-template-columns: repeat(3, minmax(180px, 1fr)) auto;
  gap: 12px;
  align-items: center;
}
.content-panel :deep(.el-card__body) { padding-top: 10px; }
.attendance-metrics {
  grid-template-columns: repeat(4, minmax(150px, 1fr));
  gap: 12px;
  margin: 8px 0 20px;
}
.metric-value.success { color: var(--admin-success); }
.metric-value.danger { color: var(--admin-danger); }
.metric-value.muted { color: #60758a; }
.section-title { margin: 10px 0 14px; }
.record-count {
  color: var(--admin-muted);
  font-size: 14px;
  font-weight: 800;
}
.table-scroll {
  width: 100%;
  min-width: 0;
  overflow-x: auto;
  padding-bottom: 5px;
}
.table-scroll :deep(.el-table) { min-width: 100%; }
.evidence-cell {
  display: flex;
  align-items: center;
  gap: 8px;
  white-space: nowrap;
}
.pagination-row {
  display: flex;
  justify-content: flex-end;
  padding-top: 18px;
  overflow-x: auto;
}
.photo-viewer { display: grid; gap: 14px; }
.photo-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.photo-meta span {
  padding: 6px 10px;
  border: 1px solid var(--admin-border);
  border-radius: 999px;
  color: var(--admin-muted);
  background: var(--admin-surface-soft);
  font-size: 13px;
  font-weight: 700;
}
.photo-frame {
  min-height: 280px;
  max-height: 58vh;
  border: 1px solid var(--admin-border);
  border-radius: 8px;
  background: #0f172a;
  overflow: auto;
  display: grid;
  place-items: center;
}
.photo-frame img {
  display: block;
  max-width: 100%;
  height: auto;
}
:deep(.safe-dialog .el-dialog__body) {
  max-height: 68vh;
  overflow-y: auto;
}
@media (max-width: 1000px) {
  .attendance-metrics { grid-template-columns: repeat(2, minmax(150px, 1fr)); }
  .filters { grid-template-columns: repeat(2, minmax(170px, 1fr)); }
}
@media (max-width: 760px) {
  .range-row { align-items: stretch; flex-direction: column; }
  .range-row :deep(.el-date-editor) { width: 100%; }
  .filters { grid-template-columns: 1fr; }
  .attendance-metrics { grid-template-columns: 1fr 1fr; }
  .section-title { align-items: flex-start; flex-direction: column; }
}
</style>
