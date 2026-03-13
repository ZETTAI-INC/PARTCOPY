/**
 * AI-powered Section Classifier using Claude Haiku.
 * Falls back to heuristic classifier if API key is not set.
 */
import Anthropic from '@anthropic-ai/sdk'
import { classifySection, type RawSection } from './classifier.js'

const FAMILY_TYPES = [
  'hero',
  'feature',
  'social_proof',
  'stats',
  'pricing',
  'faq',
  'content',
  'cta',
  'contact',
  'recruit',
  'news_list',
  'timeline',
  'company_profile',
  'gallery',
  'logo_cloud',
  'carousel',
  'tabs',
  'accordion',
  'card',
] as const

interface AIClassification {
  type: string
  variant: string
  confidence: number
  quality_score: number
  reason: string
}

/**
 * Classify a batch of sections using Claude Haiku.
 * Returns array of classifications in the same order as input.
 */
export async function classifySectionsWithAI(
  sections: { index: number; textContent: string; features: Record<string, any>; classTokens: string[]; tagName: string; boundingBox: { height: number; width: number }; outerHTMLSnippet?: string }[]
): Promise<AIClassification[]> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey || sections.length === 0) {
    return sections.map(() => ({
      type: 'content',
      variant: '',
      confidence: 0.3,
      quality_score: 0.3,
      reason: 'No API key'
    }))
  }

  const client = new Anthropic({ apiKey })

  const sectionDescriptions = sections.map((s, i) => {
    const text = s.textContent.slice(0, 400).trim()
    const classes = s.classTokens.slice(0, 15).join(', ')
    const htmlSnippet = s.outerHTMLSnippet || ''
    const f = s.features
    return `## Section ${i}
- Tag: <${s.tagName}>, Size: ${Math.round(s.boundingBox.width)}x${Math.round(s.boundingBox.height)}px
- Classes: ${classes || 'none'}
- Content: ${f.headingCount || 0} headings, ${f.imageCount || 0} images, ${f.buttonCount || 0} buttons, ${f.formCount || 0} forms, ${f.cardCount || 0} cards, ${f.linkCount || 0} links, ${f.listItemCount || 0} list items
- Repeated pattern: ${f.repeatedChildPattern || 'none'}
- Text: ${text || '(empty)'}${htmlSnippet ? `\n- HTML:\n\`\`\`html\n${htmlSnippet}\n\`\`\`` : ''}`
  }).join('\n\n')

  const prompt = `あなたはWebデザインの専門家です。LPやコーポレートサイトから抽出されたHTMLセクションを分類し、再利用価値を評価してください。

## タスク
各セクションの「種類」「バリエーション名」「分類の確信度」「再利用品質」を判定してください。

## 使用可能なタイプ
${FAMILY_TYPES.join(', ')}

## 判定基準

### type（種類）の判定
- HTMLの構造・テキスト内容・要素の組み合わせから判断
- クラス名だけに頼らず、実際のコンテンツで判断すること
- hero: ページ冒頭の大きなビジュアル+キャッチコピー
- feature: サービスや特徴をカード等で並べたエリア
- cta: 申し込み・資料請求などの行動誘導
- card: 単体の情報カード（繰り返しパターンの1つ）
- carousel: スライダー/スワイプ系のUI
- pricing: 料金プラン比較
- social_proof: お客様の声・導入事例
- stats: 数字実績の訴求
- faq: Q&A形式
- contact: お問い合わせフォーム
- content: 上記に該当しないテキスト中心のエリア

### quality_score（再利用品質）の判定
Webデザイナーが「このパーツのレイアウト構造を参考にしたい」と思えるか？
- 0.9-1.0: 構造が明確、レスポンシブ対応、カード/グリッド等のレイアウトパターンが綺麗
- 0.7-0.8: 標準的な構成、そのまま参考にできる
- 0.5-0.6: 使えなくはないが特徴がない
- 0.3-0.4: テキストだけ、構造が単純すぎる
- 0.1-0.2: 壊れている、意味不明、1行だけ、装飾のないテキスト段落

## 出力形式
JSON配列のみ返してください（説明文不要）:
[{"type": "...", "variant": "日本語の短い説明(例: 3カラムカード、横スクロール、アコーディオン式)", "confidence": 0.0-1.0, "quality_score": 0.0-1.0, "reason": "判断理由(10文字程度)"}]

## セクションデータ

${sectionDescriptions}`

  try {
    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }]
    })

    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map(b => b.text)
      .join('')

    // Extract JSON array from response
    const jsonMatch = text.match(/\[[\s\S]*\]/)
    if (!jsonMatch) throw new Error('No JSON array in response')

    const parsed: AIClassification[] = JSON.parse(jsonMatch[0])

    // Validate and pad if needed
    return sections.map((_, i) => {
      const result = parsed[i]
      if (!result) return { type: 'content', variant: '', confidence: 0.3, quality_score: 0.3, reason: 'Missing from AI response' }
      return {
        type: FAMILY_TYPES.includes(result.type as any) ? result.type : 'content',
        variant: String(result.variant || ''),
        confidence: Math.max(0, Math.min(1, Number(result.confidence) || 0.5)),
        quality_score: Math.max(0, Math.min(1, Number(result.quality_score) || 0.5)),
        reason: String(result.reason || '')
      }
    })
  } catch (err) {
    console.error('AI classification failed, falling back to heuristic:', err)
    // Fallback to heuristic
    return sections.map((s, i) => {
      const raw: RawSection = {
        tagName: s.tagName,
        outerHTML: '',
        textContent: s.textContent,
        boundingBox: { x: 0, y: 0, ...s.boundingBox },
        computedStyles: {},
        hasImages: (s.features.imageCount || 0) > 0,
        hasCTA: (s.features.buttonCount || 0) > 0,
        hasForm: (s.features.formCount || 0) > 0,
        headingCount: s.features.headingCount || 0,
        linkCount: s.features.linkCount || 0,
        cardCount: s.features.cardCount || 0,
        childCount: s.features.childCount || 0,
        classNames: s.classTokens.join(' '),
        id: ''
      }
      const heuristic = classifySection(raw, s.index, sections.length)
      return {
        type: heuristic.type,
        variant: '',
        confidence: heuristic.confidence,
        quality_score: 0.5,
        reason: 'heuristic fallback'
      }
    })
  }
}
