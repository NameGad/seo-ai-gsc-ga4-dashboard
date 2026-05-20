<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue';
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
import { getBreakdowns, getGscDeepAnalysis, getGscHistoryTrends, getGscPageTypeTrends, getHistoryStats, getPageQuery, getPageTypeTrend, getPages, getQueries, getSites, getSnapshot, getSnapshots, getTrend, saveSnapshot } from './api/gsc';
import { useI18n } from './i18n';
import { PAGE_TYPES, defaultDateRange, detectShopifyType, formatNumber, formatPct } from './utils';

const {locale, t, tv} = useI18n();
const savedSite = localStorage.getItem('gsc:lastSite') || '';
const savedBrandTerms = localStorage.getItem('gsc:brandTerms') || '';
const savedQuerySegment = localStorage.getItem('gsc:querySegment') || 'All';
const dates = defaultDateRange();
const savedTheme = localStorage.getItem('seo-dashboard:theme');
const preferredTheme = savedTheme
  || (window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');

const controls = reactive({
  siteUrl: savedSite,
  selectedSite: '',
  startDate: dates.startDate,
  endDate: dates.endDate
});

const status = reactive({
  message: t('status.ready'),
  type: 'default'
});

const themeMode = ref(preferredTheme);
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
const querySegment = ref(['All', 'Branded', 'Non-branded'].includes(savedQuerySegment) ? savedQuerySegment : 'All');
const brandTerms = ref(savedBrandTerms);
const workspaceSnapshotId = ref('');
const workspaceDatasets = ref({});
const pageTypeTrendLoading = ref(false);
const querySegments = ['All', 'Branded', 'Non-branded'];

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

  return rawPageTypeTrend.value
    .filter(row => row.pageType === pageTypeFilter.value)
    .map(row => ({
      date: row.date,
      clicks: row.clicks,
      impressions: row.impressions,
      ctr: row.ctr,
      position: row.position,
      pagesCount: row.pagesCount
    }));
});

const performanceTrendKey = computed(() => [
  pageTypeFilter.value,
  performanceTrendRows.value.length,
  performanceTrendRows.value.map(row => [
    row.date,
    Math.round(Number(row.clicks || 0)),
    Math.round(Number(row.impressions || 0)),
    Number(row.position || 0).toFixed(4)
  ].join(':')).join('|')
].join('::'));

const filteredPages = computed(() => {
  if (pageTypeFilter.value === 'All') return rawPages.value;
  return rawPages.value.filter(row => detectShopifyType(row.page) === pageTypeFilter.value);
});

const filteredPageQuery = computed(() => {
  if (pageTypeFilter.value === 'All') return rawPageQuery.value;
  return rawPageQuery.value.filter(row => detectShopifyType(row.page) === pageTypeFilter.value);
});

const effectiveBrandTerms = computed(() => parseBrandTerms(brandTerms.value || inferBrandTerms(controls.siteUrl)));

const segmentedPageQuery = computed(() => filterByQuerySegment(filteredPageQuery.value));

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

const pageTypeDailyRows = computed(() => performanceTrendRows.value.map(row => ({
  Date: row.date,
  Type: pageTypeFilter.value,
  Clicks: formatNumber(row.clicks),
  Impressions: formatNumber(row.impressions),
  CTR: formatPct(row.ctr),
  Position: row.position ? row.position.toFixed(2) : '-',
  Pages: row.pagesCount ? formatNumber(row.pagesCount) : '-'
})));

const workspaceDataReady = computed(() => rawPages.value.length > 0 || trendRows.value.length > 0);

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
  const rows = pageTypeFilter.value === 'All'
    ? filterByQuerySegment(rawQueries.value)
    : filterByQuerySegment(aggregateQueries(filteredPageQuery.value));

  return rows
    .slice()
    .sort((a, b) => b.impressions - a.impressions)
    .slice(0, 50)
    .map(formatQueryRow);
});

const lowCtrRows = computed(() => segmentedPageQuery.value
  .filter(row => row.impressions >= 500 && row.position <= 12 && (row.ctr * 100) < 1.5)
  .sort((a, b) => b.impressions - a.impressions)
  .slice(0, 100)
  .map(formatOpportunityRow));

const keywordRows = computed(() => segmentedPageQuery.value
  .filter(row => row.impressions >= 200 && row.position >= 8 && row.position <= 20)
  .sort((a, b) => b.impressions - a.impressions)
  .slice(0, 100)
  .map(formatOpportunityRow));

