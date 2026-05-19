<script setup>
defineProps({
  title: {
    type: String,
    required: true
  },
  eyebrow: {
    type: String,
    required: true
  },
  description: {
    type: String,
    required: true
  },
  bullets: {
    type: Array,
    default: () => []
  },
  icon: {
    type: Object,
    default: null
  }
});
</script>

<template>
  <section class="future-module">
    <div class="future-copy">
      <div class="eyebrow">{{ eyebrow }}</div>
      <h2>{{ title }}</h2>
      <p>{{ description }}</p>
      <div class="future-grid">
        <div v-for="bullet in bullets" :key="bullet.title" class="future-card">
          <strong>{{ bullet.title }}</strong>
          <span>{{ bullet.text }}</span>
        </div>
      </div>
    </div>
    <div class="future-visual" aria-hidden="true">
      <component :is="icon" v-if="icon" />
    </div>
  </section>
</template>
