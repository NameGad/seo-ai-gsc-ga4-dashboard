<script setup>
import { Activity, CircleAlert, CircleCheck, Languages, LineChart, Moon, Sun } from '@lucide/vue';
import { useI18n } from '../i18n';

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
const {locale, languageOptions, setLocale, t} = useI18n();

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
        <h1>{{ t('app.title') }}</h1>
        <div class="subline">{{ props.activeProperty || t('app.noProperty') }}</div>
      </div>
    </div>

    <div class="topbar-actions">
      <label class="language-toggle" :title="t('language.label')">
        <Languages />
        <select :value="locale" :aria-label="t('language.label')" @change="setLocale($event.target.value)">
          <option v-for="option in languageOptions" :key="option.value" :value="option.value">
            {{ option.label }}
          </option>
        </select>
      </label>

      <button
        class="theme-toggle"
        type="button"
        :aria-label="props.themeMode === 'dark' ? t('theme.lightMode') : t('theme.darkMode')"
        :title="props.themeMode === 'dark' ? t('theme.lightMode') : t('theme.darkMode')"
        @click="emit('toggle-theme')"
      >
        <Sun v-if="props.themeMode === 'dark'" />
        <Moon v-else />
        <span>{{ props.themeMode === 'dark' ? t('theme.light') : t('theme.dark') }}</span>
      </button>

      <div class="status" :class="props.status.type">
        <component :is="iconMap[props.status.type] || iconMap.default" />
        <span>{{ props.status.message }}</span>
      </div>
    </div>
  </header>
</template>
