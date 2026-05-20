# GSC JS Dashboard

本地项目：使用 Node.js + Express 从 Google Search Console 获取 Search Analytics 数据，并使用 Vue 3 + Vite + Chart.js 构建前端工作台。

快速开始：

1. 将你的 `credentials.json`（OAuth 客户端）放在项目根目录（与 `server.js` 同级）。
2. 运行：

```bash
npm install
npm run build
npm start
```

3. 打开浏览器访问： http://localhost:3000
4. 点击 `Google Auth` 完成授权（第一次访问会要求授权）。授权成功后会在项目根目录生成 `token.json`。
5. 点击 `Load Sites` 拉取当前 Google 账号可访问的所有 Search Console property，也可以手动输入 `Site URL`（例如 `https://www.example.com/` 或 `sc-domain:example.com`）。
6. 选择日期范围（默认结束日期为今天前 2 天，起始日期为结束日前 28 天），点击 `Load Data` 加载并查看报告。

多站点说明：

- `token.json` 绑定的是当前授权的 Google 账号，不是某一个网站。
- 同一个 Google 账号在 Search Console 里有权限的多个站点，都可以通过同一个 token 读取。
- 如果要访问不同 Google 账号下的站点，需要重新授权并生成对应账号的 token；生产化版本建议按账号分别保存 token，而不是共用一个 `token.json`。

数据工作台说明：

- 页面右上角支持 `Light / Dark` 模式切换，选择会保存在当前浏览器本地，刷新后自动沿用。
- UI 采用克制的 AI 产品风格渐变系统，覆盖品牌、导航、筛选器、指标卡片、图表容器和历史数据模块。
- `GSC`：当前可用的 Search Console 数据工作台。
- `GSC` 内置页面类型筛选：可按 `All / Collection / Product / Blog / Other` 查看 Performance Trend、KPI 卡片、Top Pages、Top Queries、低 CTR 机会和关键词机会。
- `GSC` 内置 Query segment 筛选：可按 `All / Branded / Non-branded` 拆分关键词、低 CTR 机会和关键词机会；品牌词支持自动推断，也可以手动维护。
- `GSC` 内置 SEO Action Board：基于曝光、排名、CTR gap、品牌/非品牌、页面类型和关键词内耗计算机会评分，并输出 Quick Wins、内容刷新计划、页面衰退和关键词内耗任务。
- `Insights`：GSC 深度分析工作区，基于本地历史快照识别页面衰退、关键词波动、低 CTR 机会、关键词内耗、搜索意图和新增/流失关键词。
- `GA4`：已预留 Google Analytics 入口，后续可接入 GA4 traffic、events、conversions 等接口。
- `History`：每次成功点击 `Load` 后，当前 GSC 数据会保存到本机 `data/snapshots/`。
- `History` 还会基于 SQLite 展示 GSC 历史趋势，比较不同快照之间的 clicks、impressions、CTR 和 position 变化。
- 历史趋势会按不同 GSC property 分组，同一网站内部单独计算变化，避免不同网站之间互相比。
- `AI`：预留 AI 分析入口，后续可以读取本地历史快照，做趋势解释、异常检测、CTR 优化建议和 GSC + GA 联动分析。

本地数据存储策略：

- 原始层：每次成功加载 GSC 后，会保存完整 JSON 快照到 `data/snapshots/`。
- 结构化层：同一份快照会同步写入 `data/seo-data.sqlite`，用于快速查询、历史趋势和后续 AI 分析。
- 去重层：每次保存前会计算数据指纹；同一站点、同一日期范围、同一份 GSC 数据不会重复保存，前端会复用已有快照。
- 迁移层：SQLite 使用 `schema_migrations` 记录数据库版本，后续新增 GA4/AI 表时会按 migration 升级。
- 备份层：可以通过 `POST /api/history/backup` 生成 `data/backups/seo-data-*.sqlite`。
- 当前 SQLite 表包括：
  - `snapshots`：每次抓取的元数据、站点、日期范围和指标摘要。
  - `sites`：站点/property 元数据。
  - `data_sources`：GSC、GA4 等数据源状态。
  - `sync_jobs`：同步任务记录。
  - `gsc_trend`：按日期的 clicks/impressions/ctr/position。
  - `gsc_pages`：按页面维度的数据。
  - `gsc_queries`：按关键词维度的数据。
  - `gsc_page_queries`：页面 + 关键词组合数据。
  - `gsc_dimensions`：国家、设备、搜索外观和搜索类型拆分数据。
  - `gsc_page_type_summary`：按 Collection、Product、Blog、Other 聚合的页面类型趋势数据。
  - `gsc_page_type_trend`：按日期 + 页面类型聚合的 daily trend，用于让 Performance Trend 跟随页面类型筛选。
- 服务启动时会自动把 `data/snapshots/` 里已有的 JSON 快照同步进 SQLite。

GSC 页面类型分组说明：

