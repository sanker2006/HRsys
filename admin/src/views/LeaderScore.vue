<template>
  <div class="page-shell">
    <header class="page-head">
      <div>
        <div class="eyebrow">批次工作流 · 05</div>
        <h2>领导评分</h2>
        <p>{{ batch?.name || '加载中' }} · 每位领导独立导出并完整导入评分表</p>
      </div>
      <el-button @click="$router.push('/batch')">返回批次</el-button>
    </header>

    <section class="metric-band">
      <div><span>领导人数</span><strong>{{ list.length }}</strong></div>
      <div><span>评价对象</span><strong>{{ totals.total }}</strong></div>
      <div><span>已完成</span><strong>{{ totals.completed }}</strong></div>
      <div><span>待处理</span><strong>{{ totals.total - totals.completed }}</strong></div>
    </section>

    <section class="table-section">
      <el-table :data="list" v-loading="loading" stripe>
        <el-table-column prop="leader_name" label="领导" width="110" />
        <el-table-column prop="leader_department" label="部门" width="130" class-name="optional-column" label-class-name="optional-column" />
        <el-table-column label="类型" width="90">
          <template #default="{ row }">{{ row.leader_level === 'main_leader' ? '主要领导' : '分管领导' }}</template>
        </el-table-column>
        <el-table-column prop="total" label="对象数" width="76" />
        <el-table-column label="进度" min-width="170">
          <template #default="{ row }">
            <el-progress :percentage="row.total ? Math.round(row.completed / row.total * 100) : 0" />
            <small>{{ row.completed }} 已完成 · {{ row.draft }} 草稿 · {{ row.pending }} 待评</small>
          </template>
        </el-table-column>
        <el-table-column label="参考数据" min-width="190">
          <template #default="{ row }">
            <el-tag v-if="row.reference_ready" type="success" effect="plain">已就绪</el-tag>
            <el-tooltip v-else :content="row.blocking_reason" placement="top">
              <el-tag type="warning" effect="plain">尚未完成</el-tag>
            </el-tooltip>
          </template>
        </el-table-column>
        <el-table-column label="最近导入" width="150" class-name="optional-column" label-class-name="optional-column">
          <template #default="{ row }">{{ row.last_import_at || '-' }}</template>
        </el-table-column>
        <el-table-column label="操作" width="210" fixed="right">
          <template #default="{ row }">
            <el-button size="small" @click="download(row)">下载模板</el-button>
            <el-button size="small" type="primary" :loading="uploadingId === row.leader_id" @click="chooseFile(row)">上传评分</el-button>
          </template>
        </el-table-column>
      </el-table>
      <input ref="fileInput" class="hidden-input" type="file" accept=".xlsx" @change="handleFile" />
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { answerApi } from '../api'

const props = defineProps<{ batchId: string }>()
const loading = ref(false)
const uploadingId = ref<number | null>(null)
const batch = ref<any>(null)
const list = ref<any[]>([])
const selected = ref<any>(null)
const fileInput = ref<HTMLInputElement>()
const totals = computed(() => list.value.reduce((result, row) => ({
  total: result.total + Number(row.total || 0), completed: result.completed + Number(row.completed || 0),
}), { total: 0, completed: 0 }))

async function load() {
  loading.value = true
  try {
    const res: any = await answerApi.leaderScores(Number(props.batchId))
    batch.value = res.data?.batch
    list.value = res.data?.list || []
  } finally { loading.value = false }
}
async function download(row: any) {
  try {
    const blob: any = await answerApi.exportLeaderScore(Number(props.batchId), row.leader_id)
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `领导评分-${batch.value?.name || props.batchId}-${row.leader_name}.xlsx`
    anchor.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  } catch {
    // The shared response interceptor displays the server's concrete error.
  }
}
function chooseFile(row: any) {
  selected.value = row
  if (fileInput.value) { fileInput.value.value = ''; fileInput.value.click() }
}
async function handleFile(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  const row = selected.value
  if (!file || !row) return
  uploadingId.value = row.leader_id
  try {
    const previewRes: any = await answerApi.previewLeaderScore(Number(props.batchId), row.leader_id, file)
    const preview = previewRes.data
    const conflictText = preview.conflicts?.length ? `，其中 ${preview.conflicts.length} 条将覆盖已有正式评分` : ''
    await ElMessageBox.confirm(`校验通过，共 ${preview.rows} 条${conflictText}。确认导入？`, '导入确认', {
      type: preview.conflicts?.length ? 'warning' : 'info', confirmButtonText: '确认导入', cancelButtonText: '取消',
    })
    await answerApi.importLeaderScore(Number(props.batchId), row.leader_id, file, preview, !!preview.conflicts?.length)
    ElMessage.success('领导评分导入成功')
    await load()
  } catch (error: any) {
    if (error !== 'cancel' && error !== 'close') ElMessage.error(error?.response?.data?.message || error?.message || '导入失败')
  } finally { uploadingId.value = null }
}
onMounted(load)
</script>

<style scoped>
.page-shell { padding: 24px; }
.page-head { display: flex; justify-content: space-between; gap: 24px; align-items: flex-start; margin-bottom: 20px; }
.page-head h2 { margin: 4px 0; font-size: 26px; letter-spacing: 0; }
.page-head p, .eyebrow, small { color: var(--admin-muted); }
.eyebrow { font-size: 12px; font-weight: 700; }
.metric-band { display: grid; grid-template-columns: repeat(4, 1fr); border-block: 1px solid var(--admin-border); margin-bottom: 22px; }
.metric-band div { padding: 18px; border-right: 1px solid var(--admin-border); }
.metric-band div:last-child { border-right: 0; }
.metric-band span, .metric-band strong { display: block; }
.metric-band span { color: var(--admin-muted); font-size: 13px; }
.metric-band strong { margin-top: 6px; font-size: 25px; }
.table-section { width: 100%; }
.hidden-input { display: none; }
small { display: block; margin-top: 5px; font-size: 12px; }
@media (max-width: 760px) { .metric-band { grid-template-columns: repeat(2, 1fr); } .page-shell { padding: 16px; } }
@media (max-width: 1100px) { :deep(.optional-column) { display: none; } }
</style>
