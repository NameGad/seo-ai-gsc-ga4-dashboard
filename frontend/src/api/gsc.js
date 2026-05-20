async function request(path, params = {}) {
  const qs = new URLSearchParams(params);
  const url = qs.toString() ? `${path}?${qs.toString()}` : path;
  const res = await fetch(url);
  const text = await res.text();
  const data = parseResponseBody(text);

  if (!res.ok) {
    const error = new Error(formatHttpError(data.error, res.status));
    error.status = res.status;
    throw error;
  }

  return data;
}

async function post(path, body = {}) {
  const res = await fetch(path, {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify(body)
  });
  const text = await res.text();
  const data = parseResponseBody(text);

  if (!res.ok) {
    const error = new Error(formatHttpError(data.error, res.status));
    error.status = res.status;
    throw error;
  }

  return data;
}

function parseResponseBody(text) {
  try {
    return text ? JSON.parse(text) : {};
  } catch (err) {
    return {error: stripHtmlError(text)};
  }
}

function stripHtmlError(text = '') {
  const preMatch = text.match(/<pre[^>]*>([\s\S]*?)<\/pre>/i);
  const raw = preMatch ? preMatch[1] : text;
  const stripped = raw
    .replace(/<[^>]+>/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
  return stripped || '服务器返回了非 JSON 响应。';
}

function formatHttpError(message, status) {
  if (message && message.includes('Cannot GET /api/')) {
    return `${message}. 当前 3000 端口可能还在运行旧版服务，请重启 npm start 后再试。`;
  }
  return message || `请求失败：HTTP ${status}`;
}

export function getOauthDebug() {
  return request('/api/oauth/debug');
}

export function getSites() {
  return request('/api/gsc/sites');
}

export function getTrend(params) {
  return request('/api/gsc/trend', params);
}

export function getPages(params) {
  return request('/api/gsc/pages', params);
}

export function getQueries(params) {
  return request('/api/gsc/queries', params);
}

export function getPageQuery(params) {
  return request('/api/gsc/page-query', params);
}

export function getPageTypeTrend(params) {
  return request('/api/gsc/page-type-trend', params);
}

export function getBreakdowns(params) {
  return request('/api/gsc/breakdowns', params);
}

export function saveSnapshot(snapshot) {
  return post('/api/history/snapshots', snapshot);
}

export function getSnapshots(params = {}) {
  return request('/api/history/snapshots', params);
}

export function getHistoryStats() {
  return request('/api/history/stats');
}

export function getGscHistoryTrends(params = {}) {
  return request('/api/history/gsc-trends', params);
}

export function getGscPageTypeTrends(params = {}) {
  return request('/api/history/gsc-page-types', params);
}

export function getGscDeepAnalysis(params = {}) {
  return request('/api/history/gsc-deep-analysis', params);
}

export function getSnapshot(id) {
  return request(`/api/history/snapshots/${encodeURIComponent(id)}`);
}
