<script setup>
import { computed, onMounted, reactive, ref } from 'vue';
import { BarChart3, BrainCircuit, Files, Funnel, Gauge, Search, Sparkles, TrendingUp } from '@lucide/vue';
import AppHeader from './components/AppHeader.vue';
import ControlBar from './components/ControlBar.vue';
import DataTable from './components/DataTable.vue';
import DeepAnalysisView from './components/DeepAnalysisView.vue';
import FutureModule from './components/FutureModule.vue';
import HistoryView from './components/HistoryView.vue';
import MetricCards from './components/MetricCards.vue';
import Panel from './components/Panel.vue';
import TrendChart from './components/TrendChart.vue';
import WorkspaceNav from './components/WorkspaceNav.vue';
import { getBreakdowns, getGscDeepAnalysis, getGscHistoryTrends, getGscPageTypeTrends, getHistoryStats, getPageQuery, getPageTypeTrend, getPages, getQueries, getSites, getSnapshots, getTrend, saveSnapshot } from './api/gsc';
import { PAGE_TYPES, defaultDateRange, detectShopifyType, formatNumber, formatPct } from './utils';

const savedSite = localStorage.getItem('gsc:lastSite') || '';
const dates = defaultDateRange();

const controls = reactive({
  siteUrl: savedSite,
  selectedSite: '',
  startDate: dates.startDate,
  endDate: dates.endDate
});

const status = reactive({
  message: 'Ready',
  type: 'default'
});

const busy = ref(false);
const activeView = ref('gsc');
const sites = ref([]);
const snapshots = ref([]);
const historyStats = ref(null);
const historyTrendRows = ref([]);
const pageTypeTrendRows = ref([]);
const deepAnalysis = ref(null);
const trendRows = ref([]);
const rawPageTypeTrend = ref([]);
const rawPages = ref([]);
const rawQueries = ref([]);
const rawPageQuery = ref([]);
const pageTypeFilter = ref('All');

const activeProperty = computed(() => controls.siteUrl || 'No property selected');
const metrics = computed(() => {
  const rows = performanceTrendRows.value;
  const totalClicks = rows.reduce((sum, row) => sum + (row.clicks || 0), 0);
  const totalImpressions = rows.reduce((sum, row) => sum + (row.impressions || 0), 0);
  const avgCtr = totalImpressions ? totalClicks / totalImpressions : 0;
  const avgPosition = weightedAveragePosition(rows);

  return {
    clicks: rows.length ? formatNumber(totalClicks) : '-',
    impressions: rows.length ? formatNumber(totalImpressions) : '-',
    ctr: rows.length ? formatPct(avgCtr) : '-',
    position: rows.length ? avgPosition.toFixed(2) : '-'
  };
});

const performanceTrendRows = computed(() => {
  if (pageTypeFilter.value === 'All') return trendRows.value;

  const dailyRows = rawPageTypeTrend.value
    .filter(row => row.pageType === pageTypeFilter.value)
    .map(row => ({
      date: row.date,
      clicks: row.clicks,
      impressions: row.impressions,
      ctr: row.ctr,
      position: row.position
    }));

  if (dailyRows.length) return dailyRows;
  if (!filteredPages.value.length) return [];

  const clicks = filteredPages.value.reduce((sum, row) => sum + (row.clicks || 0), 0);
  const impressions = filteredPages.value.reduce((sum, row) => sum + (row.impressions || 0), 0);
  return [{
    date: `${controls.startDate || 'Start'} → ${controls.endDate || 'End'}`,
    clicks,
    impressions,
    ctr: impressions ? clicks / impressions : 0,
    position: weightedAveragePosition(filteredPages.value)
  }];
});

const filteredPages = computed(() => {
  if (pageTypeFilter.value === 'All') return rawPages.value;
  return rawPages.value.filter(row => detectShopifyType(row.page) === pageTypeFilter.value);
});

const filteredPageQuery = computed(() => {
  if (pageTypeFilter.value === 'All') return rawPageQuery.value;
  return rawPageQuery.value.filter(row => detectShopifyType(row.page) === pageTypeFilter.value);
});

