<template>
  <div class="admin-page batch-page">
    <section class="admin-hero batch-hero">
      <div>
        <h1>批次工作流</h1>
        <p>按“评价矩阵、题目模板、评价关系、进度监控”的顺序完成每个评比活动。</p>
      </div>
      <div class="hero-actions">
        <el-button type="primary" size="large" @click="openCreate">新建批次</el-button>
      </div>
    </section>

    <section class="batch-metrics">
      <div class="metric-card">
        <div class="metric-label">全部批次</div>
        <div class="metric-value">{{ batches.length }}</div>
        <div class="metric-note">系统内评比活动</div>
      </div>
      <div class="metric-card">
        <div class="metric-label">进行中</div>
        <div class="metric-value success">{{ statusCount.active }}</div>
        <div class="metric-note">允许提交评价</div>
      </div>
      <div class="metric-card">
        <div class="metric-label">待配置</div>
        <div class="metric-value warning">{{ statusCount.draft }}</div>
        <div class="metric-note">尚未启动</div>
      </div>
      <div class="metric-card">
        <div class="metric-label">已结束</div>
        <div class="metric-value muted">{{ statusCount.closed }}</div>
        <div class="metric-note">只读归档</div>
      </div>
    </section>

    <el-card class="work-card batch-work-card">
      <template #header>
        <div class="card-titlebar">
          <div class="card-title">
            <strong>评比活动</strong>
            <span>选择批次后继续配置，或直接查看当前完成进度。</span>
          </div>
        </div>
      </template>

      <div v-loading="loading" class="batch-list">
        <article v-for="row in paginatedList" :key="row.id" class="batch-card">
          <div class="batch-status-rail" :class="row.status" aria-hidden="true" />

          <div class="batch-content">
            <div class="batch-header">
              <div class="batch-title-block">
                <div class="batch-eyebrow">{{ row.period || '未设置周期' }}</div>
                <h2>{{ row.name }}</h2>
                <div class="batch-time">
                  <span>{{ formatDate(row.start_time) }}</span>
                  <em>至</em>
                  <span>{{ formatDate(row.end_time) }}</span>
                </div>
              </div>

              <div class="batch-scoreboard">
                <span class="status-chip" :class="statusClass(row.status)">{{ statusText[row.status] || row.status }}</span>
                <div class="score-number">
                  <strong>{{ row.completed || 0 }}</strong>
                  <span>/{{ row.total || 0 }}</span>
                </div>
                <small>完成 {{ progress(row) }}%</small>
              </div>
            </div>

            <div class="progress-block" aria-label="完成进度">
              <div class="progress-track">
                <div class="progress-fill" :style="{ width: `${progress(row)}%` }" />
              </div>
            </div>

            <div class="workflow-strip">
              <button type="button" class="workflow-step" @click="$router.push(`/matrix/${row.id}`)">
                <span>01</span>
                <strong>评价矩阵</strong>
              </button>
              <button type="button" class="workflow-step" @click="$router.push(`/self-question/${row.id}`)">
                <span>02</span>
                <strong>题目模板</strong>
              </button>
              <button type="button" class="workflow-step" @click="$router.push(`/relation/${row.id}`)">
                <span>03</span>
                <strong>评价关系</strong>
              </button>
              <button type="button" class="workflow-step primary-step" @click="$router.push(`/progress/${row.id}`)">
                <span>04</span>
                <strong>进度监控</strong>
              </button>
            </div>
          </div>

          <div class="batch-actions">
            <el-button type="primary" @click="$router.push(`/progress/${row.id}`)">查看进度</el-button>
            <el-dropdown @command="(cmd:string) => handleCommand(cmd, row)">
              <el-button plain>
                更多操作
                <el-icon class="el-icon--right"><ArrowDown /></el-icon>
              </el-button>
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item command="edit">编辑批次</el-dropdown-item>
                  <el-dropdown-item command="start" v-if="row.status==='draft'">启动批次</el-dropdown-item>
                  <el-dropdown-item command="close" v-if="row.status==='active'">结束批次</el-dropdown-item>
                  <el-dropdown-item command="delete" v-if="row.status==='draft'" class="danger-item">删除批次</el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>
          </div>
        </article>
        <el-empty v-if="!loading && batches.length === 0" description="暂无批次" />
      </div>

      <div class="pagination-wrap">
        <span>共 {{ batches.length }} 条</span>
        <el-pagination
          v-model:current-page="currentPage"
          v-model:page-size="pageSize"
          :page-sizes="[10, 20, 50]"
          :total="batches.length"
          layout="sizes, prev, pager, next"
          background
        />
      </div>
    </el-card>

    <el-dialog v-model="showDialog" :title="editingId ? '编辑批次' : '新建批次'" width="520px">
      <el-form :model="form" label-width="96px">
        <el-form-item label="批次名称" required>
          <el-input v-model="form.name" placeholder="例如：2026年Q2评比活动" />
        </el-form-item>
        <el-form-item label="评选周期">
          <el-input v-model="form.period" placeholder="例如：2026Q2" />
        </el-form-item>
        <el-form-item label="开始时间" required>
          <el-date-picker v-model="form.start_time" type="datetime" value-format="YYYY-MM-DD HH:mm:ss" style="width:100%" />
        </el-form-item>
        <el-form-item label="结束时间" required>
          <el-date-picker v-model="form.end_time" type="datetime" value-format="YYYY-MM-DD HH:mm:ss" style="width:100%" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showDialog = false">取消</el-button>
        <el-button type="primary" @click="handleSave" :loading="saving">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ArrowDown } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { computed, onMounted, reactive, ref } from 'vue'
