<template>
  <main class="records-page safe-bottom">
    <van-nav-bar title="月打卡记录" left-arrow @click-left="$router.back()" />
    <section class="month-switch">
      <input v-model="month" type="month" @change="loadData" />
      <button type="button" @click="loadData">刷新</button>
    </section>

    <section class="summary">
      <div><span>应出勤</span><strong>{{ row?.summary?.expected_days || 0 }}</strong></div>
      <div><span>出勤</span><strong>{{ row?.summary?.present_days || 0 }}</strong></div>
      <div><span>缺勤</span><strong>{{ row?.summary?.absent_days || 0 }}</strong></div>
      <div><span>异常</span><strong>{{ row?.summary?.exception_days || 0 }}</strong></div>
    </section>

    <section class="day-list">
      <article v-for="day in days" :key="day.date" class="day-card" :class="day.status">
        <div>
          <b>{{ day.date.slice(5) }}</b>
          <span>{{ day.status === 'present' ? '出勤' : '缺勤' }}</span>
        </div>
        <div class="day-meta">
          <p>有效 {{ day.valid_count }} 次 / 原始 {{ day.raw_count }} 次</p>
          <p>首次 {{ day.first_time || '-' }}</p>
          <p>末次 {{ day.last_time || '-' }}</p>
        </div>
      </article>
      <van-empty v-if="!days.length" description="当前月份没有应统计日期" />
    </section>
  </main>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { internH5Api } from '../api'

function currentMonth() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

const month = ref(currentMonth())
const row = ref<any>(null)
const days = computed(() => row.value?.days || [])

async function loadData() {
  const res: any = await internH5Api.month(month.value)
  row.value = res.data?.rows?.[0] || null
}

onMounted(loadData)
</script>

<style scoped>
.records-page { min-height: 100vh; background: linear-gradient(180deg, #dbe7ef, #bdcedb); padding-bottom: 24px; }
.month-switch {
  margin: 14px;
  display: grid;
  grid-template-columns: 1fr 88px;
  gap: 10px;
}
.month-switch input, .month-switch button {
  min-height: 46px;
  border: 1px solid #9fb5c7;
  border-radius: 12px;
  background: #f8fbfd;
  padding: 0 12px;
  color: #102033;
  font-weight: 800;
}
.summary {
  margin: 14px;
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
}
.summary div {
  padding: 12px 8px;
  border-radius: 14px;
  background: rgba(248,251,253,.9);
  text-align: center;
  box-shadow: 0 10px 22px rgba(15,23,42,.08);
}
.summary span { display: block; color: #64748b; font-size: 12px; font-weight: 800; }
.summary strong { display: block; margin-top: 4px; font-size: 24px; color: #0f4f66; }
.day-list { display: grid; gap: 10px; margin: 14px; }
.day-card {
  display: grid;
  grid-template-columns: 74px 1fr;
  gap: 12px;
  padding: 14px;
  border: 1px solid #b8c9d6;
  border-radius: 14px;
  background: rgba(248,251,253,.92);
}
.day-card b { display: block; font-size: 22px; }
.day-card span { font-weight: 900; }
.day-card.present span { color: #059669; }
.day-card.absent span { color: #dc2626; }
.day-meta p { margin: 0 0 4px; color: #526779; font-size: 13px; }
</style>
