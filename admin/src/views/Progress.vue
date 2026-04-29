<template>
  <div class="progress-page">
    <el-card v-loading="loading">
      <!-- 顶部批次信息 -->
      <template #header>
        <div style="display:flex;justify-content:space-between;align-items:center">
          <span style="font-size:15px;font-weight:600">进度监控</span>
          <el-button size="small" @click="$router.back()">返回</el-button>
        </div>
      </template>

      <div v-if="batch" class="batch-info">
        <div class="batch-tag">
          <span class="batch-name">{{ batch.name }}</span>
          <span class="batch-period">{{ batch.period }}</span>
          <el-tag :type="statusType[batch.status] || 'info'" size="small">{{ statusText[batch.status] }}</el-tag>
        </div>
        <div class="batch-meta">
          <span>📅 {{ batch.start_time }} ~ {{ batch.end_time }}</span>
        </div>
        <!-- 总体进度条 -->
        <div class="overall-bar">
          <div class="bar-label">
            <span>总体完成率</span>
            <b>{{ totalProgress }}%</b>
            <span class="bar-sub">({{ totalStats.completed }}/{{ totalStats.total }}条)</span>
          </div>
          <el-progress :percentage="totalProgress" :stroke-width="14" :color="progressColor" />
        </div>
      </div>

      <!-- 三类进度小卡片 -->
      <div v-if="!loading" class="type-stats">
        <div class="type-card type-self"  @click="activeTab='self'">
          <div class="type-icon">✍️</div>
          <div class="type-body">
            <div class="type-name">自评</div>
            <div class="type-nums">
              <span class="done">{{ typeStats.self.completed }}已完成</span>
              <span class="sep">·</span>
              <span class="pend">{{ typeStats.self.pending }}待评</span>
              <span class="sep">·</span>
              <span class="ttl">{{ typeStats.self.total }}总计</span>
            </div>
          </div>
          <div class="type-arrow">›</div>
        </div>
        <div class="type-card type-peer"    @click="activeTab='peer'">
          <div class="type-icon">🤝</div>
          <div class="type-body">
            <div class="type-name">互评</div>
            <div class="type-nums">
              <span class="done">{{ typeStats.peer.completed }}已完成</span>
              <span class="sep">·</span>
              <span class="pend">{{ typeStats.peer.pending }}待评</span>
              <span class="sep">·</span>
              <span class="ttl">{{ typeStats.peer.total }}总计</span>
            </div>
          </div>
          <div class="type-arrow">›</div>
        </div>
        <div class="type-card type-down"  @click="activeTab='downward'">
          <div class="type-icon">👇</div>
          <div class="type-body">
            <div class="type-name">向下评估</div>
            <div class="type-nums">
              <span class="done">{{ typeStats.downward.completed }}已完成</span>
              <span class="sep">·</span>
              <span class="pend">{{ typeStats.downward.pending }}待评</span>
              <span class="sep">·</span>
              <span class="ttl">{{ typeStats.downward.total }}总计</span>
            </div>
          </div>
          <div class="type-arrow">›</div>
        </div>
      </div>
    </el-card>

    <!-- 三个 Sheet -->
    <el-card style="margin-top:12px">
      <el-tabs v-model="activeTab" class="eval-tabs">

        <!-- 自评进度 -->
        <el-tab-pane name="self">
          <template #label>
            <span class="tab-label"><span class="tab-dot dot-self"></span>自评进度</span>
          </template>
          <div v-if="selfList.length === 0" class="empty-tip">暂无自评数据</div>
          <template v-else>
            <el-table :data="paginatedSelf" stripe class="eval-table">
              <el-table-column type="index" label="#" width="50" align="center" />
              <el-table-column prop="target_name" label="姓名" width="90" />
              <el-table-column prop="target_department" label="部门" min-width="110" />
              <el-table-column label="状态" width="80" align="center">
                <template #default="{ row }">
                  <el-tag size="small" :type="statusTag[row.status]">{{ statusTagText[row.status] }}</el-tag>
                </template>
              </el-table-column>
              <!-- 固定题目1~题目10列 -->
              <el-table-column v-for="i in 10" :key="i" :label="`题目${i}`" width="68" align="center">
                <template #default="{ row }">
                  <span :class="row.questionScores[i-1]?.score !== null ? 'score-val' : 'score-empty'">
                    {{ row.questionScores[i-1]?.score ?? '-' }}
                  </span>
                </template>
              </el-table-column>
              <el-table-column label="总分" width="70" align="center">
                <template #default="{ row }">
                  <b class="total-val">{{ row.totalScore ?? '-' }}</b>
                </template>
              </el-table-column>
            </el-table>
            <div class="pagination-wrap">
              <span class="total-hint">共 {{ selfList.length }} 条</span>
              <el-pagination
                v-model:current-page="selfPage"
                v-model:page-size="selfPageSize"
                :page-sizes="[20, 50, 100]"
                :total="selfList.length"
                layout="sizes, prev, pager, next"
                background
              />
            </div>
          </template>
        </el-tab-pane>

        <!-- 互评进度 -->
        <el-tab-pane name="peer">
          <template #label>
            <span class="tab-label"><span class="tab-dot dot-peer"></span>互评进度</span>
          </template>
          <div v-if="peerList.length === 0" class="empty-tip">暂无互评数据</div>
          <template v-else>
            <el-table :data="paginatedPeer" stripe class="eval-table">
              <el-table-column type="index" label="#" width="50" align="center" />
              <el-table-column prop="evaluator_name" label="评价人" width="90" />
              <el-table-column prop="evaluator_department" label="评价人部门" min-width="110" />
              <el-table-column prop="target_name" label="被评人" width="90" />
              <el-table-column prop="target_department" label="被评人部门" min-width="110" />
              <el-table-column label="状态" width="80" align="center">
                <template #default="{ row }">
                  <el-tag size="small" :type="statusTag[row.status]">{{ statusTagText[row.status] }}</el-tag>
                </template>
              </el-table-column>
              <el-table-column label="评分" width="80" align="center">
                <template #default="{ row }">
                  <b class="total-val">{{ row.totalScore ?? '-' }}</b>
                </template>
              </el-table-column>
            </el-table>
            <div class="pagination-wrap">
              <span class="total-hint">共 {{ peerList.length }} 条</span>
              <el-pagination
                v-model:current-page="peerPage"
                v-model:page-size="peerPageSize"
                :page-sizes="[20, 50, 100]"
                :total="peerList.length"
                layout="sizes, prev, pager, next"
                background
              />
            </div>
          </template>
        </el-tab-pane>

        <!-- 向下评估进度 -->
        <el-tab-pane name="downward">
          <template #label>
            <span class="tab-label"><span class="tab-dot dot-down"></span>向下评估</span>
          </template>
          <div v-if="downwardList.length === 0" class="empty-tip">暂无向下评估数据</div>
          <template v-else>
            <el-table :data="paginatedDownward" stripe class="eval-table">
              <el-table-column type="index" label="#" width="50" align="center" />
              <el-table-column prop="evaluator_name" label="评价人" width="90" />
              <el-table-column prop="evaluator_department" label="评价人部门" min-width="110" />
              <el-table-column prop="target_name" label="被评人" width="90" />
              <el-table-column prop="target_department" label="被评人部门" min-width="110" />
              <el-table-column label="状态" width="80" align="center">
                <template #default="{ row }">
                  <el-tag size="small" :type="statusTag[row.status]">{{ statusTagText[row.status] }}</el-tag>
                </template>
              </el-table-column>
              <el-table-column label="评分" width="80" align="center">
                <template #default="{ row }">
                  <b class="total-val">{{ row.totalScore ?? '-' }}</b>
                </template>
              </el-table-column>
            </el-table>
            <div class="pagination-wrap">
              <span class="total-hint">共 {{ downwardList.length }} 条</span>
              <el-pagination
                v-model:current-page="downwardPage"
                v-model:page-size="downwardPageSize"
                :page-sizes="[20, 50, 100]"
                :total="downwardList.length"
                layout="sizes, prev, pager, next"
                background
              />
            </div>
          </template>
        </el-tab-pane>
      </el-tabs>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { batchApi, answerApi } from '../api'

