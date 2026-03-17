# PARTCOPY — Site Genome OS

## What is PARTCOPY?

**PARTCOPY は、既存の Web サイトを「パーツ」に分解し、自由に再構成できるツールです。**

URL を入力するだけで、サイトの HTML/CSS/画像/フォントを丸ごとダウンロードし、ヘッダー・ヒーロー・料金表・FAQ・フッターといったセクション単位に自動分割。Claude Haiku AI が 18 種類のカテゴリに分類し、ライブラリに蓄積。ドラッグ&ドロップで新しいページを組み立てられます。

### 誰のためのツール？

- **Web 制作会社** — 競合サイトの構造を分析し、提案の初稿を最速で作りたい
- **LP デザイナー** — 業種ごとの「勝ちパターン」をパーツ単位で比較・収集したい
- **マーケター** — 他社サイトの CTA 配置やセクション構成を定量的に把握したい

### 何ができる？

| 機能 | 説明 |
|------|------|
| **URL → パーツ分解** | URL を入力するとサイトを完全ダウンロードし、セマンティックなセクション（Hero, Feature, Pricing, FAQ 等 18 種）に AI 自動分類 |
| **パーツライブラリ** | 抽出したパーツをジャンル・ブロックタイプ・特徴量で横断検索。複数サイトのパーツを一元管理 |
| **Canvas エディタ** | ライブラリからパーツを選んでドラッグ&ドロップでページ構成。順序変更・挿入・削除 |
| **ビジュアル編集** | パーツ内のテキスト・画像・リンクをクリックして直接編集（WordPress 風インライン編集） |
| **HTML コード編集** | Monaco Editor（VS Code 相当）でパーツの HTML を直接書き換え。ライブプレビュー付き |
| **AI デザイン統一** | 複数サイトから集めたバラバラなデザインを Claude Sonnet 4 で統一。ブランドカラー・業種・ターゲット設定可 |
| **画像 URL 表示** | セクション内の画像元 URL を一覧表示。クリックでコピー・新タブ表示 |
| **プロジェクト管理** | Canvas の状態を保存・復元。複数プロジェクト対応 |
| **HTML エクスポート** | 完成ページを単体 HTML ファイルとしてダウンロード |
| **使用量警告** | ライブラリ・Canvas・サイト数が増えすぎた場合に警告バナー表示 |

### 処理の流れ

```
URL 入力  →  サイト完全ダウンロード  →  セクション自動検出  →  AI 分類（Claude Haiku）
                                                                    ↓
     HTML エクスポート  ←  プレビュー  ←  Canvas で再構成  ←  パーツライブラリに蓄積
```

---

## かかる費用

### 無料のもの

| 項目 | 説明 |
|------|------|
| PARTCOPY 本体 | オープンソース、無料 |
| 全ライブラリ/依存関係 | React, Express, Puppeteer 等すべて OSS |
| ヘッドレスブラウザ | Puppeteer 内蔵 Chromium（ローカル実行） |
| ローカルモード | Supabase なしでも動作（.partcopy/ に JSON 保存） |

### 有料のもの

#### Anthropic API（Claude）

| 処理 | モデル | 1回あたりの目安 |
|------|--------|----------------|
| **セクション分類** | Claude Haiku | **約 $0.01〜0.05（2〜8 円）** |
| **デザイン統一**（任意） | Claude Sonnet 4 | **約 $0.06〜0.10（10〜15 円）** |

1 サイト分析（40 セクション想定）: 15 件ずつバッチ処理 = 3 回の API 呼び出し → **約 3〜6 円**

| 使い方 | 月額目安 |
|--------|---------|
| ライト（週 1〜2 サイト） | **約 15〜60 円** |
| 通常（週 3〜5 サイト） | **約 45〜150 円** |
| ヘビー（毎日 + AI 統一多用） | **約 150〜750 円** |

> AI 分類なしでもヒューリスティック分類で動作。`ANTHROPIC_API_KEY` 未設定なら API 料金ゼロ。

#### Supabase（任意）

| プラン | 料金 | 含まれるもの |
|--------|------|-------------|
| **Free** | $0/月 | DB 500MB, Storage 1GB |
| **Pro** | $25/月 | DB 8GB, Storage 100GB |

ローカルモードを使えば Supabase 不要。

#### 費用まとめ

