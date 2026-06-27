<template>
  <el-container class="layout-container">
    <el-aside width="248px" class="sidebar">
      <div class="brand">
        <div class="brand-mark">HR</div>
        <div>
          <div class="brand-title">HRsys</div>
          <div class="brand-sub">绩效评价控制台</div>
        </div>
      </div>

      <el-menu :default-active="$route.path" router class="sidebar-menu">
        <el-menu-item index="/dashboard">
          <el-icon><DataAnalysis /></el-icon>
          <span>运营总览</span>
        </el-menu-item>
        <el-menu-item index="/batch">
          <el-icon><List /></el-icon>
          <span>批次工作流</span>
        </el-menu-item>
        <el-menu-item index="/user">
          <el-icon><User /></el-icon>
          <span>人员与角色</span>
        </el-menu-item>
        <el-menu-item index="/department">
          <el-icon><OfficeBuilding /></el-icon>
          <span>部门管理</span>
        </el-menu-item>
        <el-menu-item index="/interns">
          <el-icon><User /></el-icon>
          <span>实习生管理</span>
        </el-menu-item>
        <el-menu-item index="/intern-attendance">
          <el-icon><DataAnalysis /></el-icon>
          <span>实习生打卡</span>
        </el-menu-item>
      </el-menu>

      <div class="sidebar-note">
        <strong>V2.1</strong>
        <span>配置、生成、监控按批次闭环执行。</span>
      </div>
    </el-aside>

    <el-container class="content-shell">
      <el-header class="topbar">
        <div class="topbar-title">
          <div class="crumb">HRsys / {{ pageTitle }}</div>
          <h1>{{ pageTitle }}</h1>
        </div>
        <div class="topbar-right">
          <el-tag effect="plain" round>V2.1</el-tag>
          <el-dropdown @command="handleCommand" trigger="click">
            <button class="user-pill" type="button" aria-label="打开用户菜单">
              <el-icon><Avatar /></el-icon>
              <span>{{ userName }}</span>
              <el-icon class="arrow"><ArrowDown /></el-icon>
            </button>
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
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  ArrowDown,
  Avatar,
  DataAnalysis,
  List,
  OfficeBuilding,
  SwitchButton,
  User,
} from '@element-plus/icons-vue'
import { authApi } from '../api'

const router = useRouter()
const route = useRoute()
const userName = ref('系统管理员')

onMounted(async () => {
  try {
    const res: any = await authApi.me()
    userName.value = res.data?.name || '系统管理员'
  } catch {}
})

const pageTitle = computed(() => {
  const map: Record<string, string> = {
    '/dashboard': '运营总览',
    '/batch': '批次工作流',
    '/user': '人员与角色',
    '/department': '部门管理',
    '/interns': '实习生管理',
    '/intern-attendance': '实习生打卡',
  }
  if (route.path.startsWith('/matrix')) return '评估矩阵'
  if (route.path.startsWith('/self-question')) return '题目模板'
  if (route.path.startsWith('/relation')) return '评价关系'
  if (route.path.startsWith('/progress')) return '进度监控'
  return map[route.path] || '控制台'
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
  background: var(--admin-bg);
}

.sidebar {
  display: flex;
  flex-direction: column;
  background:
    linear-gradient(180deg, rgba(15, 59, 95, 0.98), rgba(15, 35, 59, 0.98)),
    #0f253b;
  color: #fff;
  overflow: hidden;
}

.brand {
  height: 76px;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 0 22px;
  border-bottom: 1px solid rgba(255,255,255,.10);
}

.brand-mark {
  width: 40px;
  height: 40px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #38bdf8, #0369a1);
  font-size: 14px;
  font-weight: 900;
  letter-spacing: .4px;
  box-shadow: 0 10px 20px rgba(3,105,161,.28);
}

.brand-title { font-size: 18px; font-weight: 900; line-height: 1.2; }
.brand-sub { margin-top: 3px; color: rgba(255,255,255,.62); font-size: 12px; }

.sidebar-menu {
  flex: 1;
  padding: 12px 10px;
  border-right: none;
  background: transparent;
}

:deep(.el-menu-item) {
  height: 46px;
  margin: 4px 0;
  border-radius: 9px;
  color: rgba(255,255,255,.72);
  font-weight: 700;
}

:deep(.el-menu-item:hover) {
  background: rgba(255,255,255,.08) !important;
  color: #fff;
}

:deep(.el-menu-item.is-active) {
  background: rgba(56,189,248,.18) !important;
  color: #fff !important;
  box-shadow: inset 3px 0 0 #38bdf8;
}

.sidebar-note {
  margin: 14px;
  padding: 14px;
  border: 1px solid rgba(255,255,255,.12);
  border-radius: 12px;
  background: rgba(255,255,255,.06);
  display: grid;
  gap: 6px;
}

.sidebar-note strong { font-size: 14px; }
.sidebar-note span { color: rgba(255,255,255,.62); font-size: 12px; line-height: 1.5; }

.content-shell {
  min-width: 0;
  overflow: hidden;
}

.topbar {
  height: 76px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
  padding: 0 28px;
  background: rgba(255,255,255,.92);
  border-bottom: 1px solid rgba(223,231,241,.95);
  backdrop-filter: blur(12px);
}

.topbar-title h1 {
  margin: 3px 0 0;
  color: var(--admin-text);
  font-size: 22px;
  line-height: 1.2;
  font-weight: 900;
}

.crumb {
  color: var(--admin-muted);
  font-size: 12px;
  font-weight: 700;
}

.topbar-right {
  display: flex;
  align-items: center;
  gap: 12px;
}

.user-pill {
  min-height: 40px;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 0 13px;
  border: 1px solid var(--admin-border);
  border-radius: 999px;
  background: #fff;
  color: var(--admin-text);
  font-weight: 800;
  cursor: pointer;
}

.arrow { color: var(--admin-faint); }

.main-content {
  min-width: 0;
  padding: 22px 28px 56px;
  overflow-y: auto;
  overflow-x: hidden;
}
</style>
