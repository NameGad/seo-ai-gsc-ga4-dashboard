<script setup>
import { computed, ref } from 'vue';
import { Maximize2, Minimize2 } from '@lucide/vue';
import { useI18n } from '../i18n';

const props = defineProps({
  rows: {
    type: Array,
    default: () => []
  },
  columns: {
    type: Array,
    required: true
  },
  numericColumns: {
    type: Array,
    default: () => ['Clicks', 'Impressions', 'CTR', 'Position']
  }
});

const expanded = ref(false);
const {t, tv} = useI18n();
const longTextColumns = new Set([
  'Page',
  'Top Page',
  'Competing Pages',
  'Query',
  'Best Query',
  'Reason',
  'Action',
  'Current',
  'Value'
]);

const canExpand = computed(() => props.rows.length > 0);

function cellClass(column) {
  return {
    num: props.numericColumns.includes(column),
    'text-cell': !props.numericColumns.includes(column),
    'long-cell': longTextColumns.has(column),
    [`col-${column.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`]: true
  };
}

function displayValue(value) {
  return value == null ? '' : tv(value);
}
</script>

<template>
  <div class="table-shell" :class="{ expanded }">
    <div v-if="canExpand" class="table-actions">
      <button type="button" class="table-expand" @click="expanded = !expanded">
        <Minimize2 v-if="expanded" />
        <Maximize2 v-else />
        <span>{{ expanded ? t('table.compact') : t('table.expand') }}</span>
      </button>
    </div>
    <div v-if="rows.length === 0" class="empty">{{ t('table.noData') }}</div>
    <div v-else class="table-wrap">
      <table>
        <thead>
          <tr>
            <th v-for="column in columns" :key="column">{{ t(`col.${column}`, column) }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(row, index) in rows" :key="index">
            <td
              v-for="column in columns"
              :key="column"
              :class="cellClass(column)"
              :title="displayValue(row[column])"
            >
              <span>{{ displayValue(row[column]) }}</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
