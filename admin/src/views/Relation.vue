<template>
  <div class="relation-page">
    <el-card v-loading="loading">
      <template #header>
        <div style="display:flex;justify-content:space-between;align-items:center">
          <span>评价关系管理</span>
          <el-space>
            <el-button type="primary" @click="handleGenerate" :loading="generating">自动生成</el-button>
            <el-button @click="handleExport">导出</el-button>
            <el-upload action="" :before-upload="handleImport" accept=".xlsx,.xls,.csv" :show-file-list="false">
              <el-button>批量导入</el-button>
            </el-upload>
          </el-space>
        </div>
      </template>

      <div style="margin-bottom:12px">
        <el-select v-model="filterType" placeholder="评估类型" clearable style="width:140px;margin-right:8px">
          <el-option label="全部" value="" />
          <el-option label="自评" value="self" />
          <el-option label="同层互评" value="peer" />
          <el-option label="向下评估" value="downward" />
        </el-select>
        <el-select v-model="filterStatus" placeholder="状态" clearable style="width:120px">
          <el-option label="全部" value="" />
          <el-option label="待评" value="pending" />
          <el-option label="草稿" value="draft" />
          <el-option label="已完成" value="completed" />
        </el-select>
      </div>

      <el-table :data="paginatedList" stripe>
        <el-table-column type="index" label="序号" width="60" align="center" />
        <el-table-column prop="evaluator_name" label="评价人" width="100" />
        <el-table-column prop="evaluator_department" label="评价人部门" width="120" />
        <el-table-column prop="eval_type" label="类型" width="110">
          <template #default="{ row }">
            <el-tag size="small" :type="typeTag[row.eval_type]">{{ typeText[row.eval_type] }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="target_name" label="被评人" width="100" />
        <el-table-column prop="target_department" label="被评人部门" width="120" />
        <el-table-column prop="status" label="状态" width="90">
          <template #default="{ row }">
            <el-tag size="small" :type="statusTag[row.status]">{{ statusText[row.status] }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="80">
          <template #default="{ row }">
            <el-button size="small" type="danger" @click="handleDelete(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>

      <div style="margin-top:16px;display:flex;justify-content:flex-end;align-items:center;gap:12px">
        <span style="color:#606266;font-size:13px">共 {{ filteredList.length }} 条</span>
        <el-pagination
          v-model:current-page="currentPage"
          v-model:page-size="pageSize"
          :page-sizes="[20, 50, 100]"
          :total="filteredList.length"
          layout="sizes, prev, pager, next"
          background
        />
      </div>

      <div style="margin-top:20px;text-align:center">
        <el-button @click="$router.back()">返回</el-button>
      </div>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
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
const typeText: Record<string, string> = { self: '自评', peer: '同层互评', downward: '向下评估' }
const statusTag: Record<string, string> = { pending: 'info', draft: 'warning', completed: 'success' }
const statusText: Record<string, string> = { pending: '待评', draft: '草稿', completed: '已完成' }

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

async function loadList() {
  loading.value = true
  try {
    const res: any = await relationApi.list({ batchId: parseInt(props.batchId), pageSize: 1000 })
    allList.value = res.data?.list || []
  } finally {
    loading.value = false
  }
}

async function handleGenerate() {
  await ElMessageBox.confirm('确认重新自动生成评价关系？将覆盖现有关系。', '自动生成')
  generating.value = true
  try {
    const res: any = await relationApi.generate(parseInt(props.batchId))
    ElMessage.success(`生成完成，共 ${res.data?.total || 0} 条关系`)
    loadList()
  } finally {
    generating.value = false
  }
}

async function handleDelete(row: any) {
  await ElMessageBox.confirm('确认删除该评价关系？', '删除')
  await relationApi.delete(row.id)
  loadList()
  ElMessage.success('已删除')
}

function handleExport() {
  const data = filteredList.value.map(r => ({
    评价人: r.evaluator_name,
    评价人部门: r.evaluator_department,
    类型: typeText[r.eval_type],
    被评人: r.target_name,
    被评人部门: r.target_department,
    状态: statusText[r.status],
  }))
  const headers = Object.keys(data[0] || {})
  const csv = [headers.join(','), ...data.map(d => headers.map(h => d[h as keyof typeof d]).join(','))]
  const blob = new Blob(['\uFEFF' + csv.join('\n')], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `评价关系-${props.batchId}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

async function handleImport(file: File) {
  const reader = new FileReader()
  reader.onload = async (e) => {
    try {
      const text = e.target?.result as string
      const lines = text.trim().split('\n')
      const headers = lines[0].split(',').map(h => h.trim())
      const items: any[] = []
      for (let i = 1; i < lines.length; i++) {
        const vals = lines[i].split(',').map(v => v.trim())
        const obj: any = {}
        headers.forEach((h, idx) => { obj[h] = vals[idx] || '' })
        items.push(obj)
      }
      const res: any = await relationApi.import(parseInt(props.batchId), items)
      ElMessage.success(`导入完成，成功 ${res.data?.success || 0} 条`)
      if (res.data?.errors?.length > 0) {
        ElMessage.warning(`${res.data.errors.length} 条导入失败`)
      }
      loadList()
    } catch {
      ElMessage.error('导入失败')
    }
  }
  reader.readAsText(file)
  return false
}

onMounted(loadList)
</script>
