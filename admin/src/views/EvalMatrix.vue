<template>
  <div class="admin-page matrix-page">
    <section class="admin-hero">
      <div>
        <h1>评价矩阵</h1>
        <p>控制本批次自动生成哪些评价关系。员工互评固定为本部门内部互评，领导不生成自评。</p>
      </div>
      <div class="hero-actions">
        <el-button @click="$router.back()">返回批次</el-button>
        <el-button type="warning" plain @click="handleReset">重置默认</el-button>
        <el-button type="primary" :loading="saving" @click="handleSave">保存配置</el-button>
      </div>
    </section>

    <el-alert type="info" :closable="false" class="matrix-alert">
      评价矩阵决定本批次的关系生成口径。主要领导评价全部部门负责人和员工；分管领导只评价负责部门范围内人员。
    </el-alert>

    <el-card class="work-card" v-loading="loading">
      <section class="section-block">
        <div class="section-header">
          <span class="section-mark">自</span>
          <span class="section-title">自我评价</span>
          <el-tag type="info" size="small">部门负责人、员工</el-tag>
        </div>
        <p class="section-desc">主要领导和分管领导不参与自评。部门负责人和员工自评关系默认启用。</p>
        <el-table :data="selfRows" class="admin-table compact-table">
          <el-table-column prop="from_role" label="评价人角色" width="190">
            <template #default="{ row }">
              <span class="role-tag" :class="row.from_role">{{ roleText[row.from_role] }}</span>
            </template>
          </el-table-column>
          <el-table-column label="评价对象" align="center">
            <template #default>本人</template>
          </el-table-column>
          <el-table-column label="状态" align="center" width="130">
            <template #default>
              <el-tag type="success" size="small">已启用</el-tag>
            </template>
          </el-table-column>
        </el-table>
      </section>

      <section class="section-block">
        <div class="section-header">
          <span class="section-mark">互</span>
          <span class="section-title">同级互评</span>
          <el-tag type="warning" size="small">只评综合评价</el-tag>
        </div>
        <p class="section-desc">部门负责人可配置本部门或跨部门互评；普通员工固定为本部门内其他员工互评。</p>

        <div class="eval-group">
          <div class="group-label">
            <span class="role-tag manager">部门负责人</span>
            <el-checkbox v-model="peerManagerEnabled" :true-value="1" :false-value="0">
              启用部门负责人互评
            </el-checkbox>
          </div>
          <div v-if="peerManagerEnabled === 1" class="group-options">
            <el-radio-group v-model="peerCrossDept" size="small">
              <el-radio :value="0">仅本部门互评</el-radio>
              <el-radio :value="1">全部部门负责人互评</el-radio>
            </el-radio-group>
          </div>
        </div>

        <div class="eval-group">
          <div class="group-label">
            <span class="role-tag staff">员工</span>
            <el-checkbox v-model="peerStaffEnabled" :true-value="1" :false-value="0">
              启用员工互评
            </el-checkbox>
          </div>
          <div class="group-options">
            <el-tag type="info" size="small">员工互评只在本部门内生成，不受跨部门开关影响</el-tag>
          </div>
        </div>

        <div class="eval-group">
          <div class="group-label">
            <span class="role-tag staff">员工</span>
            <el-checkbox v-model="peerStaffToManagerEnabled" :true-value="1" :false-value="0">
              启用员工评议本部门负责人
            </el-checkbox>
          </div>
          <div class="group-options">
            <el-tag type="info" size="small">员工评议部门负责人只评价综合题，用于统计中的“员工评议”</el-tag>
          </div>
        </div>
      </section>

      <section class="section-block">
        <div class="section-header">
          <span class="section-mark">下</span>
          <span class="section-title">向下评价</span>
          <el-tag type="warning" size="small">按角色生成</el-tag>
        </div>
        <p class="section-desc">分管领导只评价负责部门；主要领导评价所有部门负责人和员工；部门负责人评价本部门员工。</p>
        <el-table :data="downwardRows" class="admin-table compact-table">
          <el-table-column label="评价人角色" width="190">
            <template #default="{ row }">
              <span class="role-tag" :class="row.from_role">{{ roleText[row.from_role] }}</span>
            </template>
          </el-table-column>
          <el-table-column label="被评价角色" width="190">
            <template #default="{ row }">
              <span class="role-tag" :class="row.to_role">{{ roleText[row.to_role] }}</span>
            </template>
          </el-table-column>
          <el-table-column label="规则说明">
            <template #default="{ row }">{{ ruleText(row) }}</template>
          </el-table-column>
          <el-table-column label="启用" width="120" align="center">
            <template #default="{ row }">
              <el-switch v-model="row.enabled" :active-value="1" :inactive-value="0" />
            </template>
          </el-table-column>
        </el-table>
      </section>

      <div class="actions">
        <el-button @click="$router.back()">返回</el-button>
        <el-button type="warning" plain @click="handleReset">重置为默认</el-button>
        <el-button type="primary" :loading="saving" @click="handleSave">保存配置</el-button>
      </div>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { evalMatrixApi } from '../api'

type MatrixRow = {
  from_role: string
  to_role: string
  eval_type: 'self' | 'peer' | 'downward'
  enabled: number
}

const props = defineProps<{ batchId: string }>()
const loading = ref(false)
const saving = ref(false)
const peerCrossDept = ref(0)
const rawMatrix = ref<MatrixRow[]>([])

const roleText: Record<string, string> = {
  main_leader: '主要领导',
  division_leader: '分管领导',
  manager: '部门负责人',
  staff: '员工',
}

