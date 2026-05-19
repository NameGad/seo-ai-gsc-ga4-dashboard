const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
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
  },
  {
    version: 3,
    name: 'gsc_dimension_breakdown_tables',
    up(database) {
      database.exec(`
        CREATE TABLE IF NOT EXISTS gsc_dimensions (
          snapshot_id TEXT NOT NULL,
          dimension_type TEXT NOT NULL,
          dimension_value TEXT NOT NULL,
          search_type TEXT NOT NULL DEFAULT 'web',
          clicks INTEGER NOT NULL DEFAULT 0,
          impressions INTEGER NOT NULL DEFAULT 0,
          ctr REAL NOT NULL DEFAULT 0,
          position REAL NOT NULL DEFAULT 0,
          PRIMARY KEY (snapshot_id, dimension_type, dimension_value, search_type),
          FOREIGN KEY (snapshot_id) REFERENCES snapshots(id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_gsc_dimensions_snapshot_type_impressions
          ON gsc_dimensions(snapshot_id, dimension_type, impressions DESC);
      `);
    }
  },
  {
    version: 4,
    name: 'snapshot_data_fingerprint',
    up(database) {
      database.exec(`
        ALTER TABLE snapshots ADD COLUMN data_hash TEXT;
      `);
      database.exec(`
        CREATE INDEX IF NOT EXISTS idx_snapshots_dedupe
          ON snapshots(source, site_url, start_date, end_date, data_hash);
      `);
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
  const dataHash = snapshot.dataHash || createSnapshotDataHash(snapshot);
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
        id, source, site_url, start_date, end_date, captured_at, metrics_json, dataset_sizes_json, raw_snapshot_path, data_hash
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      snapshot.id,
      snapshot.source,
      snapshot.siteUrl,
      dateRange.startDate || null,
      dateRange.endDate || null,
      snapshot.capturedAt,
      JSON.stringify(snapshot.metrics || {}),
      JSON.stringify(datasetSizes),
      rawSnapshotPath,
      dataHash
    );

    database.prepare('DELETE FROM gsc_trend WHERE snapshot_id = ?').run(snapshot.id);
    database.prepare('DELETE FROM gsc_pages WHERE snapshot_id = ?').run(snapshot.id);
    database.prepare('DELETE FROM gsc_queries WHERE snapshot_id = ?').run(snapshot.id);
    database.prepare('DELETE FROM gsc_page_queries WHERE snapshot_id = ?').run(snapshot.id);
    database.prepare('DELETE FROM gsc_dimensions WHERE snapshot_id = ?').run(snapshot.id);

    insertRows(database, 'gsc_trend', ['snapshot_id', 'date', 'clicks', 'impressions', 'ctr', 'position'],
      (datasets.trend || []).map(row => [snapshot.id, row.date, toInt(row.clicks), toInt(row.impressions), toNum(row.ctr), toNum(row.position)]));

    insertRows(database, 'gsc_pages', ['snapshot_id', 'page', 'clicks', 'impressions', 'ctr', 'position'],
      (datasets.pages || []).map(row => [snapshot.id, row.page, toInt(row.clicks), toInt(row.impressions), toNum(row.ctr), toNum(row.position)]));

    insertRows(database, 'gsc_queries', ['snapshot_id', 'query_text', 'clicks', 'impressions', 'ctr', 'position'],
      (datasets.queries || []).map(row => [snapshot.id, row.query, toInt(row.clicks), toInt(row.impressions), toNum(row.ctr), toNum(row.position)]));

    insertRows(database, 'gsc_page_queries', ['snapshot_id', 'page', 'query_text', 'clicks', 'impressions', 'ctr', 'position'],
      (datasets.pageQuery || []).map(row => [snapshot.id, row.page, row.query, toInt(row.clicks), toInt(row.impressions), toNum(row.ctr), toNum(row.position)]));

    insertRows(database, 'gsc_dimensions', ['snapshot_id', 'dimension_type', 'dimension_value', 'search_type', 'clicks', 'impressions', 'ctr', 'position'], [
      ...mapDimensionRows(snapshot.id, 'country', datasets.countries || [], 'country'),
      ...mapDimensionRows(snapshot.id, 'device', datasets.devices || [], 'device'),
      ...mapDimensionRows(snapshot.id, 'searchAppearance', datasets.searchAppearances || [], 'appearance'),
      ...mapDimensionRows(snapshot.id, 'searchType', datasets.searchTypes || [], 'type')
    ]);

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

function mapDimensionRows(snapshotId, dimensionType, rows, valueKey) {
  return rows.map(row => [
    snapshotId,
    dimensionType,
    String(row[valueKey] || row.dimension || 'unknown'),
    String(row.searchType || row.type || 'web'),
    toInt(row.clicks),
    toInt(row.impressions),
    toNum(row.ctr),
    toNum(row.position)
  ]);
}

function listDatabaseSnapshots({source} = {}) {
  const database = getDb();
  const rows = source
    ? database.prepare('SELECT * FROM snapshots WHERE source = ? ORDER BY captured_at DESC').all(source)
    : database.prepare('SELECT * FROM snapshots ORDER BY captured_at DESC').all();
  return dedupeSnapshotRows(rows).map(mapSnapshotRow);
}

function getGscSnapshotTrends({siteUrl, limit = 50} = {}) {
  const database = getDb();
  const safeLimit = Math.max(1, Math.min(Number(limit) || 50, 200));
  const where = siteUrl ? 'WHERE s.source = ? AND s.site_url = ?' : 'WHERE s.source = ?';
  const args = siteUrl ? ['gsc', siteUrl] : ['gsc'];
  const rows = database.prepare(`
    SELECT
      s.id,
      s.site_url,
      s.start_date,
      s.end_date,
      s.captured_at,
      s.data_hash,
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
  `).all(...args);

  const dedupedRows = dedupeSnapshotRows(rows).sort((a, b) => {
    const siteCompare = a.site_url.localeCompare(b.site_url);
    if (siteCompare) return siteCompare;
    return new Date(a.captured_at) - new Date(b.captured_at);
  });
  const previousBySite = new Map();
  const mappedRows = dedupedRows.map(row => {
    const previous = previousBySite.get(row.site_url);
    const mapped = {
      id: row.id,
      siteUrl: row.site_url,
      dateRange: {
        startDate: row.start_date,
        endDate: row.end_date
      },
      capturedAt: row.captured_at,
      dataHash: row.data_hash,
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
    previousBySite.set(row.site_url, row);
    return mapped;
  });

  return siteUrl
    ? mappedRows.slice(-safeLimit)
    : mappedRows
      .sort((a, b) => new Date(a.capturedAt) - new Date(b.capturedAt))
      .slice(-safeLimit);
}

function getGscDeepAnalysis({siteUrl, limit = 50, minImpressions = 100} = {}) {
  const database = getDb();
  const safeLimit = Math.max(5, Math.min(Number(limit) || 50, 200));
  const safeMinImpressions = Math.max(1, Number(minImpressions) || 100);
  const snapshots = getLatestGscSnapshots(database, siteUrl);
  const latest = snapshots[0] || null;
  const previous = snapshots[1] || null;

  if (!latest) {
    return {
      meta: {
        siteUrl: siteUrl || null,
        latestSnapshot: null,
        previousSnapshot: null,
        hasComparison: false,
        minImpressions: safeMinImpressions
      },
      summary: emptyDeepSummary(),
      pageDecay: [],
      keywordVolatility: [],
      lowCtrOpportunities: [],
      cannibalization: [],
      queryIntent: [],
      newKeywords: [],
      lostKeywords: [],
      dimensions: {
        countries: [],
        devices: [],
        searchAppearances: [],
        searchTypes: []
      }
    };
  }

  const latestPages = getRows(database, 'gsc_pages', latest.id);
  const previousPages = previous ? getRows(database, 'gsc_pages', previous.id) : [];
  const latestQueries = getRows(database, 'gsc_queries', latest.id);
  const previousQueries = previous ? getRows(database, 'gsc_queries', previous.id) : [];
  const latestPageQueries = getRows(database, 'gsc_page_queries', latest.id);

  const pageDecay = buildPageDecay(latestPages, previousPages, safeMinImpressions, safeLimit);
  const keywordVolatility = buildKeywordVolatility(latestQueries, previousQueries, safeMinImpressions, safeLimit);
  const lowCtrOpportunities = buildLowCtrOpportunities(latestPageQueries, safeMinImpressions, safeLimit);
  const cannibalization = buildCannibalization(latestPageQueries, safeMinImpressions, safeLimit);
  const queryIntent = buildQueryIntent(latestQueries, safeMinImpressions, safeLimit);
  const keywordMovement = buildNewLostKeywords(latestQueries, previousQueries, safeMinImpressions, safeLimit);
  const dimensions = buildDimensionBreakdowns(database, latest.id);

  return {
    meta: {
      siteUrl: latest.site_url,
      latestSnapshot: mapSnapshotRow(latest),
      previousSnapshot: previous ? mapSnapshotRow(previous) : null,
      hasComparison: Boolean(previous),
      minImpressions: safeMinImpressions
    },
    summary: {
      pageDecayCount: pageDecay.length,
      clickLoss: pageDecay.reduce((sum, row) => sum + Math.max(0, row.clicksLost || 0), 0),
      keywordVolatilityCount: keywordVolatility.length,
      lowCtrOpportunityCount: lowCtrOpportunities.length,
      potentialClicks: Math.round(lowCtrOpportunities.reduce((sum, row) => sum + (row.potentialClicks || 0), 0)),
      cannibalizationCount: cannibalization.length,
      newKeywordCount: keywordMovement.newKeywords.length,
      lostKeywordCount: keywordMovement.lostKeywords.length,
      intentMix: summarizeIntentMix(queryIntent)
    },
    pageDecay,
    keywordVolatility,
    lowCtrOpportunities,
    cannibalization,
    queryIntent,
    newKeywords: keywordMovement.newKeywords,
    lostKeywords: keywordMovement.lostKeywords,
    dimensions
  };
}

function findDuplicateSnapshot(snapshot) {
  const database = getDb();
  const dateRange = snapshot.dateRange || {};
  const dataHash = snapshot.dataHash || createSnapshotDataHash(snapshot);
  const row = database.prepare(`
    SELECT *
    FROM snapshots
    WHERE source = ?
      AND site_url = ?
      AND COALESCE(start_date, '') = COALESCE(?, '')
      AND COALESCE(end_date, '') = COALESCE(?, '')
      AND data_hash = ?
    ORDER BY captured_at DESC
    LIMIT 1
  `).get(
    snapshot.source,
    snapshot.siteUrl,
    dateRange.startDate || null,
    dateRange.endDate || null,
    dataHash
  );

  return row ? mapSnapshotRow(row) : null;
}

function getDatabaseStats() {
  const database = getDb();
  const row = database.prepare(`
    SELECT
      COUNT(*) AS snapshots,
      COUNT(DISTINCT source || char(31) || site_url || char(31) || COALESCE(start_date, '') || char(31) || COALESCE(end_date, '') || char(31) || COALESCE(data_hash, id)) AS unique_snapshots,
      COUNT(DISTINCT site_url) AS sites,
      COALESCE(SUM((SELECT COUNT(*) FROM gsc_trend WHERE gsc_trend.snapshot_id = snapshots.id)), 0) AS trend_rows,
      COALESCE(SUM((SELECT COUNT(*) FROM gsc_pages WHERE gsc_pages.snapshot_id = snapshots.id)), 0) AS page_rows,
      COALESCE(SUM((SELECT COUNT(*) FROM gsc_queries WHERE gsc_queries.snapshot_id = snapshots.id)), 0) AS query_rows,
      COALESCE(SUM((SELECT COUNT(*) FROM gsc_page_queries WHERE gsc_page_queries.snapshot_id = snapshots.id)), 0) AS page_query_rows
    FROM snapshots
  `).get();
  return row;
}

function getLatestGscSnapshots(database, siteUrl) {
  const where = siteUrl ? 'WHERE source = ? AND site_url = ?' : 'WHERE source = ?';
  const args = siteUrl ? ['gsc', siteUrl] : ['gsc'];
  const rows = database.prepare(`
    SELECT * FROM snapshots
    ${where}
    ORDER BY captured_at DESC
  `).all(...args);
  return dedupeSnapshotRows(rows).slice(0, 2);
}

function getRows(database, table, snapshotId) {
  const orderBy = table === 'gsc_trend' ? 'date ASC' : 'impressions DESC';
  return database.prepare(`SELECT * FROM ${table} WHERE snapshot_id = ? ORDER BY ${orderBy}`).all(snapshotId);
}

function buildPageDecay(latestRows, previousRows, minImpressions, limit) {
  const latestByPage = byKey(latestRows, 'page');
  return previousRows
    .filter(previous => previous.impressions >= minImpressions || previous.clicks >= 5)
    .map(previous => {
      const latest = latestByPage.get(previous.page) || zeroPerformanceRow({page: previous.page});
      const clicksLost = Math.max(0, previous.clicks - latest.clicks);
      const impressionsLost = Math.max(0, previous.impressions - latest.impressions);
      return {
        page: previous.page,
        clicks: latest.clicks,
        previousClicks: previous.clicks,
        clicksDelta: latest.clicks - previous.clicks,
        clicksLost,
        clicksChangePct: percentChange(latest.clicks, previous.clicks),
        impressions: latest.impressions,
        previousImpressions: previous.impressions,
        impressionsDelta: latest.impressions - previous.impressions,
        impressionsLost,
        ctr: latest.ctr,
        previousCtr: previous.ctr,
        ctrDelta: latest.ctr - previous.ctr,
        position: latest.position,
        previousPosition: previous.position,
        positionDelta: latest.position - previous.position,
        severity: scoreSeverity(clicksLost, impressionsLost, latest.position - previous.position)
      };
    })
    .filter(row => row.clicksLost >= 5 || row.impressionsLost >= minImpressions || row.positionDelta >= 2)
    .sort((a, b) => (b.clicksLost - a.clicksLost) || (b.impressionsLost - a.impressionsLost))
    .slice(0, limit);
}

function buildKeywordVolatility(latestRows, previousRows, minImpressions, limit) {
  const latestByQuery = byKey(latestRows, 'query_text');
  return previousRows
    .filter(previous => previous.impressions >= minImpressions)
    .map(previous => {
      const latest = latestByQuery.get(previous.query_text) || zeroPerformanceRow({query_text: previous.query_text});
      const positionDelta = latest.position ? latest.position - previous.position : 100 - previous.position;
      return {
        query: previous.query_text,
        intent: classifySearchIntent(previous.query_text),
        clicks: latest.clicks,
        previousClicks: previous.clicks,
        clicksDelta: latest.clicks - previous.clicks,
        impressions: latest.impressions,
        previousImpressions: previous.impressions,
        impressionsDelta: latest.impressions - previous.impressions,
        ctr: latest.ctr,
        previousCtr: previous.ctr,
        position: latest.position || null,
        previousPosition: previous.position,
        positionDelta,
        direction: positionDelta > 0 ? 'down' : 'up'
      };
    })
    .filter(row => Math.abs(row.positionDelta) >= 3 || Math.abs(row.clicksDelta) >= 10)
    .sort((a, b) => Math.abs(b.positionDelta) - Math.abs(a.positionDelta))
    .slice(0, limit);
}

function buildLowCtrOpportunities(rows, minImpressions, limit) {
  return rows
    .filter(row => row.impressions >= minImpressions && row.position > 0 && row.position <= 15)
    .map(row => {
      const expectedCtr = expectedCtrByPosition(row.position);
      const potentialClicks = Math.max(0, (expectedCtr - row.ctr) * row.impressions);
      return {
        page: row.page,
        query: row.query_text,
        intent: classifySearchIntent(row.query_text),
        clicks: row.clicks,
        impressions: row.impressions,
        ctr: row.ctr,
        expectedCtr,
        ctrGap: expectedCtr - row.ctr,
        potentialClicks,
        position: row.position
      };
    })
    .filter(row => row.ctrGap > 0.005 && row.potentialClicks >= 3)
    .sort((a, b) => b.potentialClicks - a.potentialClicks)
    .slice(0, limit);
}

function buildCannibalization(rows, minImpressions, limit) {
  const grouped = new Map();
  rows
    .filter(row => row.impressions >= Math.max(10, minImpressions / 5))
    .forEach(row => {
      const list = grouped.get(row.query_text) || [];
      list.push(row);
      grouped.set(row.query_text, list);
    });

  return [...grouped.entries()]
    .map(([query, pages]) => {
      const sortedPages = pages.sort((a, b) => b.impressions - a.impressions);
      const totalImpressions = sortedPages.reduce((sum, row) => sum + row.impressions, 0);
      const totalClicks = sortedPages.reduce((sum, row) => sum + row.clicks, 0);
      const leader = sortedPages[0];
      const leaderShare = totalImpressions ? leader.impressions / totalImpressions : 0;
      return {
        query,
        intent: classifySearchIntent(query),
        competingPages: sortedPages.length,
        totalClicks,
        totalImpressions,
        leaderShare,
        risk: leaderShare < 0.55 ? 'high' : leaderShare < 0.75 ? 'medium' : 'low',
        pages: sortedPages.slice(0, 5).map(row => ({
          page: row.page,
          clicks: row.clicks,
          impressions: row.impressions,
          ctr: row.ctr,
          position: row.position,
          share: totalImpressions ? row.impressions / totalImpressions : 0
        }))
      };
    })
    .filter(row => row.competingPages >= 2 && row.totalImpressions >= minImpressions && row.leaderShare < 0.85)
    .sort((a, b) => (b.totalImpressions - a.totalImpressions) || (a.leaderShare - b.leaderShare))
    .slice(0, limit);
}

function buildQueryIntent(rows, minImpressions, limit) {
  return rows
    .filter(row => row.impressions >= minImpressions)
    .map(row => ({
      query: row.query_text,
      intent: classifySearchIntent(row.query_text),
      clicks: row.clicks,
      impressions: row.impressions,
      ctr: row.ctr,
      position: row.position
    }))
    .sort((a, b) => b.impressions - a.impressions)
    .slice(0, limit);
}

function buildNewLostKeywords(latestRows, previousRows, minImpressions, limit) {
  const latestByQuery = byKey(latestRows, 'query_text');
  const previousByQuery = byKey(previousRows, 'query_text');
  const newKeywords = latestRows
    .filter(row => row.impressions >= minImpressions && !previousByQuery.has(row.query_text))
    .sort((a, b) => b.impressions - a.impressions)
    .slice(0, limit)
    .map(row => mapKeywordMovement(row, 'new'));

  const lostKeywords = previousRows
    .filter(row => row.impressions >= minImpressions && !latestByQuery.has(row.query_text))
    .sort((a, b) => b.impressions - a.impressions)
    .slice(0, limit)
    .map(row => mapKeywordMovement(row, 'lost'));

  return {newKeywords, lostKeywords};
}

function buildDimensionBreakdowns(database, snapshotId) {
  const rows = database.prepare(`
    SELECT dimension_type, dimension_value, search_type, clicks, impressions, ctr, position
    FROM gsc_dimensions
    WHERE snapshot_id = ?
    ORDER BY dimension_type, impressions DESC
  `).all(snapshotId);

  const pick = type => rows
    .filter(row => row.dimension_type === type)
    .map(row => ({
      value: row.dimension_value,
      searchType: row.search_type,
      clicks: row.clicks,
      impressions: row.impressions,
      ctr: row.ctr,
      position: row.position
    }));

  return {
    countries: pick('country'),
    devices: pick('device'),
    searchAppearances: pick('searchAppearance'),
    searchTypes: pick('searchType')
  };
}

function emptyDeepSummary() {
  return {
    pageDecayCount: 0,
    clickLoss: 0,
    keywordVolatilityCount: 0,
    lowCtrOpportunityCount: 0,
    potentialClicks: 0,
    cannibalizationCount: 0,
    newKeywordCount: 0,
    lostKeywordCount: 0,
    intentMix: []
  };
}

function byKey(rows, key) {
  return new Map(rows.map(row => [row[key], row]));
}

function zeroPerformanceRow(extra = {}) {
  return {
    clicks: 0,
    impressions: 0,
    ctr: 0,
    position: 0,
    ...extra
  };
}

function percentChange(current, previous) {
  if (!previous) return current ? 1 : 0;
  return (current - previous) / previous;
}

function scoreSeverity(clicksLost, impressionsLost, positionDelta) {
  const score = clicksLost * 3 + impressionsLost * 0.05 + Math.max(0, positionDelta) * 8;
  if (score >= 80) return 'high';
  if (score >= 30) return 'medium';
  return 'low';
}

function expectedCtrByPosition(position) {
  if (position <= 1) return 0.28;
  if (position <= 2) return 0.16;
  if (position <= 3) return 0.11;
  if (position <= 5) return 0.07;
  if (position <= 8) return 0.04;
  if (position <= 10) return 0.028;
  if (position <= 15) return 0.014;
  return 0.006;
}

function classifySearchIntent(query = '') {
  const text = query.toLowerCase();
  const has = terms => terms.some(term => text.includes(term));

  if (has(['near me', '附近', '地址', '门店', 'location', 'hours', '营业时间'])) return 'local';
  if (has(['buy', 'price', 'coupon', 'discount', 'order', 'shop', '购买', '价格', '优惠', '折扣', '官网'])) return 'transactional';
  if (has(['best', 'review', 'vs', 'compare', 'alternative', 'top', '推荐', '评测', '对比', '哪个好'])) return 'commercial';
  if (has(['login', 'signin', 'download', 'app', 'brand', 'official', '登录', '下载'])) return 'navigational';
  if (has(['how', 'what', 'why', 'guide', 'tutorial', 'tips', 'meaning', '怎么', '如何', '是什么', '为什么', '教程', '指南'])) return 'informational';
  return 'mixed';
}

function mapKeywordMovement(row, status) {
  return {
    query: row.query_text,
    status,
    intent: classifySearchIntent(row.query_text),
    clicks: row.clicks,
    impressions: row.impressions,
    ctr: row.ctr,
    position: row.position
  };
}

function summarizeIntentMix(rows) {
  const summary = rows.reduce((map, row) => {
    const current = map.get(row.intent) || {intent: row.intent, clicks: 0, impressions: 0, queries: 0};
    current.clicks += row.clicks;
    current.impressions += row.impressions;
    current.queries += 1;
    map.set(row.intent, current);
    return map;
  }, new Map());
  return [...summary.values()].sort((a, b) => b.impressions - a.impressions);
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

function createSnapshotDataHash(snapshot) {
  return crypto
    .createHash('sha256')
    .update(stableStringify(normalizeSnapshotForHash(snapshot)))
    .digest('hex');
}

function normalizeSnapshotForHash(snapshot) {
  const datasets = {};
  Object.entries(snapshot.datasets || {}).forEach(([key, value]) => {
    if (Array.isArray(value) && value.length === 0) return;
    datasets[key] = value;
  });

  return {
    source: snapshot.source || 'gsc',
    siteUrl: snapshot.siteUrl,
    dateRange: snapshot.dateRange || {},
    datasets
  };
}

function dedupeSnapshotRows(rows) {
  const seen = new Set();
  return rows.filter(row => {
    const key = snapshotDedupeKey(row);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function snapshotDedupeKey(row) {
  return [
    row.source,
    row.site_url,
    row.start_date || '',
    row.end_date || '',
    row.data_hash || row.id
  ].join('\u001f');
}

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
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
    dataHash: row.data_hash || null,
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
  createSnapshotDataHash,
  findDuplicateSnapshot,
  getDatabaseStats,
  getGscDeepAnalysis,
  getGscSnapshotTrends,
  getMigrationStatus,
  initLocalDatabase,
  listDatabaseSnapshots,
  saveSnapshotToDatabase,
  syncSnapshotsFromDisk
};
