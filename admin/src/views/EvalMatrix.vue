<template>
  <div class="matrix-page">
    <el-alert type="info" :closable="false" style="margin-bottom:16px">
      评估矩阵决定不同角色之间的评价关系规则。自评全员强制启用；同层互评和向下评估可按需开启。
    </el-alert>
    <el-card v-loading="loading">

      <!-- Section 1: 自评 -->
      <div class="section-block">
        <div class="section-header">
          <el-icon><Lock /></el-icon>
          <span class="section-title">自评</span>
          <el-tag type="info" size="small">全员，不可关闭</el-tag>
        </div>
        <p class="section-desc">所有角色评价本人，强制启用，无需配置。</p>
        <el-table :data="selfRows" border size="small">
          <el-table-column prop="fromRole" label="评价者角色" width="150">
            <template #default="{ row }">
              <span class="role-tag" :class="row.fromRole">{{ roleText[row.fromRole] }}</span>
            </template>
          </el-table-column>
          <el-table-column label="评价对象" align="center">
            <template #default>
              <span class="eval-target">本人</span>
            </template>
          </el-table-column>
          <el-table-column label="评估类型" align="center">
            <template #default>
              <el-tag type="primary" size="small">自评</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="状态" align="center">
            <template #default>
              <el-tag type="success" size="small">已启用</el-tag>
            </template>
          </el-table-column>
        </el-table>
      </div>

      <!-- Section 2: 同层互评 -->
      <div class="section-block">
        <div class="section-header">
          <el-icon><User /></el-icon>
          <span class="section-title">同层互评</span>
          <el-tag type="warning" size="small">可配置</el-tag>
        </div>
        <p class="section-desc">同级别同事之间互相评价，支持本部门或跨部门两种范围。</p>

        <!-- 部门负责人互评 -->
        <div class="eval-group">
          <div class="group-label">
            <span class="role-tag manager">部门负责人</span>
            <el-checkbox
              v-model="peerManager"
              :true-value="1"
              :false-value="0"
              label="启用部门负责人互评"
            />
          </div>
          <div v-if="peerManager === 1" class="group-options">
            <el-radio-group v-model="peerCrossDept" size="small">
              <el-radio :value="0">本部门互评（仅同部门负责人互相评价）</el-radio>
              <el-radio :value="1">全公司互评（所有部门负责人互相评价）</el-radio>
            </el-radio-group>
          </div>
        </div>

        <!-- 员工互评 -->
        <div class="eval-group">
          <div class="group-label">
            <span class="role-tag staff">员工层</span>
            <el-checkbox
              v-model="peerStaff"
              :true-value="1"
              :false-value="0"
              label="启用员工互评"
              disabled
            />
          </div>
          <div v-if="peerStaff === 1" class="group-options">
            <el-tag type="info" size="small">仅本部门同事互评（不可关闭）</el-tag>
          </div>
        </div>
      </div>

      <!-- Section 3: 向下评估 -->
      <div class="section-block">
        <div class="section-header">
          <el-icon><Bottom /></el-icon>
          <span class="section-title">向下评估</span>
          <el-tag type="warning" size="small">可配置</el-tag>
        </div>
        <p class="section-desc">上级评价下级，评估结果不对外公示。</p>
        <el-table :data="downwardRows" border size="small">
          <el-table-column label="评价者" width="150">
            <template #default="{ row }">
              <span class="role-tag" :class="row.from_role">{{ roleText[row.from_role] }}</span>
            </template>
          </el-table-column>
          <el-table-column label="被评人" width="150">
            <template #default="{ row }">
              <span class="role-tag" :class="row.to_role">{{ roleText[row.to_role] }}</span>
            </template>
          </el-table-column>
          <el-table-column label="评估类型" align="center">
            <template #default>
              <el-tag type="warning" size="small">向下评估</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="启用" align="center">
            <template #default="{ row }">
              <el-checkbox
                v-model="row.enabled"
                :true-value="1"
                :false-value="0"
              />
            </template>
          </el-table-column>
        </el-table>
      </div>

      <div style="margin-top:20px;text-align:center">
        <el-button @click="$router.back()">返回</el-button>
        <el-button type="warning" @click="handleReset">重置为默认</el-button>
        <el-button type="primary" @click="handleSave" :loading="saving">保存配置</el-button>
      </div>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Lock, User, Bottom } from '@element-plus/icons-vue'
