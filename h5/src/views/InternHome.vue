<template>
  <main class="intern-home safe-bottom">
    <van-nav-bar title="实习生打卡" left-text="退出" @click-left="logout" />

    <section class="profile">
      <div>
        <p>{{ today }}</p>
        <h1>{{ intern?.name || '实习生' }}</h1>
        <span>{{ intern?.department || '-' }} · {{ intern?.position || '-' }}</span>
      </div>
      <strong>{{ todayStats.valid_count || 0 }}</strong>
    </section>

    <section class="status-card">
      <div class="status-line">
        <span>今日状态</span>
        <b :class="todayStats.status">{{ statusText(todayStats.status) }}</b>
      </div>
      <div class="last-time">最后打卡：{{ todayStats.last_time || '暂无记录' }}</div>
      <div class="evidence" :class="{ ok: gps.ready, warn: gps.failed }">
        <span>{{ gpsText }}</span>
      </div>
      <input ref="fileInput" class="hidden-file" type="file" accept="image/*" capture="environment" @change="onFileChange" />
      <button class="photo-button" type="button" @click="pickPhoto">
        {{ photoBase64 ? '已选择照片，可重新选择' : gps.failed ? '上传打卡照片（必填）' : '上传照片（可选）' }}
      </button>
      <van-button block type="primary" :loading="submitting || locating" @click="submitPunch">
        {{ locating ? '正在定位' : '立即打卡' }}
      </van-button>
    </section>

    <nav class="quick-nav">
      <button type="button" @click="$router.push('/intern/records')">月打卡记录</button>
      <button type="button" @click="$router.push('/intern/calendar')">年度统计</button>
    </nav>
  </main>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { showToast } from 'vant'
import { internH5Api } from '../api'

const router = useRouter()
const intern = ref<any>(null)
const todayStats = ref<any>({})
const submitting = ref(false)
const locating = ref(false)
const fileInput = ref<HTMLInputElement | null>(null)
const photoBase64 = ref<string | null>(null)
const gps = reactive({ ready: false, failed: false, latitude: null as number | null, longitude: null as number | null, accuracy: null as number | null })
const today = new Date().toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' })

const gpsText = computed(() => {
  if (gps.ready) return `定位成功，精度 ${gps.accuracy == null ? '-' : gps.accuracy.toFixed(1)}m`
  if (gps.failed) return '未获取到定位，本次打卡必须上传照片'
  return '点击打卡后会先请求定位；定位失败时可用照片作为证据'
})

function statusText(status: string) {
  if (status === 'present') return '出勤'
  if (status === 'absent') return '缺勤'
  return '待打卡'
}

function currentMonth() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function currentDate() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

async function loadData() {
  const [me, month]: any[] = await Promise.all([internH5Api.me(), internH5Api.month(currentMonth())])
  intern.value = me.data
  localStorage.setItem('intern_profile', JSON.stringify(me.data))
  const row = month.data?.rows?.[0]
  todayStats.value = row?.days?.find((d: any) => d.date === currentDate()) || {}
}

function locate(): Promise<void> {
  locating.value = true
  gps.ready = false
  gps.failed = false
  return new Promise(resolve => {
    if (!navigator.geolocation) {
      gps.failed = true
      locating.value = false
      resolve()
      return
    }
    navigator.geolocation.getCurrentPosition(
      pos => {
        gps.latitude = pos.coords.latitude
        gps.longitude = pos.coords.longitude
        gps.accuracy = pos.coords.accuracy
        gps.ready = true
        locating.value = false
        resolve()
      },
      () => {
        gps.failed = true
        locating.value = false
        resolve()
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    )
  })
}

function pickPhoto() {
  fileInput.value?.click()
}

async function onFileChange(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file) return
  try {
    photoBase64.value = await compressImage(file)
    showToast('照片已压缩')
  } catch (err: any) {
    showToast(err.message || '照片压缩失败')
  }
}

