<template>
  <div class="admin-page sq-page">
    <section class="admin-hero">
      <div>
        <h1>题目模板</h1>
        <p>按员工绑定业绩评价和综合评价题目；导入后才能进入完整评价流程。</p>
      </div>
      <div class="hero-actions">
        <el-button @click="downloadTemplate">下载模板</el-button>
        <el-upload action="" :before-upload="handleUpload" accept=".csv" :show-file-list="false">
          <el-button type="primary">导入 CSV</el-button>
        </el-upload>
        <el-button
          type="danger"
          plain
          @click="handleClear"
          :disabled="!canClear"
          :title="canClear ? '' : '只有没有评价答案的草稿批次可以清空题目'"
        >清除全部</el-button>
      </div>
    </section>

    <el-card v-loading="loading" class="work-card">
      <template #header>
        <div class="card-titlebar">
          <div class="card-title">
            <strong>已导入题目</strong>
            <span>当前批次共 {{ list.length }} 名人员已绑定题目。</span>
          </div>
          <el-button @click="$router.back()">返回批次</el-button>
        </div>
      </template>

      <el-alert type="info" :closable="false" class="tip">
        模板为单表双区：姓名、工号、业绩题1-10/业绩分值1-10、综合题1-5/综合分值1-5。后端会校验工号存在、姓名匹配、业绩合计 70 分、综合合计 30 分，分值最多 1 位小数。
      </el-alert>

      <el-table :data="list" class="admin-table question-table" v-if="list.length > 0">
        <el-table-column prop="employee_no" label="工号" width="120" />
        <el-table-column prop="user_name" label="姓名" width="120" />
        <el-table-column label="题目状态" width="100">
          <template #default="{ row }">
            <el-tag :type="row.locked ? 'warning' : 'success'">{{ row.locked ? '已锁定' : '已录入' }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="业绩评价">
          <template #default="{ row }">
            <div v-for="q in row.performance_questions" :key="q.answer_seq" class="q-line">
              <span class="q-index">P{{ q.seq }}</span>{{ q.content }}
              <span class="q-score">{{ q.weight }} 分</span>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="综合评价">
          <template #default="{ row }">
            <div v-for="q in row.comprehensive_questions" :key="q.answer_seq" class="q-line">
              <span class="q-index">C{{ q.seq }}</span>{{ q.content }}
              <span class="q-score">{{ q.weight }} 分</span>
            </div>
          </template>
        </el-table-column>
      </el-table>
      <el-empty v-else description="暂无自评题目，请导入模板数据" />

    </el-card>

    <el-dialog v-model="previewVisible" title="导入结果" width="820px">
      <el-alert v-if="importResult" :type="importResult.failed > 0 ? 'warning' : 'success'" :closable="false" class="tip">
        共 {{ importResult.total }} 行：写入 {{ importResult.success }}，未变化 {{ importResult.unchanged || 0 }}，
        无题目跳过 {{ importResult.skipped_no_questions || 0 }}，失败 {{ importResult.failed }}
      </el-alert>
      <el-table v-if="importResult?.errors?.length" :data="importResult.errors" max-height="360" border>
        <el-table-column prop="row" label="行号" width="90" />
        <el-table-column prop="employee_no" label="工号" width="120" />
        <el-table-column prop="user_name" label="姓名" width="120" />
        <el-table-column prop="message" label="错误信息" min-width="260" />
      </el-table>
      <el-empty v-else description="本次导入全部成功" />
      <template #footer>
        <el-button type="primary" @click="previewVisible = false; loadList()">确定</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { batchApi, selfQuestionApi, userApi } from '../api'
import { buildCsvText, parseCsvBuffer } from '../utils/csv'

const props = defineProps<{ batchId: string }>()
const loading = ref(false)
const list = ref<any[]>([])
const previewVisible = ref(false)
const importResult = ref<any>(null)
const batch = ref<any>(null)
const canClear = computed(() =>
  batch.value?.status === 'draft'
  && list.value.length > 0
  && !list.value.some(row => row.locked)
)

async function loadList() {
  loading.value = true
  try {
    const [res, batchRes]: any = await Promise.all([
      selfQuestionApi.list(Number(props.batchId)),
      batchApi.get(Number(props.batchId)),
    ])
    list.value = res.data || []
    batch.value = batchRes.data
  } finally {
    loading.value = false
  }
}

async function downloadTemplate() {
  const headers = ['题目状态', '姓名', '工号']
  for (let i = 1; i <= 10; i++) headers.push(`业绩题${i}`, `业绩分值${i}`)
  for (let i = 1; i <= 5; i++) headers.push(`综合题${i}`, `综合分值${i}`)

  const res: any = await userApi.export({ status: 'active' })
  const users = (res.data || [])
    .filter((user: any) => ['manager', 'staff'].includes(user.level) && !Number(user.is_admin || 0))
    .sort((a: any, b: any) => String(a.employee_no || '').localeCompare(String(b.employee_no || ''), 'zh-Hans-CN'))

  if (users.length === 0) {
    ElMessage.warning('暂无可导出的启用员工')
    return
  }

  const existingByEmployeeNo = new Map(list.value.map((row: any) => [String(row.employee_no), row]))
  const rows = users.map((user: any) => {
    const existing: any = existingByEmployeeNo.get(String(user.employee_no))
    const questionCells = Array.from({ length: 30 }, () => '' as string | number)
    for (const question of existing?.performance_questions || []) {
      const offset = (Number(question.seq) - 1) * 2
      questionCells[offset] = question.content
      questionCells[offset + 1] = question.weight
    }
    for (const question of existing?.comprehensive_questions || []) {
      const offset = 20 + (Number(question.seq) - 1) * 2
      questionCells[offset] = question.content
      questionCells[offset + 1] = question.weight
    }
    return [
      existing ? (existing.locked ? '已锁定' : '已录入') : '未录入',
      user.name || '',
      user.employee_no || '',
      ...questionCells,
    ]
  })
  const blob = new Blob([buildCsvText(headers, rows)], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = '自评题目导入模板-启用员工.csv'
  a.click()
  URL.revokeObjectURL(url)
}

async function handleUpload(file: File) {
  try {
    const { items } = parseCsvBuffer(await file.arrayBuffer())
    const res: any = await selfQuestionApi.import(Number(props.batchId), items)
    importResult.value = res.data
    previewVisible.value = true
  } catch (err: any) {
    ElMessage.error(err?.message || '文件解析失败')
  }
  return false
}

async function handleClear() {
  await ElMessageBox.confirm('确认清除当前批次的所有自评题目？', '清除')
  await selfQuestionApi.delete(Number(props.batchId))
  await loadList()
  ElMessage.success('已清除')
}

onMounted(loadList)
</script>

<style scoped>
.tip { margin-bottom: 16px; }
.q-line {
  margin-bottom: 7px;
  line-height: 1.55;
  color: var(--admin-text);
}
.q-index {
  display: inline-flex;
  justify-content: center;
  min-width: 28px;
  margin-right: 6px;
  color: var(--admin-primary-2);
  font-weight: 900;
}
.q-score {
  color: var(--admin-success);
  margin-left: 8px;
  font-weight: 800;
}
</style>
