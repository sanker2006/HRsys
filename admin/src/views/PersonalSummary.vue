<template>
  <div class="admin-page summary-page">
    <section class="admin-hero summary-hero">
      <div>
        <h1>个人总结</h1>
        <p>{{ batch?.name || '当前批次' }} · 管理评价对象的 Word 个人总结。</p>
      </div>
      <el-button @click="$router.push('/batch')">返回批次</el-button>
    </section>

    <section class="summary-metrics">
      <div class="metric-card">
        <div class="metric-label">评价对象</div>
        <div class="metric-value">{{ summary.total }}</div>
        <div class="metric-note">当前批次人员</div>
      </div>
      <div class="metric-card">
        <div class="metric-label">已上传</div>
        <div class="metric-value success">{{ summary.uploaded }}</div>
        <div class="metric-note">可供评价人下载</div>
      </div>
      <div class="metric-card">
        <div class="metric-label">未上传</div>
        <div class="metric-value warning">{{ summary.missing }}</div>
        <div class="metric-note">评价页不显示入口</div>
      </div>
    </section>

    <el-card class="work-card">
      <template #header>
        <div class="card-titlebar">
          <div class="card-title">
            <strong>上传情况</strong>
            <span v-if="batch?.status === 'closed'">批次已结束，个人总结已冻结，只能下载查看。</span>
            <span v-else>支持 .doc、.docx，单个文件不超过 10 MB。</span>
          </div>
        </div>
      </template>

      <div class="filters">
        <el-input
          v-model="filters.keyword"
          clearable
          placeholder="姓名或工号"
          @keyup.enter="search"
        />
        <el-select v-model="filters.department" clearable placeholder="全部部门" @change="search">
          <el-option v-for="item in departments" :key="item" :label="item" :value="item" />
        </el-select>
        <el-radio-group v-model="filters.upload_status" @change="search">
          <el-radio-button value="">全部</el-radio-button>
          <el-radio-button value="uploaded">已上传</el-radio-button>
          <el-radio-button value="missing">未上传</el-radio-button>
        </el-radio-group>
        <el-button type="primary" :icon="Search" @click="search">查询</el-button>
        <el-button :icon="Refresh" @click="resetFilters">重置</el-button>
      </div>

      <el-table v-loading="loading" :data="rows" stripe>
        <el-table-column prop="employee_no" label="工号" width="120" />
        <el-table-column prop="name" label="姓名" width="110" />
        <el-table-column prop="department" label="部门" min-width="150" />
        <el-table-column prop="position" label="岗位" min-width="130">
          <template #default="scope">{{ scope.row.position || '-' }}</template>
        </el-table-column>
        <el-table-column label="状态" width="100">
          <template #default="scope">
            <el-tag :type="scope.row.has_summary ? 'success' : 'info'">
              {{ scope.row.has_summary ? '已上传' : '未上传' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="文件" min-width="220">
          <template #default="scope">
            <div v-if="scope.row.has_summary" class="file-cell">
              <strong :title="scope.row.original_name">{{ scope.row.original_name }}</strong>
              <span>{{ formatSize(scope.row.file_size) }} · {{ formatTime(scope.row.uploaded_at) }}</span>
            </div>
            <span v-else class="muted">-</span>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="270" fixed="right">
          <template #default="scope">
            <div class="row-actions">
              <el-upload
                action=""
                accept=".doc,.docx"
                :show-file-list="false"
                :disabled="batch?.status === 'closed' || uploadingId === scope.row.user_id"
                :before-upload="(file: File) => uploadFile(scope.row, file)"
              >
                <el-button
                  :icon="Upload"
                  :loading="uploadingId === scope.row.user_id"
                  :disabled="batch?.status === 'closed'"
                >
                  {{ scope.row.has_summary ? '替换' : '上传' }}
                </el-button>
              </el-upload>
              <el-button
                v-if="scope.row.has_summary"
                :icon="Download"
                :loading="downloadingId === scope.row.user_id"
                @click="downloadFile(scope.row)"
              >下载</el-button>
              <el-tooltip v-if="scope.row.has_summary && batch?.status !== 'closed'" content="删除个人总结">
                <el-button
                  type="danger"
                  plain
                  :icon="Delete"
                  aria-label="删除个人总结"
                  @click="deleteFile(scope.row)"
                />
              </el-tooltip>
            </div>
          </template>
        </el-table-column>
        <template #empty>
          <el-empty description="暂无批次评价对象，请先导入题目并生成评价关系" />
        </template>
      </el-table>

      <div class="pagination-wrap">
        <span>共 {{ total }} 条</span>
        <el-pagination
          v-model:current-page="page"
          v-model:page-size="pageSize"
          :page-sizes="[10, 20, 50, 100]"
          :total="total"
          layout="sizes, prev, pager, next"
          background
          @current-change="loadData"
          @size-change="handleSizeChange"
        />
      </div>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { Delete, Download, Refresh, Search, Upload } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { onMounted, reactive, ref } from 'vue'
import { departmentApi, personalSummaryApi } from '../api'

const props = defineProps<{ batchId: string }>()
const rows = ref<any[]>([])
const batch = ref<any>(null)
const departments = ref<string[]>([])
const loading = ref(false)
const uploadingId = ref<number | null>(null)
const downloadingId = ref<number | null>(null)
const page = ref(1)
const pageSize = ref(20)
const total = ref(0)
const summary = reactive({ total: 0, uploaded: 0, missing: 0 })
const filters = reactive({ keyword: '', department: '', upload_status: '' })

function formatSize(value: number | null) {
  const size = Number(value || 0)
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / 1024 / 1024).toFixed(1)} MB`
}

function formatTime(value: string | null) {
  return value ? value.replace('T', ' ').slice(0, 16) : '-'
}

function saveBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

async function loadData() {
  loading.value = true
  try {
    const res: any = await personalSummaryApi.list(Number(props.batchId), {
      page: page.value,
      pageSize: pageSize.value,
      keyword: filters.keyword || undefined,
      department: filters.department || undefined,
      upload_status: filters.upload_status || undefined,
    })
    rows.value = res.data?.list || []
    batch.value = res.data?.batch || null
    total.value = Number(res.data?.total || 0)
    Object.assign(summary, res.data?.summary || { total: 0, uploaded: 0, missing: 0 })
  } finally {
    loading.value = false
  }
}

async function loadDepartments() {
  const res: any = await departmentApi.list()
  departments.value = (res.data?.list || []).map((item: any) => item.name)
}

function search() {
  page.value = 1
  void loadData()
}

function resetFilters() {
  Object.assign(filters, { keyword: '', department: '', upload_status: '' })
  search()
}

function handleSizeChange() {
  page.value = 1
  void loadData()
}

async function uploadFile(row: any, file: File) {
  const extension = file.name.slice(file.name.lastIndexOf('.')).toLowerCase()
  if (!['.doc', '.docx'].includes(extension)) {
    ElMessage.warning('仅支持 .doc 或 .docx 文件')
    return false
  }
  if (!file.size || file.size > 10 * 1024 * 1024) {
    ElMessage.warning(file.size ? '文件不能超过 10 MB' : '文件不能为空')
    return false
  }
  uploadingId.value = row.user_id
  try {
    await personalSummaryApi.upload(Number(props.batchId), row.user_id, file)
    ElMessage.success(row.has_summary ? '个人总结已替换' : '个人总结已上传')
    await loadData()
  } finally {
    uploadingId.value = null
  }
  return false
}

async function downloadFile(row: any) {
  downloadingId.value = row.user_id
  try {
    const data: any = await personalSummaryApi.download(Number(props.batchId), row.user_id)
    const blob = data instanceof Blob ? data : new Blob([data])
    saveBlob(blob, row.original_name || `${row.name}-个人总结.docx`)
  } finally {
    downloadingId.value = null
  }
}

async function deleteFile(row: any) {
  await ElMessageBox.confirm(`确认删除 ${row.name} 的个人总结？`, '删除个人总结', { type: 'warning' })
  await personalSummaryApi.delete(Number(props.batchId), row.user_id)
  ElMessage.success('个人总结已删除')
  await loadData()
}

onMounted(() => Promise.all([loadData(), loadDepartments()]))
</script>

<style scoped>
.summary-hero { align-items: center; }

.summary-metrics {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 14px;
}

.metric-value.success { color: var(--admin-success); }
.metric-value.warning { color: var(--admin-warning); }

.filters {
  display: grid;
  grid-template-columns: minmax(180px, 1fr) 180px auto auto auto;
  gap: 10px;
  align-items: center;
  margin-bottom: 18px;
}

.file-cell { display: grid; gap: 3px; min-width: 0; }
.file-cell strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--admin-text); }
.file-cell span, .muted { color: var(--admin-muted); font-size: 12px; }
.row-actions { display: flex; align-items: center; gap: 8px; }

@media (max-width: 1100px) {
  .filters { grid-template-columns: 1fr 180px auto; }
}

@media (max-width: 760px) {
  .summary-metrics { grid-template-columns: 1fr; }
  .filters { grid-template-columns: 1fr; }
}
</style>
