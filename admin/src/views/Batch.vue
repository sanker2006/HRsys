<template>
  <div class="batch-page">
    <el-card>
      <template #header>
        <div style="display:flex;justify-content:space-between;align-items:center">
          <span>评选批次</span>
          <el-button type="primary" @click="showDialog = true">新建批次</el-button>
        </div>
      </template>

      <el-table :data="paginatedList" stripe v-loading="loading">
        <el-table-column type="index" label="序号" width="60" align="center" />
        <el-table-column prop="name" label="批次名称" />
        <el-table-column prop="period" label="周期" />
        <el-table-column prop="start_time" label="开始时间" />
        <el-table-column prop="end_time" label="结束时间" />
        <el-table-column prop="status" label="状态">
          <template #default="{ row }">
            <el-tag :type="statusType[row.status] || 'info'">{{ statusText[row.status] }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="完成进度">
          <template #default="{ row }">
            <span>{{ row.completed || 0 }} / {{ row.total || 0 }}</span>
            <el-progress :percentage="row.total ? Math.round((row.completed / row.total) * 100) : 0" style="width:120px;margin-left:8px" />
          </template>
        </el-table-column>
        <el-table-column label="操作" width="320">
          <template #default="{ row }">
            <el-button size="small" @click="$router.push(`/matrix/${row.id}`)">评估矩阵</el-button>
            <el-button size="small" @click="$router.push(`/self-question/${row.id}`)">自评题目</el-button>
            <el-button size="small" @click="$router.push(`/relation/${row.id}`)">评价关系</el-button>
            <el-button size="small" @click="$router.push(`/progress/${row.id}`)">进度</el-button>
            <el-dropdown split-button size="small" type="default" @click.stop @command="(cmd:string) => handleCommand(cmd, row)" style="margin-left:4px">
              <span>操作</span>
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item command="edit">编辑</el-dropdown-item>
                  <el-dropdown-item command="start" v-if="row.status==='draft'">启动</el-dropdown-item>
                  <el-dropdown-item command="close" v-if="row.status==='active'">结束</el-dropdown-item>
                  <el-dropdown-item command="delete" v-if="row.status==='draft'" style="color:#f56c6c">删除</el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>
          </template>
        </el-table-column>
      </el-table>

      <div style="margin-top:16px;display:flex;justify-content:flex-end;align-items:center;gap:12px">
        <span style="color:#606266;font-size:13px">共 {{ batches.length }} 条</span>
        <el-pagination
          v-model:current-page="currentPage"
          v-model:page-size="pageSize"
          :page-sizes="[20, 50, 100]"
          :total="batches.length"
          layout="sizes, prev, pager, next"
          background
        />
      </div>
    </el-card>

    <!-- 新建/编辑弹窗 -->
    <el-dialog v-model="showDialog" :title="editingId ? '编辑批次' : '新建批次'" width="500px">
      <el-form :model="form" label-width="90px">
        <el-form-item label="批次名称" required>
          <el-input v-model="form.name" placeholder="如：2026年Q1季度评选" />
        </el-form-item>
        <el-form-item label="评选周期">
          <el-input v-model="form.period" placeholder="如：2026Q1" />
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
import { ref, reactive, computed, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { batchApi } from '../api'

const batches = ref<any[]>([])
const loading = ref(false)
const showDialog = ref(false)
const saving = ref(false)
const editingId = ref<number | null>(null)
const currentPage = ref(1)
const pageSize = ref(20)

const form = reactive({ name: '', period: '', start_time: '', end_time: '' })
const statusType: Record<string, string> = { draft: 'warning', active: 'success', closed: 'info' }
const statusText: Record<string, string> = { draft: '草稿', active: '进行中', closed: '已结束' }

const paginatedList = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value
  return batches.value.slice(start, start + pageSize.value)
})

function resetForm() {
  Object.assign(form, { name: '', period: '', start_time: '', end_time: '' })
  editingId.value = null
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
    ElMessage.warning('请填写必填项')
    return
  }
  saving.value = true
  try {
    if (editingId.value) {
      await batchApi.update(editingId.value, form)
    } else {
      await batchApi.create(form)
    }
    showDialog.value = false
    resetForm()
    loadBatches()
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
    loadBatches()
    ElMessage.success('已启动')
  } else if (cmd === 'close') {
    await ElMessageBox.confirm('确认结束该批次？结束后将无法继续评价。', '结束批次')
    await batchApi.close(row.id)
    loadBatches()
    ElMessage.success('已结束')
  } else if (cmd === 'delete') {
    await ElMessageBox.confirm('确认删除该批次？', '删除批次')
    await batchApi.delete(row.id)
    loadBatches()
    ElMessage.success('已删除')
  }
}

onMounted(loadBatches)
</script>