const querySegmentSummary = computed(() => {
  const rows = pageTypeFilter.value === 'All' ? rawQueries.value : aggregateQueries(filteredPageQuery.value);
  const buckets = {
    Branded: {label: 'Branded', clicks: 0, impressions: 0, weightedPosition: 0, queries: 0},
    'Non-branded': {label: 'Non-branded', clicks: 0, impressions: 0, weightedPosition: 0, queries: 0}
  };

  rows.forEach(row => {
    const key = isBrandedQuery(row.query) ? 'Branded' : 'Non-branded';
    const current = buckets[key];
    current.clicks += row.clicks || 0;
    current.impressions += row.impressions || 0;
    current.weightedPosition += (row.position || 0) * (row.impressions || 0);
    current.queries += 1;
  });

  return Object.values(buckets)
    .filter(row => row.impressions > 0 || row.queries > 0)
    .map(row => ({
      Segment: row.label,
      Queries: formatNumber(row.queries),
      Clicks: formatNumber(row.clicks),
      Impressions: formatNumber(row.impressions),
      CTR: formatPct(row.impressions ? row.clicks / row.impressions : 0),
      Position: row.impressions ? (row.weightedPosition / row.impressions).toFixed(2) : '-'
    }));
});

const cannibalQueryStats = computed(() => {
  const buckets = new Map();
  segmentedPageQuery.value.forEach(row => {
    if (!row.query || !row.page || row.impressions < 50) return;
    const current = buckets.get(row.query) || {
      query: row.query,
      pages: new Map(),
      clicks: 0,
      impressions: 0
    };
    const page = current.pages.get(row.page) || {page: row.page, clicks: 0, impressions: 0};
    page.clicks += row.clicks || 0;
    page.impressions += row.impressions || 0;
    current.pages.set(row.page, page);
    current.clicks += row.clicks || 0;
    current.impressions += row.impressions || 0;
    buckets.set(row.query, current);
  });

  return buckets;
});

const cannibalizationRows = computed(() => [...cannibalQueryStats.value.values()]
  .map(group => {
    const pages = [...group.pages.values()].sort((a, b) => b.impressions - a.impressions);
    const topPage = pages[0];
    const secondPage = pages[1];
    const share = topPage && group.impressions ? topPage.impressions / group.impressions : 0;
    return {
      query: group.query,
      segment: isBrandedQuery(group.query) ? 'Branded' : 'Non-branded',
      pages,
      clicks: group.clicks,
      impressions: group.impressions,
      share,
      topPage: topPage?.page || '-',
      competingPages: pages.slice(1, 4).map(page => page.page).join(' | '),
      action: share < 0.62 && secondPage ? 'Choose primary page + adjust internal links' : 'Consolidate secondary pages'
    };
  })
  .filter(row => row.pages.length >= 2 && row.impressions >= 200)
  .sort((a, b) => (b.impressions * (1 - b.share)) - (a.impressions * (1 - a.share)))
  .slice(0, 50)
  .map(row => ({
    Query: row.query,
    Segment: row.segment,
    Pages: formatNumber(row.pages.length),
    Clicks: formatNumber(row.clicks),
    Impressions: formatNumber(row.impressions),
    'Top Share': formatPct(row.share),
    'Top Page': row.topPage,
    'Competing Pages': row.competingPages,
    Action: row.action
  })));

const seoOpportunityItems = computed(() => segmentedPageQuery.value
  .filter(row => row.query && row.page && row.impressions >= 100 && row.position >= 3 && row.position <= 35)
  .map(row => buildOpportunityItem(row))
  .filter(row => row.score >= 20)
  .sort((a, b) => b.score - a.score));

const seoActionRows = computed(() => seoOpportunityItems.value
  .slice(0, 60)
  .map(formatActionRow));

const quickWinRows = computed(() => seoOpportunityItems.value
  .filter(row => row.position >= 4 && row.position <= 15 && row.impressions >= 200 && row.ctrGap > 0)
  .slice(0, 50)
  .map(row => ({
    Score: row.score,
    Priority: row.priority,
    Page: row.page,
    Type: row.pageType,
    Query: row.query,
    Segment: row.segment,
    Impressions: formatNumber(row.impressions),
    CTR: formatPct(row.ctr),
    Expected: formatPct(row.expectedCtr),
    Position: row.position.toFixed(2),
    Action: row.action
  })));

