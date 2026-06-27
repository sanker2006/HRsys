<template>
  <main class="intern-login">
    <section class="login-card">
      <p>Intern Attendance</p>
      <h1>实习生打卡</h1>
      <span>手机号 + 身份证后四位登录，账号独立于绩效评价系统。</span>
      <van-form class="form" @submit="login">
        <van-field v-model="phone" name="phone" type="tel" maxlength="11" label="手机号" placeholder="请输入手机号" />
        <van-field v-model="idCardTail" name="idCardTail" type="tel" maxlength="4" label="后四位" placeholder="身份证后四位" />
        <van-button block type="primary" native-type="submit" :loading="loading">登录打卡</van-button>
      </van-form>
    </section>
  </main>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { showToast } from 'vant'
import { internH5Api } from '../api'

const router = useRouter()
const phone = ref('')
const idCardTail = ref('')
const loading = ref(false)

async function login() {
  if (!/^1\d{10}$/.test(phone.value) || !/^\d{4}$/.test(idCardTail.value)) {
    showToast('请输入正确手机号和身份证后四位')
    return
  }
  loading.value = true
  try {
    const res: any = await internH5Api.login(phone.value, idCardTail.value)
    localStorage.setItem('intern_token', res.data.intern_token)
    localStorage.setItem('intern_profile', JSON.stringify(res.data.intern))
    router.replace('/intern/home')
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.intern-login {
  min-height: 100vh;
  display: grid;
  place-items: center;
  padding: 24px;
  background:
    linear-gradient(135deg, rgba(6, 95, 70, .18), transparent 42%),
    linear-gradient(180deg, #dbe8ef, #b8ccda);
}
.login-card {
  width: 100%;
  max-width: 420px;
  padding: 28px 22px;
  border: 1px solid rgba(148, 163, 184, .45);
  border-radius: 18px;
  background: rgba(245, 250, 252, .92);
  box-shadow: 0 24px 58px rgba(15, 23, 42, .18);
}
.login-card p { margin: 0 0 10px; color: #0f766e; font-size: 12px; font-weight: 900; letter-spacing: .1em; text-transform: uppercase; }
.login-card h1 { margin: 0 0 8px; color: #102033; font-size: 30px; }
.login-card span { color: #526779; line-height: 1.6; }
.form { margin-top: 24px; display: grid; gap: 14px; }
:deep(.van-cell) { border-radius: 12px; margin-bottom: 10px; background: #f8fbfd; }
</style>
