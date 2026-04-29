<template>
  <div class="sq-page">
    <el-card v-loading="loading">
      <template #header>
        <div style="display:flex;justify-content:space-between;align-items:center">
          <span>自评题目导入</span>
          <el-space>
            <el-button @click="downloadTemplate">下载模板</el-button>
            <el-upload action="" :before-upload="handleUpload" accept=".xlsx,.xls" :show-file-list="false">
              <el-button type="primary">导入Excel</el-button>
            </el-upload>
            <el-button type="danger" @click="handleClear" :disabled="list.length === 0">清除全部</el-button>
          </el-space>
        </div>
      </template>

      <el-alert type="info" :closable="false" style="margin-bottom:16px">
        Excel格式：工号、题目1~10、分值1~10（已填写题目的分值合计必须=100）。支持1~10题灵活配置，未使用列留空；例如只填3道题且分值合计100，也可以导入。
      </el-alert>

      <el-table :data="list" stripe v-if="list.length > 0">
        <el-table-column prop="employee_no" label="工号" width="100" />
        <el-table-column prop="user_name" label="姓名" width="100" />
        <el-table-column label="题目">
          <template #default="{ row }">
            <div v-for="q in row.questions.filter((q:any) => q.content)" :key="q.seq" style="margin-bottom:4px">
              <span style="color:#666">Q{{ q.seq }}：</span>{{ q.content }}
              <span style="color:#409eff;margin-left:8px">分值 {{ q.weight || 0 }} 分</span>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="80">
          <template #default="{ row }">
            <el-button size="small" type="danger" @click="deleteOne(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
      <el-empty v-else description="暂无自评题目，请导入Excel" />

      <div style="margin-top:16px;text-align:center">
        <el-button @click="$router.back()">返回</el-button>
      </div>
    </el-card>

    <!-- 导入预览弹窗 -->
    <el-dialog v-model="previewVisible" title="导入预览" width="700px">
      <el-alert v-if="importResult" :type="importResult.errors.length > 0 ? 'warning' : 'success'" style="margin-bottom:12px">
        成功 {{ importResult.success }} 条
        <span v-if="importResult.errors.length > 0">，失败 {{ importResult.errors.length }} 条</span>
      </el-alert>
      <el-table :data="importResult?.errors || []" max-height="300" v-if="importResult?.errors.length">
        <el-table-column prop="row" label="行号" width="80" />
        <el-table-column prop="message" label="错误信息" />
      </el-table>
      <template #footer>
        <el-button type="primary" @click="previewVisible=false; loadList()">确定</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { selfQuestionApi } from '../api'

const props = defineProps<{ batchId: string }>()
const loading = ref(false)
const list = ref<any[]>([])
const previewVisible = ref(false)
const importResult = ref<any>(null)

async function loadList() {
  loading.value = true
  try {
    const res: any = await selfQuestionApi.list(parseInt(props.batchId))
    list.value = res.data || []
  } finally {
    loading.value = false
  }
}

function downloadTemplate() {
  const headers = ['工号', '题目1', '分值1', '题目2', '分值2', '题目3', '分值3', '题目4', '分值4',
    '题目5', '分值5', '题目6', '分值6', '题目7', '分值7', '题目8', '分值8', '题目9', '分值9',
    '题目10', '分值10']
  // 示例：3道题，分值分别为40/35/25，合计100
  const row = ['EMP001', '工作目标完成情况', '40', '协作沟通与团队贡献', '35', '学习改进与创新意识', '25', '', '', '', '', '', '', '', '', '', '', '', '', '', '']
  const csv = [headers.join(','), row.join(',')]
  const blob = new Blob([csv.join('\n')], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = '自评题目分值导入模板.csv'
  a.click()
  URL.revokeObjectURL(url)
}

async function handleUpload(file: File) {
  const formData = new FormData()
  formData.append('file', file)
  // 简单解析：实际项目应使用 xlsx 库，这里用纯前端读 CSV
  ElMessage.info('正在解析文件，请稍候...')
  // 提示：此处应接入 xlsx 库解析Excel，或在后端处理
  // 为保证流程完整，示例为手动构造数据
  const reader = new FileReader()
  reader.onload = async (e) => {
    try {
      const text = e.target?.result as string
      const lines = text.trim().split('\n')
      if (lines.length < 2) { ElMessage.error('文件内容为空'); return }
      const headers = lines[0].split(',').map(h => h.trim())
      const items: any[] = []
      for (let i = 1; i < lines.length; i++) {
        const vals = lines[i].split(',').map(v => v.trim())
        const obj: any = {}
        headers.forEach((h, idx) => { obj[h] = vals[idx] || '' })
        items.push(obj)
      }
      const res: any = await selfQuestionApi.import(parseInt(props.batchId), items)
      importResult.value = res.data
      previewVisible.value = true
    } catch {
      ElMessage.error('文件解析失败')
    }
  }
  reader.readAsText(file)
  return false
}

async function deleteOne(_row: any) {
  await ElMessageBox.confirm('确认删除？', '删除')
  ElMessage.info('请重新导入以更新数据')
}

async function handleClear() {
  await ElMessageBox.confirm('确认清除所有自评题目？', '清除')
  await selfQuestionApi.delete(parseInt(props.batchId))
  loadList()
  ElMessage.success('已清除')
}

onMounted(loadList)
</script>
