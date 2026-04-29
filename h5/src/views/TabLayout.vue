<template>
  <div class="tab-layout">
    <div class="page-content">
      <router-view v-slot="{ Component }">
        <transition :name="transitionName" mode="out-in">
          <component :is="Component" :key="route.path" />
        </transition>
      </router-view>
    </div>

    <van-tabbar
      v-model="active"
      route
      :height="60"
      placeholder
      class="tab-bar"
    >
      <van-tabbar-item to="/home" class="tab-item">
        <template #icon>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
            <polyline points="9 22 9 12 15 12 15 22"/>
          </svg>
        </template>
        首页
      </van-tabbar-item>

      <van-tabbar-item to="/my" class="tab-item">
        <template #icon>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
            <polyline points="14 2 14 8 20 8"/>
            <line x1="16" y1="13" x2="8" y2="13"/>
            <line x1="16" y1="17" x2="8" y2="17"/>
            <polyline points="10 9 9 9 8 9"/>
          </svg>
        </template>
        我的评价
      </van-tabbar-item>
    </van-tabbar>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { useRoute } from 'vue-router'

const route = useRoute()
const active = ref(0)
const transitionName = ref('slide-left')

watch(() => route.path, (p) => {
  active.value = p.startsWith('/my') ? 1 : 0
}, { immediate: true })
</script>

<style scoped>
.tab-layout {
  min-height: 100dvh;
  background: #f5f7fa;
}
.page-content {
  padding-bottom: 72px;
  min-height: 100dvh;
}

/* 转场动画 */
.slide-left-enter-active,
.slide-left-leave-active,
.slide-right-enter-active,
.slide-right-leave-active {
  transition: all 0.22s ease;
}
.slide-left-enter-from {
  opacity: 0;
  transform: translateX(20px);
}
.slide-left-leave-to {
  opacity: 0;
  transform: translateX(-20px);
}
.slide-right-enter-from {
  opacity: 0;
  transform: translateX(-20px);
}
.slide-right-leave-to {
  opacity: 0;
  transform: translateX(20px);
}

/* TabBar */
.tab-bar {
  --van-tabbar-item-active-color: #2c5282;
  --van-tabbar-item-inactive-color: #9aa5b4;
  box-shadow: 0 -1px 16px rgba(0, 0, 0, 0.06);
}
.tab-bar :deep(.van-tabbar-item__icon svg) {
  transition: transform 0.2s ease;
}
.tab-bar :deep(.van-tabbar-item--active .van-tabbar-item__icon svg) {
  transform: scale(1.1);
}
.tab-item {
  font-size: 11px;
}
</style>
