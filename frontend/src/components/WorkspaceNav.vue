<script setup>
import { BarChart3, BrainCircuit, Database, LineChart, Radar } from '@lucide/vue';
import { useI18n } from '../i18n';

defineProps({
  active: {
    type: String,
    required: true
  },
  snapshotCount: {
    type: Number,
    default: 0
  }
});

const emit = defineEmits(['change']);
const {t} = useI18n();

const items = [
  { key: 'gsc', labelKey: 'nav.gsc', noteKey: 'nav.gscNote', icon: LineChart },
  { key: 'insights', labelKey: 'nav.insights', noteKey: 'nav.insightsNote', icon: Radar },
  { key: 'ga', labelKey: 'nav.ga', noteKey: 'nav.gaNote', icon: BarChart3 },
  { key: 'history', labelKey: 'nav.history', noteKey: 'nav.historyNote', icon: Database },
  { key: 'ai', labelKey: 'nav.ai', noteKey: 'nav.aiNote', icon: BrainCircuit }
];
</script>

<template>
  <nav class="workspace-nav" aria-label="Workspace modules">
    <button
      v-for="item in items"
      :key="item.key"
      type="button"
      class="nav-item"
      :class="{ active: active === item.key }"
      @click="emit('change', item.key)"
    >
      <component :is="item.icon" />
      <span>
        <strong>{{ t(item.labelKey) }}</strong>
        <small>{{ item.key === 'history' && snapshotCount ? t('nav.snapshots', '', {count: snapshotCount}) : t(item.noteKey) }}</small>
      </span>
    </button>
  </nav>
</template>
