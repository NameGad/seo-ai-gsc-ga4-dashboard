<script setup>
import { computed, onMounted, reactive, ref } from 'vue';
import { BarChart3, BrainCircuit, Files, Gauge, Search, Sparkles, TrendingUp } from '@lucide/vue';
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
import { getBreakdowns, getGscDeepAnalysis, getGscHistoryTrends, getHistoryStats, getPageQuery, getPages, getQueries, getSites, getSnapshots, getTrend, saveSnapshot } from './api/gsc';
import { defaultDateRange, detectShopifyType, formatNumber, formatPct } from './utils';

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
const deepAnalysis = ref(null);
const trendRows = ref([]);
const topPages = ref([]);
const topQueries = ref([]);
const lowCtrRows = ref([]);
const keywordRows = ref([]);

const activeProperty = computed(() => controls.siteUrl || 'No property selected');
const metrics = computed(() => {
  const totalClicks = trendRows.value.reduce((sum, row) => sum + (row.clicks || 0), 0);
  const totalImpressions = trendRows.value.reduce((sum, row) => sum + (row.impressions || 0), 0);
  const avgCtr = totalImpressions ? totalClicks / totalImpressions : 0;
  const avgPosition = trendRows.value.reduce((sum, row) => sum + (row.position || 0), 0) / Math.max(1, trendRows.value.length);

  return {
    clicks: trendRows.value.length ? formatNumber(totalClicks) : '-',
    impressions: trendRows.value.length ? formatNumber(totalImpressions) : '-',
    ctr: trendRows.value.length ? formatPct(avgCtr) : '-',
    position: trendRows.value.length ? avgPosition.toFixed(2) : '-'
  };
});

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
    const [data, stats, trends] = await Promise.all([
      getSnapshots(),
      getHistoryStats(),
      getGscHistoryTrends({limit: 100})
    ]);
    snapshots.value = data.rows || [];
    historyStats.value = stats.stats || null;
    historyTrendRows.value = trends.rows || [];
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

    const [trend, pages, queries, pageQuery, breakdowns] = await Promise.all([
      getTrend(params),
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
    topPages.value = (pages.rows || [])
      .sort((a, b) => b.impressions - a.impressions)
      .slice(0, 50)
      .map(row => ({
        Page: row.page,
        Type: detectShopifyType(row.page),
        Clicks: formatNumber(row.clicks),
        Impressions: formatNumber(row.impressions),
        CTR: formatPct(row.ctr),
        Position: row.position.toFixed(2)
      }));

    topQueries.value = (queries.rows || [])
      .sort((a, b) => b.impressions - a.impressions)
      .slice(0, 50)
      .map(row => ({
        Query: row.query,
        Clicks: formatNumber(row.clicks),
        Impressions: formatNumber(row.impressions),
        CTR: formatPct(row.ctr),
        Position: row.position.toFixed(2)
      }));

    lowCtrRows.value = (pageQuery.rows || [])
      .filter(row => row.impressions >= 500 && row.position <= 12 && (row.ctr * 100) < 1.5)
      .sort((a, b) => b.impressions - a.impressions)
      .slice(0, 100)
      .map(formatOpportunityRow);

    keywordRows.value = (pageQuery.rows || [])
      .filter(row => row.impressions >= 200 && row.position >= 8 && row.position <= 20)
      .sort((a, b) => b.impressions - a.impressions)
      .slice(0, 100)
      .map(formatOpportunityRow);

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
        : breakdowns.warning
        ? `Loaded core data and saved locally: ${snapshot.id}. Dimension breakdown skipped: ${breakdowns.warning}`
        : `Loaded and saved locally: ${snapshot.id}`,
      breakdowns.warning ? 'default' : 'success'
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
    Query: row.query,
    Clicks: formatNumber(row.clicks),
    Impressions: formatNumber(row.impressions),
    CTR: formatPct(row.ctr),
    Position: row.position.toFixed(2)
  };
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

      <section class="workspace">
        <section>
          <Panel title="Performance Trend" :icon="TrendingUp" :meta="`${trendRows.length} days`">
            <TrendChart :rows="trendRows" />
          </Panel>

          <div class="tables">
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
            <DataTable :rows="lowCtrRows" :columns="['Page', 'Query', 'Clicks', 'Impressions', 'CTR', 'Position']" />
          </Panel>

          <Panel title="Keyword Opportunities" :icon="Sparkles" :meta="`${keywordRows.length} rows`">
            <DataTable :rows="keywordRows" :columns="['Page', 'Query', 'Clicks', 'Impressions', 'CTR', 'Position']" />
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