import { batchApi } from '../api'

const batches = ref<any[]>([])
const loading = ref(false)
const showDialog = ref(false)
const saving = ref(false)
const editingId = ref<number | null>(null)
const currentPage = ref(1)
const pageSize = ref(10)

const form = reactive({ name: '', period: '', start_time: '', end_time: '' })
const statusText: Record<string, string> = { draft: '待配置', active: '进行中', closed: '已结束' }

const paginatedList = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value
  return batches.value.slice(start, start + pageSize.value)
})

const statusCount = computed(() => ({
  active: batches.value.filter(row => row.status === 'active').length,
  draft: batches.value.filter(row => row.status === 'draft').length,
  closed: batches.value.filter(row => row.status === 'closed').length,
}))

function statusClass(status: string) {
  if (status === 'active') return 'success'
  if (status === 'draft') return 'warning'
  return 'info'
}

function progress(row: any) {
  return row.total ? Math.round((Number(row.completed || 0) / Number(row.total || 0)) * 100) : 0
}

function formatDate(value: string) {
  return value ? value.replace('T', ' ').slice(0, 16) : '-'
}

function resetForm() {
  Object.assign(form, { name: '', period: '', start_time: '', end_time: '' })
  editingId.value = null
}

function openCreate() {
  resetForm()
  showDialog.value = true
}

async function loadBatches() {
  loading.value = true
  try {
    const res: any = await batchApi.list()
    batches.value = res.data || []
  } finally {
    loading.value = false
  }
}

async function handleSave() {
  if (!form.name || !form.start_time || !form.end_time) {
    ElMessage.warning('请填写批次名称、开始时间和结束时间')
    return
  }
  saving.value = true
  try {
    if (editingId.value) await batchApi.update(editingId.value, form)
    else await batchApi.create(form)
    showDialog.value = false
    resetForm()
    await loadBatches()
    ElMessage.success('保存成功')
  } finally {
    saving.value = false
  }
}

async function handleCommand(cmd: string, row: any) {
  if (cmd === 'edit') {
    editingId.value = row.id
    Object.assign(form, { name: row.name, period: row.period, start_time: row.start_time, end_time: row.end_time })
    showDialog.value = true
  } else if (cmd === 'start') {
    await ElMessageBox.confirm('确认启动该批次？启动后将开始收集评价数据。', '启动批次')
    await batchApi.start(row.id)
    await loadBatches()
    ElMessage.success('已启动')
  } else if (cmd === 'close') {
    await ElMessageBox.confirm('确认结束该批次？结束后将无法继续评价。', '结束批次')
    await batchApi.close(row.id)
    await loadBatches()
    ElMessage.success('已结束')
  } else if (cmd === 'delete') {
    await ElMessageBox.confirm('确认删除该批次？', '删除批次')
    await batchApi.delete(row.id)
    await loadBatches()
    ElMessage.success('已删除')
  }
}

onMounted(loadBatches)
</script>

<style scoped>
.batch-hero {
  align-items: center;
}

.batch-metrics {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 14px;
}

