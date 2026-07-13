<template>
  <div class="admin-page relation-page">
    <section class="admin-hero">
      <div>
        <h1>评价关系</h1>
        <p>检查评价人、角色、被评人和状态，确认关系生成范围符合业务规则。</p>
      </div>
      <div class="hero-actions">
        <el-button v-if="canGenerate" type="primary" @click="handleGenerate" :loading="generating">预览增量生成</el-button>
        <el-button @click="handleExport">导出</el-button>
        <el-upload action="" :before-upload="handleImport" accept=".csv" :show-file-list="false">
          <el-button>批量导入</el-button>
        </el-upload>
      </div>
    </section>

    <section class="metric-grid relation-metrics">
      <div class="metric-card">
        <div class="metric-label">关系总数</div>
        <div class="metric-value">{{ allList.length }}</div>
      </div>
      <div class="metric-card">
        <div class="metric-label">自评</div>
        <div class="metric-value">{{ typeCount.self }}</div>
      </div>
      <div class="metric-card">
        <div class="metric-label">同级互评</div>
        <div class="metric-value">{{ typeCount.peer }}</div>
      </div>
      <div class="metric-card">
        <div class="metric-label">向下评价</div>
        <div class="metric-value">{{ typeCount.downward }}</div>
      </div>
    </section>

    <el-card v-loading="loading" class="work-card">
      <template #header>
        <div class="card-titlebar">
          <div class="card-title">
            <strong>关系列表</strong>
            <span>可按评价类型和完成状态过滤。</span>
          </div>
          <el-button @click="$router.back()">返回批次</el-button>
        </div>
      </template>

      <div class="filters">
        <el-select v-model="filterType" placeholder="评价类型" clearable>
          <el-option label="全部" value="" />
          <el-option label="自评" value="self" />
          <el-option label="同层互评" value="peer" />
          <el-option label="向下评价" value="downward" />
        </el-select>
        <el-select v-model="filterStatus" placeholder="状态" clearable>
          <el-option label="全部" value="" />
          <el-option label="待评" value="pending" />
          <el-option label="草稿" value="draft" />
          <el-option label="已完成" value="completed" />
        </el-select>
      </div>

      <el-table :data="paginatedList" class="admin-table">
        <el-table-column type="index" label="序号" width="60" align="center" />
        <el-table-column prop="evaluator_name" label="评价人" width="110" />
        <el-table-column label="角色" width="110">
          <template #default="{ row }">
            <el-tag size="small" :type="roleTag[row.evaluator_level]">{{ roleText[row.evaluator_level] || row.evaluator_level || '-' }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="evaluator_department" label="评价部门" width="130" />
        <el-table-column prop="eval_type" label="类型" width="110">
          <template #default="{ row }">
            <el-tag size="small" :type="typeTag[row.eval_type]">{{ typeText[row.eval_type] }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="target_name" label="被评人" width="110" />
        <el-table-column label="被评角色" width="110">
          <template #default="{ row }">
            <el-tag size="small" :type="roleTag[row.target_level]">{{ roleText[row.target_level] || row.target_level || '-' }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="target_department" label="被评部门" width="130" />
        <el-table-column prop="status" label="状态" width="90">
          <template #default="{ row }">
            <el-tag size="small" :type="statusTag[row.status]">{{ statusText[row.status] }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="80" fixed="right">
          <template #default="{ row }">
            <el-button size="small" type="danger" :disabled="row.status !== 'pending'" @click="handleDelete(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>

      <div class="pagination-wrap">
        <span>共 {{ filteredList.length }} 条</span>
        <el-pagination
          v-model:current-page="currentPage"
          v-model:page-size="pageSize"
          :page-sizes="[20, 50, 100]"
          :total="filteredList.length"
          layout="sizes, prev, pager, next"
          background
        />
      </div>
    </el-card>

    <el-dialog v-model="previewVisible" title="增量生成预览" width="min(860px, 92vw)" destroy-on-close>
      <el-alert
        type="success"
        :closable="false"
        title="现有评价关系、题目、草稿和正式答案均会保留，本次只新增缺失关系。"
        class="preview-alert"
      />
      <div v-if="preview" class="preview-summary">
        <div><span>现有关系</span><strong>{{ preview.existing_total }}</strong></div>
        <div><span>新增关系</span><strong>{{ preview.new_relations.total }}</strong></div>
        <div><span>新增人员</span><strong>{{ preview.new_participants.length }}</strong></div>
        <div><span>保留的旧规则关系</span><strong>{{ preview.obsolete_relations }}</strong></div>
      </div>
      <div v-if="preview" class="preview-breakdown">
        <el-tag>自评 +{{ preview.new_relations.self }}</el-tag>
        <el-tag type="warning">同层互评 +{{ preview.new_relations.peer }}</el-tag>
        <el-tag type="success">向下评价 +{{ preview.new_relations.downward }}</el-tag>
      </div>
      <section v-if="preview?.existing_evaluators_with_new_tasks?.length" class="impact-section">
        <h3>将新增任务的原有人员</h3>
        <div class="impact-list">
          <span v-for="item in preview.existing_evaluators_with_new_tasks" :key="item.user_id">
            {{ item.name }}（{{ item.department }}，+{{ item.new_tasks }}项）
          </span>
        </div>
      </section>
      <section v-if="preview?.score_affected_users?.length" class="impact-section warning-section">
        <h3>统计分可能重新计算的人员</h3>
        <p>新人提交对以下人员的评价后，其互评平均分和最终总分会更新。</p>
        <div class="impact-list">
          <span v-for="item in preview.score_affected_users" :key="item.user_id">
            {{ item.name }}（{{ item.department }}）
          </span>
        </div>
      </section>
      <el-alert
        v-if="preview?.existing_evaluators_with_new_tasks?.length"
        type="warning"
        :closable="false"
        title="生成后待评任务总数会增加，批次总体完成率可能下降。"
      />
      <template #footer>
        <el-button @click="previewVisible = false">取消</el-button>
        <el-button
          type="primary"
          :loading="generating"
          :disabled="!preview || preview.new_relations.total === 0"
          @click="confirmGenerate"
        >确认增量生成</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { batchApi, relationApi } from '../api'

const props = defineProps<{ batchId: string }>()
const loading = ref(false)
const generating = ref(false)
const previewVisible = ref(false)
const preview = ref<any>(null)
const batch = ref<any>(null)
const allList = ref<any[]>([])
const filterType = ref('')
const filterStatus = ref('')
const currentPage = ref(1)
const pageSize = ref(20)
const canGenerate = computed(() => ['draft', 'active'].includes(batch.value?.status))

const typeTag: Record<string, string> = { self: '', peer: 'warning', downward: 'success' }
const typeText: Record<string, string> = { self: '自评', peer: '同层互评', downward: '向下评价' }
const statusTag: Record<string, string> = { pending: 'info', draft: 'warning', completed: 'success' }
const statusText: Record<string, string> = { pending: '待评', draft: '草稿', completed: '已完成' }
const roleTag: Record<string, string> = { main_leader: 'danger', division_leader: 'warning', manager: 'success', staff: 'info', admin: '' }
const roleText: Record<string, string> = {
  main_leader: '主要领导',
  division_leader: '分管领导',
  manager: '部门负责人',
  staff: '员工',
  admin: '管理员',
}

const filteredList = computed(() => {
  return allList.value.filter(r => {
    if (filterType.value && r.eval_type !== filterType.value) return false
    if (filterStatus.value && r.status !== filterStatus.value) return false
    return true
  })
})

const paginatedList = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value
  return filteredList.value.slice(start, start + pageSize.value)
})
const typeCount = computed(() => ({
  self: allList.value.filter(r => r.eval_type === 'self').length,
  peer: allList.value.filter(r => r.eval_type === 'peer').length,
  downward: allList.value.filter(r => r.eval_type === 'downward').length,
}))

async function loadList() {
  loading.value = true
  try {
    const [res, batchRes]: any = await Promise.all([
      relationApi.list({ batchId: Number(props.batchId), pageSize: 5000 }),
      batchApi.get(Number(props.batchId)),
    ])
    allList.value = res.data?.list || []
    batch.value = batchRes.data
  } finally {
    loading.value = false
  }
}

async function handleGenerate() {
  generating.value = true
  try {
    const res: any = await relationApi.previewGenerate(Number(props.batchId))
    preview.value = res.data
    previewVisible.value = true
  } catch (err: any) {
    const missing = err?.data?.missing_questions || []
    if (missing.length > 0) {
      const rows = missing.map((item: any) =>
        `${item.department} / ${item.employee_no} / ${item.name} / ${roleText[item.level] || item.level}`
      ).join('；')
      await ElMessageBox.alert(
        `以下人员未录入当前批次题目，无法生成评价关系：${rows}。请先进入“题目模板”导入完整题目。`,
        '题目缺失',
        { type: 'warning' }
      )
    }
  } finally {
    generating.value = false
  }
}

async function confirmGenerate() {
  if (!preview.value?.preview_hash) return
  generating.value = true
  try {
    const res: any = await relationApi.generate(Number(props.batchId), preview.value.preview_hash)
    previewVisible.value = false
    ElMessage.success(`增量生成完成，新增 ${res.data?.total || 0} 条关系，原有 ${res.data?.preserved_existing || 0} 条关系已保留`)
    await loadList()
  } catch (err: any) {
    if (err?.status === 409 || /重新预览/.test(String(err?.message || ''))) {
      previewVisible.value = false
      ElMessage.warning('生成范围已经发生变化，请重新预览后确认')
    }
  } finally {
    generating.value = false
  }
}

async function handleDelete(row: any) {
  await ElMessageBox.confirm('确认删除该评价关系？', '删除')
  await relationApi.delete(row.id)
  await loadList()
  ElMessage.success('已删除')
}

function csvEscape(value: any) {
  const text = String(value ?? '')
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

function handleExport() {
  const data = filteredList.value.map(r => ({
    评价人: r.evaluator_name,
    评价人角色: roleText[r.evaluator_level] || r.evaluator_level,
    评价部门: r.evaluator_department,
    类型: typeText[r.eval_type],
    被评人: r.target_name,
    被评人角色: roleText[r.target_level] || r.target_level,
    被评部门: r.target_department,
    状态: statusText[r.status],
  }))
  const headers = Object.keys(data[0] || {})
  const csv = [headers.join(','), ...data.map(d => headers.map(h => csvEscape(d[h as keyof typeof d])).join(','))]
  const blob = new Blob(['\uFEFF' + csv.join('\n')], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `评价关系-${props.batchId}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

function parseCsvLine(line: string) {
  return line.split(',').map(v => v.trim())
}

async function handleImport(file: File) {
  const reader = new FileReader()
  reader.onload = async (e) => {
    try {
      const text = String(e.target?.result || '').trim()
      const lines = text.split(/\r?\n/).filter(Boolean)
      const headers = parseCsvLine(lines[0]).map((h, i) => i === 0 ? h.replace(/^\uFEFF/, '') : h)
      const items = lines.slice(1).map(line => {
        const vals = parseCsvLine(line)
        const obj: any = {}
        headers.forEach((h, idx) => { obj[h] = vals[idx] || '' })
        return obj
      })
      const res: any = await relationApi.import(Number(props.batchId), items)
      ElMessage.success(`导入完成，成功 ${res.data?.success || 0} 条`)
      if (res.data?.errors?.length > 0) ElMessage.warning(`${res.data.errors.length} 条导入失败`)
      await loadList()
    } catch {
      ElMessage.error('导入失败')
    }
  }
  reader.readAsText(file, 'utf-8')
  return false
}

onMounted(loadList)
</script>

<style scoped>
.relation-metrics .metric-value { font-size: 28px; }
.filters { display: flex; gap: 10px; margin-bottom: 14px; }
.filters .el-select { width: 140px; }
.preview-alert { margin-bottom: 16px; }
.preview-summary {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
  margin-bottom: 14px;
}
.preview-summary > div {
  padding: 14px;
  border: 1px solid var(--admin-border);
  border-radius: 8px;
  background: var(--admin-bg-soft);
}
.preview-summary span { display: block; color: var(--admin-muted); font-size: 12px; }
.preview-summary strong { display: block; margin-top: 6px; font-size: 24px; color: var(--admin-text); }
.preview-breakdown { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 18px; }
.impact-section { padding: 14px 0; border-top: 1px solid var(--admin-border); }
.impact-section h3 { margin: 0 0 8px; font-size: 15px; }
.impact-section p { margin: 0 0 8px; color: var(--admin-muted); font-size: 13px; }
.impact-list { display: flex; flex-wrap: wrap; gap: 8px; }
.impact-list span { padding: 7px 10px; border-radius: 6px; background: var(--admin-bg-soft); font-size: 13px; }
.warning-section h3 { color: var(--el-color-warning-dark-2); }
@media (max-width: 720px) {
  .preview-summary { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
</style>
