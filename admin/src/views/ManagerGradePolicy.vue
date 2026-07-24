<template>
  <div class="page-shell">
    <header class="page-head">
      <div>
        <div class="eyebrow">批次工作流 · 05</div>
        <h2>分档规则</h2>
        <p>{{ batch?.name || '加载中' }} · {{ sceneDescription }}</p>
      </div>
      <div class="head-actions">
        <el-button :icon="Refresh" :loading="loading" circle title="刷新" @click="load" />
        <el-button @click="$router.push('/batch')">返回批次</el-button>
      </div>
    </header>

    <el-tabs v-model="activeScene" class="scene-tabs">
      <el-tab-pane label="负责人向下评价" name="manager" />
      <el-tab-pane label="员工互评" name="staffPeer" />
    </el-tabs>

    <section class="metric-band">
      <div><span>部门组</span><strong>{{ list.length }}</strong></div>
      <div><span>默认规则</span><strong>{{ modeCount('default') }}</strong></div>
      <div><span>特殊规则</span><strong>{{ modeCount('custom') }}</strong></div>
      <div><span>不限制</span><strong>{{ modeCount('unrestricted') }}</strong></div>
    </section>

    <el-alert
      v-if="batch?.status === 'closed'"
      type="info"
      :closable="false"
      title="批次已结束，分档规则只读"
      class="status-alert"
    />
    <el-alert
      v-else-if="isStaffPeer"
      type="info"
      :closable="false"
      title="员工互评规则按部门配置，并对部门内每名员工的互评对象分别执行。评价人数不包含本人和部门负责人。"
      class="status-alert"
    />

    <section class="table-section">
      <el-table :data="list" v-loading="loading" stripe>
        <el-table-column prop="department" label="部门" min-width="150" />
        <el-table-column v-if="!isStaffPeer" prop="manager_name" label="负责人" width="110" />
        <el-table-column v-if="isStaffPeer" label="员工人数" width="96">
          <template #default="{ row }">{{ row.staff_count }} 人</template>
        </el-table-column>
        <el-table-column :label="isStaffPeer ? '每人评价' : '评价人数'" width="96">
          <template #default="{ row }">{{ row.target_count }} 人</template>
        </el-table-column>
        <el-table-column v-if="isStaffPeer" label="互评关系" width="100">
          <template #default="{ row }">{{ row.relation_count }} 条</template>
        </el-table-column>
        <el-table-column label="已提交" width="90">
          <template #default="{ row }">{{ row.completed_count }} {{ isStaffPeer ? '条' : '人' }}</template>
        </el-table-column>
        <el-table-column label="模式" width="100">
          <template #default="{ row }">
            <el-tag :type="modeType(row.mode)" effect="plain">{{ modeText(row.mode) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="description" label="当前规则" min-width="300" show-overflow-tooltip />
        <el-table-column label="现有评分" width="110">
          <template #default="{ row }">
            <el-tooltip v-if="!row.current_valid" :content="row.current_message" placement="top">
              <el-tag type="danger" effect="plain">不兼容</el-tag>
            </el-tooltip>
            <el-tag v-else type="success" effect="plain">可执行</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="88" fixed="right">
          <template #default="{ row }">
            <el-button
              :icon="Edit"
              circle
              title="配置规则"
              :disabled="batch?.status === 'closed' || !row.current_valid && !row.target_count"
              @click="openEditor(row)"
            />
          </template>
        </el-table-column>
      </el-table>
      <el-empty v-if="!loading && !list.length" :description="emptyDescription" />
    </section>

    <el-dialog v-model="dialogVisible" :title="dialogTitle" width="760px" destroy-on-close>
      <div v-if="editing" class="editor">
        <div class="editor-context">
          <div><span>部门</span><strong>{{ editing.department }}</strong></div>
          <div>
            <span>{{ isStaffPeer ? '员工人数' : '负责人' }}</span>
            <strong>{{ isStaffPeer ? `${editing.staff_count} 人` : editing.manager_name }}</strong>
          </div>
          <div>
            <span>{{ isStaffPeer ? '每人评价' : '评价对象' }}</span>
            <strong>{{ editing.target_count }} 人</strong>
          </div>
        </div>

        <div class="range-strip">
          <div v-for="item in scoreRanges" :key="item.grade">
            <strong>{{ item.grade }}级</strong>
            <span>{{ item.label }}</span>
          </div>
        </div>

        <div class="field-block">
          <label>规则模式</label>
          <el-segmented v-model="form.mode" :options="modeOptions" />
        </div>

        <el-alert
          v-if="form.mode === 'default'"
          type="info"
          :closable="false"
          :title="defaultDescription(editing.target_count)"
        />
        <el-alert
          v-else-if="form.mode === 'unrestricted'"
          type="warning"
          :closable="false"
          title="ABCDE所有等级均不限制人数，仍保留分数对应等级的展示。"
        />

        <div v-else class="constraint-editor">
          <div class="constraint-head">
            <div>
              <strong>人数约束</strong>
              <p>同一等级只能出现在一条约束中；最少和最多相同即为精确人数。</p>
            </div>
            <el-button :icon="Plus" @click="addConstraint">增加约束</el-button>
          </div>
          <div class="constraint-row heading">
            <span>等级组合</span><span>最少人数</span><span>最多人数</span><span />
          </div>
          <div v-for="(constraint, index) in form.constraints" :key="index" class="constraint-row">
            <el-select v-model="constraint.grades" multiple placeholder="选择等级">
              <el-option v-for="grade in grades" :key="grade" :label="`${grade}级`" :value="grade" />
            </el-select>
            <el-input-number v-model="constraint.min" :min="0" :max="editing.target_count" controls-position="right" />
            <el-input-number v-model="constraint.max" :min="0" :max="editing.target_count" controls-position="right" />
            <el-button :icon="Delete" type="danger" circle plain title="删除约束" @click="removeConstraint(index)" />
          </div>
          <el-empty v-if="!form.constraints.length" description="至少增加一条人数约束" :image-size="54" />
        </div>
      </div>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="save">保存规则</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { Delete, Edit, Plus, Refresh } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { managerGradePolicyApi, staffPeerGradePolicyApi } from '../api'

const props = defineProps<{ batchId: string }>()
const loading = ref(false)
const saving = ref(false)
const dialogVisible = ref(false)
const activeScene = ref<'manager' | 'staffPeer'>('manager')
const batch = ref<any>(null)
const managerList = ref<any[]>([])
const staffPeerList = ref<any[]>([])
const editing = ref<any>(null)
const grades = ['A', 'B', 'C', 'D', 'E']
const modeOptions = [
  { label: '默认规则', value: 'default' },
  { label: '自定义', value: 'custom' },
  { label: '不限制', value: 'unrestricted' },
]
const form = reactive<any>({ mode: 'default', constraints: [] })

const isStaffPeer = computed(() => activeScene.value === 'staffPeer')
const list = computed(() => isStaffPeer.value ? staffPeerList.value : managerList.value)
const sceneDescription = computed(() => isStaffPeer.value
  ? '配置员工对本部门其他员工的30分制互评分档'
  : '配置部门负责人对本部门员工的100分制向下评价分档')
const emptyDescription = computed(() => isStaffPeer.value
  ? '请先生成员工互评关系'
  : '请先生成负责人向下评价关系')
const dialogTitle = computed(() => isStaffPeer.value
  ? '配置员工互评分档规则'
  : '配置负责人向下评价规则')
const scoreRanges = computed(() => isStaffPeer.value
  ? [
    { grade: 'A', label: '27.1～30.0' },
    { grade: 'B', label: '24.1～27.0' },
    { grade: 'C', label: '21.1～24.0' },
    { grade: 'D', label: '18.0～21.0' },
    { grade: 'E', label: '0～17.9' },
  ]
  : [
    { grade: 'A', label: '91.0～100.0' },
    { grade: 'B', label: '81.0～90.9' },
    { grade: 'C', label: '71.0～80.9' },
    { grade: 'D', label: '60.0～70.9' },
    { grade: 'E', label: '0～59.9' },
  ])
const coveredGrades = computed(() => new Set(
  form.constraints.flatMap((item: any) => item.grades || [])
))

function modeCount(mode: string) {
  return list.value.filter(row => row.mode === mode).length
}
function modeText(mode: string) {
  return mode === 'custom' ? '特殊规则' : mode === 'unrestricted' ? '不限制' : '默认规则'
}
function modeType(mode: string) {
  return mode === 'custom' ? 'warning' : mode === 'unrestricted' ? 'info' : 'success'
}
function defaultDescription(count: number) {
  if (count <= 3) return '默认规则：A级最多1人，其余等级不限。'
  if (count === 4) return '默认规则：A+B共1人、C+D共2人、E共1人。'
  return '默认规则：A、B最多20%，C最多30%，D至少20%，E至少10%。'
}
async function load() {
  loading.value = true
  try {
    const [managerRes, staffPeerRes]: any[] = await Promise.all([
      managerGradePolicyApi.list(Number(props.batchId)),
      staffPeerGradePolicyApi.list(Number(props.batchId)),
    ])
    batch.value = managerRes.data?.batch || staffPeerRes.data?.batch
    managerList.value = managerRes.data?.list || []
    staffPeerList.value = staffPeerRes.data?.list || []
  } finally {
    loading.value = false
  }
}
function openEditor(row: any) {
  editing.value = row
  form.mode = row.mode
  form.constraints = row.mode === 'custom'
    ? row.constraints.map((item: any) => ({
      grades: [...item.grades],
      min: Number(item.min),
      max: Number(item.max),
    }))
    : []
  dialogVisible.value = true
}
function addConstraint() {
  const firstAvailable = grades.find(grade => !coveredGrades.value.has(grade))
  form.constraints.push({
    grades: firstAvailable ? [firstAvailable] : [],
    min: 0,
    max: editing.value?.target_count || 0,
  })
}
function removeConstraint(index: string | number) {
  form.constraints.splice(Number(index), 1)
}
async function save() {
  if (!editing.value) return
  if (form.mode === 'custom' && !form.constraints.length) {
    ElMessage.warning('自定义规则至少需要一条人数约束')
    return
  }
  saving.value = true
  try {
    const api = isStaffPeer.value ? staffPeerGradePolicyApi : managerGradePolicyApi
    await api.save(Number(props.batchId), {
      department: editing.value.department,
      expected_target_count: editing.value.target_count,
      mode: form.mode,
      constraints: form.mode === 'custom' ? form.constraints : [],
    })
    ElMessage.success('分档规则已保存')
    dialogVisible.value = false
    await load()
  } finally {
    saving.value = false
  }
}
watch(activeScene, () => {
  dialogVisible.value = false
  editing.value = null
})
onMounted(load)
</script>

<style scoped>
.page-shell { padding: 24px; }
.page-head { display: flex; justify-content: space-between; gap: 24px; align-items: flex-start; margin-bottom: 12px; }
.page-head h2 { margin: 4px 0; font-size: 26px; letter-spacing: 0; }
.page-head p, .eyebrow { color: var(--admin-muted); }
.eyebrow { font-size: 12px; font-weight: 700; }
.head-actions { display: flex; gap: 10px; }
.scene-tabs { margin-bottom: 4px; }
.metric-band { display: grid; grid-template-columns: repeat(4, 1fr); border-block: 1px solid var(--admin-border); margin-bottom: 20px; }
.metric-band div { padding: 18px; border-right: 1px solid var(--admin-border); }
.metric-band div:last-child { border-right: 0; }
.metric-band span, .metric-band strong { display: block; }
.metric-band span { color: var(--admin-muted); font-size: 13px; }
.metric-band strong { margin-top: 6px; font-size: 25px; }
.status-alert { margin-bottom: 16px; }
.table-section { width: 100%; }
.editor-context { display: grid; grid-template-columns: repeat(3, 1fr); border-block: 1px solid var(--admin-border); margin-bottom: 18px; }
.editor-context div { padding: 14px; }
.editor-context span, .editor-context strong { display: block; }
.editor-context span { color: var(--admin-muted); font-size: 12px; }
.editor-context strong { margin-top: 4px; }
.range-strip { display: grid; grid-template-columns: repeat(5, 1fr); border: 1px solid var(--admin-border); margin-bottom: 18px; }
.range-strip div { padding: 10px; text-align: center; border-right: 1px solid var(--admin-border); }
.range-strip div:last-child { border-right: 0; }
.range-strip strong, .range-strip span { display: block; }
.range-strip span { margin-top: 3px; color: var(--admin-muted); font-size: 12px; }
.field-block { display: grid; gap: 8px; margin-bottom: 18px; }
.field-block label, .constraint-head strong { font-weight: 800; }
.constraint-editor { margin-top: 18px; }
.constraint-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 18px; margin-bottom: 12px; }
.constraint-head p { margin: 4px 0 0; color: var(--admin-muted); font-size: 12px; }
.constraint-row { display: grid; grid-template-columns: minmax(220px, 1fr) 130px 130px 40px; gap: 10px; align-items: center; margin-bottom: 10px; }
.constraint-row.heading { color: var(--admin-muted); font-size: 12px; }
@media (max-width: 760px) {
  .page-shell { padding: 16px; }
  .page-head { display: block; }
  .head-actions { margin-top: 12px; }
  .metric-band { grid-template-columns: repeat(2, 1fr); }
  .editor-context { grid-template-columns: 1fr; }
  .range-strip { grid-template-columns: repeat(2, 1fr); }
  .constraint-row { grid-template-columns: 1fr 1fr; }
  .constraint-row.heading { display: none; }
}
</style>
