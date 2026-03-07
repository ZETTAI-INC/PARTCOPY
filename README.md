# PARTCOPY

**URLを入れるだけで、サイトを再利用可能なUIパーツに分解するノーコードWeb構築ツール。**

日本企業サイト（.co.jp）のUIコンポーネントを構造レベルで抽出・分類・蓄積し、ドラッグ&ドロップで新しいサイトを組み立てる。画像は除去し、レイアウトパターン（構造）だけを資産化する。

---

## Architecture

```
Browser (React + Vite)
  │
  │  POST /api/extract { url, genre, tags }
  ▼
Express Server (port 3001)
  │
  ├── Puppeteer ──► Target Site
  │     │
  │     ├── Full-page render (1440x900)
  │     ├── Lazy-load trigger (scroll bottom → top)
  │     ├── DOM section detection
  │     ├── Per-section screenshot (element.screenshot)
  │     └── CSS / stylesheet URL collection
  │
  ├── Section Classifier (heuristic)
  │     └── DOM tag + class/id + text + position → BlockType
  │
  ├── HTML Sanitizer
  │     ├── <img> / <picture> / <video> → placeholder
  │     ├── background-image → strip
  │     └── relative URL → absolute URL (href, action)
  │
  └── Storage (JSON file)
        └── data/parts.json
```

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18 + TypeScript + Vite 6 |
| Backend | Express + Puppeteer (headless Chrome) |
| Storage | JSON file (`data/parts.json`) |
| Build | tsx (dev), tsc + vite build (prod) |

依存パッケージは最小限。DB不要、Docker不要、`npm install && npm run dev` で即起動。

---

## Features (Current v0.1)

### 1. URL → パーツ抽出

URLを入力すると、Puppeteerでページをフルレンダリングし、DOMを解析してセマンティックセクションに分割する。

**抽出フロー:**

1. Headless Chromeでページ取得（networkidle2待機）
2. Scroll to bottom → top でlazy-load発火
3. セマンティック要素（`<header>`, `<nav>`, `<section>`, `<footer>` 等）＋ body直下の大きなブロック要素を候補として収集
4. 入れ子の親子関係を解決（大きすぎる親を除外、子を優先）
5. 各セクションを分類（後述）
6. 各セクションの **スクリーンショット** を `element.screenshot()` で個別取得
7. HTMLから画像を除去、相対URLを絶対URLに変換

**出力（1セクション = 1パーツ）:**

```typescript
{
  id: string           // UUID
  type: BlockType      // 分類結果
  confidence: number   // 0.0 - 1.0
  html: string         // 画像除去済みHTML
  thumbnail: string    // base64 PNG screenshot
  genre: string        // ユーザー指定ジャンル
  tags: string[]       // ユーザー指定タグ
  meta: {
    hasImages: boolean
    hasCTA: boolean
    hasForm: boolean
    headingCount: number
    linkCount: number
    cardCount: number
  }
  sourceUrl: string
  stylesheetUrls: string[]
}
```

### 2. セクション分類（ヒューリスティクス）

13種のBlockTypeに分類する。AI/MLは未使用。現在は以下のルールベース:

| BlockType | 判定ロジック |
|-----------|------------|
| `navigation` | `<nav>`タグ、class/idに`nav`、`<header>`でリンク3つ以上 |
| `hero` | ページ上部25%以内、class/idに`hero`/`banner`/`mv`/`kv`/`fv`、高さ300px超+CTA有り |
| `feature` | class/idに`feature`/`service`/`merit`、テキストに「特徴」「サービス」、カード3枚以上 |
| `pricing` | class/idに`pricing`/`plan`、テキストに「料金」「プラン」 |
| `cta` | class/idに`cta`、CTA有り+見出し2以下+子要素10未満 |
| `faq` | class/idに`faq`、テキストに「よくある質問」 |
| `testimonial` | class/idに`testimonial`/`voice`/`review`、テキストに「お客様の声」「導入事例」 |
| `contact` | `<form>`有り、class/idに`contact`、テキストに「お問い合わせ」 |
| `footer` | `<footer>`タグ、class/idに`footer`、ページ下部85%以下+リンク5つ以上 |
| `stats` | class/idに`number`/`stat`/`counter`、テキストに「実績」 |
| `logo-cloud` | class/idに`logo`/`client`/`partner`、テキストに「導入企業」+画像有り |
| `gallery` | class/idに`gallery`/`portfolio`/`works` |
| `content` | 見出し1つ以上+テキスト100文字以上（汎用） |

**日本語サイト特化のキーワードを含む**（`mainvisual`, `fv`, `kv`, `mv`, 「お客様の声」,「よくある質問」等）。

### 3. 画像除去（構造のみ保持）

他人の著作物（画像）を除去し、レイアウト構造だけを資産化する:

- `<img>` → グレーの「IMAGE」プレースホルダーdivに置換
- `<picture>`, `<video>` → 同様にプレースホルダー化
- `background-image: url(...)` → CSSプロパティ自体を除去
- スクリーンショット（thumbnail）は参照用として保持（元サイトの見た目確認用）

### 4. ジャンルタグ付け

抽出時にジャンルとタグを指定:

