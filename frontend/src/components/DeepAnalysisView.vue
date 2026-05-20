<script setup>
import { computed } from 'vue';
import { Activity, AlertTriangle, Gauge, Globe2, MinusCircle, PlusCircle, RefreshCw, Split, Tags } from '@lucide/vue';
import DataTable from './DataTable.vue';
import Panel from './Panel.vue';
import { useI18n } from '../i18n';

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
const {t} = useI18n();

const summaryCards = computed(() => {
  const summary = props.analysis?.summary || {};
  return [
    { label: t('summary.decliningPages', 'Declining pages'), value: formatNumber(summary.pageDecayCount), sub: t('summary.lostClicks', '{count} lost clicks', {count: formatNumber(summary.clickLoss)}), accent: '#be123c' },
    { label: t('summary.lowCtrUpside', 'Low CTR upside'), value: formatNumber(summary.lowCtrOpportunityCount), sub: t('summary.potentialClicks', '{count} potential clicks', {count: formatNumber(summary.potentialClicks)}), accent: '#2563eb' },
    { label: t('summary.cannibalizedQueries', 'Cannibalized queries'), value: formatNumber(summary.cannibalizationCount), sub: t('summary.multiPageCompetition', 'multi-page competition'), accent: '#7c3aed' },
    { label: t('summary.keywordMovement', 'Keyword movement'), value: `${formatNumber(summary.newKeywordCount)} / ${formatNumber(summary.lostKeywordCount)}`, sub: t('summary.newLostQueries', 'new / lost queries'), accent: '#0f766e' }
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
  if (!snapshot) return t('insights.latestMissing');
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
    <Panel :title="t('insights.title')" :icon="Activity" :meta="latestLabel">
      <div class="analysis-toolbar">
        <div>
          <strong>{{ analysis?.meta?.hasComparison ? t('insights.historicalReady') : t('insights.latestAnalysis') }}</strong>
          <span>{{ t('insights.snapshotReuse') }}</span>
        </div>
        <button type="button" :disabled="busy" @click="emit('refresh')">
          <RefreshCw :class="{ spinning: busy }" />
          <span>{{ t('history.refresh') }}</span>
        </button>
      </div>

      <div class="analysis-summary">
        <article v-for="card in summaryCards" :key="card.label" class="analysis-card" :style="{ '--accent': card.accent }">
          <span>{{ card.label }}</span>
          <strong>{{ card.value }}</strong>
          <small>{{ card.sub }}</small>
        </article>
      </div>

      <div v-if="!analysis?.meta?.latestSnapshot" class="empty">{{ t('insights.empty') }}</div>
    </Panel>

    <section v-if="analysis?.meta?.latestSnapshot" class="analysis-grid">
      <Panel :title="t('insights.decay')" :icon="AlertTriangle" :meta="t('meta.pages', '', {count: pageDecayRows.length})">
        <DataTable :rows="pageDecayRows" :columns="['Page', 'Severity', 'Click Loss', 'Click Δ%', 'Impr. Loss', 'Pos Δ', 'Current']" />
      </Panel>

      <Panel :title="t('insights.volatility')" :icon="Activity" :meta="t('meta.queries', '', {count: volatilityRows.length})">
        <DataTable :rows="volatilityRows" :columns="['Query', 'Intent', 'Move', 'Pos Δ', 'Click Δ', 'Impr. Δ', 'Position']" />
      </Panel>

      <Panel :title="t('panel.lowCtr')" :icon="Gauge" :meta="t('meta.opportunities', '{count} opportunities', {count: lowCtrRows.length})">
        <DataTable :rows="lowCtrRows" :columns="['Page', 'Query', 'Intent', 'Impressions', 'CTR', 'Expected', 'Gap', 'Potential Clicks', 'Position']" />
      </Panel>

      <Panel :title="t('insights.cannibalization')" :icon="Split" :meta="t('meta.queries', '', {count: analysis.cannibalization.length})">
        <div class="cannibal-list">
          <div v-if="analysis.cannibalization.length === 0" class="empty">{{ t('insights.noCannibal') }}</div>
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

      <Panel :title="t('insights.intentMix')" :icon="Tags" :meta="t('meta.intents', '{count} intents', {count: intentRows.length})">
        <DataTable :rows="intentRows" :columns="['Intent', 'Queries', 'Clicks', 'Impressions']" />
      </Panel>

      <Panel :title="t('insights.newKeywords')" :icon="PlusCircle" :meta="t('meta.queries', '', {count: newKeywordRows.length})">
        <DataTable :rows="newKeywordRows" :columns="['Query', 'Intent', 'Clicks', 'Impressions', 'CTR', 'Position']" />
      </Panel>

      <Panel :title="t('insights.lostKeywords')" :icon="MinusCircle" :meta="t('meta.queries', '', {count: lostKeywordRows.length})">
        <DataTable :rows="lostKeywordRows" :columns="['Query', 'Intent', 'Clicks', 'Impressions', 'CTR', 'Position']" />
      </Panel>

      <Panel :title="t('insights.dimensions')" :icon="Globe2" :meta="t('meta.rows', '', {count: dimensionRows.length})">
        <DataTable :rows="dimensionRows" :columns="['Type', 'Value', 'Search Type', 'Clicks', 'Impressions', 'CTR', 'Position']" />
      </Panel>
    </section>
  </section>
</template>
