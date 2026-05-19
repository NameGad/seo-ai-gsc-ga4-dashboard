const fs = require('fs');
const path = require('path');
const {DatabaseSync} = require('node:sqlite');

let db;

const MIGRATIONS = [
  {
    version: 1,
    name: 'core_gsc_snapshot_tables',
    up(database) {
      database.exec(`
        CREATE TABLE IF NOT EXISTS snapshots (
          id TEXT PRIMARY KEY,
          source TEXT NOT NULL,
          site_url TEXT NOT NULL,
          start_date TEXT,
          end_date TEXT,
          captured_at TEXT NOT NULL,
          metrics_json TEXT,
          dataset_sizes_json TEXT,
          raw_snapshot_path TEXT
        );

        CREATE TABLE IF NOT EXISTS gsc_trend (
          snapshot_id TEXT NOT NULL,
          date TEXT NOT NULL,
          clicks INTEGER NOT NULL DEFAULT 0,
          impressions INTEGER NOT NULL DEFAULT 0,
          ctr REAL NOT NULL DEFAULT 0,
          position REAL NOT NULL DEFAULT 0,
          PRIMARY KEY (snapshot_id, date),
          FOREIGN KEY (snapshot_id) REFERENCES snapshots(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS gsc_pages (
          snapshot_id TEXT NOT NULL,
          page TEXT NOT NULL,
          clicks INTEGER NOT NULL DEFAULT 0,
          impressions INTEGER NOT NULL DEFAULT 0,
          ctr REAL NOT NULL DEFAULT 0,
          position REAL NOT NULL DEFAULT 0,
          PRIMARY KEY (snapshot_id, page),
          FOREIGN KEY (snapshot_id) REFERENCES snapshots(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS gsc_queries (
          snapshot_id TEXT NOT NULL,
          query_text TEXT NOT NULL,
          clicks INTEGER NOT NULL DEFAULT 0,
          impressions INTEGER NOT NULL DEFAULT 0,
          ctr REAL NOT NULL DEFAULT 0,
          position REAL NOT NULL DEFAULT 0,
          PRIMARY KEY (snapshot_id, query_text),
          FOREIGN KEY (snapshot_id) REFERENCES snapshots(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS gsc_page_queries (
          snapshot_id TEXT NOT NULL,
          page TEXT NOT NULL,
          query_text TEXT NOT NULL,
          clicks INTEGER NOT NULL DEFAULT 0,
          impressions INTEGER NOT NULL DEFAULT 0,
          ctr REAL NOT NULL DEFAULT 0,
          position REAL NOT NULL DEFAULT 0,
          PRIMARY KEY (snapshot_id, page, query_text),
          FOREIGN KEY (snapshot_id) REFERENCES snapshots(id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_snapshots_source_site_date ON snapshots(source, site_url, captured_at);
        CREATE INDEX IF NOT EXISTS idx_gsc_pages_snapshot_impressions ON gsc_pages(snapshot_id, impressions DESC);
        CREATE INDEX IF NOT EXISTS idx_gsc_queries_snapshot_impressions ON gsc_queries(snapshot_id, impressions DESC);
        CREATE INDEX IF NOT EXISTS idx_gsc_page_queries_snapshot_impressions ON gsc_page_queries(snapshot_id, impressions DESC);
      `);
    }
  },
  {
    version: 2,
    name: 'metadata_and_sync_tables',
    up(database) {
      database.exec(`
        CREATE TABLE IF NOT EXISTS data_sources (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'planned',
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS sites (
          site_url TEXT PRIMARY KEY,
          display_name TEXT,
          property_type TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS sync_jobs (
          id TEXT PRIMARY KEY,
          source TEXT NOT NULL,
          site_url TEXT,
          status TEXT NOT NULL,
          started_at TEXT NOT NULL,
          finished_at TEXT,
          message TEXT,
          rows_saved INTEGER NOT NULL DEFAULT 0
        );

        CREATE INDEX IF NOT EXISTS idx_sync_jobs_source_started_at ON sync_jobs(source, started_at DESC);
        CREATE INDEX IF NOT EXISTS idx_sites_property_type ON sites(property_type);
      `);

      const now = new Date().toISOString();
      const insertSource = database.prepare(`
        INSERT OR IGNORE INTO data_sources (id, name, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?)
      `);
      insertSource.run('gsc', 'Google Search Console', 'active', now, now);
      insertSource.run('ga4', 'Google Analytics 4', 'planned', now, now);
    }
  }
];

