<script setup>
import { BarChart3, BrainCircuit, Database, LineChart } from '@lucide/vue';

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

const items = [
  { key: 'gsc', label: 'GSC', note: 'Search performance', icon: LineChart },
  { key: 'ga', label: 'GA4', note: 'Traffic and events', icon: BarChart3 },
  { key: 'history', label: 'History', note: 'Local snapshots', icon: Database },
  { key: 'ai', label: 'AI', note: 'Analysis ready', icon: BrainCircuit }
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
        <strong>{{ item.label }}</strong>
        <small>{{ item.key === 'history' && snapshotCount ? `${snapshotCount} snapshots` : item.note }}</small>
      </span>
    </button>
  </nav>
</template>
