<template>
  <div class="admin-page relation-page">
    <section class="admin-hero">
      <div>
        <h1>评价关系</h1>
        <p>检查评价人、角色、被评人和状态，确认关系生成范围符合业务规则。</p>
      </div>
      <div class="hero-actions">
        <el-button type="primary" @click="handleGenerate" :loading="generating">自动生成</el-button>
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
            <el-button size="small" type="danger" @click="handleDelete(row)">删除</el-button>
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
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { relationApi } from '../api'

const props = defineProps<{ batchId: string }>()
const loading = ref(false)
const generating = ref(false)
const allList = ref<any[]>([])
const filterType = ref('')
const filterStatus = ref('')
const currentPage = ref(1)
const pageSize = ref(20)

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
    const res: any = await relationApi.list({ batchId: Number(props.batchId), pageSize: 1000 })
    allList.value = res.data?.list || []
  } finally {
    loading.value = false
  }
}

async function handleGenerate() {
  await ElMessageBox.confirm('确认重新自动生成评价关系？这会覆盖当前批次已有关系。', '自动生成')
  generating.value = true
  try {
    const res: any = await relationApi.generate(Number(props.batchId))
    ElMessage.success(`生成完成，共 ${res.data?.total || 0} 条关系`)
    await loadList()
  } catch (err: any) {
    const missing = err?.data?.missing_questions || []
    if (missing.length > 0) {
      const rows = missing.map((item: any) =>
        `${item.department} / ${item.employee_no} / ${item.name} / ${roleText[item.level] || item.level}`
      ).join('<br/>')
      await ElMessageBox.alert(
        `以下人员未录入当前批次题目，无法生成评价关系：<br/><br/>${rows}<br/><br/>请先进入“题目模板”导入完整题目。`,
        '题目缺失',
        { dangerouslyUseHTMLString: true, type: 'warning' }
      )
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
</style>
