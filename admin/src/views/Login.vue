<template>
  <div class="login-page">
    <div class="login-card">
      <div class="brand">
        <div class="brand-icon">360</div>
        <h1>HR-360</h1>
        <p>人事评价系统 · 管理端</p>
      </div>
      <el-form :model="form" @submit.prevent="handleLogin" size="large">
        <el-form-item>
          <el-input
            v-model="form.account"
            placeholder="请输入账号"
            :prefix-icon="UserIcon"
            clearable
          />
        </el-form-item>
        <el-form-item>
          <el-input
            v-model="form.password"
            type="password"
            placeholder="请输入密码"
            :prefix-icon="LockIcon"
            show-password
            @keyup.enter="handleLogin"
          />
        </el-form-item>
        <el-form-item style="margin-top: 28px">
          <el-button
            type="primary"
            style="width: 100%; height: 44px; font-size: 16px"
            :loading="loading"
            native-type="submit"
            @click="handleLogin"
          >
            登录
          </el-button>
        </el-form-item>
      </el-form>
    </div>
    <div class="login-footer">HR-360 人事评价系统 v1.0</div>
  </div>
</template>

<script setup lang="ts">
import { reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { User as UserIcon, Lock as LockIcon } from '@element-plus/icons-vue'
import { authApi } from '../api'

const router = useRouter()
const loading = ref(false)
const form = reactive({ account: '', password: '' })

async function handleLogin() {
  if (!form.account || !form.password) {
    ElMessage.warning('请输入账号和密码')
    return
  }
  loading.value = true
  try {
    const res: any = await authApi.login(form.account, form.password)
    if (res.code === 0) {
      localStorage.setItem('admin_token', res.data.token)
      router.push('/dashboard')
    } else {
      ElMessage.error(res.message || '登录失败')
    }
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.login-page {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: #F5F7FA;
}
.login-card {
  width: 400px;
  padding: 40px 36px;
  background: #fff;
  border-radius: 8px;
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.08);
}
.brand {
  text-align: center;
  margin-bottom: 32px;
}
.brand-icon {
  width: 56px;
  height: 56px;
  border-radius: 12px;
  background: linear-gradient(135deg, #409EFF 0%, #1976D2 100%);
  color: #fff;
  font-size: 20px;
  font-weight: bold;
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0 auto 12px;
}
.brand h1 {
  font-size: 24px;
  font-weight: 600;
  color: #303133;
  margin: 0 0 6px;
}
.brand p {
  font-size: 13px;
  color: #909399;
  margin: 0;
}
.login-footer {
  margin-top: 24px;
  font-size: 12px;
  color: #C0C4CC;
}
</style>
