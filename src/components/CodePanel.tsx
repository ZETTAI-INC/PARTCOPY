import React, { useState, useEffect, useRef } from 'react'
import { apiFetch } from '../api'
import Editor from '@monaco-editor/react'
import { SourceSection } from '../types'
import { FAMILY_META_MAP } from '../constants'

interface Props {
  sectionId: string | null
  sections: SourceSection[]
  onClose: () => void
}

export function CodePanel({ sectionId, sections, onClose }: Props) {
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [copied, setCopied] = useState<'code' | 'prompt' | null>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  const section = sections.find(s => s.id === sectionId)

  useEffect(() => {
    if (!sectionId) return
    setLoading(true)
    setCode('')
    apiFetch(`/api/sections/${sectionId}/html`)
      .then(res => res.ok ? res.json() : Promise.reject())
      .then(data => setCode(data.html || data.sanitizedHtml || ''))
      .catch(() => setCode('<!-- コードの取得に失敗しました -->'))
      .finally(() => setLoading(false))
  }, [sectionId])

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      const textarea = document.createElement('textarea')
      textarea.value = text
      document.body.appendChild(textarea)
      textarea.select()
      document.execCommand('copy')
      document.body.removeChild(textarea)
    }
  }

  const handleCopyCode = async () => {
    await copyToClipboard(code)
    setCopied('code')
    setTimeout(() => setCopied(null), 2000)
  }

  const handleCopyWithPrompt = async () => {
    const family = section ? (FAMILY_META_MAP[section.block_family]?.label || section.block_family) : ''
    const variant = section?.block_variant || ''
    const summary = section?.text_summary || ''
    const domain = section?.source_sites?.normalized_domain || ''
    const features: string[] = []
    if (section?.features_jsonb?.hasImages) features.push('画像あり')
    if (section?.features_jsonb?.hasCTA) features.push('CTAあり')
    if (section?.features_jsonb?.hasForm) features.push('フォームあり')

    const prompt = `以下の参考HTMLコードの「構造パターン」を参考に、同じレイアウト構成で新しいセクションを実装してください。

## 参考パーツ情報
- セクション種別: ${family}${variant ? `（${variant}）` : ''}${summary ? `\n- 概要: ${summary}` : ''}${features.length ? `\n- 特徴: ${features.join('、')}` : ''}${domain ? `\n- 参照元: ${domain}` : ''}

## 指示
- 下記のHTMLコードをそのままコピーせず、構造（レイアウト・要素の配置・セクション構成）だけを参考にしてください
- テキスト・画像・色はプロジェクトに合わせて書き換えてください
- セマンティックHTML + レスポンシブ対応で実装してください
- 元サイトのブランド要素（ロゴ・商標・固有表現）は使わないでください

## 参考コード
\`\`\`html
${code}
\`\`\``

    await copyToClipboard(prompt)
    setCopied('prompt')
    setTimeout(() => setCopied(null), 2000)
  }

  if (!sectionId) return null

  return (
    <div className="code-panel" ref={panelRef}>
      <div className="code-panel-header">
        <div className="code-panel-title">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
            <path d="M5.5 3L1 8l4.5 5M10.5 3L15 8l-4.5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          <span>
            {section ? (FAMILY_META_MAP[section.block_family]?.label || section.block_family) : 'HTML'}
          </span>
          {section?.source_sites?.normalized_domain && (
            <span className="code-panel-domain">{section.source_sites.normalized_domain}</span>
          )}
        </div>
        <div className="code-panel-actions">
          <button
            className={`code-panel-btn ${copied === 'code' ? 'copied' : ''}`}
            onClick={handleCopyCode}
            disabled={loading}
          >
            {copied === 'code' ? 'Copied' : 'Copy'}
          </button>
          <button
            className={`code-panel-btn code-panel-btn-accent ${copied === 'prompt' ? 'copied' : ''}`}
            onClick={handleCopyWithPrompt}
            disabled={loading}
          >
            {copied === 'prompt' ? 'Copied' : 'Prompt'}
          </button>
          <button className="code-panel-close" onClick={onClose}>
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </button>
        </div>
      </div>
      <div className="code-panel-body">
        {loading ? (
          <div className="code-panel-loading">
            <div className="code-panel-spinner" />
          </div>
        ) : (
          <Editor
            height="100%"
            language="html"
            value={code}
            onChange={(value) => setCode(value || '')}
            theme="vs-dark"
            options={{
              readOnly: false,
              minimap: { enabled: false },
              fontSize: 13,
              lineNumbers: 'on',
              scrollBeyondLastLine: false,
              wordWrap: 'on',
              tabSize: 2,
              renderWhitespace: 'none',
              overviewRulerBorder: false,
              hideCursorInOverviewRuler: true,
              scrollbar: {
                verticalScrollbarSize: 8,
                horizontalScrollbarSize: 8,
              },
              padding: { top: 12, bottom: 12 },
            }}
          />
        )}
      </div>
    </div>
  )
}
