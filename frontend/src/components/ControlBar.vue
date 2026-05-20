<script setup>
import { KeyRound, ListTree, RefreshCw } from '@lucide/vue';
import { useI18n } from '../i18n';

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
  },
  datePresets: {
    type: Array,
    default: () => []
  },
  activeDatePreset: {
    type: String,
    default: ''
  }
});

const emit = defineEmits(['update:modelValue', 'auth', 'load-sites', 'load-data', 'apply-date-preset']);
const {t} = useI18n();

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
      {{ t('control.siteUrl') }}
      <input
        :value="modelValue.siteUrl"
        type="text"
        placeholder="https://www.example.com/ or sc-domain:example.com"
        autocomplete="off"
        @input="patch({ siteUrl: $event.target.value, selectedSite: '' })"
      >
    </label>

    <label>
      {{ t('control.property') }}
      <select :value="modelValue.selectedSite" @change="selectSite">
        <option value="">{{ t('control.manual') }}</option>
        <option v-for="site in sites" :key="site.siteUrl" :value="site.siteUrl">
          {{ site.siteUrl }} ({{ site.permissionLevel }})
        </option>
      </select>
    </label>

    <label>
      {{ t('control.startDate') }}
      <input :value="modelValue.startDate" type="date" @input="patch({ startDate: $event.target.value })">
    </label>

    <label>
      {{ t('control.endDate') }}
      <input :value="modelValue.endDate" type="date" @input="patch({ endDate: $event.target.value })">
    </label>

    <button type="button" title="Google Auth" @click="emit('auth')">
      <KeyRound />
      <span>{{ t('control.auth') }}</span>
    </button>
    <button type="button" title="Load Sites" :disabled="busy" @click="emit('load-sites')">
      <ListTree />
      <span>{{ t('control.sites') }}</span>
    </button>
    <button type="button" class="primary" title="Load Data" :disabled="busy" @click="emit('load-data')">
      <RefreshCw :class="{ spinning: busy }" />
      <span>{{ busy ? t('control.loading') : t('control.load') }}</span>
    </button>

    <div class="date-presets" aria-label="Date presets">
      <span>{{ t('control.datePresets') }}</span>
      <div class="segmented-control compact">
        <button
          v-for="preset in datePresets"
          :key="preset.value"
          type="button"
          :class="{ active: activeDatePreset === preset.value }"
          @click="emit('apply-date-preset', preset.value)"
        >
          {{ t(preset.labelKey) }}
        </button>
      </div>
    </div>
  </section>
</template>
