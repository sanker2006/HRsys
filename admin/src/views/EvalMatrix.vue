<template>
  <div class="matrix-page">
    <el-alert type="info" :closable="false" class="matrix-alert">
      评价矩阵决定本批次自动生成哪些评价关系。领导不生成自评；普通员工同级互评固定为本部门内部互评。
    </el-alert>

    <el-card v-loading="loading">
      <section class="section-block">
        <div class="section-header">
          <span class="section-mark">自</span>
          <span class="section-title">自我评价</span>
          <el-tag type="info" size="small">部门负责人、员工</el-tag>
        </div>
        <p class="section-desc">主要领导和分管领导不参与自评。部门负责人和员工自评关系默认启用。</p>
        <el-table :data="selfRows" border size="small">
          <el-table-column prop="from_role" label="评价人角色" width="180">
            <template #default="{ row }">
              <span class="role-tag" :class="row.from_role">{{ roleText[row.from_role] }}</span>
            </template>
          </el-table-column>
          <el-table-column label="评价对象" align="center">
            <template #default>本人</template>
          </el-table-column>
          <el-table-column label="状态" align="center" width="120">
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
      </section>

      <section class="section-block">
        <div class="section-header">
          <span class="section-mark">下</span>
          <span class="section-title">向下评价</span>
          <el-tag type="warning" size="small">按角色生成</el-tag>
        </div>
        <p class="section-desc">分管领导只评价所负责部门；主要领导评价全部部门负责人和员工。</p>
        <el-table :data="downwardRows" border size="small">
          <el-table-column label="评价人角色" width="180">
            <template #default="{ row }">
              <span class="role-tag" :class="row.from_role">{{ roleText[row.from_role] }}</span>
            </template>
          </el-table-column>
          <el-table-column label="被评价角色" width="180">
            <template #default="{ row }">
              <span class="role-tag" :class="row.to_role">{{ roleText[row.to_role] }}</span>
            </template>
          </el-table-column>
          <el-table-column label="规则说明">
            <template #default="{ row }">{{ ruleText(row) }}</template>
          </el-table-column>
          <el-table-column label="启用" width="100" align="center">
            <template #default="{ row }">
              <el-switch v-model="row.enabled" :active-value="1" :inactive-value="0" />
            </template>
          </el-table-column>
        </el-table>
      </section>

      <div class="actions">
        <el-button @click="$router.back()">返回</el-button>
        <el-button type="warning" @click="handleReset">重置为默认</el-button>
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
}
.section-block {
  padding-bottom: 22px;
  margin-bottom: 24px;
  border-bottom: 1px solid #edf0f5;
}
.section-block:last-of-type {
  border-bottom: none;
  margin-bottom: 0;
}
.section-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
  color: #1f2d3d;
  font-size: 15px;
  font-weight: 700;
}
.section-mark {
  width: 26px;
  height: 26px;
  border-radius: 6px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: #edf4ff;
  color: #2f6fbd;
  font-size: 13px;
}
.section-title {
  font-size: 15px;
}
.section-desc {
  margin: 0 0 14px 34px;
  color: #667085;
  font-size: 13px;
}
.eval-group {
  margin: 12px 0 12px 34px;
  padding: 12px 14px;
  border: 1px solid #edf0f5;
  border-radius: 8px;
  background: #fafbfc;
}
.group-label {
  display: flex;
  align-items: center;
  gap: 12px;
}
.group-options {
  margin-top: 10px;
  margin-left: 92px;
}
.role-tag {
  display: inline-block;
  min-width: 72px;
  padding: 3px 10px;
  border-radius: 4px;
  font-size: 12px;
  text-align: center;
}
.role-tag.main_leader {
  background: #fef0f0;
  color: #c45656;
}
.role-tag.division_leader {
  background: #fdf6ec;
  color: #b88230;
}
.role-tag.manager {
  background: #f0f9eb;
  color: #529b2e;
}
.role-tag.staff {
  background: #ecf5ff;
  color: #337ecc;
}
.actions {
  display: flex;
  justify-content: center;
  gap: 10px;
  margin-top: 20px;
}
</style>
