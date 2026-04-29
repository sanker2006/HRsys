<template>
  <div class="login-page">
    <!-- 顶部品牌区 -->
    <div class="top-brand">
      <div class="brand-icon">
        <svg width="48" height="48" viewBox="0 0 56 56" fill="none">
          <path d="M28 4L49.2 16V40L28 52L6.8 40V16L28 4Z" fill="rgba(44,82,130,0.08)" stroke="#2c5282" stroke-width="1.5"/>
          <circle cx="28" cy="20" r="6" fill="#2c5282" opacity="0.9"/>
          <path d="M18 42c0-5.5 4.5-10 10-10s10 4.5 10 10" fill="#2c5282" opacity="0.9"/>
          <path d="M10 28C10 18 18.5 10 28 10" stroke="rgba(44,82,130,0.3)" stroke-width="1.5" stroke-linecap="round"/>
          <path d="M46 28C46 38 37.5 46 28 46" stroke="rgba(44,82,130,0.3)" stroke-width="1.5" stroke-linecap="round"/>
        </svg>
      </div>
      <h1 class="brand-title">HR-360</h1>
      <p class="brand-sub">360° 绩效评价系统</p>
    </div>

    <!-- 表单卡片 -->
    <div class="login-card">
      <div class="card-header">
        <h2>欢迎回来</h2>
        <p>请输入您的账号信息登录</p>
      </div>

      <van-form @submit="handleLogin">
        <div class="form-field">
          <label class="field-label">手机号</label>
          <van-field
            v-model="form.phone"
            placeholder="请输入手机号"
            type="tel"
            :border="false"
            :rules="[{ required: true, message: '请输入手机号' }]"
            class="custom-field"
          />
        </div>

        <div class="form-field">
          <label class="field-label">证件后四位</label>
          <van-field
            v-model="form.idCardTail"
            placeholder="请输入身份证后4位"
            maxlength="4"
            :border="false"
            :rules="[
              { required: true, message: '请输入证件后四位' },
              { pattern: /^\d{4}$/, message: '仅限4位数字' }
            ]"
            class="custom-field"
          />
        </div>

        <div class="login-btn-wrap">
          <van-button
            type="primary"
            round
            block
            native-type="submit"
            :loading="loading"
            class="login-btn"
          >
            登 录
          </van-button>
        </div>
      </van-form>
    </div>

    <!-- 底部 -->
    <div class="login-footer">
      <p>登录即表示同意平台服务协议</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { showToast } from 'vant'
import { h5Api } from '../api'

const router = useRouter()
const loading = ref(false)
const form = reactive({ phone: '', idCardTail: '' })

async function handleLogin() {
  if (!form.phone || !form.idCardTail) {
    showToast('请填写完整信息')
    return
  }
  if (!/^\d{4}$/.test(form.idCardTail)) {
    showToast('证件后四位仅限4位数字')
    return
  }
  loading.value = true
  try {
    const res: any = await h5Api.login(form.phone, form.idCardTail)
    if (res.code === 0) {
      localStorage.setItem('h5_token', res.data.token)
      router.replace('/home')
    }
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.login-page {
  min-height: 100dvh;
  background: #f0f4f8;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: calc(env(safe-area-inset-top) + 24px) 24px calc(env(safe-area-inset-bottom) + 24px);
  box-sizing: border-box;
}

/* 顶部品牌 */
.top-brand {
  text-align: center;
  color: #1a2332;
  margin-bottom: 32px;
}
.brand-icon {
  margin-bottom: 12px;
}
.brand-title {
  font-size: 28px;
  font-weight: 800;
  color: #1a365d;
  margin: 0 0 6px;
  letter-spacing: 3px;
}
.brand-sub {
  font-size: 13px;
  color: #8a96a6;
  margin: 0;
  letter-spacing: 1px;
}

/* 表单卡片 */
.login-card {
  width: 100%;
  max-width: 340px;
  background: #fff;
  border-radius: 20px;
  padding: 28px 24px 24px;
  box-shadow:
    0 4px 24px rgba(44, 82, 130, 0.1),
    0 1px 4px rgba(0, 0, 0, 0.06);
}

.card-header {
  margin-bottom: 24px;
}
.card-header h2 {
  font-size: 20px;
  font-weight: 700;
  color: #1a2332;
  margin: 0 0 6px;
}
.card-header p {
  font-size: 13px;
  color: #8a96a6;
  margin: 0;
}

.form-field {
  margin-bottom: 16px;
}
.field-label {
  font-size: 14px;
  font-weight: 600;
  color: #1a2332;
  margin-bottom: 8px;
  display: block;
}
.custom-field {
  background: #f5f7fa;
  border-radius: 10px;
  border: 1.5px solid transparent;
  padding: 0 14px;
  transition: border-color 0.2s ease, background 0.2s ease;
}
.custom-field:focus-within {
  border-color: #2c5282;
  background: #fff;
}
.custom-field :deep(.van-field__control) {
  color: #1a2332;
  font-size: 16px;
}
.custom-field :deep(.van-field__control::placeholder) {
  color: #b0bec5;
  font-size: 14px;
}
.custom-field :deep(.van-field__body) {
  height: 46px;
}

.login-btn-wrap {
  margin-top: 24px;
}
.login-btn {
  height: 48px;
  font-size: 16px;
  font-weight: 600;
  letter-spacing: 2px;
  background: linear-gradient(135deg, #1a3a6b 0%, #2c5282 100%) !important;
  border: none !important;
  box-shadow: 0 4px 16px rgba(44, 82, 130, 0.35);
  transition: all 0.2s ease;
}
.login-btn:hover {
  transform: translateY(-1px);
  box-shadow: 0 6px 20px rgba(44, 82, 130, 0.45);
}

/* 底部 */
.login-footer {
  margin-top: 24px;
  text-align: center;
}
.login-footer p {
  font-size: 11px;
  color: #b0bec5;
  margin: 0;
}
</style>
