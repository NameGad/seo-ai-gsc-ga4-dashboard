# Changelog

## 1.2.0 - 2026-05-19

- Added a GSC Deep Analysis / Insights workspace.
- Added page decay monitoring, keyword ranking volatility, low CTR opportunity scoring, cannibalization detection, query intent classification, and new/lost keyword detection.
- Added GSC country, device, search appearance, and search type breakdown capture for future snapshots.
- Added SQLite `gsc_dimensions` storage and deep-analysis API.

## 1.1.0 - 2026-05-19

- Renamed project to `seo-ai-gsc-ga4-dashboard` for clearer SEO/GSC/GA4 positioning.
- Migrated the frontend to Vue 3 + Vite.
- Added a professional SEO analytics workspace UI with GSC, GA4, History, and AI sections.
- Added local JSON snapshot storage for GSC pulls.
- Added SQLite structured storage for snapshots, GSC trend rows, pages, queries, and page-query rows.
- Added SQLite schema migrations, metadata tables, sync job records, and local backup API.
- Added GSC historical trend aggregation and History dashboard chart/table.
- Hardened OAuth callback UX and token persistence.

## 1.0.0 - 2026-05-19

- Initial local Google Search Console dashboard prototype.
