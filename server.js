const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const {google} = require('googleapis');
const {
  backupDatabase,
  getDatabaseStats,
  getGscDeepAnalysis,
  getGscSnapshotTrends,
  getMigrationStatus,
  initLocalDatabase,
  listDatabaseSnapshots,
  saveSnapshotToDatabase,
  syncSnapshotsFromDisk
} = require('./localDb');

const app = express();
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';

const CREDENTIALS_PATH = path.join(__dirname, 'credentials.json');
const TOKEN_PATH = path.join(__dirname, 'token.json');
const DATA_PATH = path.join(__dirname, 'data');
const SNAPSHOTS_PATH = path.join(DATA_PATH, 'snapshots');
const BACKUPS_PATH = path.join(DATA_PATH, 'backups');
const DATABASE_PATH = path.join(DATA_PATH, 'seo-data.sqlite');
const FRONTEND_DIST_PATH = path.join(__dirname, 'frontend', 'dist');
const LEGACY_PUBLIC_PATH = path.join(__dirname, 'public');
const SCOPES = ['https://www.googleapis.com/auth/webmasters.readonly'];
const REDIRECT_URI = process.env.REDIRECT_URI || `http://localhost:${PORT}/oauth2callback`;
const OAUTH_TIMEOUT_MS = 20000;
const DASHBOARD_URL = process.env.DASHBOARD_URL || `http://localhost:${PORT}/`;

const STATIC_PATH = fs.existsSync(FRONTEND_DIST_PATH) ? FRONTEND_DIST_PATH : LEGACY_PUBLIC_PATH;

app.use(express.json({limit: '50mb'}));
app.use(express.static(STATIC_PATH));

function loadCredentials() {
  if (!fs.existsSync(CREDENTIALS_PATH)) {
    throw new Error('credentials.json not found in project root.');
  }
  const content = fs.readFileSync(CREDENTIALS_PATH, 'utf8');
  const creds = JSON.parse(content);
  // support both "installed" and "web" formats
  const data = creds.installed || creds.web || creds;
  const clientId = data.client_id || data.clientId;
  const clientSecret = data.client_secret || data.clientSecret;
  if (!clientId || !clientSecret) {
    throw new Error('Invalid credentials.json: missing client_id or client_secret.');
  }
  return {clientId, clientSecret};
}

function createOAuth2Client() {
  const {clientId, clientSecret} = loadCredentials();
  const oAuth2Client = new google.auth.OAuth2(clientId, clientSecret, REDIRECT_URI);

  // Persist tokens when client refreshes or receives new tokens.
  oAuth2Client.on('tokens', (tokens) => saveTokens(tokens));

  return oAuth2Client;
}

function saveTokens(tokens) {
  if (!tokens || Object.keys(tokens).length === 0) return;
  let existing = {};
  if (fs.existsSync(TOKEN_PATH)) {
    try {
      existing = JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf8'));
    } catch (e) {
      existing = {};
    }
  }
  const merged = Object.assign({}, existing, tokens);
  fs.writeFileSync(TOKEN_PATH, JSON.stringify(merged, null, 2));
}

function withTimeout(promise, ms, message) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(message)), ms))
  ]);
}

function getGoogleErrorMessage(err) {
  const responseData = err.response && err.response.data;
  if (responseData) {
    if (typeof responseData === 'string') return responseData;
    return responseData.error_description || responseData.error || JSON.stringify(responseData);
  }
  return err.message;
}

