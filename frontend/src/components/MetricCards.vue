<script setup>
import { Eye, MapPin, MousePointerClick, Target } from '@lucide/vue';

defineProps({
  metrics: {
    type: Object,
    required: true
  }
});

const cards = [
  { key: 'clicks', label: 'Total Clicks', icon: MousePointerClick, accent: '#2563eb' },
  { key: 'impressions', label: 'Total Impressions', icon: Eye, accent: '#0f766e' },
  { key: 'ctr', label: 'CTR', icon: Target, accent: '#b45309' },
  { key: 'position', label: 'Avg Position', icon: MapPin, accent: '#be123c' }
];
</script>

<template>
  <section class="metrics" aria-label="Metrics">
    <article v-for="card in cards" :key="card.key" class="metric" :style="{ '--accent': card.accent }">
      <div class="metric-head">
        <span>{{ card.label }}</span>
        <span class="metric-icon">
          <component :is="card.icon" />
        </span>
      </div>
      <div class="metric-value">{{ metrics[card.key] }}</div>
    </article>
  </section>
</template>
