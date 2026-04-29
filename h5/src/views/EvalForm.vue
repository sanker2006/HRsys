<template>
  <div class="eval-form-page">
    <van-nav-bar
      :title="targetName"
      left-arrow
      @click-left="router.back()"
      class="nav-bar"
    />

    <!-- 已完成遮罩 -->
    <div v-if="isCompleted" class="completed-banner">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
        <polyline points="22 4 12 14.01 9 11.01"/>
      </svg>
      <span>您已完成本次评价</span>
    </div>

    <!-- 自评顶部汇总卡 -->
    <div v-if="isSelf && !isCompleted" class="score-summary">
      <div class="summary-left">
        <div class="summary-label">当前得分</div>
        <div class="summary-value">
          <span class="current">{{ currentTotal }}</span>
          <span class="max">/{{ maxTotal }}</span>
        </div>
      </div>
      <div class="summary-right">
        <van-progress
          :percentage="maxTotal ? Math.round((currentTotal/maxTotal)*100) : 0"
          :color="currentTotal >= maxTotal ? '#07c160' : '#2c5282'"
          :track-color="'rgba(255,255,255,0.25)'"
          :pivot-color="currentTotal >= maxTotal ? '#07c160' : '#2c5282'"
          style="width: 80px"
        />
        <span class="summary-hint">{{ answeredCount }}/{{ questions.length }} 题</span>
      </div>
    </div>

    <!-- 进度条 -->
    <div v-if="isSelf && !isCompleted && questions.length > 0" class="progress-bar">
      <div class="progress-track">
        <div
          class="progress-fill"
          :style="{ width: Math.round((answeredCount / questions.length) * 100) + '%' }"
        />
      </div>
      <span class="progress-label">{{ answeredCount }}/{{ questions.length }} 题已完成</span>
    </div>

    <!-- 自评：逐题打分 -->
    <div v-if="isSelf && !isCompleted" class="self-form">
      <div v-for="(q, idx) in questions" :key="q.seq" class="question-card">
        <div class="question-header">
          <div class="question-num">{{ String(idx + 1).padStart(2, '0') }}</div>
          <span class="weight-tag">满分 {{ q.weight || 0 }} 分</span>
        </div>
        <div class="question-text">{{ q.content }}</div>
        <div class="slider-area">
          <div class="score-display">{{ answers[q.seq] ?? 0 }}<span class="unit">分</span></div>
          <van-slider
            v-model="answers[q.seq]"
            :min="0"
            :max="(q.weight || 0)"
            :step="1"
            :active-color="'#2c5282'"
            :inactive-color="'rgba(44,82,130,0.15)'"
            :track-color="'rgba(44,82,130,0.15)'"
            :pivot-color="'#2c5282'"
          />
          <div class="slider-range">
            <span>0</span>
            <span>{{ q.weight || 0 }}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- 自评只读 -->
    <div v-else-if="isSelf && isCompleted" class="self-form readonly">
      <div class="score-summary-done">
        <div class="summary-big">{{ currentTotal }}<span class="unit">分</span></div>
        <div class="summary-max-hint">满分 {{ maxTotal }} 分</div>
      </div>
      <div v-for="(q, idx) in questions" :key="q.seq" class="question-card">
        <div class="question-header">
          <div class="question-num readonly-num">{{ String(idx + 1).padStart(2, '0') }}</div>
          <span class="weight-tag">满分 {{ q.weight || 0 }} 分</span>
        </div>
        <div class="question-text">{{ q.content }}</div>
        <div class="readonly-score-row">
          <span class="readonly-score-val">{{ answers[q.seq] ?? 0 }}</span>
          <span class="readonly-score-unit">分</span>
        </div>
      </div>
    </div>

    <!-- 互评总分 -->
    <div v-else-if="!isSelf && !isCompleted" class="total-form">
      <div class="total-card">
        <div class="total-eval-target">
          <div class="target-label">为 <strong>{{ targetName }}</strong> 打分</div>
        </div>
        <div class="total-score-area">
          <div class="total-num">{{ totalScore }}<span class="total-unit">分</span></div>
          <van-slider
            v-model="totalScore"
            :min="0"
            :max="100"
            :step="1"
            :active-color="'#2c5282'"
            :inactive-color="'rgba(44,82,130,0.15)'"
            :track-color="'rgba(44,82,130,0.15)'"
            :pivot-color="'#2c5282'"
            @update:model-value="onScoreChange"
          />
          <div class="total-range">0 ~ 100 分</div>
        </div>
        <div class="score-guide">
          <div class="guide-item" :class="{ active: totalScore < 40 }"><div class="guide-bar poor" /><span>待改进</span></div>
          <div class="guide-item" :class="{ active: totalScore >= 40 && totalScore < 70 }"><div class="guide-bar ok" /><span>合格</span></div>
          <div class="guide-item" :class="{ active: totalScore >= 70 && totalScore < 90 }"><div class="guide-bar good" /><span>良好</span></div>
          <div class="guide-item" :class="{ active: totalScore >= 90 }"><div class="guide-bar excellent" /><span>优秀</span></div>
        </div>
      </div>
    </div>

    <!-- 互评只读 -->
    <div v-else class="total-form readonly">
      <div class="total-card">
        <div class="total-eval-target">
          <div class="target-label">综合评分</div>
        </div>
        <div class="total-score-area done">
          <div class="total-num done">{{ totalScore }}<span class="total-unit">分</span></div>
        </div>
      </div>
    </div>

    <!-- 底部按钮 -->
    <div class="actions" v-if="!isCompleted">
      <van-button type="default" size="large" @click="handleDraft" :loading="drafting" class="btn-draft">
        暂存草稿
      </van-button>
      <van-button type="primary" size="large" @click="handleSubmit" :loading="submitting" class="btn-submit">
        提交评价
      </van-button>
    </div>

    <van-dialog
      v-model:show="showConfirm"
      title="确认提交"
      :message="confirmMsg"
      show-cancel-button
      confirm-button-text="确认提交"
      cancel-button-text="取消"
      @confirm="doSubmit"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, reactive } from 'vue'
