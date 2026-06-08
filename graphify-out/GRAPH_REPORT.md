# Graph Report - .  (2026-06-04)

## Corpus Check
- 66 files · ~51,965 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 413 nodes · 642 edges · 29 communities (21 shown, 8 thin omitted)
- Extraction: 95% EXTRACTED · 4% INFERRED · 0% AMBIGUOUS · INFERRED: 27 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Training Analytics & Insights|Training Analytics & Insights]]
- [[_COMMUNITY_Health Monitoring UI|Health Monitoring UI]]
- [[_COMMUNITY_Food Tracking & AI Scan|Food Tracking & AI Scan]]
- [[_COMMUNITY_Training Navigation & Detail|Training Navigation & Detail]]
- [[_COMMUNITY_Session Planning Engine|Session Planning Engine]]
- [[_COMMUNITY_Project Dependencies|Project Dependencies]]
- [[_COMMUNITY_Dev Config & Architecture Docs|Dev Config & Architecture Docs]]
- [[_COMMUNITY_Today Dashboard|Today Dashboard]]
- [[_COMMUNITY_TypeScript Config|TypeScript Config]]
- [[_COMMUNITY_App Shell & Navigation|App Shell & Navigation]]
- [[_COMMUNITY_Coach & Profile UI|Coach & Profile UI]]
- [[_COMMUNITY_Authentication Flow|Authentication Flow]]
- [[_COMMUNITY_Route Mapping & GPX|Route Mapping & GPX]]
- [[_COMMUNITY_Claude Code Config|Claude Code Config]]
- [[_COMMUNITY_Auth Middleware|Auth Middleware]]
- [[_COMMUNITY_Next.js Config|Next.js Config]]
- [[_COMMUNITY_PostCSS Config|PostCSS Config]]
- [[_COMMUNITY_Tailwind Config|Tailwind Config]]
- [[_COMMUNITY_Training Calendar Event|Training Calendar Event]]
- [[_COMMUNITY_Web Next Config|Web Next Config]]
- [[_COMMUNITY_Web TS Config|Web TS Config]]

## God Nodes (most connected - your core abstractions)
1. `createClient()` - 21 edges
2. `compilerOptions` - 16 edges
3. `FoodClient()` - 11 edges
4. `Graphify Skill Definition` - 11 edges
5. `TodayPage()` - 10 edges
6. `AddFoodSheet()` - 9 edges
7. `computeInsights()` - 9 edges
8. `PerformancePage()` - 9 edges
9. `trainingFetcher()` - 8 edges
10. `formatDuration()` - 8 edges

## Surprising Connections (you probably didn't know these)
- `Supabase Auth in Next.js Middleware` --semantically_similar_to--> `SWR Cache Pre-warming Pattern`  [INFERRED] [semantically similar]
  middleware.ts → CLAUDE.md
- `Tailwind CSS Config` --conceptually_related_to--> `Swift/iOS Design Language Parity`  [INFERRED]
  tailwind.config.ts → CLAUDE.md
- `Vital App Login Page Screenshot` --references--> `BottomNav Component`  [EXTRACTED]
  .playwright-mcp/page-2026-06-03T17-15-44-426Z.png → components/BottomNav.tsx
- `Next.js Middleware (Auth Guard)` --references--> `Login Page (/login)`  [EXTRACTED]
  middleware.ts → CLAUDE.md
