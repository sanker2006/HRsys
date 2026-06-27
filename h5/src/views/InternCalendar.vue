<template>
  <main class="year-page safe-bottom">
    <van-nav-bar title="年度统计" left-arrow @click-left="$router.back()" />
    <section class="year-switch">
      <input v-model="year" type="number" min="2000" max="2100" />
      <button type="button" @click="loadData">刷新</button>
    </section>

    <section class="year-grid">
      <article v-for="item in months" :key="item.month" class="month-card">
        <header>
          <b>{{ item.month.slice(5) }}月</b>
          <span>{{ item.summary.present_days }}/{{ item.summary.expected_days }}</span>
        </header>
        <div class="bar"><i :style="{ width: rate(item.summary) + '%' }"></i></div>
        <footer>
          <span>缺勤 {{ item.summary.absent_days }}</span>
          <span>异常 {{ item.summary.exception_days }}</span>
        </footer>
      </article>
    </section>
  </main>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { internH5Api } from '../api'

const year = ref(String(new Date().getFullYear()))
const months = ref<any[]>([])

function rate(summary: any) {
  if (!summary.expected_days) return 0
  return Math.round((summary.present_days / summary.expected_days) * 100)
}

async function loadData() {
  const res: any = await internH5Api.year(year.value)
  months.value = res.data?.months || []
}

onMounted(loadData)
</script>

<style scoped>
.year-page { min-height: 100vh; background: linear-gradient(180deg, #dbe7ef, #bdcedb); padding-bottom: 24px; }
.year-switch {
  margin: 14px;
  display: grid;
  grid-template-columns: 1fr 88px;
  gap: 10px;
}
.year-switch input, .year-switch button {
  min-height: 46px;
  border: 1px solid #9fb5c7;
  border-radius: 12px;
  background: #f8fbfd;
  padding: 0 12px;
  color: #102033;
  font-weight: 800;
}
.year-grid {
  margin: 14px;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}
.month-card {
  padding: 14px;
  border: 1px solid #b8c9d6;
  border-radius: 16px;
  background: rgba(248,251,253,.92);
  box-shadow: 0 10px 22px rgba(15,23,42,.08);
}
.month-card header, .month-card footer {
  display: flex;
  justify-content: space-between;
  gap: 8px;
}
.month-card b { font-size: 22px; color: #102033; }
.month-card header span { color: #0f766e; font-weight: 900; }
.month-card footer { margin-top: 10px; color: #64748b; font-size: 12px; font-weight: 800; }
.bar { height: 8px; margin-top: 12px; border-radius: 999px; background: #d3e0e9; overflow: hidden; }
.bar i { display: block; height: 100%; border-radius: inherit; background: linear-gradient(90deg, #0f766e, #0891b2); }
</style>
