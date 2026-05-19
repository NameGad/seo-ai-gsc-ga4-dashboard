<script setup>
import { KeyRound, ListTree, RefreshCw } from '@lucide/vue';

const props = defineProps({
  modelValue: {
    type: Object,
    required: true
  },
  sites: {
    type: Array,
    default: () => []
  },
  busy: {
    type: Boolean,
    default: false
  }
});

const emit = defineEmits(['update:modelValue', 'auth', 'load-sites', 'load-data']);

function patch(values) {
  emit('update:modelValue', {
    ...props.modelValue,
    ...values
  });
}

function selectSite(event) {
  const siteUrl = event.target.value;
  patch({
    selectedSite: siteUrl,
    siteUrl: siteUrl || props.modelValue.siteUrl
  });
}
</script>

<template>
  <section class="toolbar" aria-label="Controls">
    <label>
      Site URL
      <input
        :value="modelValue.siteUrl"
        type="text"
        placeholder="https://www.example.com/ or sc-domain:example.com"
        autocomplete="off"
        @input="patch({ siteUrl: $event.target.value, selectedSite: '' })"
      >
    </label>

    <label>
      GSC Property
      <select :value="modelValue.selectedSite" @change="selectSite">
        <option value="">Manual input</option>
        <option v-for="site in sites" :key="site.siteUrl" :value="site.siteUrl">
          {{ site.siteUrl }} ({{ site.permissionLevel }})
        </option>
      </select>
    </label>

    <label>
      Start Date
      <input :value="modelValue.startDate" type="date" @input="patch({ startDate: $event.target.value })">
    </label>

    <label>
      End Date
      <input :value="modelValue.endDate" type="date" @input="patch({ endDate: $event.target.value })">
    </label>

    <button type="button" title="Google Auth" @click="emit('auth')">
      <KeyRound />
      <span>Auth</span>
    </button>
    <button type="button" title="Load Sites" :disabled="busy" @click="emit('load-sites')">
      <ListTree />
      <span>Sites</span>
    </button>
    <button type="button" class="primary" title="Load Data" :disabled="busy" @click="emit('load-data')">
      <RefreshCw :class="{ spinning: busy }" />
      <span>{{ busy ? 'Loading' : 'Load' }}</span>
    </button>
  </section>
</template>