- `Package Manifest (vital-web)` --references--> `Vital — AI Fitness and Health Coaching App`  [EXTRACTED]
  package.json → CLAUDE.md

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Health Detail Pages Pattern (HealthDetailScreen + Section + healthFetcher)** — health_activity_activitypage, health_weight_weightpage, health_fetcher_healthfetcher, health_sections_activitysection, health_sections_weightsection [EXTRACTED 1.00]
- **Add Food Sheet Multi-View Pattern** — food_foodclient_addfoodsheet, food_foodclient_customfoodview, food_foodclient_createmealview, concept_barcode_scan_flow [EXTRACTED 1.00]
- **Today Page Insight Pipeline (fetch → compute → brief → render)** — app_page_fetchtoday, app_page_computeinsights, app_page_buildbriefing, app_page_insightcard, app_page_dailybriefingcard [EXTRACTED 1.00]
- **Training SWR Data Flow: Fetcher → Cache → Sub-pages** — training_fetcher, components_dataprovider, training_page, running_page, strength_page, history_page, performance_page [EXTRACTED 1.00]
- **Session Planning Pipeline: detectSport → computeAdvice → RouteMapCard → RouteMap** — session_detectsport, session_computeadvice, session_routemapcardcomponent, routemap_routemap [EXTRACTED 1.00]
- **Screen Layout Hierarchy: PremiumScreen / TrainingDetailScreen / HealthDetailScreen / DetailScreen** — components_premiumscreen, components_trainingdetailscreen, components_healthdetailscreen, components_detailscreen [INFERRED 0.95]
- **Graphify Skill Reference Documents** — graphify_extraction_spec, graphify_query, graphify_add_watch, graphify_hooks, graphify_exports, graphify_transcribe, graphify_update, graphify_github_merge [EXTRACTED 1.00]
- **Vital App Build Configuration Stack** — web_next_config, web_tailwind_config, web_postcss_config, web_tsconfig [INFERRED 0.95]
- **Vital Authentication Flow** — web_middleware, concept_login_page, concept_supabase_auth_middleware [EXTRACTED 1.00]
- **Login Screen UI Elements** — playwright_mcp_login_screenshot, login_page, bottom_nav, design_dark_theme [INFERRED 0.85]
- **Login Screen UI Elements** — playwright_mcp_login_screenshot, login_page, bottom_nav, vital_app_ui, auth_supabase [INFERRED 0.85]

## Communities (29 total, 8 thin omitted)

### Community 0 - "Training Analytics & Insights"
Cohesion: 0.05
Nodes (45): computeStrengthScore(), PerformancePage(), buildCyclingInsight(), buildMonthlyInsight(), buildOverviewInsight(), buildRunningInsight(), buildStrengthInsight(), buildTopInsights() (+37 more)

### Community 1 - "Health Monitoring UI"
Cohesion: 0.07
Nodes (22): CATEGORIES, HealthDetailScreen(), Card(), MetricRow(), MetricTile(), MinimalWorkoutList(), SectionHeader(), SuggestionCard() (+14 more)

### Community 2 - "Food Tracking & AI Scan"
Cohesion: 0.07
Nodes (39): POST /api/route-plan (ORS Proxy), POST /api/scan-food (Claude Haiku Vision), fetchTodayData(), BarcodeScanner(), BarcodeScannerProps, NutritionProgressBar(), Barcode Scan Flow (Open Food Facts fallback), SWR Cache Strategy (+31 more)

### Community 3 - "Training Navigation & Detail"
Cohesion: 0.08
Nodes (21): CATEGORIES, TrainingDetailScreen(), Sport Keyword Filter for Calendar Events, Activity Type, AiInsight Component, computeFTP, computeMuscleRecovery, computePerformanceScore (+13 more)

### Community 4 - "Session Planning Engine"
Cohesion: 0.08
Nodes (25): computeAdvice (training algorithm), detectSport, Advice, avgPaceSecPerKm(), avgSpeedKmh(), computeAdvice(), CYCLE_SPEED_FACTOR, daysSinceLast() (+17 more)

### Community 5 - "Project Dependencies"
Cohesion: 0.07
Nodes (29): dependencies, @anthropic-ai/sdk, leaflet, lucide-react, next, react, react-dom, react-leaflet (+21 more)

### Community 6 - "Dev Config & Architecture Docs"
Cohesion: 0.10
Nodes (25): Claude Skills Index (.claude/CLAUDE.md), Graphify AST + Semantic Parallel Extraction, Graphify Confidence Rubric (EXTRACTED/INFERRED/AMBIGUOUS), Graphify Knowledge Graph Build Pipeline, Swift/iOS Design Language Parity, Login Page (/login), Supabase Auth in Next.js Middleware, SWR Cache Pre-warming Pattern (+17 more)