const props = defineProps<{ batchId: string }>()
const loading = ref(false)

const batch        = ref<any>(null)
const selfList     = ref<any[]>([])
const peerList     = ref<any[]>([])
const downwardList  = ref<any[]>([])

const selfPage     = ref(1); const selfPageSize     = ref(20)
const peerPage     = ref(1); const peerPageSize     = ref(20)
const downwardPage = ref(1); const downwardPageSize = ref(20)

const activeTab = ref('self')

const statusType: Record<string, string> = { draft: 'warning', active: 'success', closed: 'info' }
const statusText: Record<string, string> = { draft: '草稿', active: '进行中', closed: '已结束' }

const statusTag:   Record<string, string> = { completed: 'success', draft: 'warning', pending: 'info' }
const statusTagText: Record<string, string> = { completed: '已完成', draft: '草稿', pending: '待评' }

const typeStats = ref({
  self:     { total: 0, completed: 0, draft: 0, pending: 0 },
  peer:     { total: 0, completed: 0, draft: 0, pending: 0 },
  downward: { total: 0, completed: 0, draft: 0, pending: 0 },
})

const totalStats = computed(() => ({
  total:     typeStats.value.self.total + typeStats.value.peer.total + typeStats.value.downward.total,
  completed: typeStats.value.self.completed + typeStats.value.peer.completed + typeStats.value.downward.completed,
}))

