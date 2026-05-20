<script setup>
import { computed } from 'vue';
import { Database, FileJson, RefreshCw, TrendingUp } from '@lucide/vue';
import HistoryTrendChart from './HistoryTrendChart.vue';
import Panel from './Panel.vue';
import { useI18n } from '../i18n';

const props = defineProps({
  snapshots: {
    type: Array,
    default: () => []
  },
  trendRows: {
    type: Array,
    default: () => []
  },
  pageTypeRows: {
    type: Array,
    default: () => []
  },
  dbStats: {
    type: Object,
    default: null
  },
  busy: {
    type: Boolean,
    default: false
  },
  themeMode: {
    type: String,
    default: 'light'
  }
});

const emit = defineEmits(['refresh']);
const {t, tv} = useI18n();

const trendGroups = computed(() => {
  const groups = new Map();
  props.trendRows.forEach(row => {
    const rows = groups.get(row.siteUrl) || [];
    rows.push(row);
    groups.set(row.siteUrl, rows);
  });

  return [...groups.entries()]
    .map(([siteUrl, rows]) => ({
      siteUrl,
      rows: rows.slice().sort((a, b) => new Date(a.capturedAt) - new Date(b.capturedAt))
    }))
    .sort((a, b) => a.siteUrl.localeCompare(b.siteUrl));
});

const pageTypeGroups = computed(() => {
  const groups = new Map();
  props.pageTypeRows.forEach(row => {
    const key = `${row.siteUrl}::${row.pageType}`;
    const rows = groups.get(key) || [];
    rows.push(row);
    groups.set(key, rows);
  });

  return [...groups.entries()]
    .map(([key, rows]) => {
      const [siteUrl, pageType] = key.split('::');
      return {
        key,
        siteUrl,
        pageType,
        rows: rows.slice().sort((a, b) => new Date(a.capturedAt) - new Date(b.capturedAt))
      };
    })
    .sort((a, b) => {
      const siteCompare = a.siteUrl.localeCompare(b.siteUrl);
      if (siteCompare) return siteCompare;
      return a.pageType.localeCompare(b.pageType);
    });
});

function formatDate(value) {
  if (!value) return '-';
  return new Date(value).toLocaleString();
}

function metricLine(snapshot) {
  const metrics = snapshot.metrics || {};
  return [
    metrics.clicks ? t('history.metricClicks', '{value} clicks', {value: metrics.clicks}) : null,
    metrics.impressions ? t('history.metricImpressions', '{value} impressions', {value: metrics.impressions}) : null,
    metrics.ctr ? `${metrics.ctr} CTR` : null
  ].filter(Boolean).join(' · ') || t('history.metricsPending', 'Metrics pending');
}

function formatNumber(value) {
  return Number(value || 0).toLocaleString();
}

function formatPct(value) {
  return `${(Number(value || 0) * 100).toFixed(2)}%`;
}

function formatPosition(value) {
  return Number(value || 0).toFixed(2);
}

function formatDelta(value, type = 'number') {
  if (value == null) return '-';
  const prefix = value > 0 ? '+' : '';
  if (type === 'pct') return `${prefix}${(value * 100).toFixed(2)}pp`;
  if (type === 'position') return `${prefix}${value.toFixed(2)}`;
  return `${prefix}${formatNumber(value)}`;
}

function deltaClass(value, invert = false) {
  if (value == null || value === 0) return '';
  const positive = invert ? value < 0 : value > 0;
  return positive ? 'good' : 'bad';
}
</script>

