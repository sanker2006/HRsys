<template>
  <section v-if="summary" class="summary-bar">
    <div class="summary-main">
      <van-icon name="description" class="summary-icon" />
      <div>
        <strong>个人总结</strong>
        <span :title="summary.original_name">{{ summary.original_name }}</span>
      </div>
    </div>
    <van-button size="small" plain type="primary" icon="down" :loading="downloading" @click="download">
      查看
    </van-button>
  </section>
</template>

<script setup lang="ts">
import { Icon as VanIcon, showToast } from 'vant'
import { ref } from 'vue'
import { h5Api } from '../api'

const props = defineProps<{
  relationId: string | number
  summary: { original_name: string; file_size: number; uploaded_at: string } | null
}>()

const downloading = ref(false)

function saveBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

async function download() {
  if (!props.summary || downloading.value) return
  downloading.value = true
  try {
    const data: any = await h5Api.downloadPersonalSummary(Number(props.relationId))
    const blob = data instanceof Blob ? data : new Blob([data])
    saveBlob(blob, props.summary.original_name)
    showToast('已下载，请使用 Word 或 WPS 打开')
  } finally {
    downloading.value = false
  }
}
</script>

<style scoped>
.summary-bar {
  margin: 12px 14px 0;
  padding: 12px 14px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  border: 1px solid #d8e2ec;
  border-radius: 8px;
  background: #fff;
}

.summary-main {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 10px;
}

.summary-icon { flex: 0 0 auto; color: var(--hr-accent); font-size: 24px; }
.summary-main div { min-width: 0; display: grid; gap: 2px; }
.summary-main strong { color: var(--hr-text); font-size: 14px; }
.summary-main span {
  overflow: hidden;
  color: var(--hr-muted);
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
