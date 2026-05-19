<script setup>
import { computed } from 'vue';
import { Activity, AlertTriangle, Gauge, Globe2, MinusCircle, PlusCircle, RefreshCw, Split, Tags } from '@lucide/vue';
import DataTable from './DataTable.vue';
import Panel from './Panel.vue';

const props = defineProps({
  analysis: {
    type: Object,
    default: null
  },
  busy: {
    type: Boolean,
    default: false
  }
});

const emit = defineEmits(['refresh']);

const summaryCards = computed(() => {
  const summary = props.analysis?.summary || {};
  return [
    { label: 'Declining pages', value: formatNumber(summary.pageDecayCount), sub: `${formatNumber(summary.clickLoss)} lost clicks`, accent: '#be123c' },
    { label: 'Low CTR upside', value: formatNumber(summary.lowCtrOpportunityCount), sub: `${formatNumber(summary.potentialClicks)} potential clicks`, accent: '#2563eb' },
    { label: 'Cannibalized queries', value: formatNumber(summary.cannibalizationCount), sub: 'multi-page competition', accent: '#7c3aed' },
    { label: 'Keyword movement', value: `${formatNumber(summary.newKeywordCount)} / ${formatNumber(summary.lostKeywordCount)}`, sub: 'new / lost queries', accent: '#0f766e' }
  ];
});

const pageDecayRows = computed(() => (props.analysis?.pageDecay || []).map(row => ({
  Page: row.page,
  Severity: row.severity,
  'Click Loss': formatNumber(row.clicksLost),
  'Click Δ%': formatPct(row.clicksChangePct),
  'Impr. Loss': formatNumber(row.impressionsLost),
  'Pos Δ': formatSigned(row.positionDelta, 2),
  Current: `${formatNumber(row.clicks)} clicks · ${formatNumber(row.impressions)} impr.`
})));

const volatilityRows = computed(() => (props.analysis?.keywordVolatility || []).map(row => ({
  Query: row.query,
  Intent: row.intent,
  Move: row.direction === 'down' ? 'Down' : 'Up',
  'Pos Δ': formatSigned(row.positionDelta, 2),
  'Click Δ': formatSigned(row.clicksDelta),
  'Impr. Δ': formatSigned(row.impressionsDelta),
  Position: row.position ? row.position.toFixed(2) : '-'
})));

const lowCtrRows = computed(() => (props.analysis?.lowCtrOpportunities || []).map(row => ({
  Page: row.page,
  Query: row.query,
  Intent: row.intent,
  Impressions: formatNumber(row.impressions),
  CTR: formatCtr(row.ctr),
  Expected: formatCtr(row.expectedCtr),
  Gap: formatCtr(row.ctrGap),
  'Potential Clicks': formatNumber(Math.round(row.potentialClicks)),
  Position: row.position.toFixed(2)
})));

const intentRows = computed(() => (props.analysis?.summary?.intentMix || []).map(row => ({
  Intent: row.intent,
  Queries: formatNumber(row.queries),
  Clicks: formatNumber(row.clicks),
  Impressions: formatNumber(row.impressions)
})));

const newKeywordRows = computed(() => (props.analysis?.newKeywords || []).map(formatKeywordRow));
const lostKeywordRows = computed(() => (props.analysis?.lostKeywords || []).map(formatKeywordRow));

const dimensionRows = computed(() => {
  const dimensions = props.analysis?.dimensions || {};
  return [
    ...formatDimensionRows('Country', dimensions.countries || []),
    ...formatDimensionRows('Device', dimensions.devices || []),
    ...formatDimensionRows('Appearance', dimensions.searchAppearances || []),
    ...formatDimensionRows('Search type', dimensions.searchTypes || [])
  ];
});

const latestLabel = computed(() => {
  const snapshot = props.analysis?.meta?.latestSnapshot;
  if (!snapshot) return 'No local GSC snapshot yet';
  const period = snapshot.dateRange?.startDate && snapshot.dateRange?.endDate
    ? `${snapshot.dateRange.startDate} to ${snapshot.dateRange.endDate}`
    : 'saved period';
  return `${snapshot.siteUrl} · ${period}`;
});

function formatKeywordRow(row) {
  return {
    Query: row.query,
    Intent: row.intent,
    Clicks: formatNumber(row.clicks),
    Impressions: formatNumber(row.impressions),
    CTR: formatCtr(row.ctr),
    Position: row.position ? row.position.toFixed(2) : '-'
  };
}

function formatDimensionRows(type, rows) {
  return rows.map(row => ({
    Type: type,
    Value: row.value,
    'Search Type': row.searchType,
    Clicks: formatNumber(row.clicks),
    Impressions: formatNumber(row.impressions),
    CTR: formatCtr(row.ctr),
    Position: row.position ? row.position.toFixed(2) : '-'
  }));
}

