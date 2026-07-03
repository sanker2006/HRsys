<template>
  <div class="admin-page user-page">
    <section class="admin-hero">
      <div>
        <h1>人员与角色</h1>
        <p>维护员工、部门负责人、分管领导和主要领导，并配置分管领导负责部门。</p>
      </div>
      <div class="hero-actions">
        <el-button @click="downloadImportTemplate">下载导入模板</el-button>
        <el-upload action="" :before-upload="handleImport" accept=".csv" :show-file-list="false">
          <el-button>批量导入</el-button>
        </el-upload>
        <el-button type="primary" @click="openDialog()">添加用户</el-button>
      </div>
    </section>

    <section class="metric-grid user-metrics">
      <div class="metric-card">
        <div class="metric-label">启用人员</div>
        <div class="metric-value success">{{ statusCount.active }}</div>
      </div>
      <div class="metric-card">
        <div class="metric-label">停用人员</div>
        <div class="metric-value warning">{{ statusCount.inactive }}</div>
      </div>
      <div class="metric-card">
        <div class="metric-label">人员总数</div>
        <div class="metric-value">{{ allUsers.length }}</div>
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
        <el-input v-model="keyword" placeholder="搜索姓名/工号" clearable @change="resetAndLoadUsers" />
        <el-select v-model="filterDept" placeholder="部门" clearable @change="resetAndLoadUsers">
          <el-option v-for="d in departments" :key="d" :label="d" :value="d" />
        </el-select>
        <el-select v-model="filterLevel" placeholder="角色" clearable @change="resetAndLoadUsers">
          <el-option v-for="item in roleOptions" :key="item.value" :label="item.label" :value="item.value" />
        </el-select>
        <el-select v-model="filterStatus" placeholder="状态" clearable @change="resetAndLoadUsers">
          <el-option v-for="item in statusOptions" :key="item.value" :label="item.label" :value="item.value" />
        </el-select>
      </div>

      <el-table :data="users" class="admin-table" v-loading="loading">
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
        <el-table-column prop="status" label="状态" width="100">
          <template #default="{ row }">
            <el-tag size="small" :type="row.status === 'active' ? 'success' : 'info'">{{ statusText[row.status] || row.status }}</el-tag>
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
        <span>共 {{ totalUsers }} 条</span>
        <el-pagination
          v-model:current-page="currentPage"
          v-model:page-size="pageSize"
          :page-sizes="[20, 50, 100]"
          :total="totalUsers"
          layout="sizes, prev, pager, next"
          background
          @current-change="loadUsers"
          @size-change="handlePageSizeChange"
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
        <el-form-item label="状态" required>
          <el-select v-model="form.status" style="width:100%">
            <el-option v-for="item in statusOptions" :key="item.value" :label="item.label" :value="item.value" />
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

    <el-dialog v-model="importResultVisible" title="人员导入结果" width="720px">
      <el-alert
        v-if="importResult"
        :type="importResult.failed > 0 ? 'warning' : 'success'"
        :closable="false"
        class="import-summary"
      >
        共 {{ importResult.total }} 行，成功 {{ importResult.success }} 行，失败 {{ importResult.failed }} 行
      </el-alert>
      <el-table v-if="importResult?.errors?.length" :data="importResult.errors" max-height="360" border>
        <el-table-column prop="row" label="表格行号" width="100" />
        <el-table-column prop="message" label="错误原因" min-width="420" />
      </el-table>
      <el-empty v-else description="本次导入全部成功" />
      <template #footer>
        <el-button type="primary" @click="importResultVisible = false">确定</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { departmentApi, userApi } from '../api'
import { parseCsvBuffer } from '../utils/csv'
import { buildUserImportTemplate, removeUnchangedExampleRows } from '../utils/userImportTemplate'

const users = ref<any[]>([])
const allUsers = ref<any[]>([])
const totalUsers = ref(0)
const departments = ref<string[]>([])
const loading = ref(false)
const saving = ref(false)
const showDialog = ref(false)
const importResultVisible = ref(false)
const importResult = ref<any>(null)
const editingId = ref<number | null>(null)
const keyword = ref('')
const filterDept = ref('')
const filterLevel = ref('')
const filterStatus = ref('')
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
const statusOptions = [
  { label: '启用', value: 'active' },
  { label: '停用', value: 'inactive' },
]
const statusText: Record<string, string> = { active: '启用', inactive: '停用' }