const pageDecayRows = computed(() => (deepAnalysis.value?.pageDecay || [])
  .filter(row => pageTypeFilter.value === 'All' || detectShopifyType(row.page) === pageTypeFilter.value)
  .slice(0, 50)
  .map(row => ({
    Page: row.page,
    Type: detectShopifyType(row.page),
    Severity: Math.round(row.severity || 0),
    'Clicks Lost': formatNumber(row.clicksLost),
    'Impr. Lost': formatNumber(row.impressionsLost),
    'Click Δ': formatSigned(row.clicksDelta),
    'Position Δ': formatSigned(row.positionDelta, 2),
    Action: row.positionDelta >= 2 ? 'Refresh content + check intent drift' : 'Review title, snippets, and internal links'
  })));

const contentRefreshRows = computed(() => {
  const decayByPage = new Map((deepAnalysis.value?.pageDecay || []).map(row => [row.page, row]));
  const buckets = new Map();

  segmentedPageQuery.value.forEach(row => {
    if (!row.page || row.impressions < 50) return;
    const current = buckets.get(row.page) || {
      page: row.page,
      pageType: detectShopifyType(row.page),
      clicks: 0,
      impressions: 0,
      weightedPosition: 0,
      queries: 0,
      lowCtrQueries: 0,
      nonBrandQueries: 0,
      bestQuery: '',
      bestQueryImpressions: 0
    };
    current.clicks += row.clicks || 0;
    current.impressions += row.impressions || 0;
    current.weightedPosition += (row.position || 0) * (row.impressions || 0);
    current.queries += 1;
    if (!isBrandedQuery(row.query)) current.nonBrandQueries += 1;
    if (row.position <= 20 && row.ctr < expectedCtrByPosition(row.position) * 0.55) current.lowCtrQueries += 1;
    if (row.impressions > current.bestQueryImpressions) {
      current.bestQuery = row.query;
      current.bestQueryImpressions = row.impressions;
    }
    buckets.set(row.page, current);
  });

  return [...buckets.values()]
    .map(row => {
      const position = row.impressions ? row.weightedPosition / row.impressions : 0;
      const decay = decayByPage.get(row.page);
      const score = Math.round(Math.min(100,
        Math.log10(row.impressions + 1) * 14
        + Math.min(22, row.lowCtrQueries * 3)
        + Math.min(18, row.nonBrandQueries * 1.5)
        + (decay ? 18 : 0)
        + (position >= 5 && position <= 25 ? 12 : 0)
      ));
      return {
        ...row,
        position,
        decay,
        score
      };
    })
    .filter(row => row.impressions >= 500 && row.score >= 45)
    .sort((a, b) => b.score - a.score)
    .slice(0, 50)
    .map(row => ({
      Score: row.score,
      Page: row.page,
      Type: row.pageType,
      'Best Query': row.bestQuery,
      Queries: formatNumber(row.queries),
      'Low CTR Queries': formatNumber(row.lowCtrQueries),
      Impressions: formatNumber(row.impressions),
      CTR: formatPct(row.impressions ? row.clicks / row.impressions : 0),
      Position: row.position.toFixed(2),
      Decay: row.decay ? `${formatNumber(row.decay.clicksLost)} clicks lost` : '-',
      Action: row.decay ? 'Refresh and re-promote this page' : 'Expand sections around winning queries'
    }));
});

function setStatus(message, type = 'default') {
  status.message = message;
  status.type = type;
}

function toggleTheme() {
  themeMode.value = themeMode.value === 'dark' ? 'light' : 'dark';
}

function parseBrandTerms(value = '') {
  return String(value)
    .split(/[,;\n]/)
    .map(term => normalizeQuery(term))
    .filter(term => term.length >= 2);
}

function inferBrandTerms(siteUrl = '') {
  try {
    const value = siteUrl.startsWith('sc-domain:')
      ? `https://${siteUrl.replace('sc-domain:', '')}`
      : siteUrl;
    const hostname = new URL(value).hostname.toLowerCase();
    const parts = hostname.split('.').filter(Boolean);
    const ignored = new Set(['www', 'shop', 'store', 'blog', 'app', 'admin', 'support']);
    const candidates = parts.filter(part => !ignored.has(part));
    return candidates.length >= 2 ? candidates[candidates.length - 2] : candidates[0] || '';
  } catch (err) {
    return '';
  }
}

