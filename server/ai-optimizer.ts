import Anthropic from '@anthropic-ai/sdk'
import { logger } from './logger.js'

export interface OptimizeConfig {
  brandColor: string
  industry: string
  targetAudience: string
}

export interface OptimizeResult {
  css: string
}

/** HTMLからclass名・構造・見出しを抽出 */
function extractStructureInfo(html: string): string {
  const classMatches = html.match(/class="([^"]+)"/g) || []
  const classes = new Set<string>()
  for (const m of classMatches) {
    const val = m.replace(/class="([^"]+)"/, '$1')
    for (const c of val.split(/\s+/)) {
      if (c && c.length < 60) classes.add(c)
    }
  }

  const headings: string[] = []
  const hPattern = /<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/gi
  let match
  while ((match = hPattern.exec(html)) !== null && headings.length < 10) {
    const text = match[1].replace(/<[^>]+>/g, '').trim().slice(0, 80)
    if (text) headings.push(text)
  }

  const buttons: string[] = []
  const btnPattern = /<(button|a)[^>]*class="[^"]*btn[^"]*"[^>]*>([\s\S]*?)<\/\1>/gi
  while ((match = btnPattern.exec(html)) !== null && buttons.length < 5) {
    const text = match[2].replace(/<[^>]+>/g, '').trim().slice(0, 40)
    if (text) buttons.push(text)
  }

  return [
    `Key classes: ${[...classes].slice(0, 40).join(', ')}`,
    headings.length ? `Headings: ${headings.join(' | ')}` : '',
    buttons.length ? `Buttons: ${buttons.join(' | ')}` : ''
  ].filter(Boolean).join('\n')
}

const SYSTEM_PROMPT = `あなたは世界最高レベルのWebデザインエンジニアです。
複数のWebサイトから抽出したHTMLセクションを、プロダクション品質のLPに統一します。

## あなたの仕事
元のHTMLとCSSはそのまま保持されます。
あなたは **CSSオーバーライドレイヤー** のみを生成します。
このCSSは元のCSSの後に読み込まれ、上書きで統一感を出します。

## 生成するCSSの要件

### 1. グローバルリセット & テーマ
\`\`\`
.pc-optimized { ... }  /* bodyに付与済み */
\`\`\`
- CSS変数でブランドカラー・フォント・スペーシングを定義
- font-family統一: 'Noto Sans JP', -apple-system, sans-serif
- box-sizing, margin/padding リセット

### 2. セクションスコープ
各セクションは \`.pc-s0\` 〜 \`.pc-sN\` でラップ済み。
- セクション間の余白を統一（padding: 80px 0 等）
- 背景色を交互に（白 / 薄いグレー）
- max-width + margin: auto でコンテンツ幅統一

### 3. カラーハーモニー（最重要）
- 全てのプライマリボタン → ブランドカラーに統一（!important使用可）
- リンク色 → ブランドカラー系
- 見出し色 → ダークグレー統一
- 背景の統一感

### 4. タイポグラフィ
- h1: 48px/700, h2: 36px/700, h3: 24px/600
- body text: 16px/400, line-height: 1.7
- letter-spacing: 0.02em（日本語用）

### 5. ボタン統一
- .pc-optimized a[href], .pc-optimized button → ブランドカラー系
- border-radius: 8px, padding: 12px 32px
- hover: opacity 0.85

### 6. レスポンシブ
- @media (max-width: 768px) で調整
- セクション padding 縮小, font-size 縮小

### 7. ビジュアル仕上げ
- セクション間のセパレータ/グラデーション
- ボタンの微妙なシャドウ
- スムーズなトランジション

## !important について
元サイトのCSSをオーバーライドする必要があるため、**積極的に !important を使用してください**。
特に color, background-color, font-family, font-size, padding, margin には必要です。

## 出力
CSSコードのみ。マークダウンフェンス不要。コメントは簡潔に。`

export async function optimizeWithClaude(
  sections: Array<{ id: string; family: string; html: string; sourceUrl?: string }>,
  config: OptimizeConfig
): Promise<OptimizeResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not set')

  const client = new Anthropic({ apiKey })

  const sectionDescriptions = sections.map((s, i) => {
    const info = extractStructureInfo(s.html)
    return `### .pc-s${i} — ${s.family} (from ${s.sourceUrl || 'unknown'})
${info}`
  }).join('\n\n')

  const userPrompt = `以下の ${sections.length} セクションで構成されるSaaS LPの統一CSSを生成してください。

## ブランド設定
- メインカラー: ${config.brandColor}
- セカンダリカラー: ${config.brandColor}20（透過版）
- 業種: ${config.industry}
- ターゲット: ${config.targetAudience}

## セクション構成（上から順番に配置）
${sectionDescriptions}

プロダクション品質の美しい統一CSSを生成してください。!important を積極的に使い、確実にオーバーライドしてください。`

  logger.info('Claude optimize: calling API', {
    sectionCount: sections.length,
    inputChars: userPrompt.length
  })

  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 12000,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userPrompt }]
  })

  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map(b => b.text)
    .join('')

  logger.info('Claude optimize: response received', {
    outputChars: text.length,
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
    cost: `$${((response.usage.input_tokens * 3 + response.usage.output_tokens * 15) / 1_000_000).toFixed(4)}`
  })

  let css = text.trim()
  if (css.startsWith('```')) {
    css = css.replace(/^```(?:css)?\s*/, '').replace(/\s*```$/, '')
  }

  return { css }
}
