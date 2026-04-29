<template>
  <div class="dept-page">
    <el-card>
      <template #header>
        <div style="display:flex;justify-content:space-between;align-items:center">
          <span style="font-size:15px;font-weight:600">部门管理</span>
          <el-button type="primary" size="small" @click="openDialog()">新增部门</el-button>
        </div>
      </template>

      <el-table :data="list" stripe v-loading="loading">
        <el-table-column type="index" label="序号" width="70" align="center" />
        <el-table-column prop="name" label="部门名称" min-width="200" />
        <el-table-column prop="sort_order" label="排序" width="100" align="center" />
        <el-table-column label="创建时间" width="180">
          <template #default="{ row }">{{ row.created_at?.substring(0, 16).replace('T', ' ') }}</template>
        </el-table-column>
        <el-table-column label="操作" width="140" align="center">
          <template #default="{ row }">
            <el-button size="small" type="primary" text @click="openDialog(row)">编辑</el-button>
            <el-button size="small" type="danger" text @click="handleDelete(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <!-- 新增/编辑弹窗 -->
    <el-dialog v-model="showDialog" :title="editingId ? '编辑部门' : '新增部门'" width="420px">
      <el-form :model="form" label-width="80px">
        <el-form-item label="部门名称" prop="name" required>
          <el-input v-model="form.name" placeholder="如：技术部、市场部" maxlength="30" />
        </el-form-item>
        <el-form-item label="排序">
          <el-input-number v-model="form.sort_order" :min="0" :max="9999" />
          <span style="margin-left:8px;color:#999;font-size:12px">数字越小越靠前</span>
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
import { ref, reactive, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { departmentApi } from '../api'

const loading = ref(false)
const saving  = ref(false)
const list    = ref<any[]>([])
const showDialog = ref(false)
const editingId  = ref<number | null>(null)

const form = reactive({ name: '', sort_order: 0 })

async function load() {
  loading.value = true
  try {
    const res: any = await departmentApi.list()
    list.value = res.data?.list || []
  } finally {
    loading.value = false
  }
}

function openDialog(row?: any) {
  if (row) {
    editingId.value = row.id
    Object.assign(form, { name: row.name, sort_order: row.sort_order })
  } else {
    editingId.value = null
    Object.assign(form, { name: '', sort_order: 0 })
  }
  showDialog.value = true
}

async function handleSave() {
  if (!form.name.trim()) {
    ElMessage.warning('请填写部门名称')
    return
  }
  saving.value = true
  try {
    if (editingId.value) {
      await departmentApi.update(editingId.value, { name: form.name.trim(), sort_order: form.sort_order })
      ElMessage.success('修改成功')
    } else {
      await departmentApi.create({ name: form.name.trim(), sort_order: form.sort_order })
      ElMessage.success('创建成功')
    }
    showDialog.value = false
    load()
  } finally {
    saving.value = false
  }
}

async function handleDelete(row: any) {
  await ElMessageBox.confirm(`确认删除部门「${row.name}」？`, '删除确认')
  try {
    await departmentApi.delete(row.id)
    ElMessage.success('已删除')
    load()
  } catch (e: any) {
    ElMessage.error(e?.message || e?.response?.data?.message || '删除失败')
  }
}

onMounted(load)
</script>

<style scoped>
.dept-page :deep(.el-table) {
  font-size: 14px;
}
</style>