- `Collection`：URL 路径包含 `/collections/`。
- `Product`：URL 路径包含 `/products/`。
- `Blog`：URL 路径包含 `/blogs/` 或 `/blog/`。
- `Other`：不匹配以上规则的页面，例如首页、搜索页、支持页、品牌页等。
- 页面类型分组会在前端实时筛选，也会在保存快照时写入 SQLite，方便后续和 GA4 的 landing page、engagement、conversion 数据联动。
- 选择 Collection/Product/Blog/Other 后，Performance Trend 使用 `date + page` 拉取到的每日数据聚合，不再使用整段时间的页面总量；图表下方会展示每日明细行。
- 打开项目或刷新页面后，前端会优先把最新的本地 GSC 快照恢复到工作区，让页面类型筛选可以直接展示；如果旧快照没有 daily page type trend，选择 Collection/Product/Blog/Other 时会自动补抓 `date + page` 数据并保存新快照。

GSC 深度分析说明：

- 页面衰退监控：对比最近两次快照，识别点击、曝光和排名下滑的页面。
- 关键词排名波动：对比最近两次快照，发现排名大幅上升或下降的 query。
- 低 CTR 机会：按排名预期 CTR 估算可争取的潜在点击。
- 关键词内耗：发现同一 query 下多个页面同时获得曝光且主导页面不明确的情况。
- Query intent 自动分类：用可维护的规则先分为 informational、commercial、transactional、navigational、local、mixed，后续可升级为 AI/embedding 分类。
- 国家、设备、搜索外观、搜索类型拆分：新版本会在 `Load Data` 时同步保存这些维度；旧快照没有这部分数据，需要重新加载一次。
- 新增 / 流失关键词检测：对比最近两次快照，列出新出现和消失的 query。

测试与验证：

1. 安装依赖：

```bash
npm install
```

2. 构建 Vue 前端并启动服务器：

```bash
npm run build
npm start
# 服务器默认监听 http://localhost:3000
```

开发模式：

```bash
npm run dev
```

开发模式会同时启动 Express API 服务和 Vite 前端服务。生产/日常使用建议执行 `npm run build && npm start`，由 Express 直接服务 `frontend/dist`。

3. 在浏览器打开 `http://localhost:3000`，确认仪表盘页面能正常加载。
4. 点击 `Google Auth` 按钮，会跳转 Google 授权页面（或直接访问 `http://localhost:3000/auth` 以触发授权）。
5. 授权后 `token.json` 会写入项目根目录；随后返回仪表盘并点击 `Load Data` 拉取数据。
6. 可用的后端测试端点：

- `GET /api/gsc/trend?siteUrl=https://www.example.com` — 按日期维度返回 clicks/impressions/ctr/position（未授权时返回 `401`，请先授权）。
- `GET /api/gsc/sites` — 返回当前 token 可访问的 GSC property 列表。
- `GET /api/gsc/pages?siteUrl=...` — 按页面返回数据。
- `GET /api/gsc/queries?siteUrl=...` — 按查询返回数据。
- `GET /api/gsc/page-query?siteUrl=...` — 按 page+query 返回数据。
- `GET /api/gsc/page-type-trend?siteUrl=...` — 按 date+page 抓取并聚合为 Collection/Product/Blog/Other 的 daily trend。
- `GET /api/gsc/breakdowns?siteUrl=...` — 返回 country、device、searchAppearance 和 search type 拆分数据。
- `POST /api/history/snapshots` — 将一次数据拉取结果保存为本地 JSON 快照。
- `GET /api/history/snapshots` — 返回本地历史快照列表。
- `GET /api/history/gsc-trends` — 返回按快照聚合的 GSC 历史趋势和相邻快照变化。
- `GET /api/history/gsc-page-types` — 返回按 Collection/Product/Blog/Other 聚合的历史趋势。
- `GET /api/history/gsc-deep-analysis` — 返回 GSC 深度分析结果，可选 `siteUrl`、`limit`、`minImpressions`。
- `GET /api/history/stats` — 返回本地 SQLite 数据库统计。
- `GET /api/history/migrations` — 返回本地 SQLite schema migration 状态。
- `POST /api/history/backup` — 创建一份本地 SQLite 数据库备份。
- `GET /api/history/snapshots/:id` — 返回指定快照完整数据。

前端结构：

- `frontend/src/App.vue` — 主工作台状态与数据流。
- `frontend/src/components/` — 顶部栏、控制栏、指标卡、图表、表格等 Vue 组件。
- `frontend/src/api/gsc.js` — GSC/ OAuth API 请求封装。
- `frontend/src/styles.css` — 全局 UI 设计系统与响应式布局。

安全提示：
- 请勿将 `credentials.json`、`token.json` 或 `data/` 提交到公开仓库；`.gitignore` 已忽略这些文件。


安全说明：
- 请勿将 `credentials.json` 或 `token.json` 上传到公共仓库。
- 本地不会将凭据暴露到 `public/`。
- 本地历史快照保存在 `data/snapshots/`，其中可能包含站点和查询数据，也不要公开上传。