const pageTypeSummary = computed(() => {
  const buckets = new Map(PAGE_TYPES.filter(type => type !== 'All').map(type => [type, {
    Type: type,
    Clicks: 0,
    Impressions: 0,
    pages: 0,
    weightedPosition: 0
  }]));

  rawPages.value.forEach(row => {
    const type = detectShopifyType(row.page);
    const current = buckets.get(type) || buckets.get('Other');
    current.Clicks += row.clicks || 0;
    current.Impressions += row.impressions || 0;
    current.pages += 1;
    current.weightedPosition += (row.position || 0) * (row.impressions || 0);
  });

  return [...buckets.values()]
    .filter(row => row.Impressions > 0 || row.pages > 0)
    .sort((a, b) => b.Impressions - a.Impressions)
    .map(row => ({
      Type: row.Type,
      Pages: formatNumber(row.pages),
      Clicks: formatNumber(row.Clicks),
      Impressions: formatNumber(row.Impressions),
      CTR: formatPct(row.Impressions ? row.Clicks / row.Impressions : 0),
      Position: row.Impressions ? (row.weightedPosition / row.Impressions).toFixed(2) : '-'
    }));
});

const topPages = computed(() => filteredPages.value
  .slice()
  .sort((a, b) => b.impressions - a.impressions)
  .slice(0, 50)
  .map(row => ({
    Page: row.page,
    Type: detectShopifyType(row.page),
    Clicks: formatNumber(row.clicks),
    Impressions: formatNumber(row.impressions),
    CTR: formatPct(row.ctr),
    Position: row.position.toFixed(2)
  })));

const topQueries = computed(() => {
  if (pageTypeFilter.value === 'All') {
    return rawQueries.value
      .slice()
      .sort((a, b) => b.impressions - a.impressions)
      .slice(0, 50)
      .map(formatQueryRow);
  }

  return aggregateQueries(filteredPageQuery.value)
    .slice(0, 50)
    .map(formatQueryRow);
});

const lowCtrRows = computed(() => filteredPageQuery.value
  .filter(row => row.impressions >= 500 && row.position <= 12 && (row.ctr * 100) < 1.5)
  .sort((a, b) => b.impressions - a.impressions)
  .slice(0, 100)
  .map(formatOpportunityRow));

const keywordRows = computed(() => filteredPageQuery.value
  .filter(row => row.impressions >= 200 && row.position >= 8 && row.position <= 20)
  .sort((a, b) => b.impressions - a.impressions)
  .slice(0, 100)
  .map(formatOpportunityRow));

function setStatus(message, type = 'default') {
  status.message = message;
  status.type = type;
}

function handleAuthReturn() {
  const params = new URLSearchParams(window.location.search);
  const auth = params.get('auth');
  if (auth === 'success') {
    setStatus('Google authorization successful. Token saved.', 'success');
    window.history.replaceState({}, document.title, window.location.pathname);
  } else if (auth === 'error') {
    setStatus(params.get('message') || 'Google authorization failed.', 'error');
    window.history.replaceState({}, document.title, window.location.pathname);
  }
}

function startAuth() {
  window.location.href = '/auth';
}

async function loadSites() {
  try {
    busy.value = true;
    setStatus('Loading GSC properties...');
    const data = await getSites();
    sites.value = data.rows || [];
    setStatus(`Loaded ${sites.value.length} GSC properties.`, 'success');
  } catch (err) {
    if (err.status === 401) alert('未授权：请先点击 Auth 完成授权。');
    setStatus(err.message || '加载 GSC properties 失败。', 'error');
  } finally {
    busy.value = false;
  }
}

async function loadSnapshots() {
  try {
    const [data, stats, trends, pageTypes] = await Promise.all([
      getSnapshots(),
      getHistoryStats(),
      getGscHistoryTrends({limit: 100}),
      getGscPageTypeTrends({limit: 200})
    ]);
    snapshots.value = data.rows || [];
    historyStats.value = stats.stats || null;
    historyTrendRows.value = trends.rows || [];
    pageTypeTrendRows.value = pageTypes.rows || [];
    await loadDeepAnalysis();
  } catch (err) {
    setStatus(err.message || '读取本地历史数据失败。', 'error');
  }
}

async function loadDeepAnalysis() {
  const params = {limit: 80, minImpressions: 100};
  if (controls.siteUrl.trim()) params.siteUrl = controls.siteUrl.trim();
  try {
    const analysis = await getGscDeepAnalysis(params);
    deepAnalysis.value = analysis;
  } catch (err) {
    deepAnalysis.value = null;
    throw err;
  }
}

