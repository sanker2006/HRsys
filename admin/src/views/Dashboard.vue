<template>
  <div class="admin-page dashboard">
    <section class="admin-hero">
      <div>
        <h1>运营总览</h1>
        <p>从批次状态、配置入口和完成进度开始，快速判断今天该处理什么。</p>
      </div>
      <div class="hero-actions">
        <el-button type="primary" @click="$router.push('/batch')">进入批次工作流</el-button>
      </div>
    </section>

    <section class="metric-grid">
      <div class="metric-card">
        <div class="metric-label">全部批次</div>
        <div class="metric-value">{{ stats.total }}</div>
        <div class="metric-note">系统内累计评比活动</div>
      </div>
      <div class="metric-card">
        <div class="metric-label">进行中</div>
        <div class="metric-value success">{{ stats.active }}</div>
        <div class="metric-note">当前允许员工提交</div>
      </div>
      <div class="metric-card">
        <div class="metric-label">待配置</div>
        <div class="metric-value warning">{{ stats.draft }}</div>
        <div class="metric-note">需要启动前检查</div>
      </div>
      <div class="metric-card">
        <div class="metric-label">已结束</div>
        <div class="metric-value muted">{{ stats.closed }}</div>
        <div class="metric-note">只读归档批次</div>
      </div>
    </section>

    <section class="flow-grid">
      <button class="flow-card" type="button" aria-label="进入批次工作流创建批次" @click="$router.push('/batch')">
        <span class="flow-step">01</span>
        <strong>创建批次</strong>
        <em>设置周期、开始和结束时间</em>
      </button>
      <div class="flow-card" role="group">
        <span class="flow-step">02</span>
        <strong>导入题目</strong>
        <em>按人员绑定业绩与综合评价模板</em>
      </div>
      <div class="flow-card" role="group">
        <span class="flow-step">03</span>
        <strong>生成关系</strong>
        <em>自动生成自评、互评和向下评价</em>
      </div>
      <div class="flow-card" role="group">
        <span class="flow-step">04</span>
        <strong>监控进度</strong>
        <em>检查未完成、草稿和分数情况</em>
      </div>
    </section>

    <el-card class="work-card">
      <template #header>
        <div class="card-titlebar">
          <div class="card-title">
            <strong>最近批次</strong>
            <span>按创建顺序展示，选择批次后进入配置和监控。</span>
          </div>
        </div>
      </template>

      <el-table :data="paginatedData" class="admin-table" v-loading="loading">
        <el-table-column prop="name" label="批次名称" min-width="180">
          <template #default="{ row }">
            <div class="batch-name">{{ row.name }}</div>
            <div class="batch-period">{{ row.period || '未设置周期' }}</div>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="120">
          <template #default="{ row }">
            <span class="status-chip" :class="statusClass(row.status)">{{ statusText[row.status] || row.status }}</span>
          </template>
        </el-table-column>
        <el-table-column label="时间范围" min-width="240">
          <template #default="{ row }">
            <div class="date-range">{{ row.start_time || '-' }}</div>
            <div class="date-range muted">至 {{ row.end_time || '-' }}</div>
          </template>
        </el-table-column>
        <el-table-column label="完成进度" width="220">
          <template #default="{ row }">
            <div class="progress-cell">
              <span>{{ row.completed || 0 }}/{{ row.total || 0 }}</span>
              <el-progress :percentage="row.total ? Math.round((row.completed / row.total) * 100) : 0" :stroke-width="8" />
            </div>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="140" align="right">
          <template #default="{ row }">
            <el-button type="primary" plain @click="$router.push(`/progress/${row.id}`)">查看进度</el-button>
          </template>
        </el-table-column>
      </el-table>

      <div class="pagination-wrap">
        <span>共 {{ batches.length }} 条</span>
        <el-pagination
          v-model:current-page="currentPage"
          v-model:page-size="pageSize"
          :page-sizes="[20, 50, 100]"
          :total="batches.length"
          layout="sizes, prev, pager, next"
          background
        />
      </div>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { batchApi } from '../api'

const batches = ref<any[]>([])
const loading = ref(false)
const currentPage = ref(1)
const pageSize = ref(20)

const statusText: Record<string, string> = { draft: '待配置', active: '进行中', closed: '已结束' }

const stats = computed(() => ({
  total: batches.value.length,
  active: batches.value.filter(b => b.status === 'active').length,
  draft: batches.value.filter(b => b.status === 'draft').length,
  closed: batches.value.filter(b => b.status === 'closed').length,
}))

const paginatedData = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value
  return batches.value.slice(start, start + pageSize.value)
})

function statusClass(status: string) {
  if (status === 'active') return 'success'
  if (status === 'draft') return 'warning'
  return 'info'
}

onMounted(async () => {
  loading.value = true
  try {
    const res: any = await batchApi.list()
    batches.value = res.data || []
  } finally {
    loading.value = false
  }
})
</script>

<style scoped>
.metric-value.success { color: var(--admin-success); }
.metric-value.warning { color: var(--admin-warning); }
.metric-value.muted { color: var(--admin-muted); }

.flow-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 14px;
}

.flow-card {
  min-height: 118px;
  padding: 18px;
  border: 1px solid rgba(223, 231, 241, 0.95);
  border-radius: 12px;
  background: #fff;
  text-align: left;
  cursor: pointer;
  box-shadow: var(--admin-shadow-soft);
}

.flow-card:hover { border-color: #7dd3fc; transform: translateY(-1px); }
.flow-card[role="group"] { cursor: default; }
.flow-card[role="group"]:hover { border-color: rgba(223, 231, 241, 0.95); transform: none; }
.flow-step { color: var(--admin-accent); font-size: 12px; font-weight: 900; }
.flow-card strong { display: block; margin-top: 10px; color: var(--admin-text); font-size: 17px; }
.flow-card em { display: block; margin-top: 6px; color: var(--admin-muted); font-size: 12px; line-height: 1.5; font-style: normal; }

.batch-name { color: var(--admin-text); font-weight: 900; }
.batch-period { margin-top: 4px; color: var(--admin-muted); font-size: 12px; }
.date-range { font-size: 13px; color: var(--admin-text); }
.date-range.muted { margin-top: 3px; color: var(--admin-muted); }
.progress-cell { display: grid; gap: 8px; color: var(--admin-muted); font-size: 12px; }

@media (max-width: 1200px) {
  .flow-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
</style>