function renderRedirectPage({title, message, targetUrl, status = 'success'}) {
  const safeTitle = escapeHtml(title);
  const safeMessage = escapeHtml(message);
  const safeTargetUrl = escapeHtml(targetUrl);
  const color = status === 'success' ? '#166534' : '#be123c';
  const bg = status === 'success' ? '#f0fdf4' : '#fff1f2';
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta http-equiv="refresh" content="1.2;url=${safeTargetUrl}">
  <title>${safeTitle}</title>
  <style>
    body{margin:0;min-height:100vh;display:grid;place-items:center;background:#f6f7f9;color:#151922;font-family:Inter,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",Arial,sans-serif}
    main{width:min(440px,calc(100% - 32px));padding:28px;border:1px solid #d9e1e7;border-radius:8px;background:#fff;box-shadow:0 16px 44px rgba(25,35,52,.08);text-align:center}
    .badge{width:48px;height:48px;border-radius:999px;display:grid;place-items:center;margin:0 auto 16px;background:${bg};color:${color};font-size:26px;font-weight:700}
    h1{font-size:20px;margin:0 0 8px}
    p{margin:0;color:#667085;line-height:1.5}
    a{display:inline-block;margin-top:18px;color:#2563eb;text-decoration:none;font-weight:650}
  </style>
</head>
<body>
  <main>
    <div class="badge">${status === 'success' ? '✓' : '!'}</div>
    <h1>${safeTitle}</h1>
    <p>${safeMessage}</p>
    <a href="${safeTargetUrl}">Return to dashboard</a>
  </main>
  <script>setTimeout(()=>{ window.location.replace(${JSON.stringify(targetUrl)}); }, 900);</script>
</body>
</html>`;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function ensureDataDirs() {
  fs.mkdirSync(SNAPSHOTS_PATH, {recursive: true});
  fs.mkdirSync(BACKUPS_PATH, {recursive: true});
}

function initStorage() {
  ensureDataDirs();
  initLocalDatabase(DATABASE_PATH);
  const result = syncSnapshotsFromDisk(SNAPSHOTS_PATH);
  console.log(`Local SQLite database ready at ${DATABASE_PATH}`);
  if (result.synced) console.log(`Synced ${result.synced} JSON snapshots into SQLite.`);
}

function snapshotId(source, siteUrl, capturedAt) {
  const hash = crypto
    .createHash('sha1')
    .update(`${source}:${siteUrl}:${capturedAt}:${Math.random()}`)
    .digest('hex')
    .slice(0, 10);
  return `${source}-${capturedAt.replace(/[:.]/g, '-')}-${hash}`;
}

function snapshotPath(id) {
  return path.join(SNAPSHOTS_PATH, `${id}.json`);
}

function safeReadJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (err) {
    return null;
  }
}

app.get('/auth', (req, res) => {
  try {
    const oAuth2Client = createOAuth2Client();
    const authUrl = oAuth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: SCOPES,
      prompt: 'consent'
    });
    console.log(`Starting OAuth flow with redirect URI: ${REDIRECT_URI}`);
    res.redirect(authUrl);
  } catch (err) {
    console.error('Auth error', err.message);
    res.status(500).send('Unable to start OAuth flow: ' + err.message);
  }
});

app.get('/oauth2callback', async (req, res) => {
  if (req.query.error) {
    const description = req.query.error_description || req.query.error;
    console.error('OAuth callback rejected:', description);
    const targetUrl = `${DASHBOARD_URL}?auth=error&message=${encodeURIComponent(description)}`;
    return res.status(400).send(renderRedirectPage({
      title: 'Authorization failed',
      message: description,
      targetUrl,
      status: 'error'
    }));
  }

  const code = req.query.code;
  if (!code) return res.status(400).send('Missing code in callback');
  try {
    console.log(`OAuth callback received. Exchanging code with redirect URI: ${REDIRECT_URI}`);
    const oAuth2Client = createOAuth2Client();
    const {tokens} = await withTimeout(
      oAuth2Client.getToken(code),
      OAUTH_TIMEOUT_MS,
      'Timed out exchanging OAuth code for token. Check network access to oauth2.googleapis.com.'
    );
    oAuth2Client.setCredentials(tokens);
    saveTokens(tokens);
    console.log('OAuth token saved to token.json.');
    res.send(renderRedirectPage({
      title: 'Authorization successful',
      message: 'Token saved. Returning to dashboard...',
      targetUrl: `${DASHBOARD_URL}?auth=success`,
      status: 'success'
    }));
  } catch (err) {
    const message = getGoogleErrorMessage(err);
    console.error('OAuth callback error', message);
    const targetUrl = `${DASHBOARD_URL}?auth=error&message=${encodeURIComponent(message)}`;
    res.status(500).send(renderRedirectPage({
      title: 'Authorization failed',
      message,
      targetUrl,
      status: 'error'
    }));
  }
});

app.get('/api/oauth/debug', (req, res) => {
  try {
    const {clientId} = loadCredentials();
    res.json({
      clientId,
      activeRedirectUri: REDIRECT_URI,
      redirectUriToAddInGoogleCloud: REDIRECT_URI,
      authUrl: `/auth`
    });
  } catch (err) {
    res.status(500).json({error: err.message});
  }
});

function authorizeFromDisk() {
  if (!fs.existsSync(TOKEN_PATH)) return null;
  try {
    const token = JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf8'));
    const oAuth2Client = createOAuth2Client();
    oAuth2Client.setCredentials(token);
    return oAuth2Client;
  } catch (err) {
    throw new Error('Unable to read token.json. Please reauthorize at /auth.');
  }
}

async function querySearchAnalytics(authClient, siteUrl, requestBody) {
  const webmasters = google.webmasters({version: 'v3', auth: authClient});
  const res = await webmasters.searchanalytics.query({
    siteUrl,
    requestBody
  });
  return res.data;
}

async function listSites(authClient) {
  const webmasters = google.webmasters({version: 'v3', auth: authClient});
  const res = await webmasters.sites.list();
  return res.data.siteEntry || [];
}

function defaultDatesFromQuery(q) {
  const end = parseDateParam(q.endDate) || new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
  const start = parseDateParam(q.startDate) || new Date(end.getTime() - 28 * 24 * 60 * 60 * 1000);
  const fmt = d => d.toISOString().slice(0,10);
  return {startDate: fmt(start), endDate: fmt(end)};
}

function transformDimensionRows(data, key) {
  return (data.rows || []).map(r => ({
    [key]: r.keys && r.keys.length ? r.keys[0] : 'unknown',
    clicks: r.clicks || 0,
    impressions: r.impressions || 0,
    ctr: r.ctr || 0,
    position: r.position || 0
  }));
}

function transformSearchTypeRow(data, type) {
  const row = data.rows && data.rows[0] ? data.rows[0] : {};
  return {
    type,
    clicks: row.clicks || 0,
    impressions: row.impressions || 0,
    ctr: row.ctr || 0,
    position: row.position || 0
  };
}

function parseDateParam(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

app.get('/api/gsc/sites', async (req, res) => {
  try {
    const auth = authorizeFromDisk();
    if (!auth) return res.status(401).json({error: 'Not authorized. Visit /auth to authorize.'});
    const sites = await listSites(auth);
    const rows = sites
      .map(site => ({
        siteUrl: site.siteUrl,
        permissionLevel: site.permissionLevel || 'unknown'
      }))
      .sort((a, b) => a.siteUrl.localeCompare(b.siteUrl));
    res.json({rows, totalRows: rows.length});
  } catch (err) {
    console.error('Sites error', err.message);
    res.status(500).json({error: err.message});
  }
});

app.get('/api/gsc/trend', async (req, res) => {
  try {
    const auth = authorizeFromDisk();
    if (!auth) return res.status(401).json({error: 'Not authorized. Visit /auth to authorize.'});
    const siteUrl = req.query.siteUrl;
    if (!siteUrl) return res.status(400).json({error: 'Missing siteUrl query parameter.'});
    const {startDate, endDate} = defaultDatesFromQuery(req.query);
    const rowLimit = parseInt(req.query.rowLimit || '25000', 10);
    const startRow = parseInt(req.query.startRow || '0', 10);
    const requestBody = {
      startDate,
      endDate,
      dimensions: ['date'],
      rowLimit,
      startRow
    };
    const data = await querySearchAnalytics(auth, siteUrl, requestBody);
    // transform rows into arrays
    const rows = (data.rows || []).map(r => ({date: r.keys[0], clicks: r.clicks || 0, impressions: r.impressions || 0, ctr: r.ctr || 0, position: r.position || 0}));
    res.json({rows, totals: data.totalRows || rows.length});
  } catch (err) {
    console.error('Trend error', err.message);
    res.status(500).json({error: err.message});
  }
});

app.get('/api/gsc/pages', async (req, res) => {
  try {
    const auth = authorizeFromDisk();
    if (!auth) return res.status(401).json({error: 'Not authorized. Visit /auth to authorize.'});
    const siteUrl = req.query.siteUrl;
    if (!siteUrl) return res.status(400).json({error: 'Missing siteUrl query parameter.'});
    const {startDate, endDate} = defaultDatesFromQuery(req.query);
    const rowLimit = parseInt(req.query.rowLimit || '25000', 10);
    const startRow = parseInt(req.query.startRow || '0', 10);
    const requestBody = {startDate, endDate, dimensions: ['page'], rowLimit, startRow};
    const data = await querySearchAnalytics(auth, siteUrl, requestBody);
    const rows = (data.rows || []).map(r => ({page: r.keys[0], clicks: r.clicks || 0, impressions: r.impressions || 0, ctr: r.ctr || 0, position: r.position || 0}));
    res.json({rows, totalRows: data.totalRows || rows.length});
  } catch (err) {
    console.error('Pages error', err.message);
    res.status(500).json({error: err.message});
  }
});

app.get('/api/gsc/queries', async (req, res) => {
  try {
    const auth = authorizeFromDisk();
    if (!auth) return res.status(401).json({error: 'Not authorized. Visit /auth to authorize.'});
    const siteUrl = req.query.siteUrl;
    if (!siteUrl) return res.status(400).json({error: 'Missing siteUrl query parameter.'});
    const {startDate, endDate} = defaultDatesFromQuery(req.query);
    const rowLimit = parseInt(req.query.rowLimit || '25000', 10);
    const startRow = parseInt(req.query.startRow || '0', 10);
    const requestBody = {startDate, endDate, dimensions: ['query'], rowLimit, startRow};
    const data = await querySearchAnalytics(auth, siteUrl, requestBody);
    const rows = (data.rows || []).map(r => ({query: r.keys[0], clicks: r.clicks || 0, impressions: r.impressions || 0, ctr: r.ctr || 0, position: r.position || 0}));
    res.json({rows, totalRows: data.totalRows || rows.length});
  } catch (err) {
    console.error('Queries error', err.message);
    res.status(500).json({error: err.message});
  }
});

app.get('/api/gsc/page-query', async (req, res) => {
  try {
    const auth = authorizeFromDisk();
    if (!auth) return res.status(401).json({error: 'Not authorized. Visit /auth to authorize.'});
    const siteUrl = req.query.siteUrl;
    if (!siteUrl) return res.status(400).json({error: 'Missing siteUrl query parameter.'});
    const {startDate, endDate} = defaultDatesFromQuery(req.query);
    const rowLimit = parseInt(req.query.rowLimit || '25000', 10);
    const startRow = parseInt(req.query.startRow || '0', 10);
    const requestBody = {startDate, endDate, dimensions: ['page', 'query'], rowLimit, startRow};
    const data = await querySearchAnalytics(auth, siteUrl, requestBody);
    const rows = (data.rows || []).map(r => ({page: r.keys[0], query: r.keys[1], clicks: r.clicks || 0, impressions: r.impressions || 0, ctr: r.ctr || 0, position: r.position || 0}));
    res.json({rows, totalRows: data.totalRows || rows.length});
  } catch (err) {
    console.error('Page-query error', err.message);
    res.status(500).json({error: err.message});
  }
});

app.get('/api/gsc/breakdowns', async (req, res) => {
  try {
    const auth = authorizeFromDisk();
    if (!auth) return res.status(401).json({error: 'Not authorized. Visit /auth to authorize.'});
    const siteUrl = req.query.siteUrl;
    if (!siteUrl) return res.status(400).json({error: 'Missing siteUrl query parameter.'});
    const {startDate, endDate} = defaultDatesFromQuery(req.query);
    const rowLimit = parseInt(req.query.rowLimit || '5000', 10);
    const base = {startDate, endDate, rowLimit, startRow: 0};
    const searchTypes = ['web', 'image', 'video', 'news'];

    const [countries, devices, searchAppearances, ...typedResults] = await Promise.all([
      querySearchAnalytics(auth, siteUrl, {...base, dimensions: ['country']}),
      querySearchAnalytics(auth, siteUrl, {...base, dimensions: ['device']}),
      querySearchAnalytics(auth, siteUrl, {...base, dimensions: ['searchAppearance']}),
      ...searchTypes.map(type => querySearchAnalytics(auth, siteUrl, {...base, type}))
    ]);

    res.json({
      countries: transformDimensionRows(countries, 'country'),
      devices: transformDimensionRows(devices, 'device'),
      searchAppearances: transformDimensionRows(searchAppearances, 'appearance'),
      searchTypes: typedResults.map((data, index) => transformSearchTypeRow(data, searchTypes[index]))
    });
  } catch (err) {
    console.error('Breakdowns error', err.message);
    res.status(500).json({error: err.message});
  }
});

app.post('/api/history/snapshots', (req, res) => {
  try {
    ensureDataDirs();
    const source = req.body.source || 'gsc';
    const siteUrl = req.body.siteUrl;
    const dateRange = req.body.dateRange || {};
    const datasets = req.body.datasets || {};
    const metrics = req.body.metrics || {};
    if (!siteUrl) return res.status(400).json({error: 'Missing siteUrl.'});

    const capturedAt = new Date().toISOString();
    const id = snapshotId(source, siteUrl, capturedAt);
    const snapshot = {
      id,
      source,
      siteUrl,
      dateRange,
      capturedAt,
      metrics,
      datasetSizes: Object.fromEntries(
        Object.entries(datasets).map(([key, value]) => [key, Array.isArray(value) ? value.length : 0])
      ),
      datasets
    };

    const rawPath = snapshotPath(id);
    fs.writeFileSync(rawPath, JSON.stringify(snapshot, null, 2));
    saveSnapshotToDatabase(snapshot, rawPath);
    res.json({
      id,
      source,
      siteUrl,
      dateRange,
      capturedAt,
      metrics,
      datasetSizes: snapshot.datasetSizes
    });
  } catch (err) {
    console.error('Snapshot save error', err.message);
    res.status(500).json({error: err.message});
  }
});

app.get('/api/history/snapshots', (req, res) => {
  try {
    ensureDataDirs();
    const source = req.query.source;
    const rows = listDatabaseSnapshots({source});
    res.json({rows, totalRows: rows.length});
  } catch (err) {
    console.error('Snapshot list error', err.message);
    res.status(500).json({error: err.message});
  }
});

app.get('/api/history/snapshots/:id', (req, res) => {
  try {
    ensureDataDirs();
    const id = req.params.id;
    if (!/^[a-z0-9_.-]+$/i.test(id)) return res.status(400).json({error: 'Invalid snapshot id.'});
    const snapshot = safeReadJson(snapshotPath(id));
    if (!snapshot) return res.status(404).json({error: 'Snapshot not found.'});
    res.json(snapshot);
  } catch (err) {
    console.error('Snapshot read error', err.message);
    res.status(500).json({error: err.message});
  }
});

app.get('/api/history/stats', (req, res) => {
  try {
    res.json({
      databasePath: DATABASE_PATH,
      stats: getDatabaseStats()
    });
  } catch (err) {
    console.error('History stats error', err.message);
    res.status(500).json({error: err.message});
  }
});

app.get('/api/history/gsc-trends', (req, res) => {
  try {
    const rows = getGscSnapshotTrends({
      siteUrl: req.query.siteUrl,
      limit: req.query.limit
    });
    res.json({rows, totalRows: rows.length});
  } catch (err) {
    console.error('GSC history trend error', err.message);
    res.status(500).json({error: err.message});
  }
});

app.get('/api/history/gsc-deep-analysis', (req, res) => {
  try {
    const analysis = getGscDeepAnalysis({
      siteUrl: req.query.siteUrl,
      limit: req.query.limit,
      minImpressions: req.query.minImpressions
    });
    res.json(analysis);
  } catch (err) {
    console.error('GSC deep analysis error', err.message);
    res.status(500).json({error: err.message});
  }
});

app.get('/api/history/migrations', (req, res) => {
  try {
    res.json(getMigrationStatus());
  } catch (err) {
    console.error('Migration status error', err.message);
    res.status(500).json({error: err.message});
  }
});

app.post('/api/history/backup', (req, res) => {
  try {
    const result = backupDatabase(DATABASE_PATH, BACKUPS_PATH);
    res.json(result);
  } catch (err) {
    console.error('Database backup error', err.message);
    res.status(500).json({error: err.message});
  }
});

app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/') || req.path === '/auth' || req.path === '/oauth2callback') {
    return next();
  }

  res.sendFile(path.join(STATIC_PATH, 'index.html'));
});

initStorage();

app.listen(PORT, HOST, () => {
  console.log(`Server started on http://localhost:${PORT}`);
  console.log(`OAuth redirect URI: ${REDIRECT_URI}`);
  console.log(`Serving frontend from ${STATIC_PATH}`);
});
