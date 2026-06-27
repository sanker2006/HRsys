<template>
  <section class="admin-page intern-page">
    <div class="admin-hero interns-hero">
      <div>
        <h1>实习生管理</h1>
        <p>独立于绩效评价账号，用手机号和身份证后四位登录打卡端。</p>
      </div>
      <div class="hero-actions">
        <el-upload :show-file-list="false" accept=".csv" :before-upload="beforeImport">
          <el-button>导入 CSV</el-button>
        </el-upload>
        <el-button type="primary" @click="openCreate">新增实习生</el-button>
      </div>
    </div>

    <el-card class="work-card">
      <template #header>
        <div class="card-titlebar">
          <div class="card-title">
            <strong>实习生账号</strong>
            <span>维护独立打卡账号，停用后不能登录实习生端。</span>
          </div>
        </div>
      </template>
      <div class="toolbar-row filters">
        <el-input v-model="filters.keyword" clearable placeholder="姓名 / 编号 / 手机号" @keyup.enter="loadData" />
        <el-input v-model="filters.department" clearable placeholder="部门" @keyup.enter="loadData" />
        <el-select v-model="filters.status" clearable placeholder="状态">
          <el-option label="启用" value="active" />
          <el-option label="停用" value="inactive" />
        </el-select>
        <el-button type="primary" @click="loadData">查询</el-button>
      </div>

      <el-table v-loading="loading" :data="list" border>
        <el-table-column type="index" width="64" label="序号" />
        <el-table-column prop="intern_no" label="实习生编号" min-width="130" />
        <el-table-column prop="name" label="姓名" min-width="110" />
        <el-table-column prop="phone" label="手机号" min-width="130" />
        <el-table-column prop="department" label="部门" min-width="140" />
        <el-table-column prop="position" label="岗位/学校" min-width="150" />
        <el-table-column prop="mentor" label="负责人" min-width="110" />
        <el-table-column prop="start_date" label="开始日期" width="120" />
        <el-table-column prop="end_date" label="结束日期" width="120" />
        <el-table-column label="状态" width="90">
          <template #default="{ row }">
            <el-tag :type="row.status === 'active' ? 'success' : 'info'">{{ row.status === 'active' ? '启用' : '停用' }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="120" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="openEdit(row)">编辑</el-button>
          </template>
        </el-table-column>
      </el-table>

      <div class="pager">
        <span>共 {{ total }} 条</span>
        <el-pagination
          v-model:current-page="page"
          v-model:page-size="pageSize"
          layout="sizes, prev, pager, next"
          :total="total"
          @current-change="loadData"
          @size-change="loadData"
        />
      </div>
    </el-card>

    <el-dialog v-model="dialogVisible" :title="editing ? '编辑实习生' : '新增实习生'" width="620px">
      <el-form :model="form" label-width="110px">
        <el-form-item label="实习生编号" required>
          <el-input v-model="form.intern_no" :disabled="!!editing" />
        </el-form-item>
        <el-form-item label="姓名" required><el-input v-model="form.name" /></el-form-item>
        <el-form-item label="手机号" required><el-input v-model="form.phone" maxlength="11" /></el-form-item>
        <el-form-item label="身份证后四位" required><el-input v-model="form.id_card_tail" maxlength="4" /></el-form-item>
        <el-form-item label="部门"><el-input v-model="form.department" /></el-form-item>
        <el-form-item label="岗位/学校"><el-input v-model="form.position" /></el-form-item>
        <el-form-item label="负责人"><el-input v-model="form.mentor" /></el-form-item>
        <el-form-item label="实习日期" required>
          <el-date-picker
            v-model="dateRange"
            type="daterange"
            value-format="YYYY-MM-DD"
            start-placeholder="开始日期"
            end-placeholder="结束日期"
            style="width: 100%"
          />
        </el-form-item>
        <el-form-item label="状态">
          <el-radio-group v-model="form.status">
            <el-radio-button label="active">启用</el-radio-button>
            <el-radio-button label="inactive">停用</el-radio-button>
          </el-radio-group>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="save">保存</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="importVisible" title="导入结果" width="560px">
      <p>成功导入 {{ importResult.success || 0 }} 人，失败 {{ importResult.errors?.length || 0 }} 行。</p>
      <el-table v-if="importResult.errors?.length" :data="importResult.errors" border max-height="320">
        <el-table-column prop="row" label="行号" width="90" />
        <el-table-column prop="message" label="错误原因" />
      </el-table>
      <template #footer><el-button type="primary" @click="importVisible = false">知道了</el-button></template>
    </el-dialog>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { internApi } from '../api'

const loading = ref(false)
const saving = ref(false)
const dialogVisible = ref(false)
const importVisible = ref(false)
const editing = ref<any>(null)
const list = ref<any[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(20)
const importResult = ref<any>({})
const filters = reactive({ keyword: '', department: '', status: 'active' })
const form = reactive<any>({
  intern_no: '',
  name: '',
  phone: '',
  id_card_tail: '',
  department: '',
  position: '',
  mentor: '',
  start_date: '',
  end_date: '',
  status: 'active',
})

const dateRange = computed({
  get: () => form.start_date && form.end_date ? [form.start_date, form.end_date] : [],
  set: (value: any) => {
    form.start_date = value?.[0] || ''
    form.end_date = value?.[1] || ''
  },
})

function resetForm() {
  Object.assign(form, {
    intern_no: '',
    name: '',
    phone: '',
    id_card_tail: '',
    department: '',
    position: '',
    mentor: '',
    start_date: '',
    end_date: '',
    status: 'active',
  })
}

async function loadData() {
  loading.value = true
  try {
    const res: any = await internApi.list({ ...filters, page: page.value, pageSize: pageSize.value })
    list.value = res.data?.list || []
    total.value = res.data?.total || 0
  } finally {
    loading.value = false
  }
}

function openCreate() {
  editing.value = null
  resetForm()
  dialogVisible.value = true
}

function openEdit(row: any) {
  editing.value = row
  resetForm()
  Object.assign(form, row)
  dialogVisible.value = true
}

async function save() {
  if (!form.intern_no || !form.name || !form.phone || !form.id_card_tail || !form.start_date || !form.end_date) {
    ElMessage.warning('请补齐编号、姓名、手机号、身份证后四位和实习日期')
    return
  }
  saving.value = true
  try {
    if (editing.value) await internApi.update(editing.value.id, form)
    else await internApi.create(form)
    ElMessage.success('保存成功')
    dialogVisible.value = false
    await loadData()
  } finally {
    saving.value = false
  }
}

function parseCsv(text: string) {
  const lines = text.split(/\r?\n/).filter(line => line.trim())
  if (lines.length < 2) return []
  const split = (line: string) => line.split(',').map(cell => cell.trim().replace(/^"|"$/g, ''))
  const headers = split(lines[0])
  return lines.slice(1).map(line => {
    const cells = split(line)
    const row: any = {}
    headers.forEach((header, index) => { row[header] = cells[index] || '' })
    return {
      intern_no: row['实习生编号'] || row['编号'] || row.intern_no,
      name: row['姓名'] || row.name,
      phone: row['手机号'] || row.phone,
      id_card_tail: row['身份证后四位'] || row['证件后四位'] || row.id_card_tail,
      department: row['部门'] || row.department,
      position: row['岗位/学校'] || row['岗位'] || row['学校'] || row.position,
      mentor: row['负责人'] || row.mentor,
      start_date: row['开始日期'] || row.start_date,
      end_date: row['结束日期'] || row.end_date,
      status: row['状态'] || row.status || 'active',
    }
  })
}

function beforeImport(file: File) {
  const reader = new FileReader()
  reader.onload = async () => {
    const rows = parseCsv(String(reader.result || ''))
    if (!rows.length) {
      ElMessage.warning('CSV 至少需要表头和一行数据')
      return
    }
    const res: any = await internApi.import(rows)
    importResult.value = res.data || {}
    importVisible.value = true
    await loadData()
  }
  reader.readAsText(file, 'utf-8')
  return false
}

onMounted(loadData)
</script>

<style scoped>
.intern-page { min-width: 0; }
.interns-hero { align-items: center; }
.filters {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 12px;
  margin-bottom: 16px;
}
.pager { display: flex; justify-content: flex-end; align-items: center; gap: 14px; margin-top: 16px; color: #64748b; }
</style>