const defaultRows: MatrixRow[] = [
  { from_role: 'main_leader', to_role: 'manager', eval_type: 'downward', enabled: 1 },
  { from_role: 'main_leader', to_role: 'staff', eval_type: 'downward', enabled: 1 },
  { from_role: 'division_leader', to_role: 'manager', eval_type: 'downward', enabled: 1 },
  { from_role: 'division_leader', to_role: 'staff', eval_type: 'downward', enabled: 1 },
  { from_role: 'manager', to_role: 'manager', eval_type: 'peer', enabled: 1 },
  { from_role: 'manager', to_role: 'staff', eval_type: 'downward', enabled: 1 },
  { from_role: 'manager', to_role: 'self', eval_type: 'self', enabled: 1 },
  { from_role: 'staff', to_role: 'staff', eval_type: 'peer', enabled: 1 },
  { from_role: 'staff', to_role: 'manager', eval_type: 'peer', enabled: 1 },
  { from_role: 'staff', to_role: 'self', eval_type: 'self', enabled: 1 },
]

const selfRows = computed(() => rawMatrix.value.filter(r => r.eval_type === 'self'))
const downwardRows = computed(() => rawMatrix.value.filter(r => r.eval_type === 'downward'))

const peerManagerEnabled = computed({
  get: () => findRow('manager', 'manager', 'peer')?.enabled ?? 1,
  set: value => setEnabled('manager', 'manager', 'peer', value),
})

const peerStaffEnabled = computed({
  get: () => findRow('staff', 'staff', 'peer')?.enabled ?? 1,
  set: value => setEnabled('staff', 'staff', 'peer', value),
})

const peerStaffToManagerEnabled = computed({
  get: () => findRow('staff', 'manager', 'peer')?.enabled ?? 1,
  set: value => setEnabled('staff', 'manager', 'peer', value),
})

function rowKey(row: MatrixRow) {
  return `${row.from_role}:${row.to_role}:${row.eval_type}`
}

function findRow(fromRole: string, toRole: string, evalType: string) {
  return rawMatrix.value.find(r => r.from_role === fromRole && r.to_role === toRole && r.eval_type === evalType)
}

function setEnabled(fromRole: string, toRole: string, evalType: string, enabled: number) {
  const row = findRow(fromRole, toRole, evalType)
  if (row) row.enabled = enabled
}

function normalizeRows(rows: MatrixRow[]) {
  const incoming = new Map(rows.map(row => [rowKey(row), row.enabled]))
  rawMatrix.value = defaultRows.map(row => ({
    ...row,
    enabled: incoming.get(rowKey(row)) ?? row.enabled,
  }))
}

function ruleText(row: MatrixRow) {
  if (row.from_role === 'main_leader') return '主要领导评价所有部门负责人和员工'
  if (row.from_role === 'division_leader') return '分管领导只评价负责部门范围内人员'
  if (row.from_role === 'manager' && row.to_role === 'staff') return '部门负责人评价本部门员工'
  return '-'
}

async function load() {
  loading.value = true
  try {
    const res: any = await evalMatrixApi.get(Number(props.batchId))
    normalizeRows(res.data?.matrix || [])
    peerCrossDept.value = res.data?.peer_cross_dept ?? 0
  } finally {
    loading.value = false
  }
}

async function handleSave() {
  saving.value = true
  try {
    await evalMatrixApi.save(Number(props.batchId), rawMatrix.value, peerCrossDept.value)
    ElMessage.success('保存成功')
  } finally {
    saving.value = false
  }
}

async function handleReset() {
  await ElMessageBox.confirm('确认重置为默认评价矩阵？已保存的矩阵配置会被覆盖。', '重置矩阵')
  await evalMatrixApi.reset(Number(props.batchId))
  await load()
  ElMessage.success('已重置为默认矩阵')
}

onMounted(load)
</script>

<style scoped>
.matrix-alert {
  margin-bottom: 16px;
  border-radius: 10px;
}

.section-block {
  padding-bottom: 24px;
  margin-bottom: 26px;
  border-bottom: 1px solid var(--admin-border);
}

.section-block:last-of-type {
  border-bottom: none;
  margin-bottom: 0;
}

.section-header {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 8px;
  color: var(--admin-text);
  font-size: 15px;
  font-weight: 800;
}

.section-mark {
  width: 30px;
  height: 30px;
  border-radius: 8px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: var(--admin-primary-soft);
  color: var(--admin-accent);
  font-size: 14px;
  font-weight: 900;
}

.section-title {
  font-size: 16px;
}

.section-desc {
  margin: 0 0 16px 40px;
  color: var(--admin-muted);
  font-size: 13px;
}

.compact-table {
  margin-left: 40px;
  width: calc(100% - 40px);
}

.eval-group {
  margin: 12px 0 12px 40px;
  padding: 14px 16px;
  border: 1px solid var(--admin-border);
  border-radius: 12px;
  background: #f8fafc;
}

.group-label {
  display: flex;
  align-items: center;
  gap: 12px;
}

.group-options {
  margin-top: 12px;
  margin-left: 94px;
}

.role-tag {
  display: inline-flex;
  min-width: 82px;
  min-height: 28px;
  padding: 4px 11px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 800;
  align-items: center;
  justify-content: center;
}

.role-tag.main_leader {
  background: #fef2f2;
  color: #b91c1c;
}

.role-tag.division_leader {
  background: #fff7ed;
  color: #c2410c;
}

.role-tag.manager {
  background: #ecfdf5;
  color: #047857;
}

.role-tag.staff {
  background: #eef6fb;
  color: var(--admin-accent);
}

.actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 22px;
  padding-top: 18px;
  border-top: 1px solid var(--admin-border);
}

@media (max-width: 900px) {
  .compact-table,
  .eval-group {
    margin-left: 0;
    width: 100%;
  }

  .section-desc {
    margin-left: 0;
  }

  .group-options {
    margin-left: 0;
  }
}
</style>
