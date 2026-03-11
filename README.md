# PARTCOPY — Site Genome OS

**既存サイトのURLから構造を抽出・正規化し、再構成・比較・提案まで行う制作OS。**

raw HTMLを編集対象にしない。canonical block（正規化された再利用ブロック）を中心に据え、抽出→分類→正規化→比較→再構成→出力の全工程をカバーする。

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│  React + Vite (Client)           http://127.0.0.1:5180         │
│  ├─ URLInput       → URL/genre/tags入力 → POST /api/extract    │
│  ├─ PartsPanel     → 抽出セクション一覧 (thumbnail cards)       │
│  ├─ Canvas         → ドラッグ＆ドロップでページ構築             │
│  ├─ NodeInspector  → DOM要素単位の編集 (text/attr/asset)        │
│  ├─ Library        → 全クロール横断パーツ検索                    │
│  └─ Preview        → キャンバスのライブプレビュー                │
└──────────────── /api/* proxy ────────────────────────────────────┘
                        │
┌───────────────────────▼─────────────────────────────────────────┐
│  Express API Server          http://localhost:3002              │
│  (軽量、Puppeteerなし)                                          │
│  ├─ POST /api/extract            → crawl_runs に job 投入       │
│  ├─ GET  /api/jobs/:id           → job 状態取得                 │
│  ├─ GET  /api/jobs/:id/sections  → 結果取得                     │
│  ├─ GET  /api/sections/:id/render          → CSS付きHTML配信     │
│  ├─ GET  /api/sections/:id/editable-render → 編集可能HTML配信    │
│  ├─ GET  /api/sections/:id/dom             → DOMノードツリー     │
│  ├─ POST /api/sections/:id/patch-sets      → パッチセット作成    │
│  ├─ POST /api/patch-sets/:id/patches       → パッチ追加          │
│  ├─ GET  /api/patch-sets/:id               → パッチセット取得    │
│  ├─ GET  /api/library            → セクション検索               │
│  ├─ GET  /api/library/genres     → ジャンル集計                 │
│  ├─ GET  /api/library/families   → ブロックファミリー一覧        │
│  ├─ GET  /api/block-variants     → バリアント一覧               │
│  ├─ DELETE /api/library/:id      → セクション削除               │
│  └─ POST /api/projects/:id/page-blocks → Canvas構成保存         │
└──────────────────────── polling ─────────────────────────────────┘
                        │
┌───────────────────────▼─────────────────────────────────────────┐
│  Crawl Worker (別プロセス)        ← 重い処理はここ              │
│  ├─ crawl_runs を 3秒ごとpolling → claim → process              │
│  ├─ site-downloader.ts  → HTML/CSS/画像/フォント完全ダウンロード │
│  ├─ section-detector.ts → セマンティックセクション検出           │
│  ├─ classifier.ts       → ヒューリスティック分類                │
│  ├─ canonicalizer.ts    → スロット/トークン正規化               │
│  ├─ dom-parser.ts       → 編集可能DOMスナップショット           │
│  ├─ style-extractor.ts  → スタイル要約/レイアウトシグネチャ      │
│  └─ network-recorder.ts → CSS収集/URL解決                       │
└──────────────────────── storage ─────────────────────────────────┘
                        │
┌───────────────────────▼─────────────────────────────────────────┐
│  Storage (自動切り替え)                                          │
│  ├─ Supabase Mode  → SUPABASE_SERVICE_ROLE_KEY があれば使用     │
│  │   ├─ Postgres (4層スキーマ + RLS)                            │
│  │   ├─ Storage (screenshots, HTML, exports)                    │
│  │   └─ pgvector (将来: 類似ブロック検索)                       │
│  └─ Local Mode     → キーが無ければ自動でローカル               │
│      ├─ .partcopy/db.json (JSON DB + ファイルロック)             │
│      └─ .partcopy/storage/ (ファイルストレージ)                  │
└─────────────────────────────────────────────────────────────────┘
```

### API / Worker 分離の理由

Puppeteerは重い。タイムアウト、メモリ圧迫、クラッシュ時の巻き添えを避けるため、APIサーバーとブラウザワーカーを完全分離。APIはジョブ投入と結果取得のみ。

---

## Worker パイプライン詳細 (server/worker.ts)

Workerは5つのフェーズで処理を実行する。

### Phase 1: Complete Site Download (site-downloader.ts)

```
URL入力
  ↓
Puppeteer起動 → ページ遷移 (networkidle2, viewport 1440x900)
  ↓
ページ全体をスクロール (lazy-load トリガー)
  ↓
DOM から URL を抽出:
  - <link rel="stylesheet"> → CSS files
  - <img>, <source>, <video> → images
  - @font-face url() → fonts
  ↓
CSS ファイルを直接ダウンロード
  ↓
CSS 内の url() から追加の画像/フォント URL を抽出
  ↓
画像を並列ダウンロード (同時接続 30)
  ↓
フォントをダウンロード
  ↓
page.content() で最終 HTML 取得
  ↓
全 URL を書き換え:
  - 元の絶対URL → signed URL (30日有効)
  - 相対パス → 絶対パスに解決 → signed URL
  - srcset の各候補を個別に解決
  - CSS内 url() を書き換え
  ↓
analytics/GTM スクリプトを除去
  ↓
CSS バンドルをアップロード
```

**URL書き換えの3パターン:**
1. **直接置換**: URLを長さ降順でソートし、`split().join()` で一括置換（部分一致回避）
2. **相対パス解決**: 正規表現で `src`, `href`, `poster`, `action` 属性の相対パスを検出 → `new URL(path, baseUrl).href` で絶対化
3. **srcset 処理**: カンマ区切りで分割し、各候補を個別に解決

**出力**: `SiteDownloadResult`
```typescript
{
  finalHtml: string                    // URL書き換え済みHTML
  cssFiles: DownloadedAsset[]          // CSSファイル一覧
  imageFiles: DownloadedAsset[]        // 画像一覧
  fontFiles: DownloadedAsset[]         // フォント一覧
  allAssets: DownloadedAsset[]         // 全アセット
  pageOrigin: string                   // e.g. "https://example.com"
  title: string                        // <title> テキスト
  lang: string                         // <html lang=""> 値
}
```

### Phase 2: Page-Level Storage

```
書き換え済み HTML → corpus-raw-html/{siteId}/{jobId}/final.html
フルページスクリーンショット → corpus-page-screenshots/{siteId}/{jobId}/fullpage.png
CSS バンドル → corpus-raw-html/{siteId}/{jobId}/bundle.css
アセット一覧 JSON → corpus-raw-html/{siteId}/{jobId}/assets.json
  ↓
source_pages レコード作成
page_assets レコード作成 (最大200件)
```

### Phase 3: Section Detection (section-detector.ts)

```
Puppeteer page.evaluate() でブラウザ内実行
  ↓
Step 1: セマンティック要素収集
  - header, nav, main, section, article, aside, footer
  - + id/class にセクション系キーワードを含む div
  ↓
Step 2: スコアリング
  各要素にスコア付与:
  + セマンティックタグボーナス (header/footer/nav/section/article)
  + heading数 × 2
  + 画像数 × 1
  + フォーム数 × 3
  + ボタン数 × 1
  + 高さ (100px以上で +1, 200px以上で +2)
  + テキスト長 (100文字以上で +1)
  - マイクロタグ減点 (span, a, li, p)
  - 重複減点 (同じ親の同タグ)
  ↓
Step 3: アンラッピング
  要素が大きすぎる場合 (高さ > viewport × 1.5):
  - 意味のある子要素が2つ以上あれば、子に分解して再帰
  - nav, header, footer は常にそのまま維持 (HARD_SECTION_TAGS)
  ↓
Step 4: 重複排除
  - 強いセクションに完全包含される弱いセクションを除去
  ↓
Step 5: 特徴量抽出
  各セクションから:
  - headingCount, headingTexts
  - linkCount, buttonCount, formCount, imageCount
  - cardCount (class に card/item/col-/grid- を含む要素)
  - childCount, listItemCount
  - hasVideo, hasSvg
  - textLength, positionRatio (index / total)
  - repeatedChildPattern (e.g. "div.card x4")
  - classTokens (要素 + 先頭20子要素の class)
  - idTokens
```

**フィルタリング定数:**
- `MIN_HEIGHT` = 40px / `MIN_WIDTH` = 200px
- `MAX_SECTION_HEIGHT_RATIO` = 1.5 (viewport高さの倍率)
- 結果: 通常 5〜50 セクション検出

### Phase 4: Classification + Canonicalization

#### 分類 (classifier.ts)

優先度順のルールベース分類。各ルールに信頼度スコア付き:

| 優先度 | Family | 判定条件 | 信頼度 |
|--------|--------|---------|--------|
| 1 | **navigation** | `<nav>` タグ / "nav" class / リンク≥3 | 0.95 |
| 2 | **footer** | `<footer>` タグ / positionRatio > 0.85 + リンク>5 | 0.95/0.7 |
| 3 | **hero** | positionRatio < 0.2 + hero/banner class / 高さ>300 + CTA | 0.95/0.8/0.7 |
| 4 | **faq** | faq class / 「よくある質問」テキスト | 0.9 |
| 5 | **pricing** | pricing/plan class / カード≥2 | 0.9/0.75 |
| 6 | **contact** | フォーム有 / contact class | 0.85 |
| 7 | **social_proof** | testimonial/review class / 「お客様の声」 | 0.85 |
| 8 | **logo_cloud** | logo/partner class + 画像有 | 0.8 |
| 9 | **stats** | number/counter class / 「実績」 | 0.75 |
| 10 | **recruit** | career/recruit class / 「採用」 | 0.8 |
| 11 | **news_list** | news/blog class / 「お知らせ」 | 0.8 |
| 12 | **company_profile** | company/about class / 「会社概要」 | 0.75 |
| 13 | **cta** | cta class / 短コンテンツ + CTA | 0.8 |
| 14 | **feature** | feature/service class / カード≥2 | 0.85/0.7 |
| 15 | **gallery** | gallery/portfolio class | 0.8 |
| FB | **content** | カード≥3→feature(0.6) / heading+長文→content(0.5) / else content(0.3) |

**使用する特徴量:**
- HTMLタグ (`<nav>`, `<header>`, `<footer>`, `<section>`)
- class/id名のキーワード (英語 + 日本語)
- テキスト内容 (「よくある質問」「お客様の声」「料金」等)
- ページ内位置 (positionRatio = index / totalSections)
- BBox (height, width)
- CTA/Form/Image/Card/Link/Headingの有無と数

#### 正規化 (canonicalizer.ts)

分類結果を元に、セクションをスロット（コンテンツ）とトークン（デザイン）に分解:

**バリアント自動判定:**

| Family | 条件 | Variant |
|--------|------|---------|
| hero | 画像>3 | hero_with_trust |
| hero | grid有 | hero_split_left |
| hero | else | hero_centered |
| feature | カード≥6 | feature_grid_6 |
| feature | カード≥4 | feature_grid_4 |
| feature | カード≥3 | feature_grid_3 |
| feature | else | feature_alternating |
| pricing | toggle有 | pricing_toggle |
| pricing | else | pricing_3col |
| faq | accordion有 | faq_accordion |
| faq | else | faq_2col |
| contact | フォーム+情報 | contact_split |
| contact | else | contact_form_full |
| footer | リンク>10 | footer_sitemap |
| footer | else | footer_minimal |
| navigation | リンク>8 | nav_mega |
| navigation | else | nav_simple |

**スロット抽出 (family別):**
- **Hero**: headline, subheadline, primaryCta, secondaryCta, hasMedia, mediaCount
- **Feature**: sectionTitle, itemCount, hasIcons, repeatedPattern
- **CTA**: headline, primaryCta, secondaryCta, buttonCount
- **FAQ**: sectionTitle, itemCount, hasAccordion
- **Contact**: headline, hasForm, hasMap, hasPhone, hasEmail
- **Footer**: linkCount, hasSocialLinks, hasCopyright, columnCount
- **Navigation**: linkCount, hasCTA
- **Pricing**: sectionTitle, planCount
- **Social Proof**: sectionTitle, itemCount
- **Stats**: stats count, variant (with/without text)
- **Generic**: headingTexts, textLength, hasImages, hasCTA

**デザイントークン抽出:**
- `alignment`: center/right/left (textAlignから)
- `bgTone`: light/medium/dark (RGB値から)
- `headingScale`: 2xl/xl/lg/md/sm (fontSizeから)
- `spacingY`: xl/lg/md/sm (paddingから)

**出力**: `CanonicalBlock`
```typescript
{
  family: string        // "hero", "feature", etc.
  variant: string       // "hero_centered", "feature_grid_3", etc.
  slots: CanonicalSlots // コンテンツ情報
  tokens: CanonicalTokens // デザイン情報
  qualityScore: number  // 0-1, スロット充填率ベース
}
```

### Phase 5: DOM Snapshot + Storage

#### DOMスナップショット (dom-parser.ts)

各セクションの編集可能なDOMツリーを生成:

```
Puppeteer page.evaluate() でブラウザ内実行
  ↓
cloneEditableTree():
  - 対象セクション要素を再帰クローン
  - 各要素に window.getComputedStyle() で全CSSをインライン化
  - ::before / ::after 疑似要素を実DOM化 (materializePseudo)
  - 画像の currentSrc, input の value/checked をキャプチャ
  - 各要素に data-pc-key 属性を付与 (e.g. "s0.div[1].p[3]")
  ↓
ノードツリー構築:
  各ノードの情報:
  - stableKey: 安定した一意キー (e.g. "s0.div[1].p[3]")
  - nodeType: heading/paragraph/text/link/image/container/etc.
  - tagName: 元のHTMLタグ
  - orderIndex: 順序番号
  - textContent: テキスト内容 (編集可能ノードのみ)
  - attrs: 属性辞書
  - bbox: { x, y, width, height }
  - computedStyle: CSSサマリー (9プロパティ)
  - editable: 編集可能フラグ
  - selectorPath: CSSセレクタ
  - children: 子ノード配列
```

**編集可能ノードの判定:**
- TEXT_EDITABLE: h1-h6, p, span, a, button, li
- ATTR_EDITABLE: img (src/alt), video (src), a (href), button, input

#### ストレージ書き込み

各セクションで以下をアップロード:

```
corpus-raw-html/{siteId}/{jobId}/raw_{index}.html        → URL書き換え済みセクションHTML
corpus-sanitized-html/{siteId}/{jobId}/preview_{index}.html → プレビュー用HTML
corpus-section-thumbnails/{siteId}/{jobId}/section_{index}.png → サムネイル
corpus-sanitized-html/{siteId}/{jobId}/resolved_{index}.html → インラインCSS付きHTML
corpus-sanitized-html/{siteId}/{jobId}/dom_{index}.json    → DOMノードツリー
  ↓
source_sections レコード作成 (分類結果・特徴量・パス)
section_dom_snapshots レコード作成 (スナップショット)
section_nodes レコード作成 (最大500ノード)
block_instances レコード作成 (canonical block)
```

---

## CSS 収集・配信ロジック (network-recorder.ts)

### 収集 (Worker側)

```
collectCSSChunks(page):
  1. document.styleSheets を走査
     - same-origin → cssRules から直接読み取り
     - cross-origin → fetch() で再取得
  2. <style> タグの innerHTML を収集
  3. adoptedStyleSheets (Shadow DOM) を収集
  4. 各チャンクの相対 url() を絶対パスに解決
  ↓
collectPageCSS(page):
  全チャンクを結合 (ソースコメント付き)
  → bundle.css としてアップロード
```

### 配信 (API側)

```
GET /api/sections/:id/render:
  1. resolved snapshot のHTMLを優先読み込み
     → なければ sanitized_html → なければ raw_html
  2. resolved_inline 戦略の場合 CSS バンドル不要
     (CSSは既にインライン化済み)
  3. それ以外の場合 CSS バンドルを読み込み
     - cssBundleCache (10分TTL) でキャッシュ
  4. buildRenderDocument() で完全HTML組み立て:
     - <meta charset="utf-8">
     - <meta name="viewport">
     - <base href="{pageOrigin}/">
     - <style>{cssBundle}</style>
     - セクションHTML
```

---

## 編集パイプライン詳細

### フロントエンド → iframe 通信

```
[Canvas.tsx]
  ↓ 編集モード ON
[EditableSourceFrame.tsx]
  → GET /api/sections/:id/editable-render
  → iframe に data-pc-key 属性付きHTML + 通信スクリプトをロード
  ↓
ユーザーがノードをクリック
  ↓
iframe 内スクリプト:
  click イベント → 最近の data-pc-key 要素を探索
  → window.parent.postMessage({
      type: 'pc:node-click',
      stableKey, tagName, textContent, rect
    })
  ↓
[EditableSourceFrame] → onNodeSelect コールバック → App state
  ↓
[NodeInspector.tsx]
  → GET /api/sections/:id/dom でノード詳細取得
  → テキスト/属性/アセット編集UI表示
  ↓
ユーザーが編集を適用
  ↓
iframe へパッチ送信:
  window.parent.postMessage({
    type: 'pc:apply-patch',
    patch: { nodeStableKey, op, payload }
  })
  ↓
iframe 内スクリプト:
  [data-pc-key="{stableKey}"] を querySelector
  switch (op):
    set_text → el.textContent = payload.text
    set_attr → el.setAttribute(payload.attr, payload.value)
    replace_asset → el.src = payload.src
    set_style_token → el.style.setProperty(...)
    remove_node → el.remove()
  → postMessage({ type: 'pc:patch-applied', stableKey })
  ↓
オプション: サーバーに永続化
  POST /api/sections/:id/patch-sets → patchSet作成
  POST /api/patch-sets/:id/patches → パッチ追加
```

### パッチ操作一覧

| op | payload | 説明 |
|----|---------|------|
| `set_text` | `{ text: string }` | テキスト内容変更 |
| `set_attr` | `{ attr: string, value: string }` | 属性変更 |
| `replace_asset` | `{ src: string, alt?: string }` | 画像/動画差し替え |
| `remove_node` | `{}` | ノード削除 |
| `insert_after` | `{ html: string }` | ノード後に挿入 |
| `move_node` | `{ targetKey: string, position: 'before'\|'after' }` | ノード移動 |
| `set_style_token` | `{ property: string, value: string }` | CSSプロパティ変更 |
| `set_class` | `{ add?: string[], remove?: string[] }` | クラス追加/削除 |

**セキュリティ検証:**
- `on*` イベントハンドラ属性はブロック
- `insert_after` の `<script>` はブロック
- `nodeStableKey` と `op` は必須

---

## Database Schema (4 Layers)

### Layer 1: Tenant
```
organizations → organization_members → workspaces → projects
```
顧客境界。RLSの中心。(将来実装)

### Layer 2: Corpus (研究資産)
```
source_sites → crawl_runs → source_pages → source_sections → section_labels
                                         → page_assets
                                         → section_dom_snapshots → section_nodes
```

| Table | Purpose | 主要カラム |
|-------|---------|-----------|
| `source_sites` | ドメイン単位 | normalized_domain, homepage_url, genre, tags, industry, status |
| `crawl_runs` | ジョブ管理 | site_id, status, worker_id, trigger_type, page_count, section_count, error_code |
| `source_pages` | ページ単位 | url, title, screenshot_storage_path, final_html_path, css_bundle_path |
| `source_sections` | セクション単位 | page_id, order_index, dom_path, tag_name, bbox_json, block_family, block_variant, classifier_confidence, features_jsonb, text_summary, layout_signature, class_tokens |
| `section_labels` | 分類ラベル | heuristic/human/model別。学習ループの基盤 |
| `page_assets` | ダウンロード済みアセット | page_id, asset_type, url, storage_path, size_bytes |
| `section_dom_snapshots` | 編集用HTMLスナップショット | section_id, snapshot_type, html_storage_path, dom_json_path, node_count, css_strategy |
| `section_nodes` | フラット化DOMツリー | snapshot_id, stable_key, node_type, tag_name, text_content, editable, selector_path |

### Layer 3: Canonical Block
```
block_families → block_variants → block_instances → style_token_sets
```
**ここがmoat。** raw HTMLではなく、正規化ブロックが編集対象。

| Table | Purpose |
|-------|---------|
| `block_families` | 17種 (下記参照) |
| `block_variants` | Family内のバリエーション (24+ seed) |
| `block_instances` | 実際の抽出結果をvariantにマッピング。slot_values + token_values + quality_score |
| `style_token_sets` | computed styleから抽出したデザイントークン |

**17 Block Families:**
navigation, hero, feature, social_proof, stats, pricing, faq, content, cta, contact, recruit, footer, news_list, timeline, company_profile, gallery, logo_cloud

### Layer 4: Editor / Output
```
project_pages → project_page_blocks → project_assets → exports
                                    → section_patch_sets → section_patches
```
ユーザーが編集するのはここ。

---

## Job State Machine

```
queued → claimed → rendering → parsed → normalizing → done
                                                    ↘ failed
```

| State | 発生タイミング | 処理内容 |
|-------|--------------|---------|
| `queued` | POST /api/extract | ジョブ作成。source_sites + crawl_runs レコード |
| `claimed` | Worker polling (3秒間隔) | worker_id + started_at を atomic 更新で排他制御 |
| `rendering` | processJob 開始 | Puppeteer起動 → downloadSite() でサイト完全ダウンロード |
| `parsed` | Phase 2 完了 | HTML/スクリーンショット/CSS/アセット保存完了 |
| `normalizing` | Phase 3-4 | セクション検出 → 分類 → 正規化 → DOMスナップショット |
| `done` | 全セクション処理完了 | page_count, section_count, finished_at 記録 |
| `failed` | 任意のフェーズでエラー | error_code + error_message 記録 |

- Client は polling (2秒間隔) でステータス監視
- 将来: Realtime Broadcast で置き換え

---

## Storage Bucket 設計 (storage-config.ts)

| Bucket | Content | 格納パターン |
|--------|---------|-------------|
| `corpus-raw-html` | 元HTML (URL書き換え済み), CSS, アセット一覧 | `{siteId}/{jobId}/final.html`, `bundle.css`, `raw_{i}.html` |
| `corpus-sanitized-html` | プレビューHTML, resolved HTML, DOM JSON | `{siteId}/{jobId}/preview_{i}.html`, `resolved_{i}.html`, `dom_{i}.json` |
| `corpus-page-screenshots` | ページ全体スクリーンショット | `{siteId}/{jobId}/fullpage.png` |
| `corpus-section-thumbnails` | セクション単位スクリーンショット | `{siteId}/{jobId}/section_{i}.png` |
| `project-assets` | ユーザーアップロード画像等 | (将来) |
| `export-artifacts` | 出力ファイル | (将来) |

すべてprivate。Supabaseモードではsigned URLで配信。ローカルモードでは `/api/storage/:bucket?path=` で配信。

---

## Local Mode 詳細 (local-store.ts)

Supabaseキーが未設定の場合に自動で使用されるファイルベースDB。

### データ構造 (.partcopy/db.json)
```typescript
{
  source_sites: []        // ドメイン情報
  crawl_runs: []          // ジョブ
  source_pages: []        // ページ
  source_sections: []     // セクション
  page_assets: []         // アセット
  block_families: []      // 17ファミリー (seed済み)
  block_variants: []      // 24+バリアント (seed済み)
  block_instances: []     // canonical block
  section_dom_snapshots: []
  section_nodes: []       // フラットDOMツリー
  section_patch_sets: []  // 編集セット
  section_patches: []     // 個別パッチ
  project_page_blocks: [] // キャンバス構成
}
```

### 排他制御
- `.partcopy/.lock/` ディレクトリによるファイルレベルロック
- `mkdirSync` の排他性を利用
- 読み書き操作ごとにロック取得/解放

### Seed データ
初回起動時に以下を自動生成:
- 17 block families
- 24 block variants (hero_centered, hero_split_left, feature_grid_3, etc.)

---

## フロントエンド詳細

### App.tsx (メイン状態管理)

```typescript
state = {
  sections: SourceSection[]    // 抽出されたブロック
  canvas: CanvasBlock[]        // キャンバス上のブロック (順序付き)
  loading: boolean
  error: string | null
  jobStatus: string | null     // "queued...", "rendering...", "done"
  view: 'editor' | 'preview' | 'library'
}
```

**主要関数:**
- `handleExtract(url, genre, tags)` → POST /api/extract → polling開始
- `pollJob(jobId)` → GET /api/jobs/:id を2秒間隔 → done で sections取得
- `addToCanvas(sectionId)` → sections から canvas に追加
- `removeFromCanvas(canvasId)` → canvas から削除
- `moveBlock(from, to)` → ドラッグ＆ドロップ順序変更
- `removeSection(sectionId)` → DELETE /api/library/:id + state両方から削除

### URLInput.tsx (入力フォーム)

- URL入力 (https:// 自動補完)
- ジャンル選択 (16プリセット: SaaS, EC, BtoB, BtoC, 士業, 医療, 美容, 飲食, 不動産, 教育, 採用, 金融, IT, 製造, コンサル, その他)
- カスタムジャンル入力 (ドロップダウン上書き可)
- タグ入力 (カンマ区切り)

### PartsPanel.tsx (抽出セクション一覧)

- **ソート**: position / confidence / family / source
- **検索**: family, variant, summary, domain, page title に対する全文検索
- **フィルタ**: ブロックファミリー別 / IMG / CTA / FORM トグル
- **カード表示**: サムネイル + タイプバッジ + 信頼度% + サマリー + メタタグ
- **アクション**: "+ Canvas" / "Delete" (ホバー時)

### Canvas.tsx (編集キャンバス)

- ドラッグ＆ドロップ順序変更 (dragIndex/dragOverIndex で視覚フィードバック)
- ブロックツールバー: ドラッグハンドル、ファミリーバッジ、ソースドメイン、アクション
- 2モードレンダリング:
  - **Preview**: SourcePreviewFrame (読み取り専用)
  - **Edit**: EditableSourceFrame (クリック可能ノード) + NodeInspector

### Library.tsx (グローバルパーツ検索)

- ジャンル/ファミリーフィルタ
- ソート: newest / confidence / family / source
- ページネーション: limit スライダー (default 60, max 200)
- "Add to Canvas" ボタン

### Preview.tsx (ライブプレビュー)

- 全キャンバスブロックを縦積みで表示
- SourcePreviewFrame 使用 (maxHeight 2000px)
- 読み取り専用

### SourcePreviewFrame.tsx / EditableSourceFrame.tsx

**共通:**
- サンドボックス iframe (`sandbox="allow-same-origin"`)
- 自動高さ調整 (contentDocument.body.scrollHeight)
- ローディング状態 + エラーハンドリング

**EditableSourceFrame 固有:**
- `data-pc-key` 属性付きHTML読み込み
- ホバーハイライト (outline 2px blue)
- クリック → postMessage → 親の onNodeSelect
- パッチ適用 → postMessage → iframe内DOM操作

---

## Style 解析 (style-extractor.ts)

### extractStyleSummary(section)
セクションのcomputedStyleから以下を返却:
```typescript
{ bgColor, bgImage, textColor, fontSize, fontFamily, textAlign, display, padding }
```

### generateLayoutSignature(section)
セクションの構造特徴量からMD5ハッシュを生成:
- tag, headingCount, linkCount, buttonCount, formCount
- imageCount, cardCount, childCount, textLength, repeatedChildPattern

同一レイアウトのセクションを高速に検出するために使用。

---

## File Structure

```
PARTCOPY-1/
├── server/
│   ├── index.ts              # Express API (軽量、Puppeteerなし)
│   ├── worker.ts             # Crawl Worker (Puppeteer、別プロセス)
│   ├── site-downloader.ts    # サイト完全ダウンロード + URL書き換え
│   ├── section-detector.ts   # セマンティックセクション検出
│   ├── classifier.ts         # ヒューリスティック分類 (17 families)
│   ├── canonicalizer.ts      # スロット/トークン正規化
│   ├── dom-parser.ts         # 編集可能DOMスナップショット
│   ├── style-extractor.ts    # スタイル要約 + レイアウトシグネチャ
│   ├── network-recorder.ts   # CSS収集 + URL解決
│   ├── capture-runner.ts     # Puppeteerラッパー (launch/capture)
│   ├── patch-engine.ts       # パッチ定義/検証/適用
│   ├── local-store.ts        # ローカルJSON DB (Supabase代替)
│   ├── storage-config.ts     # Storage bucket名定義
│   └── supabase.ts           # Supabase client初期化 + HAS_SUPABASE フラグ
├── scripts/
│   └── backfill-dom-snapshots.ts  # 既存セクションのDOM snapshot一括生成
├── src/
│   ├── App.tsx               # メイン状態管理 + ルーティング
│   ├── main.tsx              # React エントリポイント
│   ├── styles.css            # 全UI スタイル (CSS変数ベース)
│   ├── types/index.ts        # TypeScript型定義
│   └── components/
│       ├── URLInput.tsx          # URL + genre + tags フォーム
│       ├── PartsPanel.tsx        # 抽出セクション一覧 (フィルタ/検索)
│       ├── Canvas.tsx            # 編集キャンバス (DnD + 編集モード)
│       ├── EditableSourceFrame.tsx # 編集可能iframe (postMessage通信)
│       ├── SourcePreviewFrame.tsx  # 読み取り専用iframe
│       ├── NodeInspector.tsx     # ノード編集パネル
│       ├── Preview.tsx           # ライブプレビュー
│       └── Library.tsx           # グローバルパーツ検索
├── .partcopy/                    # ローカルモードデータ (gitignore)
│   ├── db.json                   # JSON DB
│   └── storage/                  # ファイルストレージ
├── .env.example
├── .gitignore
├── package.json
├── tsconfig.json
└── vite.config.ts
```

---

## Setup

```bash
# 1. Install
npm install

# 2. 起動 (Docker不要 / ローカルモード)
npm run dev:all
# → Client: http://127.0.0.1:5180
# → API:    http://localhost:3002
# → Worker: 別プロセスでcrawl_runsをpolling
# → データ保存先: .partcopy/

# 3. Supabaseを使いたい場合だけ環境変数を設定
cp .env.example .env
# → SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY を入れる
# → キーが入っていれば Supabase モード、無ければ自動でローカルモード
```

### npm scripts

| Script | Description |
|--------|-------------|
| `dev` | Client + Server 同時起動 |
| `dev:all` | Client + Server + Worker 同時起動 |
| `dev:client` | Vite dev server (port 5180) |
| `dev:server` | API server (port 3002, tsx watch) |
| `dev:worker` | Worker (tsx watch, polling 3秒) |
| `db:start` / `db:stop` / `db:reset` | Supabase ローカル管理 |
| `db:migrate` | Supabase migration実行 |
| `backfill:dom` | 既存セクションの DOM snapshot 一括生成 |
| `build` | TypeScript + Vite ビルド |

### 環境変数 (.env.example)

```
PARTCOPY_API_PORT=3002                          # APIサーバーポート
SUPABASE_URL=http://127.0.0.1:54321             # ローカル or クラウド
SUPABASE_ANON_KEY=your-anon-key                 # 公開キー
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key  # サーバーキー
```

- `SUPABASE_SERVICE_ROLE_KEY` または `SUPABASE_ANON_KEY` が設定されていれば **Supabaseモード**
- 未設定なら自動で **ローカルモード** (`.partcopy/` にデータ保存)

### Vite 設定

- Client port: 5180 (env `PARTCOPY_CLIENT_PORT` で変更可)
- `/api/*` → `http://localhost:${PARTCOPY_API_PORT}` にプロキシ
- `.partcopy/` はファイル監視から除外

---

## 設計パターン

### 1. Dual-Mode Storage
全てのDB/Storage操作に `if (!HAS_SUPABASE)` 分岐。ローカルモードではJSON + ファイルシステム、Supabaseモードではクラウド。コード変更なしで切り替え可能。

### 2. Stable Node Keys
DOM要素に一意の `stableKey` を付与 (e.g. `s0.div[1].p[3]`)。ページリロード後もパッチを正しく適用できる。将来のundo/redoの基盤。

### 3. API/Worker 完全分離
APIはジョブ投入と結果取得のみ。重いPuppeteer処理はWorkerプロセスで実行。Worker障害がAPIに波及しない。

### 4. Canonical Block (moat)
raw HTMLを直接編集しない。17 families × 24+ variants に正規化。slots (コンテンツ) と tokens (デザイン) を分離。将来のテンプレート合成・業種比較の基盤。

### 5. Sandboxed Preview
全プレビューiframeに `sandbox="allow-same-origin"` を設定。外部サイトのHTMLを安全にレンダリング。parent pageへのDOM操作は不可。

### 6. CSS Inlining Strategy
resolved snapshotは全computedStyleをインライン化済み。CSSバンドル不要で完全な見た目を再現。通常のsectionは外部CSSバンドルを `<style>` 注入。

---

## What Was Removed (and Why)

| Removed | Reason |
|---------|--------|
| `data/parts.json` | 単一ファイル保存。同時書き込み/検索/履歴/権限すべてに弱い → DB |
| `base64 thumbnail` | DBもAPIもUIも太る → Storage + signed URL |
| `元サイトCSS <link>注入` | CORS/変更/ブロック/依存JSで壊れる → 完全ダウンロード + CSS inlining |
| `元CSS依存export` | 外部依存の寄せ集め → 将来自前renderer |
| `ExportModal` | 上記理由で廃止。自前renderer実装時に再構築 |
| `server/extractor.ts` | APIとPuppeteerの同居 → API/Worker分離 |
| `server/storage.ts` | JSON CRUD → local-store.ts (ロック付き) |

---

## Roadmap

### P0: Infrastructure (Current) ✅
- [x] 4層スキーマ (17ファミリー, 24バリアント seed)
- [x] API/Worker分離
- [x] Job state machine
- [x] Complete site download (HTML/CSS/画像/フォント)
- [x] URL rewriting (signed URL)
- [x] Classifier独立モジュール
- [x] Canonicalizer (スロット/トークン正規化)
- [x] DOM snapshot + 編集可能レイヤー
- [x] Patch engine (8操作)
- [x] Dual-mode storage (Supabase / Local)
- [x] Library (ジャンル/ファミリーフィルタ + 検索)
- [ ] Realtime Broadcast (job進捗)

### P1: Classification Quality
- [ ] features_jsonbを教師データの起点に
- [ ] Internal labeling UI
- [ ] Eval run + precision tracking
- [ ] Model version管理

### P2: Canonical Block Normalization
- [ ] source_section → block_instance 変換改善
- [ ] Style token extractor 高度化
- [ ] pgvector で類似ブロック検索
- [ ] Quality score 改善

### P3: Editor
- [ ] Block recipe ベースcanvas
- [ ] Slot editing (headline, CTA text等)
- [ ] Token editing (色、余白、フォント)
- [ ] Source preview / Editor previewの二面化
- [ ] Autosave + 履歴 (undo/redo)

### P4: Export / Publish
- [ ] Static HTML/CSS renderer
- [ ] Next.js + Tailwind renderer
- [ ] WordPress export
- [ ] SEO / OGP / sitemap
- [ ] フォーム連携

### P5: Benchmark / Proposal
- [ ] 業種別cohort構造比較
- [ ] 競合比較 (欠落ブロック、CTA配置)
- [ ] 提案書PDF出力
- [ ] "URL→初稿" を5分以内に

### P6: AI Layer
- [ ] Copy rewrite (slot単位)
- [ ] Block recommendation (業種×目的)
- [ ] Site map draft generation
- [ ] Similar site recommendation (pgvector)

---

## North Star Metric

> **既存企業サイトの再構築にかかる構造設計時間を、何分の1にできたか**

KPI: URL→初稿時間 / 人手修正時間 / 提案採択率 / 1社あたり月間処理案件数