<template>
  <section class="history-layout">
    <Panel :title="t('history.gscTrend')" :icon="TrendingUp" :meta="t('history.uniqueSnapshots', '', {count: trendRows.length})">
      <div v-if="trendGroups.length === 0" class="empty">{{ t('history.noTrend') }}</div>
      <template v-else>
        <div v-for="group in trendGroups" :key="group.siteUrl" class="site-history-group">
          <div class="site-history-head">
            <strong>{{ group.siteUrl }}</strong>
            <span>{{ t('history.deltasInside', '', {count: group.rows.length}) }}</span>
          </div>
          <HistoryTrendChart :rows="group.rows" :theme-mode="themeMode" />
          <div class="history-trend-table">
            <table>
              <thead>
                <tr>
                  <th>{{ t('col.Captured', 'Captured') }}</th>
                  <th>{{ t('col.Period', 'Period') }}</th>
                  <th>{{ t('col.Clicks', 'Clicks') }}</th>
                  <th>{{ t('col.Δ Clicks', 'Δ Clicks') }}</th>
                  <th>{{ t('col.Impressions', 'Impressions') }}</th>
                  <th>{{ t('col.Δ Impr.', 'Δ Impr.') }}</th>
                  <th>{{ t('col.CTR', 'CTR') }}</th>
                  <th>{{ t('col.Δ CTR', 'Δ CTR') }}</th>
                  <th>{{ t('col.Position', 'Position') }}</th>
                  <th>{{ t('col.Δ Pos.', 'Δ Pos.') }}</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="row in group.rows.slice().reverse()" :key="row.id">
                  <td>{{ formatDate(row.capturedAt) }}</td>
                  <td>{{ row.dateRange?.startDate }} → {{ row.dateRange?.endDate }}</td>
                  <td class="num">{{ formatNumber(row.clicks) }}</td>
                  <td class="num" :class="deltaClass(row.delta?.clicks)">{{ formatDelta(row.delta?.clicks) }}</td>
                  <td class="num">{{ formatNumber(row.impressions) }}</td>
                  <td class="num" :class="deltaClass(row.delta?.impressions)">{{ formatDelta(row.delta?.impressions) }}</td>
                  <td class="num">{{ formatPct(row.ctr) }}</td>
                  <td class="num" :class="deltaClass(row.delta?.ctr)">{{ formatDelta(row.delta?.ctr, 'pct') }}</td>
                  <td class="num">{{ formatPosition(row.position) }}</td>
                  <td class="num" :class="deltaClass(row.delta?.position, true)">{{ formatDelta(row.delta?.position, 'position') }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </template>
    </Panel>

    <Panel :title="t('history.pageTypeTrend')" :icon="TrendingUp" :meta="t('meta.rows', '', {count: pageTypeRows.length})">
      <div v-if="pageTypeGroups.length === 0" class="empty">{{ t('history.noPageType') }}</div>
      <template v-else>
        <div v-for="group in pageTypeGroups" :key="group.key" class="site-history-group page-type-group">
          <div class="site-history-head">
            <strong>{{ tv(group.pageType) }} · {{ group.siteUrl }}</strong>
            <span>{{ t('history.pageTypeMeta', '', {count: group.rows.length}) }}</span>
          </div>
          <div class="history-trend-table">
            <table>
              <thead>
                <tr>
                  <th>{{ t('col.Captured', 'Captured') }}</th>
                  <th>{{ t('col.Period', 'Period') }}</th>
                  <th>{{ t('col.Clicks', 'Clicks') }}</th>
                  <th>{{ t('col.Δ Clicks', 'Δ Clicks') }}</th>
                  <th>{{ t('col.Impressions', 'Impressions') }}</th>
                  <th>{{ t('col.Δ Impr.', 'Δ Impr.') }}</th>
                  <th>{{ t('col.CTR', 'CTR') }}</th>
                  <th>{{ t('col.Position', 'Position') }}</th>
                  <th>{{ t('col.Pages', 'Pages') }}</th>
                  <th>{{ t('col.Queries', 'Queries') }}</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="row in group.rows.slice().reverse()" :key="`${row.id}-${row.pageType}`">
                  <td>{{ formatDate(row.capturedAt) }}</td>
                  <td>{{ row.dateRange?.startDate }} → {{ row.dateRange?.endDate }}</td>
                  <td class="num">{{ formatNumber(row.clicks) }}</td>
                  <td class="num" :class="deltaClass(row.delta?.clicks)">{{ formatDelta(row.delta?.clicks) }}</td>
                  <td class="num">{{ formatNumber(row.impressions) }}</td>
                  <td class="num" :class="deltaClass(row.delta?.impressions)">{{ formatDelta(row.delta?.impressions) }}</td>
                  <td class="num">{{ formatPct(row.ctr) }}</td>
                  <td class="num">{{ formatPosition(row.position) }}</td>
                  <td class="num">{{ formatNumber(row.pagesCount) }}</td>
                  <td class="num">{{ formatNumber(row.queriesCount) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </template>
    </Panel>

    <Panel :title="t('history.localVault')" :icon="Database" :meta="t('history.uniqueSnapshots', '', {count: snapshots.length})">
      <div v-if="dbStats" class="db-stats">
        <div>
          <strong>{{ dbStats.unique_snapshots || snapshots.length || 0 }}</strong>
          <span>{{ t('history.unique') }}</span>
        </div>
        <div>
          <strong>{{ dbStats.sites || 0 }}</strong>
          <span>{{ t('history.sites') }}</span>
        </div>
        <div>
          <strong>{{ dbStats.trend_rows || 0 }}</strong>
          <span>{{ t('history.dailyRows') }}</span>
        </div>
        <div>
          <strong>{{ dbStats.page_type_rows || 0 }}</strong>
          <span>{{ t('history.pageTypeRows') }}</span>
        </div>
      </div>
      <div class="history-toolbar">
        <div>
          <strong>{{ t('history.savedLocal') }}</strong>
          <span>{{ t('history.savedLocalText') }}</span>
        </div>
        <button type="button" :disabled="busy" @click="emit('refresh')">
          <RefreshCw :class="{ spinning: busy }" />
          <span>{{ t('history.refresh') }}</span>
        </button>
      </div>
      <div class="snapshot-list">
        <div v-if="snapshots.length === 0" class="empty">{{ t('history.noSaved') }}</div>
        <article v-for="snapshot in snapshots" :key="snapshot.id" class="snapshot-item">
          <div class="snapshot-icon"><FileJson /></div>
          <div>
            <strong>{{ snapshot.siteUrl }}</strong>
            <span>{{ snapshot.source?.toUpperCase() }} · {{ formatDate(snapshot.capturedAt) }}</span>
            <small>{{ metricLine(snapshot) }}</small>
          </div>
          <code>{{ snapshot.id }}</code>
        </article>
      </div>
    </Panel>
  </section>
</template>