async function loadData() {
  const siteUrl = controls.siteUrl.trim();
  if (!siteUrl) {
    alert('请输入 Site URL');
    return;
  }

  const params = { siteUrl };
  if (controls.startDate) params.startDate = controls.startDate;
  if (controls.endDate) params.endDate = controls.endDate;

  try {
    busy.value = true;
    setStatus('Loading GSC data...');
    localStorage.setItem('gsc:lastSite', siteUrl);

    const [trend, pageTypeTrend, pages, queries, pageQuery, breakdowns] = await Promise.all([
      getTrend(params),
      getPageTypeTrend(params).catch(err => ({
        rows: [],
        warning: err.message
      })),
      getPages(params),
      getQueries(params),
      getPageQuery(params),
      getBreakdowns(params).catch(err => ({
        countries: [],
        devices: [],
        searchAppearances: [],
        searchTypes: [],
        warning: err.message
      }))
    ]);

    trendRows.value = trend.rows || [];
    rawPageTypeTrend.value = pageTypeTrend.rows || [];
    rawPages.value = pages.rows || [];
    rawQueries.value = queries.rows || [];
    rawPageQuery.value = pageQuery.rows || [];

    const snapshot = await saveSnapshot({
      source: 'gsc',
      siteUrl,
      dateRange: {
        startDate: controls.startDate,
        endDate: controls.endDate
      },
      metrics: metrics.value,
      datasets: {
        trend: trend.rows || [],
        pageTypeTrend: pageTypeTrend.rows || [],
        pages: pages.rows || [],
        queries: queries.rows || [],
        pageQuery: pageQuery.rows || [],
        countries: breakdowns.countries || [],
        devices: breakdowns.devices || [],
        searchAppearances: breakdowns.searchAppearances || [],
        searchTypes: breakdowns.searchTypes || []
      }
    });
    await loadSnapshots();
    setStatus(
      snapshot.cached
        ? `No data changes detected. Used cached snapshot: ${snapshot.id}`
        : pageTypeTrend.warning
        ? `Loaded data and saved locally: ${snapshot.id}. Page type trend skipped: ${pageTypeTrend.warning}`
        : breakdowns.warning
        ? `Loaded core data and saved locally: ${snapshot.id}. Dimension breakdown skipped: ${breakdowns.warning}`
        : `Loaded and saved locally: ${snapshot.id}`,
      pageTypeTrend.warning || breakdowns.warning ? 'default' : 'success'
    );
  } catch (err) {
    if (err.status === 401) alert('未授权：请先点击 Auth 完成授权。');
    setStatus(err.message || '加载失败，请查看控制台。', 'error');
  } finally {
    busy.value = false;
  }
}

function formatOpportunityRow(row) {
  return {
    Page: row.page,
    Type: detectShopifyType(row.page),
    Query: row.query,
    Clicks: formatNumber(row.clicks),
    Impressions: formatNumber(row.impressions),
    CTR: formatPct(row.ctr),
    Position: row.position.toFixed(2)
  };
}

function formatQueryRow(row) {
  return {
    Query: row.query,
    Clicks: formatNumber(row.clicks),
    Impressions: formatNumber(row.impressions),
    CTR: formatPct(row.ctr),
    Position: row.position.toFixed(2)
  };
}

function aggregateQueries(rows) {
  const buckets = new Map();
  rows.forEach(row => {
    const current = buckets.get(row.query) || {
      query: row.query,
      clicks: 0,
      impressions: 0,
      weightedPosition: 0
    };
    current.clicks += row.clicks || 0;
    current.impressions += row.impressions || 0;
    current.weightedPosition += (row.position || 0) * (row.impressions || 0);
    buckets.set(row.query, current);
  });

  return [...buckets.values()]
    .map(row => ({
      query: row.query,
      clicks: row.clicks,
      impressions: row.impressions,
      ctr: row.impressions ? row.clicks / row.impressions : 0,
      position: row.impressions ? row.weightedPosition / row.impressions : 0
    }))
    .sort((a, b) => b.impressions - a.impressions);
}

function weightedAveragePosition(rows) {
  const impressions = rows.reduce((sum, row) => sum + (row.impressions || 0), 0);
  if (!impressions) {
    return rows.reduce((sum, row) => sum + (row.position || 0), 0) / Math.max(1, rows.length);
  }
  return rows.reduce((sum, row) => sum + ((row.position || 0) * (row.impressions || 0)), 0) / impressions;
}

onMounted(() => {
  handleAuthReturn();
  loadSnapshots();
});
</script>

