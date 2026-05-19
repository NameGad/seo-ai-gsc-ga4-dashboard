<script setup>
defineProps({
  title: {
    type: String,
    required: true
  },
  meta: {
    type: String,
    default: ''
  },
  icon: {
    type: Object,
    default: null
  }
});
</script>

<template>
  <article class="panel">
    <div class="panel-head">
      <div class="panel-title">
        <component :is="icon" v-if="icon" />
        <span>{{ title }}</span>
      </div>
      <div v-if="meta" class="panel-meta">{{ meta }}</div>
    </div>
    <slot />
  </article>
</template>