- **ジャンルプリセット（16種）:** SaaS, EC, BtoB, BtoC, 士業, 医療, 美容, 飲食, 不動産, 教育, 採用, 金融, IT, 製造, コンサル, その他
- **カスタム入力:** プリセット以外も自由入力可
- **タグ:** カンマ区切りで複数付与（例: `LP, corporate, tax`）

### 5. パーツライブラリ（永続保存）

抽出したパーツを `data/parts.json` に保存。ジャンル別・ブロック種別でフィルタ。

**Library画面:**
- サイドバー: ジャンル一覧（件数付き）+ ブロック種別一覧
- グリッド表示: サムネイル付きカード
- ホバー → 「Canvasに追加」or「削除」
- 複数サイトのパーツを横断的に閲覧

### 6. Canvas（ページ構築）

パーツをCanvasに追加し、ドラッグ&ドロップで並び替えてページを構成する:

- パーツパネルからホバー → 「Canvas に追加」
- Library画面から直接追加も可能
- ドラッグ&ドロップ or 上下ボタンで順序変更
- 各ブロックのスクリーンショットで配置を確認
- ブロック単位で削除

### 7. Preview

2つのモード:

- **Screenshot モード（デフォルト）:** スクリーンショットを縦に結合。実際のサイトの見た目と完全一致。
- **Live HTML モード:** 元サイトのスタイルシートを`<link>`で注入し、画像除去済みHTMLをレンダリング。構造の確認用。

### 8. Export

Canvasの構成をHTMLファイルとして出力:

- 元サイトのスタイルシートURL込み
- コピー or ファイルダウンロード

---

## API

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/extract` | URLからパーツ抽出。Body: `{ url: string }` |
| `POST` | `/api/library/save` | パーツをライブラリに保存。Body: `{ parts: [], genre: string, tags: string[] }` |
| `GET` | `/api/library` | 保存済みパーツ一覧。Query: `?genre=SaaS` or `?type=hero` |
| `GET` | `/api/library/genres` | ジャンル一覧+件数 |
| `PATCH` | `/api/library/:id` | パーツのジャンル/タグ更新。Body: `{ genre, tags }` |
| `DELETE` | `/api/library/:id` | パーツ削除 |

---

## Data Model

```
data/parts.json
└── StoredPart[]
      ├── id: string
      ├── type: BlockType (hero | navigation | feature | ...)
      ├── confidence: number
      ├── html: string (images stripped)
      ├── thumbnail: string (base64 PNG)
      ├── genre: string
      ├── tags: string[]
      ├── meta: { hasImages, hasCTA, hasForm, headingCount, linkCount, cardCount }
      ├── sourceUrl: string
      └── savedAt: string (ISO 8601)
```

---

## File Structure

```
PARTCOPY/
├── server/
│   ├── index.ts          # Express API routes
│   ├── extractor.ts      # Puppeteer + DOM解析 + 分類 + screenshot
│   └── storage.ts        # JSON file CRUD
├── src/
│   ├── App.tsx           # Main app state + routing
│   ├── main.tsx          # React entry
│   ├── styles.css        # All styles (dark theme)
│   ├── types/index.ts    # TypeScript types
│   └── components/
│       ├── URLInput.tsx   # URL + genre + tags input
│       ├── PartsPanel.tsx # Extracted parts sidebar (thumbnail cards)
│       ├── Canvas.tsx     # Page builder (drag & drop)
│       ├── Preview.tsx    # Screenshot / Live HTML preview
│       ├── Library.tsx    # Saved parts browser (genre filter)
│       └── ExportModal.tsx # HTML export
├── data/                  # Runtime storage (gitignored)
│   └── parts.json
├── package.json
├── tsconfig.json
├── vite.config.ts
└── plan.md               # Original business plan
```

---

## Setup

```bash
npm install
npm run dev
# → Client: http://localhost:5173
# → Server: http://localhost:3001
```

---

## Known Limitations / Next Steps

### Current Limitations

- **分類精度:** ヒューリスティクスのみ。class名やテキストに手がかりがないセクションは `content` or `unknown` に落ちる
- **ストレージ:** JSONファイル。パーツ数が万単位になるとパフォーマンスが劣化する
- **CSS:** 元サイトのスタイルシートURLをそのまま参照。オフラインでは崩れる
- **SPA対応:** `networkidle2` 待ちだが、クライアントサイドルーティングのSPAは初期表示のみ取得
- **Export:** 元サイトCSS依存。自立したHTMLにはならない

### Roadmap（plan.md準拠）

1. **分類精度向上:** DOM + テキスト embedding + 視覚レイアウト（bbox, font-size）の組み合わせでML分類器を構築。目標: 上位10ブロック Precision 90%+
2. **Semantic Block正規化:** raw HTMLではなく、canonical block schema（`hero_split_left`, `feature_grid_3` 等）への変換。内容/レイアウト/スタイルの分離
3. **ストレージ移行:** JSON → SQLite or PostgreSQL。全文検索、類似構造検索
4. **ベンチマーク/提案モジュール:** 同業他社との構造比較、欠落ブロック指摘、CTAの改善提案
5. **AI生成:** ジャンル+目的を選ぶと、蓄積パターンに基づいて新サイト初稿を自動生成
6. **大規模クロール:** .co.jp 10,000サイト → セクション分類 → UIパターンコーパス構築
7. **出力強化:** Static HTML/CSS、Next.js + Tailwind、JSON schema 出力

---

## License

Private / Internal use.