import { useRouter } from 'vue-router'
import { showToast, showLoadingToast, closeToast } from 'vant'
import { h5Api } from '../api'

const props = defineProps<{ relationId: string }>()
const router = useRouter()

const drafting = ref(false)
const submitting = ref(false)
const relation = ref<any>(null)
const questions = ref<any[]>([])
const answers = reactive<Record<string, number>>({})
const totalScore = ref(0)
const showConfirm = ref(false)

const isSelf = computed(() => relation.value?.eval_type === 'self')
const targetName = computed(() => relation.value?.target_name || '评价')
const isCompleted = computed(() => relation.value?.status === 'completed')
const answeredCount = computed(() =>
  questions.value.filter(q => answers[q.seq] !== undefined).length
)
const currentTotal = computed(() =>
  Object.values(answers).reduce((s, v) => s + (v || 0), 0)
)
const maxTotal = computed(() =>
  questions.value.reduce((s, q) => s + (q.weight || 0), 0)
)

const confirmMsg = computed(() => {
  if (isSelf.value) {
    return `您的自评总分为 ${currentTotal.value} 分，确认提交？`
  }
  return `您对 ${targetName.value} 的评分为 ${totalScore.value} 分，确认提交？`
})

function onScoreChange(v: number) {
  totalScore.value = v
}

async function handleDraft() { await submitForm(true) }
async function handleSubmit() { showConfirm.value = true }

async function submitForm(draft: boolean) {
  if (drafting.value || submitting.value) return
  if (draft) drafting.value = true
  else submitting.value = true

  try {
    if (isSelf.value) {
      const ans = Object.entries(answers).map(([seq, score]) => ({
        seq: parseInt(seq),
        score: score || 0,
      }))
      if (!draft && ans.length === 0) {
        showToast('请先打分')
        return
      }
      if (!draft) {
        const missing = questions.value.filter(q => answers[q.seq] === undefined)
        if (missing.length > 0) {
          showToast(`请完成所有题目（还差 ${missing.length} 题）`)
          return
        }
      }
      showLoadingToast({ message: draft ? '保存中...' : '提交中...', forbidClick: true })
      await h5Api.submitSelf({ relation_id: parseInt(props.relationId), answers: ans, draft })
      closeToast()
      showToast(draft ? '草稿已保存' : '提交成功')
      if (!draft) router.back()
    } else {
      showLoadingToast({ message: draft ? '保存中...' : '提交中...', forbidClick: true })
      await h5Api.submitTotal({ relation_id: parseInt(props.relationId), score: totalScore.value, draft })
      closeToast()
      showToast(draft ? '草稿已保存' : '提交成功')
      if (!draft) router.back()
    }
  } finally {
    drafting.value = false
    submitting.value = false
  }
}

async function doSubmit() { await submitForm(false) }

onMounted(async () => {
  showLoadingToast({ message: '加载中...', forbidClick: true })
  try {
    const res: any = await h5Api.getRelationDetail(parseInt(props.relationId))
    relation.value = res.data?.relation
    questions.value = res.data?.questions || []
    const existing = res.data?.answers || []
    if (existing.length > 0) {
      if (isSelf.value) {
        existing.filter((a: any) => !a.is_total && a.question_seq).forEach((a: any) => {
          answers[a.question_seq] = a.score || 0
        })
      } else {
        const total = existing.find((a: any) => a.is_total)
        if (total?.score !== undefined) totalScore.value = total.score
      }
    }
  } finally {
    closeToast()
  }
})
</script>

