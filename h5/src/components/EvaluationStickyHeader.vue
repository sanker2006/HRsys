<template>
  <header class="evaluation-sticky-header">
    <van-nav-bar :title="title" left-arrow class="evaluation-nav" @click-left="$emit('back')" />
    <slot />
  </header>
</template>

<script setup lang="ts">
defineProps<{ title: string }>()
defineEmits<{ back: [] }>()
</script>

<style scoped>
.evaluation-sticky-header {
  position: sticky;
  top: 0;
  z-index: 55;
}

.evaluation-nav {
  height: 46px;
  background: #f6f9fc;
}
</style>