const totalProgress = computed(() => {
  if (!totalStats.value.total) return 0
  return Math.round((totalStats.value.completed / totalStats.value.total) * 100)
})

const progressColor = computed(() => {
  const p = totalProgress.value
  if (p >= 80) return '#67c23a'
  if (p >= 40) return '#e6a23c'
  return '#909399'
})

const paginatedSelf     = computed(() => slice(selfList.value,     selfPage.value,     selfPageSize.value))
const paginatedPeer     = computed(() => slice(peerList.value,     peerPage.value,     peerPageSize.value))
const paginatedDownward = computed(() => slice(downwardList.value, downwardPage.value, downwardPageSize.value))

function slice(arr: any[], page: number, size: number) {
  return arr.slice((page - 1) * size, page * size)
}

onMounted(async () => {
  loading.value = true
  try {
    const [batchRes, progressRes]: any = await Promise.all([
      batchApi.get(parseInt(props.batchId)),
      answerApi.getAdminProgress(parseInt(props.batchId)),
    ])
    batch.value = batchRes.data || progressRes.data?.batch || null
    const d = progressRes.data
    if (d) {
      selfList.value     = d.self?.list     || []
      peerList.value     = d.peer?.list     || []
      downwardList.value = d.downward?.list || []
      typeStats.value    = {
        self:     d.self?.stats     || typeStats.value.self,
        peer:     d.peer?.stats     || typeStats.value.peer,
        downward: d.downward?.stats || typeStats.value.downward,
      }
    }
  } finally {
    loading.value = false
  }
})
</script>

<style scoped>
/* 批次信息区 */
.batch-info {
  padding: 4px 0 16px;
}
.batch-tag {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 8px;
}
.batch-name {
  font-size: 16px;
  font-weight: 700;
  color: #1a2332;
}
.batch-period {
  font-size: 13px;
  color: #666;
  background: #f1f3f4;
  padding: 2px 8px;
  border-radius: 4px;
}
.batch-meta {
  font-size: 13px;
  color: #888;
  margin-bottom: 14px;
}

/* 总体进度条 */
.overall-bar {
  background: #f8f9fb;
  border-radius: 10px;
  padding: 12px 16px 8px;
  margin-top: 6px;
}
.bar-label {
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin-bottom: 8px;
  font-size: 13px;
  color: #555;
}
.bar-label b {
  font-size: 18px;
  color: #1a2332;
}
.bar-sub {
  font-size: 12px;
  color: #999;
}

/* 三类进度卡片 */
.type-stats {
  display: flex;
  gap: 10px;
  margin-top: 4px;
}
.type-card {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 16px;
  border-radius: 10px;
  cursor: pointer;
  transition: all 0.2s ease;
  border: 1.5px solid transparent;
}
.type-card:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(0,0,0,0.08);
}
.type-self  { background: linear-gradient(135deg, #e6f0ff 0%, #dbeeff 100%); border-color: #bfd9ff; }
.type-peer  { background: linear-gradient(135deg, #e8f7e8 0%, #d8f0d8 100%); border-color: #bde8bd; }
.type-down  { background: linear-gradient(135deg, #fff4e6 0%, #ffefdf 100%); border-color: #ffd9a8; }

.type-icon {
  font-size: 24px;
  line-height: 1;
}
.type-body {
  flex: 1;
}
.type-name {
  font-size: 14px;
  font-weight: 600;
  color: #1a2332;
  margin-bottom: 4px;
}
.type-nums {
  font-size: 12px;
  color: #666;
}
.type-nums .sep { margin: 0 3px; color: #bbb; }
.type-nums .done { color: #67c23a; }
.type-nums .pend { color: #e6a23c; }
.type-nums .ttl { color: #888; }
.type-arrow {
  font-size: 20px;
  color: #c0c4cc;
}

/* Tab 样式 */
.eval-tabs :deep(.el-tabs__header) {
  margin-bottom: 14px;
}
.tab-label {
  display: flex;
  align-items: center;
  gap: 7px;
  font-size: 14px;
}
.tab-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}
.dot-self { background: #409eff; }
.dot-peer { background: #67c23a; }
.dot-down { background: #e6a23c; }

/* 表格 */
.eval-table {
  font-size: 13px;
  border-radius: 8px;
  overflow: hidden;
}
.score-val {
  color: #409eff;
  font-weight: 600;
}
.score-empty {
  color: #dcdfe6;
}
.total-val {
  color: #1a2332;
  font-size: 13px;
}

/* 分页 */
.pagination-wrap {
  margin-top: 14px;
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 12px;
}
.total-hint {
  font-size: 13px;
  color: #888;
}

/* 空状态 */
.empty-tip {
  text-align: center;
  color: #c0c4cc;
  padding: 48px 0;
  font-size: 14px;
}
</style>
