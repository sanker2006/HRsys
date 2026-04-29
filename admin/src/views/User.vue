<template>
  <div class="user-page">
    <el-card>
      <template #header>
        <div style="display:flex;justify-content:space-between;align-items:center">
          <span>用户管理</span>
          <el-space>
            <el-upload action="" :before-upload="handleImport" accept=".xlsx,.xls,.csv" :show-file-list="false">
              <el-button>批量导入</el-button>
            </el-upload>
            <el-button type="primary" @click="openDialog()">添加用户</el-button>
          </el-space>
        </div>
      </template>

      <div style="margin-bottom:12px">
        <el-input v-model="keyword" placeholder="搜索姓名/工号" style="width:200px;margin-right:8px" clearable @change="loadUsers" />
        <el-select v-model="filterDept" placeholder="部门" clearable style="width:140px;margin-right:8px" @change="loadUsers">
          <el-option v-for="d in departments" :key="d" :label="d" :value="d" />
        </el-select>
        <el-select v-model="filterLevel" placeholder="角色层级" clearable style="width:140px" @change="loadUsers">
          <el-option label="领导层" value="leader" />
          <el-option label="部门负责人" value="manager" />
          <el-option label="员工" value="staff" />
        </el-select>
      </div>

      <el-table :data="paginatedList" stripe v-loading="loading">
        <el-table-column type="index" label="序号" width="60" align="center" />
        <el-table-column prop="name" label="姓名" width="100" />
        <el-table-column prop="employee_no" label="工号" width="100" />
        <el-table-column prop="department" label="部门" width="120" />
        <el-table-column prop="position" label="岗位" width="120" />
        <el-table-column prop="level" label="角色层级" width="110">
          <template #default="{ row }">
            <el-tag size="small" :type="levelTag[row.level]">{{ levelText[row.level] }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="phone" label="手机号" width="130" />
        <el-table-column prop="id_card_tail" label="证件后四位" width="100" />
        <el-table-column label="操作" width="160">
          <template #default="{ row }">
            <el-button size="small" @click="openDialog(row)">编辑</el-button>
            <el-button size="small" type="danger" @click="handleDelete(row)" v-if="!row.is_admin">删除</el-button>
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
    </el-card>

    <el-dialog v-model="showDialog" :title="editingId ? '编辑用户' : '添加用户'" width="500px">
      <el-form :model="form" label-width="100px">
        <el-form-item label="姓名" required>
          <el-input v-model="form.name" />
        </el-form-item>
        <el-form-item label="工号" required>
          <el-input v-model="form.employee_no" :disabled="!!editingId" />
        </el-form-item>
        <el-form-item label="部门" required>
          <el-select v-model="form.department" allow-create filterable style="width:100%">
            <el-option v-for="d in departments" :key="d" :label="d" :value="d" />
          </el-select>
        </el-form-item>
        <el-form-item label="岗位">
          <el-input v-model="form.position" />
        </el-form-item>
        <el-form-item label="角色层级" required>
          <el-select v-model="form.level" style="width:100%">
            <el-option label="领导层" value="leader" />
            <el-option label="部门负责人" value="manager" />
            <el-option label="员工" value="staff" />
          </el-select>
        </el-form-item>
        <el-form-item label="手机号" required>
          <el-input v-model="form.phone" />
        </el-form-item>
        <el-form-item label="证件后四位" required>
          <el-input v-model="form.id_card_tail" maxlength="4" />
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
import { userApi, departmentApi } from '../api'

const users = ref<any[]>([])
const departments = ref<string[]>([])
const loading = ref(false)
const saving = ref(false)
const showDialog = ref(false)
const editingId = ref<number | null>(null)
const keyword = ref('')
const filterDept = ref('')
const filterLevel = ref('')
const currentPage = ref(1)
const pageSize = ref(20)

const form = reactive({
  name: '', employee_no: '', department: '', position: '',
  level: 'staff', phone: '', id_card_tail: '',
})

const levelTag: Record<string, string> = { leader: '', manager: 'success', staff: 'info' }
const levelText: Record<string, string> = { leader: '领导层', manager: '部门负责人', staff: '员工' }

const filteredList = computed(() => users.value)

const paginatedList = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value
  return filteredList.value.slice(start, start + pageSize.value)
})

function resetForm() {
  Object.assign(form, { name: '', employee_no: '', department: '', position: '', level: 'staff', phone: '', id_card_tail: '' })
  editingId.value = null
}

function openDialog(row?: any) {
  if (row) {
    editingId.value = row.id
    Object.assign(form, { name: row.name, employee_no: row.employee_no, department: row.department, position: row.position, level: row.level, phone: row.phone, id_card_tail: row.id_card_tail })
  } else {
    resetForm()
  }
  showDialog.value = true
}

async function loadUsers() {
  loading.value = true
  try {
    const res: any = await userApi.list({ keyword: keyword.value, department: filterDept.value, level: filterLevel.value })
    users.value = res.data?.list || []
  } finally {
    loading.value = false
  }
}

async function handleSave() {
  saving.value = true
  try {
    if (editingId.value) {
      await userApi.update(editingId.value, form)
    } else {
      await userApi.create(form)
    }
    showDialog.value = false
    resetForm()
    loadUsers()
    ElMessage.success('保存成功')
  } finally {
    saving.value = false
  }
}

async function handleDelete(row: any) {
  await ElMessageBox.confirm(`确认删除用户「${row.name}」？`, '删除用户')
  await userApi.delete(row.id)
  loadUsers()
  ElMessage.success('已删除')
}

async function handleImport(file: File) {
  const reader = new FileReader()
  reader.onload = async (e) => {
    try {
      const text = (e.target?.result as string).trim()
      const lines = text.split('\n')
      const headers = lines[0].split(',').map(h => h.trim())
      const items: any[] = []
      for (let i = 1; i < lines.length; i++) {
        const vals = lines[i].split(',').map(v => v.trim())
        const obj: any = {}
        headers.forEach((h, idx) => { obj[h] = vals[idx] || '' })
        items.push(obj)
      }
      const res: any = await userApi.import(items)
      ElMessage.success(`成功导入 ${res.data?.success || 0} 人`)
      if (res.data?.errors?.length > 0) {
        ElMessage.warning(`${res.data.errors.length} 条失败`)
      }
      loadUsers()
    } catch {
      ElMessage.error('导入失败')
    }
  }
  reader.readAsText(file)
  return false
}

onMounted(async () => {
  loadUsers()
  const res: any = await departmentApi.list()
  departments.value = (res.data?.list || []).map((d: any) => d.name)
})
</script>
