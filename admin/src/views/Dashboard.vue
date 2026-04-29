<template>
  <div class="dashboard">
    <el-row :gutter="16">
      <el-col :span="6">
        <el-card shadow="hover">
          <div class="stat-card">
            <div class="stat-num">{{ stats.total }}</div>
            <div class="stat-label">总批次</div>
          </div>
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card shadow="hover">
          <div class="stat-card">
            <div class="stat-num" style="color:#67c23a">{{ stats.active }}</div>
            <div class="stat-label">进行中</div>
          </div>
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card shadow="hover">
          <div class="stat-card">
            <div class="stat-num" style="color:#e6a23c">{{ stats.draft }}</div>
            <div class="stat-label">草稿</div>
          </div>
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card shadow="hover">
          <div class="stat-card">
            <div class="stat-num" style="color:#909399">{{ stats.closed }}</div>
            <div class="stat-label">已结束</div>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <el-card style="margin-top:20px">
      <template #header>
        <span>最近批次</span>
      </template>
      <el-table :data="paginatedData" stripe>
        <el-table-column type="index" label="序号" width="60" align="center" />
        <el-table-column prop="name" label="批次名称" />
        <el-table-column prop="period" label="周期" />
        <el-table-column prop="start_time" label="开始时间" />
        <el-table-column prop="end_time" label="结束时间" />
        <el-table-column prop="status" label="状态">
          <template #default="{ row }">
            <el-tag :type="statusType[row.status] || 'info'">{{ statusText[row.status] || row.status }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="total" label="关系数" />
        <el-table-column prop="completed" label="已完成">
          <template #default="{ row }">
            <span>{{ row.completed }} / {{ row.total }}</span>
          </template>
        </el-table-column>
      </el-table>

      <div class="pagination-wrap">
        <el-pagination
          v-model:current-page="currentPage"
          v-model:page-size="pageSize"
          :page-sizes="[20, 50, 100]"
          :total="batches.length"
          layout="total, sizes, prev, pager, next, jumper"
          background
        />
      </div>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { batchApi } from '../api'

const batches = ref<any[]>([])
const currentPage = ref(1)
const pageSize = ref(20)

const statusType: Record<string, string> = { draft: 'warning', active: 'success', closed: 'info' }
const statusText: Record<string, string> = { draft: '草稿', active: '进行中', closed: '已结束' }

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

onMounted(async () => {
  const res: any = await batchApi.list()
  batches.value = res.data || []
})
</script>

<style scoped>
.stat-card {
  text-align: center;
  padding: 10px 0;
}
.stat-num {
  font-size: 32px;
  font-weight: bold;
  color: #409eff;
}
.stat-label {
  margin-top: 8px;
  color: #999;
}
.pagination-wrap {
  margin-top: 16px;
  display: flex;
  justify-content: flex-end;
}
</style>