<style scoped>
.eval-form-page {
  min-height: 100dvh;
  background: #f5f7fa;
  padding-bottom: 100px;
}
.nav-bar {
  background: #fff;
  position: sticky;
  top: 0;
  z-index: 10;
  --van-nav-bar-title-font-size: 16px;
}
.completed-banner {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  margin: 12px 16px 0;
  padding: 12px 16px;
  background: linear-gradient(135deg, #f0f9eb, #e8f5e9);
  border: 1px solid #c8e6c9;
  border-radius: 12px;
  color: #07c160;
  font-size: 14px;
  font-weight: 500;
}
.score-summary {
  margin: 12px 16px;
  padding: 16px 20px;
  background: linear-gradient(135deg, #1a3a6b 0%, #2c5282 100%);
  border-radius: 14px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  color: #fff;
  box-shadow: 0 4px 16px rgba(26, 54, 93, 0.3);
}
.summary-label { font-size: 12px; opacity: 0.7; margin-bottom: 4px; }
.summary-value { font-size: 32px; font-weight: 700; line-height: 1; }
.current { color: #fff; }
.max { font-size: 16px; opacity: 0.6; }
.summary-right { display: flex; flex-direction: column; align-items: flex-end; gap: 6px; }
.summary-hint { font-size: 11px; opacity: 0.65; }
.progress-bar {
  padding: 0 16px 12px;
  background: #fff;
}
.progress-track {
  height: 4px;
  background: rgba(44,82,130,0.12);
  border-radius: 4px;
  overflow: hidden;
  margin-bottom: 6px;
}
.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, #2c5282, #4a8fd4);
  border-radius: 4px;
  transition: width 0.3s ease;
}
.progress-label { font-size: 12px; color: #8a96a6; }
.self-form { padding: 0 16px; }
.question-card {
  background: #fff;
  border-radius: 14px;
  padding: 18px 16px;
  margin-bottom: 12px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.05);
}
.question-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
}
.question-num {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: linear-gradient(135deg, #1a3a6b, #2c5282);
  color: #fff;
  font-size: 13px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.readonly-num {
  background: linear-gradient(135deg, #8a96a6, #b0bec5);
}
.weight-tag {
  font-size: 12px;
  color: #8a96a6;
  background: #f5f7fa;
  padding: 2px 8px;
  border-radius: 20px;
}
.question-text {
  font-size: 15px;
  color: #1a2332;
  line-height: 1.6;
  margin-bottom: 16px;
}
.slider-area {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
}
.score-display {
  font-size: 36px;
  font-weight: 700;
  color: #1a365d;
  line-height: 1;
}
.unit { font-size: 14px; font-weight: 400; color: #8a96a6; margin-left: 2px; }
.slider-range {
  width: 100%;
  display: flex;
  justify-content: space-between;
  font-size: 11px;
  color: #b0bec5;
}
.readonly-score-row {
  display: flex;
  align-items: baseline;
  justify-content: center;
  gap: 4px;
  padding-top: 8px;
}
.readonly-score-val { font-size: 28px; font-weight: 700; color: #1a365d; }
.readonly-score-unit { font-size: 14px; color: #8a96a6; }
.score-summary-done {
  background: linear-gradient(135deg, #1a3a6b 0%, #2c5282 100%);
  border-radius: 14px;
  padding: 24px;
  text-align: center;
  margin-bottom: 12px;
  color: #fff;
}
.summary-big { font-size: 48px; font-weight: 700; line-height: 1; }
.summary-max-hint { font-size: 13px; opacity: 0.6; margin-top: 4px; }
.total-form { padding: 16px; }
.total-card {
  background: #fff;
  border-radius: 16px;
  padding: 24px;
  box-shadow: 0 2px 12px rgba(0,0,0,0.06);
  text-align: center;
}
.total-eval-target { margin-bottom: 24px; }
.target-label { font-size: 15px; color: #5a6a7a; }
.target-label strong { color: #1a2332; font-size: 18px; }
.total-score-area {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 20px;
  margin-bottom: 24px;
}
.total-num { font-size: 64px; font-weight: 800; color: #1a365d; line-height: 1; }
.total-num.done { font-size: 48px; color: #2c5282; }
.total-unit { font-size: 20px; font-weight: 400; color: #8a96a6; }
.total-range { font-size: 13px; color: #b0bec5; }
.score-guide {
  display: flex;
  gap: 8px;
  padding: 16px 0 0;
  border-top: 1px solid #f0f2f5;
}
.guide-item {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
}
.guide-item span { font-size: 11px; color: #b0bec5; }
.guide-item.active span { color: #2c5282; font-weight: 600; }
.guide-bar { width: 100%; height: 4px; border-radius: 4px; background: #f0f2f5; transition: background 0.2s; }
.guide-item.active .poor { background: #e57373; }
.guide-item.active .ok { background: #ffb74d; }
.guide-item.active .good { background: #81c784; }
.guide-item.active .excellent { background: #4fc3f7; }
.actions {
  padding: 16px;
  padding-bottom: calc(16px + env(safe-area-inset-bottom));
  display: flex;
  gap: 12px;
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
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
