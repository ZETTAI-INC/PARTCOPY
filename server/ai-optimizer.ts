import { claudeGenerate } from './claude-cli.js'
import { logger } from './logger.js'

export interface OptimizeConfig {
  brandColor: string
  industry: string
  targetAudience: string
  companyName?: string
}

export interface OptimizeResult {
  html: string
}

/** HTMLからレイアウト構造・セクション種別・要素数を抽出（コード自体は送らない） */
function extractLayoutBlueprint(html: string, family: string): string {
  const lines: string[] = []

  // Heading structure
  const headings: string[] = []
  const hPattern = /<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi
  let match
  while ((match = hPattern.exec(html)) !== null && headings.length < 8) {
    const level = match[1]
    const text = match[2].replace(/<[^>]+>/g, '').trim().slice(0, 60)
    if (text) headings.push(`h${level}: "${text}"`)
  }
  if (headings.length) lines.push(`見出し構造: ${headings.join(' → ')}`)

  // Button/CTA count and text
  const buttons: string[] = []
  const btnPattern = /<(button|a)[^>]*>([\s\S]*?)<\/\1>/gi
  while ((match = btnPattern.exec(html)) !== null && buttons.length < 5) {
    const text = match[2].replace(/<[^>]+>/g, '').trim().slice(0, 30)
    if (text && text.length > 1) buttons.push(`"${text}"`)
  }
  if (buttons.length) lines.push(`ボタン/CTA: ${buttons.join(', ')}`)

  // Image count
  const imgCount = (html.match(/<img /gi) || []).length
  if (imgCount > 0) lines.push(`画像: ${imgCount}枚`)

  // List/card count
  const cardCount = (html.match(/class="[^"]*(?:card|item|col-|grid-)[^"]*"/gi) || []).length
  if (cardCount > 0) lines.push(`カード/アイテム: ${cardCount}個`)

  // Form elements
  const formCount = (html.match(/<(?:form|input|textarea|select)/gi) || []).length
  if (formCount > 0) lines.push(`フォーム要素: ${formCount}個`)

  // Layout hints from class names
  const layoutClasses: string[] = []
  const classMatches = html.match(/class="([^"]+)"/g) || []
  for (const m of classMatches) {
    const val = m.replace(/class="([^"]+)"/, '$1')
    for (const c of val.split(/\s+/)) {
      if (/grid|flex|col-|row|container|wrapper|layout|section/i.test(c) && c.length < 40) {
        layoutClasses.push(c)
      }
    }
  }
  if (layoutClasses.length) lines.push(`レイアウトヒント: ${[...new Set(layoutClasses)].slice(0, 15).join(', ')}`)

  // Text content summary
  const textContent = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
  if (textContent.length > 50) {
    lines.push(`テキスト概要: "${textContent.slice(0, 200)}..."`)
  }

  return lines.join('\n')
}

const SYSTEM_PROMPT = `あなたは世界最高レベルのWebデザインエンジニアです。

## あなたの仕事
ユーザーから「参考パーツの構造情報」が渡されます。
あなたはその構造パターンを参考に、**完全に新しいHTML+CSSコードを0から書きます**。

## 重要なルール
- 元サイトのHTMLコードは一切コピーしない
- 元サイトの画像URLは使わない（プレースホルダーを使う）
- 元サイトのテキストはそのまま使わない（ユーザーの会社情報に合わせて書き換える）
- ロゴ・商標・ブランド固有の表現は絶対に含めない
- 参考にするのは「構造パターン」のみ（何を何個並べるか、レイアウトの組み方）

## 出力するコード
1つの完全なHTMLファイル（<!DOCTYPE html>から</html>まで）を出力。

### HTML要件
- セマンティックなHTML5タグを使用
- 画像はプレースホルダー（https://placehold.co/600x400/EEE/999?text=Image 等）
- テキストはユーザーのブランド設定に合わせたダミーコピー
- レスポンシブ対応のmeta viewport

### CSS要件
- <style>タグ内にCSS変数でテーマ定義
- ブランドカラーをCSS変数で一元管理
- font-family: 'Noto Sans JP', -apple-system, sans-serif
- レスポンシブ対応（@media max-width: 768px）
- モダンなデザイン（適度なpadding、border-radius、shadow）

### 品質要件
- プロダクション品質：そのままデプロイできるレベル
- アクセシビリティ：alt属性、semantic tags、コントラスト比
- パフォーマンス：不要なネスト禁止、効率的なCSS

## 出力形式
HTMLコードのみ。マークダウンフェンスで囲んでください。
\`\`\`html
<!DOCTYPE html>
...
\`\`\``

export async function generateFromBlueprint(
  sections: Array<{ id: string; family: string; html: string; sourceUrl?: string }>,
  config: OptimizeConfig
): Promise<OptimizeResult> {
  // 元のHTMLコードは送らない — 構造情報だけを抽出して送る
  const blueprints = sections.map((s, i) => {
    const blueprint = extractLayoutBlueprint(s.html, s.family)
    return `### セクション${i + 1}: ${s.family}
${blueprint}`
  }).join('\n\n')

  const companyName = config.companyName || '株式会社サンプル'

  const userPrompt = `以下の構造パターンを参考に、「${companyName}」の${config.industry}向けLPを完全に新規作成してください。

## ブランド設定
- 会社名: ${companyName}
- メインカラー: ${config.brandColor}
- 業種: ${config.industry}
- ターゲット: ${config.targetAudience || 'ビジネスパーソン'}

## 参考にする構造パターン（上から順番に配置）
${blueprints}

## 指示
- 上記の構造パターン（セクション構成・要素数・レイアウト方式）を参考にしてください
- テキストは「${companyName}」向けの自然なコピーに書き換えてください
- 画像はプレースホルダーを使ってください
- 元サイトのコード・デザインをコピーせず、同じ「構成パターン」で新しくデザインしてください
- プロダクション品質の美しいページを生成してください`

  logger.info('Claude generate: calling CLI', {
    sectionCount: sections.length,
    inputChars: userPrompt.length
  })

  const text = await claudeGenerate(userPrompt, {
    systemPrompt: SYSTEM_PROMPT,
    timeout: 180_000 // 3 min for large generations
  })

  logger.info('Claude generate: response received', {
    outputChars: text.length
  })

  // Extract HTML from markdown fences
  let html = text.trim()
  const htmlMatch = html.match(/```html\s*([\s\S]*?)\s*```/)
  if (htmlMatch) {
    html = htmlMatch[1].trim()
  } else if (html.startsWith('```')) {
    html = html.replace(/^```(?:html)?\s*/, '').replace(/\s*```$/, '')
  }

  // Ensure it's a complete HTML document
  if (!html.startsWith('<!DOCTYPE') && !html.startsWith('<html')) {
    html = `<!DOCTYPE html>\n<html lang="ja">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width,initial-scale=1">\n<title>${companyName}</title>\n</head>\n<body>\n${html}\n</body>\n</html>`
  }

  return { html }
}

// Keep backward compatibility
export async function optimizeWithClaude(
  sections: Array<{ id: string; family: string; html: string; sourceUrl?: string }>,
  config: OptimizeConfig
): Promise<{ css: string }> {
  const result = await generateFromBlueprint(sections, config)
  return { css: result.html }
}