function dataUrlBytes(dataUrl: string) {
  const raw = dataUrl.split(',')[1] || ''
  return Math.floor(raw.length * 3 / 4)
}

function compressImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      let maxSide = 520
      let quality = 0.72
      for (let attempt = 0; attempt < 12; attempt++) {
        const scale = Math.min(1, maxSide / Math.max(img.width, img.height))
        canvas.width = Math.max(1, Math.round(img.width * scale))
        canvas.height = Math.max(1, Math.round(img.height * scale))
        const ctx = canvas.getContext('2d')
        if (!ctx) return reject(new Error('浏览器不支持图片压缩'))
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
        const dataUrl = canvas.toDataURL('image/jpeg', quality)
        if (dataUrlBytes(dataUrl) <= 10 * 1024) return resolve(dataUrl)
        quality = Math.max(0.32, quality - 0.08)
        maxSide = Math.max(160, Math.round(maxSide * 0.82))
      }
      reject(new Error('照片压缩后仍超过 10KB，请更换照片'))
    }
    img.onerror = () => reject(new Error('图片读取失败'))
    img.src = URL.createObjectURL(file)
  })
}

async function submitPunch() {
  await locate()
  if (!gps.ready && !photoBase64.value) {
    showToast('未获取到定位时必须上传打卡照片')
    pickPhoto()
    return
  }
  submitting.value = true
  try {
    await internH5Api.punch({
      latitude: gps.ready ? gps.latitude : null,
      longitude: gps.ready ? gps.longitude : null,
      accuracy: gps.ready ? gps.accuracy : null,
      photoBase64: photoBase64.value,
    })
    showToast('打卡成功')
    photoBase64.value = null
    await loadData()
  } finally {
    submitting.value = false
  }
}

function logout() {
  localStorage.removeItem('intern_token')
  localStorage.removeItem('intern_profile')
  router.replace('/intern/login')
}

onMounted(loadData)
</script>

<style scoped>
.intern-home { min-height: 100vh; padding-bottom: 92px; background: linear-gradient(180deg, #dbe7ef, #bdcedb); }
.profile {
  margin: 14px;
  padding: 22px;
  border-radius: 18px;
  color: #fff;
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  background: linear-gradient(135deg, #064e5f, #0f766e);
  box-shadow: 0 18px 38px rgba(6, 78, 95, .23);
}
.profile p { margin: 0 0 8px; opacity: .76; font-weight: 800; }
.profile h1 { margin: 0 0 6px; font-size: 30px; }
.profile span { color: rgba(255,255,255,.78); }
.profile strong { font-size: 58px; line-height: .9; }
.status-card {
  margin: 14px;
  padding: 18px;
  border: 1px solid rgba(148,163,184,.42);
  border-radius: 18px;
  background: rgba(248, 251, 253, .9);
  box-shadow: 0 16px 34px rgba(15,23,42,.12);
  display: grid;
  gap: 14px;
}
.status-line { display: flex; justify-content: space-between; font-size: 18px; font-weight: 900; }
.status-line b.present { color: #059669; }
.status-line b.absent { color: #dc2626; }
.last-time { color: #536878; }
.evidence { padding: 12px; border-radius: 12px; background: #e8f1f6; color: #455d70; font-weight: 700; }
.evidence.ok { background: #dff6ed; color: #047857; }
.evidence.warn { background: #fff1df; color: #a15c12; }
.photo-button {
  width: 100%;
  border: 1px solid #9bb7ca;
  border-radius: 12px;
  background: #f7fbfd;
  color: #0b5f77;
  font-weight: 900;
}
.hidden-file { display: none; }
.quick-nav { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin: 14px; }
.quick-nav button {
  border: 1px solid #9bb7ca;
  border-radius: 14px;
  background: rgba(241, 247, 250, .88);
  color: #102033;
  font-weight: 900;
}
</style>
