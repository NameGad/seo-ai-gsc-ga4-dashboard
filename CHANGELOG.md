# Changelog

## 1.3.0 - 2026-05-20

- Added GSC page type segmentation for Collection, Product, Blog, and Other pages.
- Added a page type filter to the live GSC workspace.
- Added SQLite `gsc_page_type_summary` storage and a page-type history API.
- Added History page type trend tables for channel-style SEO analysis.

## 1.2.1 - 2026-05-19

- Fixed GSC History deltas so changes are calculated within the same property only.
- Added snapshot data fingerprints to skip saving duplicate GSC pulls for the same site and date range.
- Deduplicated History trend and snapshot lists while keeping raw local files untouched.
- Improved History UI grouping by property.

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
