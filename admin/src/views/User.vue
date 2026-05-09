<template>
  <div class="admin-page user-page">
    <section class="admin-hero">
      <div>
        <h1>人员与角色</h1>
        <p>维护员工、部门负责人、分管领导和主要领导，并配置分管领导负责部门。</p>
      </div>
      <div class="hero-actions">
        <el-upload action="" :before-upload="handleImport" accept=".csv" :show-file-list="false">
          <el-button>批量导入</el-button>
        </el-upload>
        <el-button type="primary" @click="openDialog()">添加用户</el-button>
      </div>
    </section>

    <section class="metric-grid user-metrics">
      <div class="metric-card">
        <div class="metric-label">人员总数</div>
        <div class="metric-value">{{ users.length }}</div>
      </div>
      <div class="metric-card">
        <div class="metric-label">员工</div>
        <div class="metric-value">{{ roleCount.staff }}</div>
      </div>
      <div class="metric-card">
        <div class="metric-label">部门负责人</div>
        <div class="metric-value">{{ roleCount.manager }}</div>
      </div>
      <div class="metric-card">
        <div class="metric-label">领导层</div>
        <div class="metric-value">{{ roleCount.leader }}</div>
      </div>
    </section>

    <el-card class="work-card">
      <template #header>
        <div class="card-titlebar">
          <div class="card-title">
            <strong>人员列表</strong>
            <span>可按姓名、工号、部门和角色筛选。</span>
          </div>
        </div>
      </template>

      <div class="filters">
        <el-input v-model="keyword" placeholder="搜索姓名/工号" clearable @change="loadUsers" />
        <el-select v-model="filterDept" placeholder="部门" clearable @change="loadUsers">
          <el-option v-for="d in departments" :key="d" :label="d" :value="d" />
        </el-select>
        <el-select v-model="filterLevel" placeholder="角色" clearable @change="loadUsers">
          <el-option v-for="item in roleOptions" :key="item.value" :label="item.label" :value="item.value" />
        </el-select>
      </div>

      <el-table :data="paginatedList" class="admin-table" v-loading="loading">
        <el-table-column type="index" label="序号" width="60" align="center" />
        <el-table-column prop="name" label="姓名" width="100" />
        <el-table-column prop="employee_no" label="工号" width="110" />
        <el-table-column prop="department" label="部门" width="120" />
        <el-table-column prop="position" label="岗位" width="140" />
        <el-table-column prop="level" label="角色" width="120">
          <template #default="{ row }">
            <el-tag size="small" :type="levelTag[row.level]">{{ levelText[row.level] || row.level }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="负责部门" min-width="160">
          <template #default="{ row }">
            <span v-if="row.level === 'division_leader'">{{ (row.managed_departments || []).join('、') || '-' }}</span>
            <span v-else>-</span>
          </template>
        </el-table-column>
        <el-table-column prop="phone" label="手机号" width="130" />
        <el-table-column prop="id_card_tail" label="证件后四位" width="110" />
        <el-table-column label="操作" width="160" fixed="right">
          <template #default="{ row }">
            <el-button size="small" @click="openDialog(row)">编辑</el-button>
            <el-button size="small" type="danger" @click="handleDelete(row)" v-if="!row.is_admin">删除</el-button>
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

    <el-dialog v-model="showDialog" :title="editingId ? '编辑用户' : '添加用户'" width="560px">
      <el-form :model="form" label-width="100px">
        <el-form-item label="姓名" required><el-input v-model="form.name" /></el-form-item>
        <el-form-item label="工号" required><el-input v-model="form.employee_no" :disabled="!!editingId" /></el-form-item>
        <el-form-item label="部门" required>
          <el-select v-model="form.department" filterable style="width:100%">
            <el-option v-for="d in departments" :key="d" :label="d" :value="d" />
          </el-select>
        </el-form-item>
        <el-form-item label="岗位"><el-input v-model="form.position" /></el-form-item>
        <el-form-item label="角色" required>
          <el-select v-model="form.level" style="width:100%">
            <el-option v-for="item in roleOptions" :key="item.value" :label="item.label" :value="item.value" />
          </el-select>
        </el-form-item>
        <el-form-item v-if="form.level === 'division_leader'" label="负责部门" required>
          <el-select v-model="form.managed_departments" multiple filterable style="width:100%">
            <el-option v-for="d in departments" :key="d" :label="d" :value="d" />
          </el-select>
        </el-form-item>
        <el-form-item label="手机号" required><el-input v-model="form.phone" /></el-form-item>
        <el-form-item label="证件后四位" required><el-input v-model="form.id_card_tail" maxlength="4" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showDialog = false">取消</el-button>
        <el-button type="primary" @click="handleSave" :loading="saving">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { departmentApi, userApi } from '../api'

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

const roleOptions = [
  { label: '主要领导', value: 'main_leader' },
  { label: '分管领导', value: 'division_leader' },
  { label: '部门负责人', value: 'manager' },
  { label: '员工', value: 'staff' },
]
const levelTag: Record<string, string> = { main_leader: 'danger', division_leader: 'warning', manager: 'success', staff: 'info' }
const levelText: Record<string, string> = { main_leader: '主要领导', division_leader: '分管领导', manager: '部门负责人', staff: '员工', admin: '管理员' }

const form = reactive({
  name: '',
  employee_no: '',
  department: '',
  position: '',
  level: 'staff',
  phone: '',
  id_card_tail: '',
  managed_departments: [] as string[],
})

const filteredList = computed(() => users.value)
const paginatedList = computed(() => filteredList.value.slice((currentPage.value - 1) * pageSize.value, currentPage.value * pageSize.value))
const roleCount = computed(() => ({
  staff: users.value.filter(u => u.level === 'staff').length,
  manager: users.value.filter(u => u.level === 'manager').length,
  leader: users.value.filter(u => ['main_leader', 'division_leader'].includes(u.level)).length,
}))

function resetForm() {
  Object.assign(form, { name: '', employee_no: '', department: '', position: '', level: 'staff', phone: '', id_card_tail: '', managed_departments: [] })
  editingId.value = null
}

function openDialog(row?: any) {
  if (row) {
    editingId.value = row.id
    Object.assign(form, {
      name: row.name,
      employee_no: row.employee_no,
      department: row.department,
      position: row.position,
      level: row.level,
      phone: row.phone,
      id_card_tail: row.id_card_tail,
      managed_departments: [...(row.managed_departments || [])],
    })
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
    const payload = { ...form, managed_departments: form.level === 'division_leader' ? form.managed_departments : [] }
    if (editingId.value) await userApi.update(editingId.value, payload)
    else await userApi.create(payload)
    showDialog.value = false
    resetForm()
    await loadUsers()
    ElMessage.success('保存成功')
  } finally {
    saving.value = false
  }
}

async function handleDelete(row: any) {
  await ElMessageBox.confirm(`确认删除用户「${row.name}」？`, '删除用户')
  await userApi.delete(row.id)
  await loadUsers()
  ElMessage.success('已删除')
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
      const res: any = await userApi.import(items)
      ElMessage.success(`成功导入 ${res.data?.success || 0} 人`)
      if (res.data?.errors?.length) ElMessage.warning(`${res.data.errors.length} 条失败，请检查数据`)
      await loadUsers()
    } catch {
      ElMessage.error('导入失败')
    }
  }
  reader.readAsText(file, 'utf-8')
  return false
}

onMounted(async () => {
  await loadUsers()
  const res: any = await departmentApi.list()
  departments.value = (res.data?.list || []).map((d: any) => d.name)
})
</script>

<style scoped>
.user-metrics .metric-value { font-size: 28px; }
.filters {
  display: grid;
  grid-template-columns: 260px 180px 180px;
  gap: 10px;
  margin-bottom: 14px;
}
</style>
