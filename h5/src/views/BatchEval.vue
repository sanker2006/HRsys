<template>
  <div class="batch-eval-page">
    <van-nav-bar
      :title="pageTitle"
      left-arrow
      @click-left="router.back()"
      class="nav-bar"
    />

    <div class="summary-card">
      <div>
        <div class="summary-title">{{ pageTitle }}</div>
        <div class="summary-desc">共 {{ relations.length }} 人，{{ editableRelations.length }} 人可评分</div>
      </div>
      <div class="summary-count">{{ completedCount }}/{{ relations.length }}</div>
    </div>

    <div class="person-list">
      <div v-for="r in relations" :key="r.id" class="person-card" :class="{ done: r.status === 'completed' }">
        <div class="person-head">
          <div class="avatar">{{ r.target_name?.charAt(0) || '?' }}</div>
          <div class="person-info">
            <div class="person-name">{{ r.target_name }}</div>
            <div class="person-meta">{{ r.target_department }} · {{ r.target_position }}</div>
          </div>
          <span class="status-pill" :class="r.status">{{ statusText(r.status) }}</span>
        </div>

        <div class="score-row">
          <span class="score-num">{{ scores[r.id] ?? 0 }}</span>
          <span class="score-unit">分</span>
        </div>

        <van-slider
          v-model="scores[r.id]"
          :min="0"
          :max="100"
          :step="1"
          :disabled="r.status === 'completed'"
          active-color="#2c5282"
          inactive-color="rgba(44,82,130,0.15)"
        />

        <div class="range-row">
          <span>0</span>
          <span>100</span>
        </div>
      </div>
    </div>

    <van-empty v-if="!loading && relations.length === 0" description="暂无可评分对象" />

    <div class="actions" v-if="editableRelations.length > 0">
      <van-button type="default" size="large" class="btn-draft" :loading="drafting" @click="saveBatch(true)">
        保存草稿
      </van-button>
      <van-button type="primary" size="large" class="btn-submit" :loading="submitting" @click="showConfirm = true">
        提交评分
      </van-button>
    </div>

    <van-dialog
      v-model:show="showConfirm"
      title="确认提交"
      :message="`将一次性提交 ${editableRelations.length} 条${pageTitle}评分，提交后会标记为已完成。`"
      show-cancel-button
      confirm-button-text="确认提交"
      cancel-button-text="取消"
      @confirm="saveBatch(false)"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { closeToast, showLoadingToast, showToast } from 'vant'
import { h5Api } from '../api'

const props = defineProps<{ batchId: string; type: string }>()
const router = useRouter()

const loading = ref(false)
const drafting = ref(false)
const submitting = ref(false)
const showConfirm = ref(false)
const relations = ref<any[]>([])
const scores = reactive<Record<number, number>>({})

const pageTitle = computed(() => props.type === 'downward' ? '向下评价' : '同层互评')
const editableRelations = computed(() => relations.value.filter(r => r.status !== 'completed'))
const completedCount = computed(() => relations.value.filter(r => r.status === 'completed').length)

function statusText(status: string) {
  if (status === 'completed') return '已完成'
  if (status === 'draft') return '草稿'
  return '待评'
}

async function loadBatchEval() {
  loading.value = true
  try {
    const res: any = await h5Api.getMyRelations(parseInt(props.batchId))
    relations.value = (res.data?.list || []).filter((r: any) => r.eval_type === props.type)

    await Promise.all(relations.value.map(async (r: any) => {
      const detail: any = await h5Api.getRelationDetail(r.id)
      const total = (detail.data?.answers || []).find((a: any) => a.is_total)
      scores[r.id] = total?.score ?? 0
    }))
  } finally {
    loading.value = false
  }
}

async function saveBatch(draft: boolean) {
  if (drafting.value || submitting.value) return
  if (draft) drafting.value = true
  else submitting.value = true

  try {
    const targets = editableRelations.value
    if (targets.length === 0) {
      showToast('没有需要提交的评分')
      return
    }

    showLoadingToast({ message: draft ? '保存中...' : '提交中...', forbidClick: true })
    await Promise.all(targets.map(r => h5Api.submitTotal({
      relation_id: r.id,
      score: scores[r.id] ?? 0,
      draft,
    })))
    closeToast()
    showToast(draft ? '草稿已保存' : '提交成功')

    if (draft) {
      await loadBatchEval()
    } else {
      router.back()
    }
  } finally {
    drafting.value = false
    submitting.value = false
  }
}

onMounted(async () => {
  showLoadingToast({ message: '加载中...', forbidClick: true })
  try {
    await loadBatchEval()
  } finally {
    closeToast()
  }
})
</script>

<style scoped>
.batch-eval-page {
  min-height: 100dvh;
  background: #f5f7fa;
  padding-bottom: 96px;
}
.nav-bar {
  background: #fff;
  position: sticky;
  top: 0;
  z-index: 10;
}
.summary-card {
  margin: 12px 16px;
  padding: 16px;
  border-radius: 14px;
  background: linear-gradient(135deg, #1a3a6b, #2c5282);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: space-between;
  box-shadow: 0 4px 16px rgba(26, 54, 93, 0.24);
}
.summary-title { font-size: 18px; font-weight: 700; margin-bottom: 4px; }
.summary-desc { font-size: 12px; opacity: 0.72; }
.summary-count { font-size: 22px; font-weight: 800; }
.person-list { padding: 0 16px; }
.person-card {
  background: #fff;
  border-radius: 14px;
  padding: 16px;
  margin-bottom: 12px;
  box-shadow: 0 2px 10px rgba(0,0,0,0.05);
}
.person-card.done { opacity: 0.72; }
.person-head {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
}
.avatar {
  width: 42px;
  height: 42px;
  border-radius: 50%;
  background: rgba(44,82,130,0.1);
  color: #2c5282;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  font-weight: 700;
  flex-shrink: 0;
}
.person-info { flex: 1; min-width: 0; }
.person-name { font-size: 16px; font-weight: 700; color: #1a2332; margin-bottom: 3px; }
.person-meta { font-size: 12px; color: #8a96a6; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.status-pill {
  font-size: 12px;
  padding: 3px 8px;
  border-radius: 20px;
  flex-shrink: 0;
}
.status-pill.completed { color: #07c160; background: rgba(7,193,96,0.1); }
.status-pill.draft { color: #2c5282; background: rgba(44,82,130,0.08); }
.status-pill.pending { color: #b88a1e; background: rgba(232,191,90,0.12); }
.score-row {
  display: flex;
  align-items: baseline;
  justify-content: center;
  margin-bottom: 12px;
}
.score-num { font-size: 44px; line-height: 1; font-weight: 800; color: #1a365d; }
.score-unit { font-size: 14px; color: #8a96a6; margin-left: 3px; }
.range-row {
  display: flex;
  justify-content: space-between;
  color: #b0bec5;
  font-size: 11px;
  margin-top: 8px;
}
.actions {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  gap: 12px;
  padding: 16px;
  padding-bottom: calc(16px + env(safe-area-inset-bottom));
  background: #fff;
  box-shadow: 0 -2px 12px rgba(0,0,0,0.08);
}
.btn-draft {
  flex: 1;
  border-radius: 22px;
  border: 1.5px solid #2c5282;
  color: #2c5282;
  font-weight: 600;
  height: 48px;
}
.btn-submit {
  flex: 1;
  border-radius: 22px;
  background: linear-gradient(135deg, #1a3a6b, #2c5282) !important;
  border: none;
  font-weight: 600;
  height: 48px;
  box-shadow: 0 4px 12px rgba(44,82,130,0.35);
}
</style>
