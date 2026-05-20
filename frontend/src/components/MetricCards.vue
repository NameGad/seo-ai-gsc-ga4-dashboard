<script setup>
import { Eye, MapPin, MousePointerClick, Target } from '@lucide/vue';
import { useI18n } from '../i18n';

defineProps({
  metrics: {
    type: Object,
    required: true
  }
});

const cards = [
  { key: 'clicks', labelKey: 'metric.clicks', icon: MousePointerClick, accent: '#2563eb' },
  { key: 'impressions', labelKey: 'metric.impressions', icon: Eye, accent: '#0f766e' },
  { key: 'ctr', labelKey: 'metric.ctr', icon: Target, accent: '#b45309' },
  { key: 'position', labelKey: 'metric.position', icon: MapPin, accent: '#be123c' }
];

const {t} = useI18n();
</script>

<template>
  <section class="metrics" aria-label="Metrics">
    <article v-for="card in cards" :key="card.key" class="metric" :style="{ '--accent': card.accent }">
      <div class="metric-head">
        <span>{{ t(card.labelKey) }}</span>
        <span class="metric-icon">
          <component :is="card.icon" />
        </span>
      </div>
      <div class="metric-value">{{ metrics[card.key] }}</div>
    </article>
  </section>
</template>
