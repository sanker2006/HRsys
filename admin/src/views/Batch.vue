<template>
  <div class="admin-page batch-page">
    <section class="admin-hero">
      <div>
        <h1>批次工作流</h1>
        <p>每个批次都按“矩阵配置、题目模板、评价关系、进度监控”的顺序闭环。</p>
      </div>
      <div class="hero-actions">
        <el-button type="primary" @click="openCreate">新建批次</el-button>
      </div>
    </section>

    <el-card class="work-card">
      <template #header>
        <div class="card-titlebar">
          <div class="card-title">
            <strong>评比活动</strong>
            <span>选择一个批次后继续配置或查看当前进度。</span>
          </div>
        </div>
      </template>

      <div v-loading="loading" class="batch-list">
        <article v-for="row in paginatedList" :key="row.id" class="batch-card">
          <div class="batch-main">
            <div class="batch-top">
              <div>
                <h2>{{ row.name }}</h2>
                <p>{{ row.period || '未设置周期' }} · {{ row.start_time }} 至 {{ row.end_time }}</p>
              </div>
              <span class="status-chip" :class="statusClass(row.status)">{{ statusText[row.status] || row.status }}</span>
            </div>

            <div class="batch-progress">
              <div class="progress-label">
                <span>完成进度</span>
                <b>{{ row.completed || 0 }}/{{ row.total || 0 }}</b>
              </div>
              <el-progress :percentage="row.total ? Math.round((row.completed / row.total) * 100) : 0" :stroke-width="10" />
            </div>
          </div>

          <div class="workflow-actions">
            <el-button @click="$router.push(`/matrix/${row.id}`)">评估矩阵</el-button>
            <el-button @click="$router.push(`/self-question/${row.id}`)">题目模板</el-button>
            <el-button @click="$router.push(`/relation/${row.id}`)">评价关系</el-button>
            <el-button type="primary" plain @click="$router.push(`/progress/${row.id}`)">进度监控</el-button>
            <el-dropdown @command="(cmd:string) => handleCommand(cmd, row)">
              <el-button>
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
          <el-input v-model="form.name" placeholder="如：2026年Q2评比活动" />
        </el-form-item>
        <el-form-item label="评选周期">
          <el-input v-model="form.period" placeholder="如：2026Q2" />
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

function statusClass(status: string) {
  if (status === 'active') return 'success'
  if (status === 'draft') return 'warning'
  return 'info'
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
.batch-list {
  display: grid;
  gap: 14px;
}

.batch-card {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 18px;
  padding: 18px;
  border: 1px solid var(--admin-border);
  border-radius: 12px;
  background: #fff;
}

.batch-top {
  display: flex;
  justify-content: space-between;
  gap: 16px;
}

.batch-top h2 {
  margin: 0;
  color: var(--admin-text);
  font-size: 18px;
  font-weight: 900;
}

.batch-top p {
  margin: 7px 0 0;
  color: var(--admin-muted);
  font-size: 13px;
}

.batch-progress {
  margin-top: 18px;
  display: grid;
  gap: 8px;
}

.progress-label {
  display: flex;
  justify-content: space-between;
  color: var(--admin-muted);
  font-size: 13px;
}

.progress-label b {
  color: var(--admin-text);
}

.workflow-actions {
  display: grid;
  grid-template-columns: repeat(2, 112px);
  gap: 10px;
  align-content: center;
}

.danger-item {
  color: var(--admin-danger) !important;
}

@media (max-width: 1280px) {
  .batch-card {
    grid-template-columns: 1fr;
  }
  .workflow-actions {
    grid-template-columns: repeat(5, max-content);
  }
}
</style>