function initLocalDatabase(databasePath) {
  fs.mkdirSync(path.dirname(databasePath), {recursive: true});
  db = new DatabaseSync(databasePath);
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA foreign_keys = ON;');
  runMigrations(db);
}

function getDb() {
  if (!db) throw new Error('Local database has not been initialized.');
  return db;
}

function saveSnapshotToDatabase(snapshot, rawSnapshotPath = null) {
  const database = getDb();
  const datasets = snapshot.datasets || {};
  const dateRange = snapshot.dateRange || {};
  const datasetSizes = snapshot.datasetSizes || Object.fromEntries(
    Object.entries(datasets).map(([key, value]) => [key, Array.isArray(value) ? value.length : 0])
  );

  database.exec('BEGIN');
  try {
    upsertSite(database, snapshot.siteUrl);
    insertSyncJob(database, {
      id: `${snapshot.id}-save`,
      source: snapshot.source,
      siteUrl: snapshot.siteUrl,
      status: 'success',
      startedAt: snapshot.capturedAt,
      finishedAt: new Date().toISOString(),
      message: 'Snapshot saved to local database.',
      rowsSaved: Object.values(datasetSizes).reduce((sum, value) => sum + Number(value || 0), 0)
    });

    database.prepare(`
      INSERT OR REPLACE INTO snapshots (
        id, source, site_url, start_date, end_date, captured_at, metrics_json, dataset_sizes_json, raw_snapshot_path
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      snapshot.id,
      snapshot.source,
      snapshot.siteUrl,
      dateRange.startDate || null,
      dateRange.endDate || null,
      snapshot.capturedAt,
      JSON.stringify(snapshot.metrics || {}),
      JSON.stringify(datasetSizes),
      rawSnapshotPath
    );

    database.prepare('DELETE FROM gsc_trend WHERE snapshot_id = ?').run(snapshot.id);
    database.prepare('DELETE FROM gsc_pages WHERE snapshot_id = ?').run(snapshot.id);
    database.prepare('DELETE FROM gsc_queries WHERE snapshot_id = ?').run(snapshot.id);
    database.prepare('DELETE FROM gsc_page_queries WHERE snapshot_id = ?').run(snapshot.id);

    insertRows(database, 'gsc_trend', ['snapshot_id', 'date', 'clicks', 'impressions', 'ctr', 'position'],
      (datasets.trend || []).map(row => [snapshot.id, row.date, toInt(row.clicks), toInt(row.impressions), toNum(row.ctr), toNum(row.position)]));

    insertRows(database, 'gsc_pages', ['snapshot_id', 'page', 'clicks', 'impressions', 'ctr', 'position'],
      (datasets.pages || []).map(row => [snapshot.id, row.page, toInt(row.clicks), toInt(row.impressions), toNum(row.ctr), toNum(row.position)]));

    insertRows(database, 'gsc_queries', ['snapshot_id', 'query_text', 'clicks', 'impressions', 'ctr', 'position'],
      (datasets.queries || []).map(row => [snapshot.id, row.query, toInt(row.clicks), toInt(row.impressions), toNum(row.ctr), toNum(row.position)]));

    insertRows(database, 'gsc_page_queries', ['snapshot_id', 'page', 'query_text', 'clicks', 'impressions', 'ctr', 'position'],
      (datasets.pageQuery || []).map(row => [snapshot.id, row.page, row.query, toInt(row.clicks), toInt(row.impressions), toNum(row.ctr), toNum(row.position)]));

    database.exec('COMMIT');
  } catch (err) {
    database.exec('ROLLBACK');
    throw err;
  }
}

function runMigrations(database) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL
    );
  `);

  const applied = new Set(
    database.prepare('SELECT version FROM schema_migrations').all().map(row => Number(row.version))
  );

  MIGRATIONS.forEach(migration => {
    if (applied.has(migration.version)) return;
    database.exec('BEGIN');
    try {
      migration.up(database);
      database.prepare('INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)')
        .run(migration.version, migration.name, new Date().toISOString());
      database.exec('COMMIT');
    } catch (err) {
      database.exec('ROLLBACK');
      throw err;
    }
  });
}

function upsertSite(database, siteUrl) {
  const now = new Date().toISOString();
  const propertyType = siteUrl && siteUrl.startsWith('sc-domain:') ? 'domain' : 'url-prefix';
  database.prepare(`
    INSERT INTO sites (site_url, display_name, property_type, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(site_url) DO UPDATE SET
      property_type = excluded.property_type,
      updated_at = excluded.updated_at
  `).run(siteUrl, siteUrl, propertyType, now, now);
}

function insertSyncJob(database, job) {
  database.prepare(`
    INSERT OR REPLACE INTO sync_jobs (
      id, source, site_url, status, started_at, finished_at, message, rows_saved
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    job.id,
    job.source,
    job.siteUrl || null,
    job.status,
    job.startedAt,
    job.finishedAt || null,
    job.message || null,
    toInt(job.rowsSaved)
  );
}

function insertRows(database, table, columns, rows) {
  if (rows.length === 0) return;
  const placeholders = columns.map(() => '?').join(', ');
  const stmt = database.prepare(`INSERT OR REPLACE INTO ${table} (${columns.join(', ')}) VALUES (${placeholders})`);
  rows.forEach(row => stmt.run(...row));
}

function listDatabaseSnapshots({source} = {}) {
  const database = getDb();
  const rows = source
    ? database.prepare('SELECT * FROM snapshots WHERE source = ? ORDER BY captured_at DESC').all(source)
    : database.prepare('SELECT * FROM snapshots ORDER BY captured_at DESC').all();
  return rows.map(mapSnapshotRow);
}

function getGscSnapshotTrends({siteUrl, limit = 50} = {}) {
  const database = getDb();
  const safeLimit = Math.max(1, Math.min(Number(limit) || 50, 200));
  const where = siteUrl ? 'WHERE s.source = ? AND s.site_url = ?' : 'WHERE s.source = ?';
  const args = siteUrl ? ['gsc', siteUrl, safeLimit] : ['gsc', safeLimit];
  const rows = database.prepare(`
    SELECT
      s.id,
      s.site_url,
      s.start_date,
      s.end_date,
      s.captured_at,
      COALESCE(SUM(t.clicks), 0) AS clicks,
      COALESCE(SUM(t.impressions), 0) AS impressions,
      CASE WHEN COALESCE(SUM(t.impressions), 0) > 0
        THEN CAST(SUM(t.clicks) AS REAL) / SUM(t.impressions)
        ELSE 0
      END AS ctr,
      COALESCE(AVG(NULLIF(t.position, 0)), 0) AS position,
      COUNT(t.date) AS days
    FROM snapshots s
    LEFT JOIN gsc_trend t ON t.snapshot_id = s.id
    ${where}
    GROUP BY s.id
    ORDER BY s.captured_at DESC
    LIMIT ?
  `).all(...args);

  return rows
    .reverse()
    .map((row, index, orderedRows) => {
      const previous = orderedRows[index - 1];
      return {
        id: row.id,
        siteUrl: row.site_url,
        dateRange: {
          startDate: row.start_date,
          endDate: row.end_date
        },
        capturedAt: row.captured_at,
        days: row.days,
        clicks: row.clicks,
        impressions: row.impressions,
        ctr: row.ctr,
        position: row.position,
        delta: previous ? {
          clicks: row.clicks - previous.clicks,
          impressions: row.impressions - previous.impressions,
          ctr: row.ctr - previous.ctr,
          position: row.position - previous.position
        } : null
      };
    });
}

function getDatabaseStats() {
  const database = getDb();
  const row = database.prepare(`
    SELECT
      COUNT(*) AS snapshots,
      COUNT(DISTINCT site_url) AS sites,
      COALESCE(SUM((SELECT COUNT(*) FROM gsc_trend WHERE gsc_trend.snapshot_id = snapshots.id)), 0) AS trend_rows,
      COALESCE(SUM((SELECT COUNT(*) FROM gsc_pages WHERE gsc_pages.snapshot_id = snapshots.id)), 0) AS page_rows,
      COALESCE(SUM((SELECT COUNT(*) FROM gsc_queries WHERE gsc_queries.snapshot_id = snapshots.id)), 0) AS query_rows,
      COALESCE(SUM((SELECT COUNT(*) FROM gsc_page_queries WHERE gsc_page_queries.snapshot_id = snapshots.id)), 0) AS page_query_rows
    FROM snapshots
  `).get();
  return row;
}

function getMigrationStatus() {
  const database = getDb();
  const rows = database.prepare('SELECT version, name, applied_at FROM schema_migrations ORDER BY version').all();
  const latest = rows.length ? rows[rows.length - 1].version : 0;
  return {
    latestVersion: latest,
    availableVersion: MIGRATIONS[MIGRATIONS.length - 1].version,
    applied: rows,
    pending: MIGRATIONS
      .filter(migration => !rows.some(row => Number(row.version) === migration.version))
      .map(({version, name}) => ({version, name}))
  };
}

function backupDatabase(databasePath, backupDir) {
  const database = getDb();
  fs.mkdirSync(backupDir, {recursive: true});
  database.exec('PRAGMA wal_checkpoint(FULL);');
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = path.join(backupDir, `seo-data-${timestamp}.sqlite`);
  fs.copyFileSync(databasePath, backupPath);
  return {backupPath, createdAt: new Date().toISOString()};
}

function syncSnapshotsFromDisk(snapshotsPath) {
  if (!fs.existsSync(snapshotsPath)) return {synced: 0};
  const files = fs.readdirSync(snapshotsPath).filter(file => file.endsWith('.json'));
  let synced = 0;
  files.forEach(file => {
    const filePath = path.join(snapshotsPath, file);
    const snapshot = safeReadJson(filePath);
    if (!snapshot || !snapshot.id) return;
    saveSnapshotToDatabase(snapshot, filePath);
    synced += 1;
  });
  return {synced};
}

function mapSnapshotRow(row) {
  return {
    id: row.id,
    source: row.source,
    siteUrl: row.site_url,
    dateRange: {
      startDate: row.start_date,
      endDate: row.end_date
    },
    capturedAt: row.captured_at,
    metrics: safeJson(row.metrics_json, {}),
    datasetSizes: safeJson(row.dataset_sizes_json, {}),
    rawSnapshotPath: row.raw_snapshot_path
  };
}

function safeReadJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (err) {
    return null;
  }
}

function safeJson(value, fallback) {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch (err) {
    return fallback;
  }
}

function toInt(value) {
  return Number.isFinite(Number(value)) ? Math.round(Number(value)) : 0;
}

function toNum(value) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

module.exports = {
  backupDatabase,
  getDatabaseStats,
  getGscSnapshotTrends,
  getMigrationStatus,
  initLocalDatabase,
  listDatabaseSnapshots,
  saveSnapshotToDatabase,
  syncSnapshotsFromDisk
};
