<template>
  <div class="admin-page dept-page">
    <section class="admin-hero">
      <div>
        <h1>部门管理</h1>
        <p>维护组织枚举，用户、分管领导范围和评价关系都会依赖这里的部门数据。</p>
      </div>
      <div class="hero-actions">
        <el-button type="primary" @click="openDialog()">新增部门</el-button>
      </div>
    </section>

    <section class="metric-grid dept-metrics">
      <div class="metric-card">
        <div class="metric-label">部门总数</div>
        <div class="metric-value">{{ list.length }}</div>
        <div class="metric-note">当前可选组织单元</div>
      </div>
      <div class="metric-card">
        <div class="metric-label">已设置排序</div>
        <div class="metric-value success">{{ sortedCount }}</div>
        <div class="metric-note">排序值越小越靠前</div>
      </div>
    </section>

    <el-card class="work-card">
      <template #header>
        <div class="card-titlebar">
          <div class="card-title">
            <strong>部门列表</strong>
            <span>删除部门前请确认没有用户、题目或分管关系仍在引用。</span>
          </div>
        </div>
      </template>

      <el-table :data="list" class="admin-table" v-loading="loading">
        <el-table-column type="index" label="序号" width="80" align="center" />
        <el-table-column prop="name" label="部门名称" min-width="220">
          <template #default="{ row }">
            <div class="dept-name">{{ row.name }}</div>
          </template>
        </el-table-column>
        <el-table-column prop="sort_order" label="排序" width="120" align="center" />
        <el-table-column label="创建时间" width="190">
          <template #default="{ row }">{{ row.created_at?.substring(0, 16).replace('T', ' ') }}</template>
        </el-table-column>
        <el-table-column label="操作" width="160" align="right">
          <template #default="{ row }">
            <el-button size="small" type="primary" plain @click="openDialog(row)">编辑</el-button>
            <el-button size="small" type="danger" plain @click="handleDelete(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <el-dialog v-model="showDialog" :title="editingId ? '编辑部门' : '新增部门'" width="440px">
      <el-form :model="form" label-width="86px">
        <el-form-item label="部门名称" prop="name" required>
          <el-input v-model="form.name" placeholder="例如：人才综合服务部" maxlength="30" />
        </el-form-item>
        <el-form-item label="排序">
          <el-input-number v-model="form.sort_order" :min="0" :max="9999" />
          <span class="sort-hint">数字越小越靠前</span>
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
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { departmentApi } from '../api'

const loading = ref(false)
const saving = ref(false)
const list = ref<any[]>([])
const showDialog = ref(false)
const editingId = ref<number | null>(null)

const form = reactive({ name: '', sort_order: 0 })
const sortedCount = computed(() => list.value.filter(item => item.sort_order !== null && item.sort_order !== undefined).length)

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
.dept-metrics {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.dept-name {
  font-weight: 800;
  color: var(--admin-text);
}

.sort-hint {
  margin-left: 10px;
  color: var(--admin-muted);
  font-size: 12px;
}

@media (max-width: 760px) {
  .dept-metrics {
    grid-template-columns: 1fr;
  }
}
</style>