import { evalMatrixApi } from '../api'

const props = defineProps<{ batchId: string }>()
const loading = ref(false)
const saving = ref(false)

const roleText: Record<string, string> = {
  leader: '领导层',
  manager: '部门负责人',
  staff: '员工层',
}

// 原始矩阵数据（扁平结构，来自API）
const rawMatrix = ref<any[]>([])
const peerCrossDept = ref(0)

// 派生：自评行（只读展示）
const selfRows = computed(() =>
  rawMatrix.value
    .filter(r => r.eval_type === 'self' && r.to_role === 'self')
    .map(r => ({ fromRole: r.from_role }))
)

// 派生：同层互评开关
const peerManager = computed({
  get: () => {
    const row = rawMatrix.value.find(r => r.from_role === 'manager' && r.to_role === 'manager' && r.eval_type === 'peer')
    return row?.enabled ?? 0
  },
  set: (val) => {
    const row = rawMatrix.value.find(r => r.from_role === 'manager' && r.to_role === 'manager' && r.eval_type === 'peer')
    if (row) row.enabled = val
  },
})

const peerStaff = computed({
  get: () => {
    const row = rawMatrix.value.find(r => r.from_role === 'staff' && r.to_role === 'staff' && r.eval_type === 'peer')
    return row?.enabled ?? 1
  },
  set: (val) => {
    const row = rawMatrix.value.find(r => r.from_role === 'staff' && r.to_role === 'staff' && r.eval_type === 'peer')
    if (row) row.enabled = val
  },
})

// 派生：向下评估行（直接操作 rawMatrix，保持双向绑定）
const downwardRows = computed(() =>
  rawMatrix.value.filter(r => r.eval_type === 'downward')
)

async function load() {
  loading.value = true
  try {
    const res: any = await evalMatrixApi.get(parseInt(props.batchId))
    // GET 返回 { matrix, peer_cross_dept }
    rawMatrix.value = res.data?.matrix || res.data || []
    peerCrossDept.value = res.data?.peer_cross_dept ?? 0
  } finally {
    loading.value = false
  }
}

async function handleSave() {
  saving.value = true
  try {
    const rows = rawMatrix.value.map(r => ({
      from_role: r.from_role,
      to_role: r.to_role,
      eval_type: r.eval_type,
      enabled: r.enabled,
    }))
    await evalMatrixApi.save(parseInt(props.batchId), rows, peerCrossDept.value)
    ElMessage.success('保存成功')
  } finally {
    saving.value = false
  }
}

async function handleReset() {
  await ElMessageBox.confirm('确认重置为默认矩阵？', '重置')
  await evalMatrixApi.reset(parseInt(props.batchId))
  load()
  ElMessage.success('已重置为默认矩阵')
}

onMounted(load)
</script>

<style scoped>
.section-block {
  margin-bottom: 28px;
  padding-bottom: 20px;
  border-bottom: 1px dashed #e8e8e8;
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
  font-size: 15px;
  font-weight: 600;
  color: #303133;
}

.section-title {
  font-size: 15px;
  font-weight: 600;
}

.section-desc {
  margin: 0 0 12px 24px;
  font-size: 13px;
  color: #909399;
}

.eval-group {
  margin: 12px 0 12px 24px;
  padding: 10px 14px;
  background: #f5f7fa;
  border-radius: 6px;
}

.group-label {
  display: flex;
  align-items: center;
  gap: 10px;
}

.group-options {
  margin-top: 8px;
  margin-left: 26px;
}

.role-tag {
  display: inline-block;
  padding: 2px 10px;
  border-radius: 4px;
  font-size: 12px;
}
.role-tag.leader { background: #ecf5ff; color: #409eff; }
.role-tag.manager { background: #f0f9eb; color: #67c23a; }
.role-tag.staff { background: #fdf6ec; color: #e6a23c; }

.eval-target {
  color: #409eff;
  font-weight: 500;
}
</style>
