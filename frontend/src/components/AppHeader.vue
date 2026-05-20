<script setup>
import { Activity, CircleAlert, CircleCheck, LineChart, Moon, Sun } from '@lucide/vue';

const props = defineProps({
  activeProperty: {
    type: String,
    default: ''
  },
  status: {
    type: Object,
    required: true
  },
  themeMode: {
    type: String,
    default: 'light'
  }
});

const emit = defineEmits(['toggle-theme']);

const iconMap = {
  default: Activity,
  success: CircleCheck,
  error: CircleAlert
};
</script>

<template>
  <header class="topbar">
    <div class="brand">
      <div class="brand-mark" aria-hidden="true">
        <LineChart />
      </div>
      <div>
        <h1>GSC JS Dashboard</h1>
        <div class="subline">{{ props.activeProperty || 'No property selected' }}</div>
      </div>
    </div>

    <div class="topbar-actions">
      <button
        class="theme-toggle"
        type="button"
        :aria-label="props.themeMode === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'"
        :title="props.themeMode === 'dark' ? 'Light mode' : 'Dark mode'"
        @click="emit('toggle-theme')"
      >
        <Sun v-if="props.themeMode === 'dark'" />
        <Moon v-else />
        <span>{{ props.themeMode === 'dark' ? 'Light' : 'Dark' }}</span>
      </button>

      <div class="status" :class="props.status.type">
        <component :is="iconMap[props.status.type] || iconMap.default" />
        <span>{{ props.status.message }}</span>
      </div>
    </div>
  </header>
</template>
