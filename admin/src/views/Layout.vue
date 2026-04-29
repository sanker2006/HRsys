<template>
  <el-container class="layout-container">
    <!-- 侧边栏 -->
    <el-aside width="220px" class="sidebar">
      <div class="logo">
        <div class="logo-icon">360</div>
        <span class="logo-text">HR管理端</span>
      </div>
      <el-menu
        :default-active="$route.path"
        router
        class="sidebar-menu"
        :collapse="false"
      >
        <el-menu-item index="/dashboard">
          <el-icon><DataAnalysis /></el-icon>
          <span>仪表盘</span>
        </el-menu-item>
        <el-menu-item index="/batch">
          <el-icon><List /></el-icon>
          <span>批次管理</span>
        </el-menu-item>
        <!-- 注意：评估矩阵/自评题目/评价关系/进度监控 需要先在批次管理中选择批次 -->
        <el-menu-item index="/user">
          <el-icon><User /></el-icon>
          <span>用户管理</span>
        </el-menu-item>
        <el-menu-item index="/department">
          <el-icon><OfficeBuilding /></el-icon>
          <span>部门管理</span>
        </el-menu-item>
      </el-menu>
    </el-aside>

    <!-- 主内容区 -->
    <el-container>
      <el-header class="header">
        <div class="header-left">
          <span class="page-title">{{ pageTitle }}</span>
        </div>
        <div class="header-right">
          <el-dropdown @command="handleCommand" trigger="click">
            <span class="user-info">
              <el-icon><Avatar /></el-icon>
              {{ userName }}
              <el-icon class="arrow"><ArrowDown /></el-icon>
            </span>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item command="profile">
                  <el-icon><User /></el-icon>个人信息
                </el-dropdown-item>
                <el-dropdown-item command="logout" divided>
                  <el-icon><SwitchButton /></el-icon>退出登录
                </el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>
      </el-header>

      <el-main class="main-content">
        <router-view />
      </el-main>
    </el-container>
  </el-container>
</template>

<script setup lang="ts">
import { computed, ref, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import {
  DataAnalysis, List, User, Avatar, ArrowDown, SwitchButton, OfficeBuilding
} from '@element-plus/icons-vue'
import { authApi } from '../api'

const router = useRouter()
const route = useRoute()
const userName = ref('管理员')

onMounted(async () => {
  try {
    const res: any = await authApi.me()
    userName.value = res.data?.name || '管理员'
  } catch {}
})

  const pageTitle = computed(() => {
  const map: Record<string, string> = {
    '/dashboard': '仪表盘',
    '/batch': '批次管理',
    '/user': '用户管理',
    '/department': '部门管理',
  }
  if (route.path.startsWith('/matrix')) return '评估矩阵配置'
  if (route.path.startsWith('/self-question')) return '自评题目导入'
  if (route.path.startsWith('/relation')) return '评价关系管理'
  if (route.path.startsWith('/progress')) return '进度监控'
  return map[route.path] || ''
})

function handleCommand(cmd: string) {
  if (cmd === 'logout') {
    localStorage.removeItem('admin_token')
    router.push('/login')
  }
}
</script>

<style scoped>
.layout-container {
  height: 100vh;
}

.sidebar {
  background: #304156;
  overflow-x: hidden;
}

.logo {
  height: 60px;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 20px;
  background: #263445;
  border-bottom: 1px solid #3d5166;
}

.logo-icon {
  width: 32px;
  height: 32px;
  border-radius: 6px;
  background: linear-gradient(135deg, #409EFF, #1976D2);
  color: #fff;
  font-size: 13px;
  font-weight: bold;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.logo-text {
  font-size: 15px;
  font-weight: 600;
  color: #fff;
  white-space: nowrap;
}

.sidebar-menu {
  border-right: none;
  background: transparent;
}

:deep(.el-menu-item) {
  color: #bfcbd9;
  height: 50px;
  line-height: 50px;
  margin: 4px 8px;
  border-radius: 6px;
}

:deep(.el-menu-item:hover) {
  background: #263445 !important;
  color: #fff;
}

:deep(.el-menu-item.is-active) {
  background: #409EFF !important;
  color: #fff !important;
}

:deep(.el-menu-item .el-icon) {
  margin-right: 8px;
  font-size: 16px;
}

.header {
  height: 60px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 24px;
  background: #fff;
  border-bottom: 1px solid #F0F2F5;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.05);
}

.header-left {
  display: flex;
  align-items: center;
}

.page-title {
  font-size: 16px;
  font-weight: 600;
  color: #303133;
}

.header-right {
  display: flex;
  align-items: center;
}

.user-info {
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  padding: 6px 12px;
  border-radius: 6px;
  color: #606266;
  font-size: 14px;
  transition: background 0.2s;
}

.user-info:hover {
  background: #F5F7FA;
}

.arrow {
  font-size: 12px;
  color: #909399;
}

.main-content {
  background: #F5F7FA;
  padding: 20px 24px;
  overflow-y: auto;
}
</style>