function normalizeQuery(value = '') {
  return String(value).toLowerCase().replace(/\s+/g, ' ').trim();
}

function isBrandedQuery(query = '') {
  const value = normalizeQuery(query);
  const terms = effectiveBrandTerms.value;
  if (!value || !terms.length) return false;
  return terms.some(term => value.includes(term));
}

function filterByQuerySegment(rows) {
  if (querySegment.value === 'All') return rows;
  return rows.filter(row => querySegment.value === 'Branded'
    ? isBrandedQuery(row.query)
    : !isBrandedQuery(row.query));
}

function expectedCtrByPosition(position) {
  if (position <= 1) return 0.28;
  if (position <= 2) return 0.15;
  if (position <= 3) return 0.10;
  if (position <= 4) return 0.075;
  if (position <= 5) return 0.055;
  if (position <= 7) return 0.038;
  if (position <= 10) return 0.025;
  if (position <= 15) return 0.016;
  if (position <= 20) return 0.010;
  return 0.006;
}

function buildOpportunityItem(row) {
  const expectedCtr = expectedCtrByPosition(row.position || 99);
  const ctrGap = Math.max(0, expectedCtr - (row.ctr || 0));
  const ctrGapRatio = expectedCtr ? ctrGap / expectedCtr : 0;
  const segment = isBrandedQuery(row.query) ? 'Branded' : 'Non-branded';
  const pageType = detectShopifyType(row.page);
  const cannibalized = (cannibalQueryStats.value.get(row.query)?.pages?.size || 0) >= 2;
  const impressionScore = Math.min(32, Math.log10((row.impressions || 0) + 1) * 9);
  const positionScore = row.position <= 3 ? 6 : row.position <= 10 ? 26 : row.position <= 20 ? 22 : 12;
  const ctrScore = Math.min(26, ctrGapRatio * 26);
  const nonBrandBoost = segment === 'Non-branded' ? 10 : 0;
  const typeBoost = ['Collection', 'Product', 'Blog'].includes(pageType) ? 4 : 0;
  const cannibalBoost = cannibalized ? 8 : 0;
  const score = Math.round(Math.min(100, impressionScore + positionScore + ctrScore + nonBrandBoost + typeBoost + cannibalBoost));
  const action = chooseSeoAction(row, {ctrGap, expectedCtr, segment, cannibalized});

  return {
    ...row,
    score,
    priority: score >= 72 ? 'High' : score >= 48 ? 'Medium' : 'Low',
    expectedCtr,
    ctrGap,
    segment,
    pageType,
    cannibalized,
    action,
    reason: buildOpportunityReason(row, {ctrGap, expectedCtr, segment, cannibalized})
  };
}

function chooseSeoAction(row, context) {
  if (context.cannibalized) return 'Resolve cannibalization';
  if (context.ctrGap > 0 && row.position <= 10) return 'Rewrite title/meta';
  if (row.position >= 4 && row.position <= 12) return 'Improve content + internal links';
  if (row.position > 12 && row.position <= 25) return 'Expand content depth';
  return context.segment === 'Non-branded' ? 'Create supporting content' : 'Protect branded SERP';
}

function buildOpportunityReason(row, context) {
  const parts = [
    t('reason.impressions', '{count} impressions', {count: formatNumber(row.impressions)}),
    t('reason.rank', 'rank {rank}', {rank: row.position.toFixed(1)}),
    tv(context.segment)
  ];
  if (context.ctrGap > 0) parts.push(t('reason.ctrGap', '{gap} CTR gap', {gap: formatPct(context.ctrGap)}));
  if (context.cannibalized) parts.push(t('reason.multiPage', 'multi-page query'));
  return parts.join(' · ');
}

function formatActionRow(row) {
  return {
    Score: row.score,
    Priority: row.priority,
    Action: row.action,
    Page: row.page,
    Type: row.pageType,
    Query: row.query,
    Segment: row.segment,
    Impressions: formatNumber(row.impressions),
    CTR: formatPct(row.ctr),
    Position: row.position.toFixed(2),
    Reason: row.reason
  };
}

async function selectPageType(type) {
  pageTypeFilter.value = type;
  if (type !== 'All') await ensurePageTypeTrendRows();
}

