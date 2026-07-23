<template>
  <main class="change-page">
    <section class="change-panel">
      <h1>设置新密码</h1>
      <p>首次登录必须修改初始密码，完成后才能进入评价系统。</p>
      <van-form @submit="submit">
        <van-field
          v-model="form.newPassword"
          name="newPassword"
          label="新密码"
          type="password"
          maxlength="32"
          placeholder="8～32位，包含字母和数字"
          :rules="[{ required: true, message: '请输入新密码' }]"
        />
        <van-field
          v-model="form.confirmPassword"
          name="confirmPassword"
          label="确认密码"
          type="password"
          maxlength="32"
          placeholder="再次输入新密码"
          :rules="[{ required: true, message: '请再次输入新密码' }]"
        />
        <van-button block type="primary" native-type="submit" :loading="loading">确认修改</van-button>
      </van-form>
    </section>
  </main>
</template>

<script setup lang="ts">
import { reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { showToast } from 'vant'
import { h5Api } from '../api'

const router = useRouter()
const loading = ref(false)
const form = reactive({ newPassword: '', confirmPassword: '' })

async function submit() {
  if (form.newPassword !== form.confirmPassword) {
    showToast('两次输入的密码不一致')
    return
  }
  if (form.newPassword.length < 8 || !/[A-Za-z]/.test(form.newPassword) || !/\d/.test(form.newPassword)) {
    showToast('密码须为8～32位，并同时包含字母和数字')
    return
  }
  loading.value = true
  try {
    const res: any = await h5Api.changePassword(form.newPassword, form.confirmPassword)
    localStorage.setItem('h5_token', res.data.token)
    localStorage.removeItem('h5_must_change_password')
    showToast('密码修改成功')
    await router.replace('/home')
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.change-page {
  min-height: 100dvh;
  display: grid;
  place-items: center;
  box-sizing: border-box;
  padding: 24px;
  background: var(--hr-bg);
}

.change-panel {
  width: min(100%, 420px);
  padding: 24px;
  box-sizing: border-box;
  border: 1px solid var(--hr-border);
  border-radius: 8px;
  background: var(--hr-surface-raised);
  box-shadow: var(--hr-shadow-soft);
}

h1 { margin: 0 0 8px; font-size: 22px; color: var(--hr-text); }
p { margin: 0 0 22px; color: var(--hr-muted); font-size: 14px; line-height: 1.6; }
.van-form { display: grid; gap: 16px; }
.van-cell { border: 1px solid var(--hr-border); border-radius: 6px; }
.van-button { height: 48px; border-radius: 8px; font-weight: 800; }
</style>