| 構成 | 月額目安 |
|------|---------|
| **最小構成**（ローカル + API Key 未設定） | **$0（完全無料）** |
| **推奨構成**（ローカル + Haiku 分類） | **約 $0.10〜1.00/月** |
| **フル構成**（Supabase Pro + Haiku + Sonnet） | **約 $25〜30/月** |

---

## Quick Start

```bash
# インストール
npm install

# 起動（Docker 不要 / ローカルモード）
npm run dev
# → Client: http://127.0.0.1:5180
# → API:    http://localhost:3002
# → Worker: crawl_runs をポーリング
# → データ保存先: .partcopy/
```

ブラウザで http://127.0.0.1:5180 を開き、URL を入力して「分析する」を押すだけ。

### Supabase を使う場合（オプション）

```bash
cp .env.example .env
# SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY を設定
# キーがあれば Supabase モード、なければ自動でローカルモード
```

---

## Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│  React + Vite (Client)            http://127.0.0.1:5180          │
│  URLInput → PartsPanel → Canvas → Preview → Library → Projects   │
└──────────────── /api/* proxy ─────────────────────────────────────┘
                        │
┌───────────────────────▼──────────────────────────────────────────┐
│  Express API Server               http://localhost:3002           │
│  ジョブ投入・結果取得・セクション配信（軽量、Puppeteer なし）         │
│  Helmet + CORS + Rate Limit + API Key 認証                        │
└──────────────────────── polling ──────────────────────────────────┘
                        │
┌───────────────────────▼──────────────────────────────────────────┐
│  Crawl Worker (別プロセス)                                        │
│  site-downloader → section-detector → ai-classifier → dom-parser │
└──────────────────────── storage ─────────────────────────────────┘
                        │
┌───────────────────────▼──────────────────────────────────────────┐
│  Storage (自動切り替え)                                            │
│  Supabase (Postgres + Storage) / Local (.partcopy/)               │
└──────────────────────────────────────────────────────────────────┘
```

### API / Worker 分離の理由

Puppeteer は重い。タイムアウト・メモリ圧迫・クラッシュ時の巻き添えを避けるため、API サーバーとブラウザワーカーを完全分離。API はジョブ投入と結果取得のみ。

---

## Worker パイプライン

Worker は 5 フェーズでサイトを処理する。

### Phase 1: Complete Site Download

Puppeteer でページを開き、HTML/CSS/画像/フォントを全てダウンロード。URL を長さ降順でソートし、相対パス・srcset も含めて全てローカルパスに書き換え。

### Phase 2: Page-Level Storage

書き換え済み HTML、CSS バンドル、フルページスクリーンショット、アセット一覧を保存。

### Phase 3: Section Detection

ブラウザ内で `<header>`, `<nav>`, `<section>`, `<footer>` 等のセマンティック要素を収集。大きすぎる要素は子に分解、重複は排除し、各セクションの特徴量（heading 数、画像数、CTA 有無等）を抽出。

### Phase 4: AI Classification

Claude Haiku が 18 種の Block Family に分類（15 セクション/バッチ）。信頼度スコア（0〜1）と品質スコア（0〜1）を付与。`ANTHROPIC_API_KEY` 未設定時はルールベースのヒューリスティック分類にフォールバック。

### Phase 5: DOM Snapshot + Storage

各セクションの編集可能な DOM ツリーを生成（`data-pc-key` 属性付き）。テキスト・画像・リンク等を個別に編集できる粒度でノードを保存。

---

## 18 Block Families

| Family | 日本語名 | 説明 |
|--------|---------|------|
| navigation | メニュー | グローバルナビ、ヘッダー |
| hero | メインビジュアル | ファーストビュー、キャッチコピー + CTA |
| feature | 特徴・サービス紹介 | カード、グリッド、交互レイアウト |
| social_proof | お客様の声 | テスティモニアル、レビュー |
| stats | 数字で見る実績 | カウンター、数値ハイライト |
| logo_cloud | 導入企業ロゴ | パートナー、クライアントロゴ |
| pricing | 料金プラン | 価格テーブル、比較表 |
| faq | よくある質問 | アコーディオン、Q&A |
| content | 読み物・説明 | テキスト主体コンテンツ |
| news_list | お知らせ一覧 | ブログ、ニュース |
| gallery | 写真ギャラリー | 画像グリッド |
| company_profile | 会社情報 | 企業概要、チーム紹介 |
| timeline | 沿革・ステップ | タイムライン、プロセス表示 |
| recruit | 採用情報 | 求人、キャリア |
| card | カード | 単体の情報カード |
| cta | アクションボタン | CTA バナー、申し込みボタン |
| contact | 問い合わせフォーム | フォーム、連絡先 |
| footer | フッター | サイトマップ、コピーライト |

> navigation, footer はキャンバスへの追加時に自動除外。

---

## 編集機能

### ビジュアル編集（WordPress 風インライン編集）

Canvas 上のパーツで「編集」をクリックすると、iframe 内の要素をクリックで選択可能に。

- **テキスト** — クリックでその場で編集。Enter で確定、Esc でキャンセル
- **画像** — クリックで画像変更オーバーレイ。新しい URL を入力して差替え
- **ノードインスペクター** — 右パネルで属性・スタイル・リンクを編集
- 変更は `postMessage` 経由でリアルタイム反映

### HTML コード編集（Monaco Editor）

`</>` ボタンでコードエディタを開き、パーツの HTML を直接編集。右側にライブプレビュー。Cmd+S で保存。

### パッチ操作

| op | payload | 説明 |
|----|---------|------|
| `set_text` | `{ text }` | テキスト変更 |
| `set_attr` | `{ attr, value }` | 属性変更（イベントハンドラ属性はブロック） |
| `replace_asset` | `{ src, alt? }` | 画像差し替え |
| `remove_node` | `{}` | 要素削除 |
| `set_style_token` | `{ property, value }` | CSS 変更 |
| `set_class` | `{ add?, remove? }` | クラス操作 |

---

## AI デザイン統一

プレビュー画面で複数サイトから集めたバラバラなデザインを統一。

1. 各セクションのレイアウト構造（見出し数・ボタン数・カード数等）を抽出
2. Claude Sonnet 4 がゼロから新しい HTML/CSS を生成
3. ブランドカラー・業種・ターゲット層を設定可能
4. レスポンシブ対応 + セマンティック HTML5

---

## セキュリティ

| カテゴリ | 対策 |
|---------|------|
| **認証** | API キー認証（X-API-Key ヘッダー）。全書き込みエンドポイントに適用 |
| **レート制限** | グローバル: 3000 回/15 分、クロール: 10 回/時間、AI: 20 回/時間 |
| **SSRF 防止** | localhost・プライベート IP・内部ホスト名への接続をブロック |
| **入力検証** | 全 ID の UUID 形式チェック、文字列長制限、HTML タグ除去 |
| **パストラバーサル防止** | ストレージパスの `../` や絶対パスをブロック |
| **HTTP ヘッダー** | Helmet（CSP, X-Frame-Options, HSTS, X-Content-Type-Options 等） |
| **CORS** | 許可オリジンのホワイトリスト制 |

---

## npm scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Client + Server + Worker 同時起動 |
| `npm run dev:client` | Vite dev server (port 5180) |
| `npm run dev:server` | API server (port 3002) |
| `npm run dev:worker` | Worker (polling 3 秒) |
| `npm run build` | TypeScript + Vite ビルド |

---

## 環境変数

```bash
# サーバーポート
PARTCOPY_API_PORT=3002
PARTCOPY_CLIENT_PORT=5180

# セキュリティ: API キー認証（サーバーとクライアントで同じ値を設定）
PARTCOPY_API_KEY=your-secret-api-key
VITE_PARTCOPY_API_KEY=your-secret-api-key

# Anthropic API（AI 分類・デザイン統一に必要）
ANTHROPIC_API_KEY=sk-ant-xxxxx

# Supabase（オプション — なければ自動でローカルモード）
SUPABASE_URL=http://127.0.0.1:54321
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

`SUPABASE_SERVICE_ROLE_KEY` が未設定なら自動でローカルモード（`.partcopy/` にデータ保存）。
`ANTHROPIC_API_KEY` が未設定なら AI 分類の代わりにヒューリスティック分類を使用。
`PARTCOPY_API_KEY` が未設定なら API キー認証をスキップ（開発用）。

---

## File Structure

```
PARTCOPY/
├── server/
│   ├── index.ts              # Express API（Helmet + Rate Limit + API Key 認証）
│   ├── worker.ts             # Crawl Worker（5 フェーズパイプライン）
│   ├── site-downloader.ts    # サイト完全ダウンロード + URL 書き換え
│   ├── section-detector.ts   # セマンティックセクション検出
│   ├── ai-classifier.ts      # Claude Haiku AI 分類（バッチ処理）
│   ├── ai-optimizer.ts       # Claude Sonnet 4 デザイン統一
│   ├── classifier.ts         # ヒューリスティック分類（フォールバック）
│   ├── canonicalizer.ts      # スロット/トークン正規化
│   ├── dom-parser.ts         # 編集可能 DOM スナップショット
│   ├── style-extractor.ts    # スタイル要約 + レイアウトシグネチャ
│   ├── network-recorder.ts   # CSS 収集 + URL 解決
│   ├── local-store.ts        # ローカル JSON DB（Supabase 代替）
│   ├── supabase.ts           # Supabase client 初期化
│   ├── storage-config.ts     # ストレージバケット設定
│   ├── logger.ts             # ロガー
│   └── capture-runner.ts     # Puppeteer ブラウザ管理
├── src/
│   ├── App.tsx               # メイン状態管理 + 使用量警告
│   ├── api.ts                # 認証付き fetch ラッパー（apiFetch）
│   ├── main.tsx              # React エントリポイント
│   ├── types.ts              # TypeScript 型定義
│   ├── constants.ts          # Block Family 定義・カラー・ラベル
│   ├── styles.css            # UI スタイル
│   ├── vite-env.d.ts         # Vite 環境変数型定義
│   └── components/
│       ├── URLInput.tsx          # URL + genre + tags 入力（ターミナル風進捗 UI）
│       ├── PartsPanel.tsx        # 抽出パーツ一覧
│       ├── Canvas.tsx            # 編集キャンバス（DnD + ブロック挿入ゾーン）
│       ├── EditableSourceFrame.tsx # WordPress 風インライン編集 iframe
│       ├── SourcePreviewFrame.tsx  # 読み取り専用プレビュー（1440px スケール）
│       ├── NodeInspector.tsx     # ノード編集パネル
│       ├── CodeEditor.tsx        # Monaco HTML コードエディタ
│       ├── CodePanel.tsx         # コード表示 + プロンプト付きコピー
│       ├── Preview.tsx           # プレビュー + AI 統一 + HTML エクスポート
│       ├── Library.tsx           # パーツライブラリ検索 + 画像 URL 表示
│       ├── ProjectManager.tsx    # プロジェクト保存・復元
│       ├── ImageGallery.tsx      # 画像ギャラリー（レガシー）
│       └── ErrorBoundary.tsx     # エラーバウンダリ
├── supabase/
│   └── migrations/            # Supabase マイグレーション SQL
├── docs/
│   └── GUIDE.md               # 詳細ガイド（費用・使い方・セキュリティ）
├── .partcopy/                 # ローカルモードデータ（gitignore）
├── .env.example               # 環境変数テンプレート
├── package.json
├── tsconfig.json
└── vite.config.ts
```

---

## 使用量警告

以下のしきい値を超えると、画面上部に黄色い警告バナーが表示されます。

| 対象 | しきい値 | 警告内容 |
|------|---------|---------|
| ライブラリセクション数 | 200 件 | パフォーマンス・ストレージへの影響 |
| Canvas ブロック数 | 15 個 | プレビュー・書き出しの重さ |
| 分析済みサイト数 | 10 サイト | API コストの蓄積 |

---

## Roadmap

### Done
- URL → サイト完全ダウンロード → セクション検出 → AI 分類 → 正規化
- パーツライブラリ（ジャンル/ファミリーフィルタ + 検索 + 画像 URL 表示）
- Canvas エディタ（DnD + ブロック挿入 + ビジュアル編集 + コード編集）
- DOM スナップショット + パッチエンジン
- AI デザイン統一（Claude Sonnet 4）
- プロジェクト管理（保存・復元）
- HTML エクスポート
- セキュリティ（API Key 認証 + Rate Limit + SSRF 防止 + UUID 検証 + Helmet）
- 使用量警告バナー
- Dual-mode storage（Supabase / Local）

### Next
- 分類精度向上（教師データ + ML モデル）
- pgvector で類似パーツ検索
- Static HTML / Next.js + Tailwind エクスポート
- 業種別構造比較・競合分析レポート
- AI によるコピーライティング提案

---

## North Star

> **既存サイトの再構築にかかる構造設計時間を、何分の 1 にできたか**