.metric-value.success { color: var(--admin-success); }
.metric-value.warning { color: var(--admin-warning); }
.metric-value.muted { color: var(--admin-muted); }

.batch-work-card :deep(.el-card__body) {
  padding: 20px 22px 18px;
}

.batch-list {
  display: grid;
  gap: 16px;
}

.batch-card {
  position: relative;
  display: grid;
  grid-template-columns: 7px minmax(0, 1fr) 132px;
  gap: 18px;
  padding: 16px;
  border: 1px solid var(--admin-border);
  border-radius: 14px;
  background:
    linear-gradient(180deg, rgba(248, 251, 255, 0.92), #fff 42%),
    #fff;
  box-shadow: 0 10px 28px rgba(15, 35, 59, 0.055);
}

.batch-status-rail {
  border-radius: 999px;
  min-height: 100%;
}

.batch-status-rail.active { background: var(--admin-success); }
.batch-status-rail.draft { background: var(--admin-warning); }
.batch-status-rail.closed { background: var(--admin-muted); }

.batch-content {
  min-width: 0;
  display: grid;
  gap: 14px;
}

.batch-header {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 126px;
  gap: 20px;
  align-items: start;
}

.batch-eyebrow {
  color: var(--admin-accent);
  font-size: 12px;
  font-weight: 900;
}

.batch-title-block h2 {
  margin: 5px 0 0;
  color: var(--admin-text);
  font-size: 21px;
  line-height: 1.28;
  font-weight: 900;
}

.batch-time {
  margin-top: 8px;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  color: var(--admin-muted);
  font-size: 13px;
}

.batch-time em {
  font-style: normal;
  color: var(--admin-faint);
}

.batch-scoreboard {
  display: grid;
  justify-items: end;
  gap: 7px;
}

.score-number {
  display: flex;
  align-items: baseline;
  justify-content: flex-end;
  color: var(--admin-text);
  font-variant-numeric: tabular-nums;
}

.score-number strong {
  font-size: 26px;
  line-height: 1;
  font-weight: 900;
}

.score-number span {
  color: var(--admin-muted);
  font-size: 14px;
  font-weight: 800;
}

.batch-scoreboard small {
  color: var(--admin-muted);
  font-size: 12px;
  font-weight: 800;
}

.progress-block {
  padding: 0 2px;
}

.progress-track {
  width: 100%;
  height: 10px;
  overflow: hidden;
  border-radius: 999px;
  background: #e8eef6;
}

.progress-fill {
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, #0891b2, #0369a1);
}

.workflow-strip {
  display: grid;
  grid-template-columns: repeat(4, minmax(132px, 1fr));
  gap: 10px;
}

.workflow-step {
  min-height: 58px;
  padding: 10px 12px;
  border: 1px solid var(--admin-border);
  border-radius: 12px;
  background: #fff;
  color: var(--admin-text);
  text-align: left;
  cursor: pointer;
  box-shadow: 0 4px 12px rgba(15, 35, 59, 0.035);
  transition: border-color .18s ease, transform .18s ease, box-shadow .18s ease;
}

.workflow-step:hover {
  transform: translateY(-1px);
  border-color: #7dd3fc;
  box-shadow: 0 8px 18px rgba(3, 105, 161, 0.10);
}

.workflow-step span {
  display: block;
  color: var(--admin-faint);
  font-size: 11px;
  font-weight: 900;
}

.workflow-step strong {
  display: block;
  margin-top: 5px;
  font-size: 14px;
  font-weight: 900;
}

.primary-step {
  border-color: #93c5fd;
  background: #eef6ff;
  color: var(--admin-primary-2);
}

.batch-actions {
  display: grid;
  align-content: center;
  gap: 10px;
}

.batch-actions :deep(.el-button) {
  width: 100%;
  min-height: 42px;
}

.danger-item {
  color: var(--admin-danger) !important;
}

@media (max-width: 1280px) {
  .batch-card {
    grid-template-columns: 7px minmax(0, 1fr);
  }

  .batch-actions {
    grid-column: 2;
    grid-template-columns: repeat(2, minmax(120px, 160px));
    justify-content: end;
  }
}

@media (max-width: 900px) {
  .batch-metrics,
  .workflow-strip {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .batch-header {
    grid-template-columns: 1fr;
  }

  .batch-scoreboard {
    justify-items: start;
  }
}
</style>
