<script setup>
import { Activity, CircleAlert, CircleCheck, LineChart } from '@lucide/vue';

const props = defineProps({
  activeProperty: {
    type: String,
    default: ''
  },
  status: {
    type: Object,
    required: true
  }
});

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

    <div class="status" :class="props.status.type">
      <component :is="iconMap[props.status.type] || iconMap.default" />
      <span>{{ props.status.message }}</span>
    </div>
  </header>
</template>