function formatNumber(value) {
  return Number(value || 0).toLocaleString();
}

function formatCtr(value) {
  return `${(Number(value || 0) * 100).toFixed(2)}%`;
}

function formatPct(value) {
  if (value == null) return '-';
  return `${formatSigned(Number(value) * 100, 1)}%`;
}

function formatSigned(value, digits = 0) {
  if (value == null || Number.isNaN(Number(value))) return '-';
  const number = Number(value);
  const prefix = number > 0 ? '+' : '';
  return `${prefix}${number.toFixed(digits)}`;
}
</script>

<template>
  <section class="analysis-layout">
    <Panel title="GSC Deep Analysis" :icon="Activity" :meta="latestLabel">
      <div class="analysis-toolbar">
        <div>
          <strong>{{ analysis?.meta?.hasComparison ? 'Historical comparison ready' : 'Latest snapshot analysis' }}</strong>
          <span>Built from local GSC snapshots so the same data can be reused for future AI analysis.</span>
        </div>
        <button type="button" :disabled="busy" @click="emit('refresh')">
          <RefreshCw :class="{ spinning: busy }" />
          <span>Refresh</span>
        </button>
      </div>

      <div class="analysis-summary">
        <article v-for="card in summaryCards" :key="card.label" class="analysis-card" :style="{ '--accent': card.accent }">
          <span>{{ card.label }}</span>
          <strong>{{ card.value }}</strong>
          <small>{{ card.sub }}</small>
        </article>
      </div>

      <div v-if="!analysis?.meta?.latestSnapshot" class="empty">Load and save GSC data first, then this workspace will show deep SEO diagnostics.</div>
    </Panel>

    <section v-if="analysis?.meta?.latestSnapshot" class="analysis-grid">
      <Panel title="Page Decay Monitor" :icon="AlertTriangle" :meta="`${pageDecayRows.length} pages`">
        <DataTable :rows="pageDecayRows" :columns="['Page', 'Severity', 'Click Loss', 'Click Δ%', 'Impr. Loss', 'Pos Δ', 'Current']" />
      </Panel>

      <Panel title="Keyword Ranking Volatility" :icon="Activity" :meta="`${volatilityRows.length} queries`">
        <DataTable :rows="volatilityRows" :columns="['Query', 'Intent', 'Move', 'Pos Δ', 'Click Δ', 'Impr. Δ', 'Position']" />
      </Panel>

      <Panel title="Low CTR Opportunities" :icon="Gauge" :meta="`${lowCtrRows.length} opportunities`">
        <DataTable :rows="lowCtrRows" :columns="['Page', 'Query', 'Intent', 'Impressions', 'CTR', 'Expected', 'Gap', 'Potential Clicks', 'Position']" />
      </Panel>

      <Panel title="Cannibalization Watch" :icon="Split" :meta="`${analysis.cannibalization.length} queries`">
        <div class="cannibal-list">
          <div v-if="analysis.cannibalization.length === 0" class="empty">No cannibalization risk found in the latest snapshot.</div>
          <article v-for="item in analysis.cannibalization" :key="item.query" class="cannibal-item">
            <header>
              <div>
                <strong>{{ item.query }}</strong>
                <span>{{ item.intent }} · {{ item.risk }} risk · {{ item.competingPages }} pages</span>
              </div>
              <small>{{ formatNumber(item.totalImpressions) }} impressions</small>
            </header>
            <div class="competing-pages">
              <div v-for="page in item.pages" :key="page.page">
                <span>{{ page.page }}</span>
                <small>{{ formatNumber(page.impressions) }} impr. · {{ formatCtr(page.share) }} share · pos {{ page.position.toFixed(2) }}</small>
              </div>
            </div>
          </article>
        </div>
      </Panel>

      <Panel title="Query Intent Mix" :icon="Tags" :meta="`${intentRows.length} intents`">
        <DataTable :rows="intentRows" :columns="['Intent', 'Queries', 'Clicks', 'Impressions']" />
      </Panel>

      <Panel title="New Keywords" :icon="PlusCircle" :meta="`${newKeywordRows.length} queries`">
        <DataTable :rows="newKeywordRows" :columns="['Query', 'Intent', 'Clicks', 'Impressions', 'CTR', 'Position']" />
      </Panel>

      <Panel title="Lost Keywords" :icon="MinusCircle" :meta="`${lostKeywordRows.length} queries`">
        <DataTable :rows="lostKeywordRows" :columns="['Query', 'Intent', 'Clicks', 'Impressions', 'CTR', 'Position']" />
      </Panel>

      <Panel title="Country, Device and Search Type" :icon="Globe2" :meta="`${dimensionRows.length} rows`">
        <DataTable :rows="dimensionRows" :columns="['Type', 'Value', 'Search Type', 'Clicks', 'Impressions', 'CTR', 'Position']" />
      </Panel>
    </section>
  </section>
</template>