async function ensurePageTypeTrendRows() {
  if (rawPageTypeTrend.value.length || pageTypeTrendLoading.value || busy.value) return;
  const siteUrl = controls.siteUrl.trim();
  if (!siteUrl || !controls.startDate || !controls.endDate) return;

  pageTypeTrendLoading.value = true;
  setStatus(t('status.fetchingPageType'));
  try {
    const pageTypeTrend = await getPageTypeTrend({
      siteUrl,
      startDate: controls.startDate,
      endDate: controls.endDate,
      rowLimit: 25000,
      maxPages: 20
    });
    rawPageTypeTrend.value = pageTypeTrend.rows || [];

    if (rawPageTypeTrend.value.length && (rawPages.value.length || trendRows.value.length)) {
      const snapshot = await saveSnapshot({
        source: 'gsc',
        siteUrl,
        dateRange: {startDate: controls.startDate, endDate: controls.endDate},
        metrics: metrics.value,
        datasets: {
          ...workspaceDatasets.value,
          trend: trendRows.value,
          pageTypeTrend: rawPageTypeTrend.value,
          pages: rawPages.value,
          queries: rawQueries.value,
          pageQuery: rawPageQuery.value
        }
      });
      workspaceDatasets.value = {
        ...workspaceDatasets.value,
        trend: trendRows.value,
        pageTypeTrend: rawPageTypeTrend.value,
        pages: rawPages.value,
        queries: rawQueries.value,
        pageQuery: rawPageQuery.value
      };
      workspaceSnapshotId.value = snapshot.id || workspaceSnapshotId.value;
      await loadSnapshots({hydrateWorkspace: false});
      setStatus(t('status.pageTypeSaved', '', {count: rawPageTypeTrend.value.length}), 'success');
    } else {
      setStatus(t('status.noPageTypeRows'), 'default');
    }
  } catch (err) {
    setStatus(err.message || '页面类型每日趋势拉取失败。', 'error');
  } finally {
    pageTypeTrendLoading.value = false;
  }
}

function handleAuthReturn() {
  const params = new URLSearchParams(window.location.search);
  const auth = params.get('auth');
  if (auth === 'success') {
    setStatus(t('status.authSuccess'), 'success');
    window.history.replaceState({}, document.title, window.location.pathname);
  } else if (auth === 'error') {
    setStatus(params.get('message') || t('status.authFailed'), 'error');
    window.history.replaceState({}, document.title, window.location.pathname);
  }
}

function startAuth() {
  window.location.href = '/auth';
}

async function loadSites() {
  try {
    busy.value = true;
    setStatus(t('status.loadingSites'));
    const data = await getSites();
    sites.value = data.rows || [];
    setStatus(t('status.loadedSites', '', {count: sites.value.length}), 'success');
  } catch (err) {
    if (err.status === 401) alert(t('status.notAuthorized'));
    setStatus(err.message || t('status.loadSitesFailed'), 'error');
  } finally {
    busy.value = false;
  }
}

async function loadSnapshots({hydrateWorkspace = true} = {}) {
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
    if (hydrateWorkspace) await hydrateWorkspaceFromLatestSnapshot(data.rows || []);
    await loadDeepAnalysis();
  } catch (err) {
    setStatus(err.message || t('status.loadingSnapshotsFailed'), 'error');
  }
}

async function hydrateWorkspaceFromLatestSnapshot(snapshotRows) {
  if (!snapshotRows.length) return;
  if (rawPages.value.length || rawPageQuery.value.length || rawPageTypeTrend.value.length) return;

  const selectedSite = controls.siteUrl.trim();
  const candidate = snapshotRows.find(row => row.source === 'gsc' && row.siteUrl === selectedSite)
    || snapshotRows.find(row => row.source === 'gsc')
    || snapshotRows[0];
  if (!candidate?.id) return;

  const snapshot = await getSnapshot(candidate.id);
  applySnapshotToWorkspace(snapshot);
  setStatus(t('status.snapshotHydrated', '', {id: candidate.id}), 'success');
}