<template>
  <main class="shell">
    <AppHeader :active-property="activeProperty" :status="status" />
    <WorkspaceNav :active="activeView" :snapshot-count="snapshots.length" @change="activeView = $event" />

    <template v-if="activeView === 'gsc'">
      <ControlBar
        v-model="controls"
        :sites="sites"
        :busy="busy"
        @auth="startAuth"
        @load-sites="loadSites"
        @load-data="loadData"
      />

      <MetricCards :metrics="metrics" />

      <section class="channel-filter">
        <div>
          <Funnel />
          <span>
            <strong>Page type filter</strong>
            <small>Segment GSC traffic by Collection, Product, Blog, or Other pages.</small>
          </span>
        </div>
        <div class="segmented-control">
          <button
            v-for="type in PAGE_TYPES"
            :key="type"
            type="button"
            :class="{ active: pageTypeFilter === type }"
            @click="pageTypeFilter = type"
          >
            {{ type }}
          </button>
        </div>
      </section>

      <section class="workspace">
        <section>
          <Panel
            :title="pageTypeFilter === 'All' ? 'Performance Trend' : `${pageTypeFilter} Performance Trend`"
            :icon="TrendingUp"
            :meta="`${performanceTrendRows.length} points`"
          >
            <TrendChart :rows="performanceTrendRows" />
          </Panel>

          <div class="tables">
            <Panel title="Page Type Summary" :icon="Funnel" :meta="`${pageTypeSummary.length} types`">
              <DataTable :rows="pageTypeSummary" :columns="['Type', 'Pages', 'Clicks', 'Impressions', 'CTR', 'Position']" />
            </Panel>

            <Panel title="Top Pages" :icon="Files" :meta="`${topPages.length} rows`">
              <DataTable :rows="topPages" :columns="['Page', 'Type', 'Clicks', 'Impressions', 'CTR', 'Position']" />
            </Panel>

            <Panel title="Top Queries" :icon="Search" :meta="`${topQueries.length} rows`">
              <DataTable :rows="topQueries" :columns="['Query', 'Clicks', 'Impressions', 'CTR', 'Position']" />
            </Panel>
          </div>
        </section>

        <aside class="side-stack">
          <Panel title="Low CTR Opportunities" :icon="Gauge" :meta="`${lowCtrRows.length} rows`">
            <DataTable :rows="lowCtrRows" :columns="['Page', 'Type', 'Query', 'Clicks', 'Impressions', 'CTR', 'Position']" />
          </Panel>

          <Panel title="Keyword Opportunities" :icon="Sparkles" :meta="`${keywordRows.length} rows`">
            <DataTable :rows="keywordRows" :columns="['Page', 'Type', 'Query', 'Clicks', 'Impressions', 'CTR', 'Position']" />
          </Panel>
        </aside>
      </section>
    </template>

    <DeepAnalysisView
      v-else-if="activeView === 'insights'"
      :analysis="deepAnalysis"
      :busy="busy"
      @refresh="loadSnapshots"
    />

    <FutureModule
      v-else-if="activeView === 'ga'"
      title="GA4 Analytics Hub"
      eyebrow="Next data source"
      description="This area is reserved for Google Analytics traffic, events, engagement, and conversion data. It is ready to become the GA side of the GSC + GA combined workflow."
      :icon="BarChart3"
      :bullets="[
        { title: 'Traffic quality', text: 'Sessions, engagement rate, source / medium, landing pages.' },
        { title: 'Conversion context', text: 'Events, key events, revenue, and page-level outcomes.' },
        { title: 'GSC linkage', text: 'Blend rankings and queries with behavior after the click.' }
      ]"
    />

    <HistoryView
      v-else-if="activeView === 'history'"
      :snapshots="snapshots"
      :trend-rows="historyTrendRows"
      :page-type-rows="pageTypeTrendRows"
      :db-stats="historyStats"
      :busy="busy"
      @refresh="loadSnapshots"
    />

    <FutureModule
      v-else
      title="AI Analysis Workspace"
      eyebrow="Local-first intelligence"
      description="Saved snapshots will give AI a stable historical memory: compare periods, summarize anomalies, find SEO opportunities, and explain changes across GSC and GA."
      :icon="BrainCircuit"
      :bullets="[
        { title: 'Historical memory', text: 'AI can inspect saved local JSON instead of only today’s API response.' },
        { title: 'Cross-source insight', text: 'Future GA data can explain whether clicks turned into engaged visits.' },
        { title: 'Action plans', text: 'Generate content, CTR, technical, and conversion recommendations from real data.' }
      ]"
    />
  </main>
</template>