### Community 7 - "Today Dashboard"
Cohesion: 0.16
Nodes (20): activityInsight(), buildBriefing(), calendarInsight(), computeInsights(), DailyBriefingCard(), fetchTodayData, formatSubtitle(), HeroActionCard() (+12 more)

### Community 8 - "TypeScript Config"
Cohesion: 0.10
Nodes (19): compilerOptions, allowJs, esModuleInterop, incremental, isolatedModules, jsx, lib, module (+11 more)

### Community 9 - "App Shell & Navigation"
Cohesion: 0.13
Nodes (11): metadata, RootLayout(), viewport, BottomNav(), tabs, DataProvider(), ErrorBoundary, Props (+3 more)

### Community 10 - "Coach & Profile UI"
Cohesion: 0.13
Nodes (8): PremiumScreen(), NotifStatus, ProfileButton(), Services, Units, CoachRecommendation(), createServerSupabaseClient, CATEGORIES

### Community 11 - "Authentication Flow"
Cohesion: 0.31
Nodes (8): GET /auth/callback (Supabase OAuth), Supabase Auth, BottomNav Component, Dark Teal Gradient Background Design Token, LoginPage(), Vital App Login Page Screenshot, Vital — AI Fitness Companion App, Vital App UI Design System

### Community 12 - "Route Mapping & GPX"
Cohesion: 0.29
Nodes (8): SSR-false Dynamic Import for Leaflet, MapController (fitBounds helper), RouteMap Component, buildGpx (GPX export), nominatim (geocoding), orsDirectRoute, orsRoundTrip (route generation), RouteMapCard Component

## Ambiguous Edges - Review These
- `BarcodeScanner.tsx` → `supabase.ts`  [AMBIGUOUS]
  components/BarcodeScanner.tsx · relation: references
- `POST /api/route-plan (ORS Proxy)` → `SWR Cache Strategy`  [AMBIGUOUS]
  app/api/route-plan/route.ts · relation: conceptually_related_to
- `POST /api/scan-food (Claude Haiku Vision)` → `SWR Cache Strategy`  [AMBIGUOUS]
  app/api/scan-food/route.ts · relation: conceptually_related_to

## Knowledge Gaps
- **124 isolated node(s):** `PreToolUse`, `FoodLogEntry`, `Product`, `Targets`, `TemplateFoodItem` (+119 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **8 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What is the exact relationship between `BarcodeScanner.tsx` and `supabase.ts`?**
  _Edge tagged AMBIGUOUS (relation: references) - confidence is low._
- **What is the exact relationship between `POST /api/route-plan (ORS Proxy)` and `SWR Cache Strategy`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **What is the exact relationship between `POST /api/scan-food (Claude Haiku Vision)` and `SWR Cache Strategy`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **Why does `createClient()` connect `Food Tracking & AI Scan` to `Health Monitoring UI`, `Training Navigation & Detail`, `Session Planning Engine`, `Today Dashboard`, `App Shell & Navigation`, `Coach & Profile UI`, `Authentication Flow`?**
  _High betweenness centrality (0.101) - this node is a cross-community bridge._
- **Why does `Card()` connect `Health Monitoring UI` to `Training Analytics & Insights`, `Food Tracking & AI Scan`, `Training Navigation & Detail`, `Session Planning Engine`?**
  _High betweenness centrality (0.062) - this node is a cross-community bridge._
- **Why does `SectionHeader()` connect `Health Monitoring UI` to `Training Analytics & Insights`, `Food Tracking & AI Scan`, `Today Dashboard`?**
  _High betweenness centrality (0.037) - this node is a cross-community bridge._
- **What connects `PreToolUse`, `FoodLogEntry`, `Product` to the rest of the system?**
  _127 weakly-connected nodes found - possible documentation gaps or missing edges._