function applySnapshotToWorkspace(snapshot) {
  const datasets = snapshot.datasets || {};
  if (!controls.siteUrl && snapshot.siteUrl) controls.siteUrl = snapshot.siteUrl;
  if (snapshot.dateRange?.startDate) controls.startDate = snapshot.dateRange.startDate;
  if (snapshot.dateRange?.endDate) controls.endDate = snapshot.dateRange.endDate;

  trendRows.value = datasets.trend || [];
  rawPageTypeTrend.value = datasets.pageTypeTrend || [];
  rawPages.value = datasets.pages || [];
  rawQueries.value = datasets.queries || [];
  rawPageQuery.value = datasets.pageQuery || [];
  workspaceDatasets.value = datasets;
  workspaceSnapshotId.value = snapshot.id || '';
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
    alert(t('status.missingSite'));
    return;
  }

  const params = { siteUrl };
  if (controls.startDate) params.startDate = controls.startDate;
  if (controls.endDate) params.endDate = controls.endDate;

  try {
    busy.value = true;
    setStatus(t('status.loadingGsc'));
    localStorage.setItem('gsc:lastSite', siteUrl);

    const [trend, pageTypeTrend, pages, queries, pageQuery, breakdowns] = await Promise.all([
      getTrend(params),
      getPageTypeTrend({...params, maxPages: 20}).catch(err => ({
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
    workspaceDatasets.value = {
      trend: trend.rows || [],
      pageTypeTrend: pageTypeTrend.rows || [],
      pages: pages.rows || [],
      queries: queries.rows || [],
      pageQuery: pageQuery.rows || [],
      countries: breakdowns.countries || [],
      devices: breakdowns.devices || [],
      searchAppearances: breakdowns.searchAppearances || [],
      searchTypes: breakdowns.searchTypes || []
    };

    const snapshot = await saveSnapshot({
      source: 'gsc',
      siteUrl,
      dateRange: {
        startDate: controls.startDate,
        endDate: controls.endDate
      },
      metrics: metrics.value,
      datasets: workspaceDatasets.value
    });
    workspaceSnapshotId.value = snapshot.id || workspaceSnapshotId.value;
    await loadSnapshots({hydrateWorkspace: false});
    setStatus(
      snapshot.cached
        ? t('status.cachedSnapshot', '', {id: snapshot.id})
        : pageTypeTrend.warning
        ? t('status.pageTypeSkipped', '', {id: snapshot.id, warning: pageTypeTrend.warning})
        : breakdowns.warning
        ? t('status.breakdownSkipped', '', {id: snapshot.id, warning: breakdowns.warning})
        : t('status.savedSnapshot', '', {id: snapshot.id}),
      pageTypeTrend.warning || breakdowns.warning ? 'default' : 'success'
    );
  } catch (err) {
    if (err.status === 401) alert(t('status.notAuthorized'));
    setStatus(err.message || t('status.loadFailed'), 'error');
  } finally {
    busy.value = false;
  }
}

function formatOpportunityRow(row) {
  return {
    Page: row.page,
    Type: detectShopifyType(row.page),
    Query: row.query,
    Segment: isBrandedQuery(row.query) ? 'Branded' : 'Non-branded',
    Clicks: formatNumber(row.clicks),
    Impressions: formatNumber(row.impressions),
    CTR: formatPct(row.ctr),
    Position: row.position.toFixed(2)
  };
}

function formatQueryRow(row) {
  return {
    Query: row.query,
    Segment: isBrandedQuery(row.query) ? 'Branded' : 'Non-branded',
    Clicks: formatNumber(row.clicks),
    Impressions: formatNumber(row.impressions),
    CTR: formatPct(row.ctr),
    Position: row.position.toFixed(2)
  };
}

function formatSigned(value, digits = 0) {
  if (value == null || Number.isNaN(Number(value))) return '-';
  const number = Number(value);
  const prefix = number > 0 ? '+' : '';
  return `${prefix}${number.toFixed(digits)}`;
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

watch(themeMode, mode => {
  document.documentElement.dataset.theme = mode;
  document.documentElement.style.colorScheme = mode;
  localStorage.setItem('seo-dashboard:theme', mode);
}, {immediate: true});

watch(querySegment, segment => {
  localStorage.setItem('gsc:querySegment', segment);
});

watch(brandTerms, terms => {
  localStorage.setItem('gsc:brandTerms', terms);
});

watch(locale, mode => {
  document.documentElement.lang = mode === 'zh' ? 'zh-CN' : 'en';
  if (status.message === 'Ready' || status.message === '就绪') {
    status.message = t('status.ready');
  }
}, {immediate: true});
</script>

<template>
  <main class="shell">
    <AppHeader
      :active-property="activeProperty"
      :status="status"
      :theme-mode="themeMode"
      @toggle-theme="toggleTheme"
    />
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
            <strong>{{ t('filter.pageType') }}</strong>
            <small>
              {{ workspaceDataReady
                ? t('filter.workspaceReady', '', {target: workspaceSnapshotId ? `snapshot ${workspaceSnapshotId}` : t('filter.currentData')})
                : t('filter.workspaceEmpty') }}
            </small>
          </span>
        </div>
        <div class="segmented-control">
          <button
            v-for="type in PAGE_TYPES"
            :key="type"
            type="button"
            :class="{ active: pageTypeFilter === type }"
            @click="selectPageType(type)"
          >
            {{ tv(type) }}
          </button>
        </div>
      </section>

      <section class="channel-filter query-filter">
        <div>
          <Search />
          <span>
            <strong>{{ t('filter.querySegment') }}</strong>
            <small>
              {{ t('filter.querySegmentHelp', '', {terms: effectiveBrandTerms.length ? effectiveBrandTerms.join(', ') : t('filter.none')}) }}
            </small>
          </span>
        </div>
        <label class="brand-terms-field">
          {{ t('filter.brandTerms') }}
          <input
            v-model="brandTerms"
            type="text"
            :placeholder="inferBrandTerms(controls.siteUrl) || 'rapoo, brand name'"
          />
        </label>
        <div class="segmented-control">
          <button
            v-for="segment in querySegments"
            :key="segment"
            type="button"
            :class="{ active: querySegment === segment }"
            @click="querySegment = segment"
          >
            {{ tv(segment) }}
          </button>
        </div>
      </section>

      <div v-if="!workspaceDataReady" class="empty">
        {{ t('empty.workspace') }}
      </div>

      <section class="workspace">
        <section>
          <Panel
            :title="pageTypeFilter === 'All' ? t('trend.performance') : t('trend.performanceTyped', '', {type: tv(pageTypeFilter)})"
            :icon="TrendingUp"
            :meta="t('meta.points', '', {count: performanceTrendRows.length})"
          >
            <TrendChart :key="`${themeMode}:${performanceTrendKey}`" :rows="performanceTrendRows" :theme-mode="themeMode" />
            <div v-if="pageTypeFilter !== 'All' && pageTypeTrendLoading" class="empty">
              {{ t('trend.fetchingDaily', '', {type: tv(pageTypeFilter)}) }}
            </div>
            <div v-else-if="pageTypeFilter !== 'All' && performanceTrendRows.length === 0" class="empty">
              {{ t('trend.noDaily', '', {type: tv(pageTypeFilter)}) }}
            </div>
          </Panel>

          <div class="tables">
            <Panel :title="t('panel.seoActionBoard')" :icon="Sparkles" :meta="t('meta.actions', '', {count: seoActionRows.length})">
              <DataTable
                :rows="seoActionRows"
                :columns="['Score', 'Priority', 'Action', 'Page', 'Type', 'Query', 'Segment', 'Impressions', 'CTR', 'Position', 'Reason']"
                :numeric-columns="['Score', 'Impressions', 'CTR', 'Position']"
              />
            </Panel>

            <Panel :title="t('panel.quickWins')" :icon="Gauge" :meta="t('meta.quickWins', '', {count: quickWinRows.length})">
              <DataTable
                :rows="quickWinRows"
                :columns="['Score', 'Priority', 'Page', 'Type', 'Query', 'Segment', 'Impressions', 'CTR', 'Expected', 'Position', 'Action']"
                :numeric-columns="['Score', 'Impressions', 'CTR', 'Expected', 'Position']"
              />
            </Panel>

            <Panel :title="t('panel.contentRefresh')" :icon="Files" :meta="t('meta.pages', '', {count: contentRefreshRows.length})">
              <DataTable
                :rows="contentRefreshRows"
                :columns="['Score', 'Page', 'Type', 'Best Query', 'Queries', 'Low CTR Queries', 'Impressions', 'CTR', 'Position', 'Decay', 'Action']"
                :numeric-columns="['Score', 'Queries', 'Low CTR Queries', 'Impressions', 'CTR', 'Position']"
              />
            </Panel>

            <Panel
              v-if="pageTypeFilter !== 'All'"
              :title="t('panel.dailyRows', '', {type: tv(pageTypeFilter)})"
              :icon="Funnel"
              :meta="t('meta.days', '', {count: pageTypeDailyRows.length})"
            >
              <DataTable :rows="pageTypeDailyRows" :columns="['Date', 'Type', 'Clicks', 'Impressions', 'CTR', 'Position', 'Pages']" />
            </Panel>

            <Panel :title="t('panel.pageTypeSummary')" :icon="Funnel" :meta="t('meta.types', '', {count: pageTypeSummary.length})">
              <DataTable :rows="pageTypeSummary" :columns="['Type', 'Pages', 'Clicks', 'Impressions', 'CTR', 'Position']" />
            </Panel>

            <Panel :title="t('panel.querySegmentSummary')" :icon="Search" :meta="t('meta.segments', '', {count: querySegmentSummary.length})">
              <DataTable :rows="querySegmentSummary" :columns="['Segment', 'Queries', 'Clicks', 'Impressions', 'CTR', 'Position']" />
            </Panel>

            <Panel :title="t('panel.topPages')" :icon="Files" :meta="t('meta.rows', '', {count: topPages.length})">
              <DataTable :rows="topPages" :columns="['Page', 'Type', 'Clicks', 'Impressions', 'CTR', 'Position']" />
            </Panel>

            <Panel :title="t('panel.topQueries')" :icon="Search" :meta="t('meta.rows', '', {count: topQueries.length})">
              <DataTable :rows="topQueries" :columns="['Query', 'Segment', 'Clicks', 'Impressions', 'CTR', 'Position']" />
            </Panel>
          </div>
        </section>

        <aside class="side-stack">
          <Panel :title="t('panel.pageDecay')" :icon="TrendingUp" :meta="t('meta.pages', '', {count: pageDecayRows.length})">
            <DataTable
              :rows="pageDecayRows"
              :columns="['Page', 'Type', 'Severity', 'Clicks Lost', 'Impr. Lost', 'Click Δ', 'Position Δ', 'Action']"
              :numeric-columns="['Severity', 'Clicks Lost', 'Impr. Lost', 'Click Δ', 'Position Δ']"
            />
          </Panel>

          <Panel :title="t('panel.cannibalization')" :icon="Funnel" :meta="t('meta.queries', '', {count: cannibalizationRows.length})">
            <DataTable
              :rows="cannibalizationRows"
              :columns="['Query', 'Segment', 'Pages', 'Clicks', 'Impressions', 'Top Share', 'Top Page', 'Competing Pages', 'Action']"
              :numeric-columns="['Pages', 'Clicks', 'Impressions', 'Top Share']"
            />
          </Panel>

          <Panel :title="t('panel.lowCtr')" :icon="Gauge" :meta="t('meta.rows', '', {count: lowCtrRows.length})">
            <DataTable :rows="lowCtrRows" :columns="['Page', 'Type', 'Query', 'Segment', 'Clicks', 'Impressions', 'CTR', 'Position']" />
          </Panel>

          <Panel :title="t('panel.keywordOpportunities')" :icon="Sparkles" :meta="t('meta.rows', '', {count: keywordRows.length})">
            <DataTable :rows="keywordRows" :columns="['Page', 'Type', 'Query', 'Segment', 'Clicks', 'Impressions', 'CTR', 'Position']" />
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
      :title="t('ga.title')"
      :eyebrow="t('ga.eyebrow')"
      :description="t('ga.description')"
      :icon="BarChart3"
      :bullets="[
        { title: t('ga.traffic'), text: t('ga.trafficText') },
        { title: t('ga.conversion'), text: t('ga.conversionText') },
        { title: t('ga.linkage'), text: t('ga.linkageText') }
      ]"
    />

    <HistoryView
      v-else-if="activeView === 'history'"
      :snapshots="snapshots"
      :trend-rows="historyTrendRows"
      :page-type-rows="pageTypeTrendRows"
      :db-stats="historyStats"
      :busy="busy"
      :theme-mode="themeMode"
      @refresh="loadSnapshots"
    />

    <FutureModule
      v-else
      :title="t('ai.title')"
      :eyebrow="t('ai.eyebrow')"
      :description="t('ai.description')"
      :icon="BrainCircuit"
      :bullets="[
        { title: t('ai.memory'), text: t('ai.memoryText') },
        { title: t('ai.crossSource'), text: t('ai.crossSourceText') },
        { title: t('ai.actions'), text: t('ai.actionsText') }
      ]"
    />
  </main>
</template>
