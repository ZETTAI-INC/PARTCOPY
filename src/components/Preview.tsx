import React, { useState, useRef, useEffect } from 'react'
import { SourceSection, CanvasBlock, OptimizeConfig } from '../types'
import { SourcePreviewFrame } from './SourcePreviewFrame'

interface CanvasItem {
  canvas: CanvasBlock
  section: SourceSection
}

interface Props {
  items: CanvasItem[]
}

const INDUSTRIES = [
  'SaaS', 'EC・通販', 'コーポレート', '医療・ヘルスケア',
  '教育', '飲食', '不動産', '金融', 'メディア', 'その他'
]

export function Preview({ items }: Props) {
  const [exporting, setExporting] = useState(false)
  const [optimizing, setOptimizing] = useState(false)
  const [showConfigModal, setShowConfigModal] = useState(false)
  const [optimizedHtml, setOptimizedHtml] = useState<string | null>(null)
  const [config, setConfig] = useState<OptimizeConfig>({
    brandColor: '#6366f1',
    industry: 'SaaS',
    targetAudience: ''
  })
  const optimizedIframeRef = useRef<HTMLIFrameElement>(null)

  const downloadBlob = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const handleExport = async () => {
    setExporting(true)
    try {
      if (optimizedHtml) {
        const blob = new Blob([optimizedHtml], { type: 'text/html' })
        downloadBlob(blob, 'partcopy-optimized.html')
        return
      }
      const sectionIds = items.map(item => item.section.id)
      const res = await fetch('/api/canvas/export-html', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sectionIds })
      })
      if (!res.ok) throw new Error('Export failed')
      const blob = await res.blob()
      downloadBlob(blob, 'partcopy-export.html')
    } catch {
      // ignore
    } finally {
      setExporting(false)
    }
  }

  const handleOptimize = async () => {
    setOptimizing(true)
    setShowConfigModal(false)
    try {
      const sectionIds = items.map(item => item.section.id)
      const res = await fetch('/api/canvas/optimize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sectionIds, config })
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Optimization failed')
      }
      const data = await res.json()
      setOptimizedHtml(data.html)
    } catch (err: any) {
      alert(`最適化に失敗しました: ${err.message}`)
    } finally {
      setOptimizing(false)
    }
  }

  // Render optimized result in iframe
  useEffect(() => {
    if (optimizedHtml && optimizedIframeRef.current) {
      const blob = new Blob([optimizedHtml], { type: 'text/html' })
      const url = URL.createObjectURL(blob)
      optimizedIframeRef.current.src = url
      return () => URL.revokeObjectURL(url)
    }
  }, [optimizedHtml])

  if (items.length === 0) {
    return (
      <div className="preview-container">
        <div className="canvas-empty"><p>Canvasにブロックを追加してください</p></div>
      </div>
    )
  }

  return (
    <div className="preview-container">
      <div className="preview-mode-bar">
        <div className="preview-bar-left">
          <span className="preview-label">
            {optimizedHtml ? 'AI統一プレビュー' : 'プレビュー'}
          </span>
          <span className="preview-count">{items.length} セクション</span>
        </div>
        <div className="preview-actions">
          {optimizedHtml && (
            <button
              className="preview-action-btn reset-btn"
              onClick={() => setOptimizedHtml(null)}
            >
              元に戻す
            </button>
          )}
          <button
            className="preview-action-btn export-btn"
            onClick={handleExport}
            disabled={exporting}
          >
            {exporting ? '出力中...' : 'HTML出力'}
          </button>
        </div>
      </div>

      {optimizing && (
        <div className="optimize-loading">
          <div className="optimize-spinner" />
          <p>AIがデザインを統一しています...</p>
          <p className="optimize-loading-sub">配色・フォント・余白を自動調整中</p>
        </div>
      )}

      {optimizedHtml ? (
        <div className="optimized-preview">
          <iframe
            ref={optimizedIframeRef}
            className="optimized-iframe"
            title="Optimized Preview"
          />
        </div>
      ) : (
        <div className="preview-screenshots">
          {items.map(item => (
            <div key={item.canvas.id} className="preview-section">
              <SourcePreviewFrame htmlUrl={item.section.htmlUrl} maxHeight={2000} />
            </div>
          ))}
        </div>
      )}

      {showConfigModal && (
        <div className="modal-overlay" onClick={() => setShowConfigModal(false)}>
          <div className="modal optimize-config-modal" onClick={e => e.stopPropagation()}>
            <h3>デザイン統一の設定</h3>
            <div className="optimize-form">
              <label>
                ブランドカラー
                <input
                  type="color"
                  value={config.brandColor}
                  onChange={e => setConfig({ ...config, brandColor: e.target.value })}
                />
              </label>
              <label>
                業種
                <select
                  value={config.industry}
                  onChange={e => setConfig({ ...config, industry: e.target.value })}
                >
                  {INDUSTRIES.map(ind => (
                    <option key={ind} value={ind}>{ind}</option>
                  ))}
                </select>
              </label>
              <label>
                ターゲット層
                <input
                  type="text"
                  placeholder="例: 30代ビジネスパーソン"
                  value={config.targetAudience}
                  onChange={e => setConfig({ ...config, targetAudience: e.target.value })}
                />
              </label>
            </div>
            <div className="modal-actions">
              <button className="modal-btn cancel" onClick={() => setShowConfigModal(false)}>
                キャンセル
              </button>
              <button className="modal-btn primary" onClick={handleOptimize}>
                統一を実行
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
