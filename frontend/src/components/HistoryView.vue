<script setup>
import { Database, FileJson, RefreshCw, TrendingUp } from '@lucide/vue';
import HistoryTrendChart from './HistoryTrendChart.vue';
import Panel from './Panel.vue';

defineProps({
  snapshots: {
    type: Array,
    default: () => []
  },
  trendRows: {
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
  }
});

const emit = defineEmits(['refresh']);

function formatDate(value) {
  if (!value) return '-';
  return new Date(value).toLocaleString();
}

function metricLine(snapshot) {
  const metrics = snapshot.metrics || {};
  return [
    metrics.clicks ? `${metrics.clicks} clicks` : null,
    metrics.impressions ? `${metrics.impressions} impressions` : null,
    metrics.ctr ? `${metrics.ctr} CTR` : null
  ].filter(Boolean).join(' · ') || 'Metrics pending';
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
    <Panel title="GSC Historical Trend" :icon="TrendingUp" :meta="`${trendRows.length} snapshots`">
      <HistoryTrendChart :rows="trendRows" />
      <div class="history-trend-table">
        <div v-if="trendRows.length === 0" class="empty">No trend snapshots yet</div>
        <table v-else>
          <thead>
            <tr>
              <th>Captured</th>
              <th>Property</th>
              <th>Period</th>
              <th>Clicks</th>
              <th>Δ Clicks</th>
              <th>Impressions</th>
              <th>Δ Impr.</th>
              <th>CTR</th>
              <th>Δ CTR</th>
              <th>Position</th>
              <th>Δ Pos.</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in trendRows.slice().reverse()" :key="row.id">
              <td>{{ formatDate(row.capturedAt) }}</td>
              <td>{{ row.siteUrl }}</td>
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
    </Panel>

    <Panel title="Local Data Vault" :icon="Database" :meta="`${snapshots.length} snapshots`">
      <div v-if="dbStats" class="db-stats">
        <div>
          <strong>{{ dbStats.snapshots || 0 }}</strong>
          <span>Snapshots</span>
        </div>
        <div>
          <strong>{{ dbStats.sites || 0 }}</strong>
          <span>Sites</span>
        </div>
        <div>
          <strong>{{ dbStats.trend_rows || 0 }}</strong>
          <span>Daily rows</span>
        </div>
        <div>
          <strong>{{ dbStats.page_query_rows || 0 }}</strong>
          <span>Page-query rows</span>
        </div>
      </div>
      <div class="history-toolbar">
        <div>
          <strong>Saved on this computer</strong>
          <span>Each successful GSC load is stored as JSON for future review and AI analysis.</span>
        </div>
        <button type="button" :disabled="busy" @click="emit('refresh')">
          <RefreshCw :class="{ spinning: busy }" />
          <span>Refresh</span>
        </button>
      </div>
      <div class="snapshot-list">
        <div v-if="snapshots.length === 0" class="empty">No saved snapshots yet</div>
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