const form = reactive({
  name: '',
  employee_no: '',
  department: '',
  position: '',
  level: 'staff',
  status: 'active',
  phone: '',
  id_card_tail: '',
  managed_departments: [] as string[],
})

const roleCount = computed(() => ({
  staff: allUsers.value.filter(u => u.level === 'staff').length,
  manager: allUsers.value.filter(u => u.level === 'manager').length,
  leader: allUsers.value.filter(u => ['main_leader', 'division_leader'].includes(u.level)).length,
}))
const statusCount = computed(() => ({
  active: allUsers.value.filter(u => (u.status || 'active') === 'active').length,
  inactive: allUsers.value.filter(u => u.status === 'inactive').length,
}))

function resetForm() {
  Object.assign(form, { name: '', employee_no: '', department: '', position: '', level: 'staff', status: 'active', phone: '', id_card_tail: '', managed_departments: [] })
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
      status: row.status || 'active',
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
    const res: any = await userApi.list({
      keyword: keyword.value,
      department: filterDept.value,
      level: filterLevel.value,
      status: filterStatus.value,
      page: currentPage.value,
      pageSize: pageSize.value,
    })
    users.value = res.data?.list || []
    totalUsers.value = res.data?.total || 0
  } finally {
    loading.value = false
  }
}

async function loadUserStats() {
  const res: any = await userApi.export({})
  allUsers.value = res.data || []
}

async function resetAndLoadUsers() {
  currentPage.value = 1
  await loadUsers()
}

async function handlePageSizeChange() {
  currentPage.value = 1
  await loadUsers()
}

async function handleSave() {
  saving.value = true
  try {
    const payload = { ...form, managed_departments: form.level === 'division_leader' ? form.managed_departments : [] }
    if (editingId.value) await userApi.update(editingId.value, payload)
    else await userApi.create(payload)
    showDialog.value = false
    resetForm()
    await Promise.all([loadUsers(), loadUserStats()])
    ElMessage.success('保存成功')
  } finally {
    saving.value = false
  }
}

async function handleDelete(row: any) {
  await ElMessageBox.confirm(`确认删除用户「${row.name}」？`, '删除用户')
  await userApi.delete(row.id)
  await Promise.all([loadUsers(), loadUserStats()])
  ElMessage.success('已删除')
}

function downloadImportTemplate() {
  const blob = new Blob([buildUserImportTemplate()], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = '人员批量导入模板.csv'
  link.click()
  URL.revokeObjectURL(url)
}

async function handleImport(file: File) {
  try {
    const parsed = parseCsvBuffer(await file.arrayBuffer())
    const items = removeUnchangedExampleRows(parsed.items)
    if (items.length === 0) {
      ElMessage.warning('模板中只有示例数据，请覆盖示例行或新增人员后再导入')
      return false
    }
    const res: any = await userApi.import(items)
    const errors = res.data?.errors || []
    importResult.value = {
      total: items.length,
      success: Number(res.data?.success || 0),
      failed: errors.length,
      errors,
    }
    importResultVisible.value = true
    await Promise.all([loadUsers(), loadUserStats()])
  } catch (err: any) {
    ElMessage.error(err?.message || '导入失败')
  }
  return false
}

onMounted(async () => {
  await Promise.all([loadUsers(), loadUserStats()])
  const res: any = await departmentApi.list()
  departments.value = (res.data?.list || []).map((d: any) => d.name)
})
</script>

<style scoped>
.user-metrics .metric-value { font-size: 28px; }
.metric-value.success { color: var(--admin-success); }
.metric-value.warning { color: var(--admin-warning); }
.filters {
  display: grid;
  grid-template-columns: 260px 180px 180px 160px;
  gap: 10px;
  margin-bottom: 14px;
}
.import-summary { margin-bottom: 16px; }
</style>
