import React, { useState, useRef, useCallback } from 'react'
import { SourceSection, CanvasBlock } from '../types'
import { SourcePreviewFrame } from './SourcePreviewFrame'
import { EditableSourceFrame, type SelectedNode } from './EditableSourceFrame'
import { NodeInspector } from './NodeInspector'
import { CodeEditor } from './CodeEditor'
import { FAMILY_COLORS, FAMILY_META_MAP } from '../constants'

interface CanvasItem {
  canvas: CanvasBlock
  section: SourceSection
}

interface Props {
  items: CanvasItem[]
  onRemove: (canvasId: string) => void
  onMove: (from: number, to: number) => void
  onAddToCanvas?: (section: SourceSection, atIndex?: number) => void
}

export function Canvas({ items, onRemove, onMove, onAddToCanvas }: Props) {
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)
  const [insertDropIndex, setInsertDropIndex] = useState<number | null>(null)
  const dragRef = useRef<number | null>(null)
  const [editingIndex, setEditingIndex] = useState<number | null>(null)
  const [codeEditingIndex, setCodeEditingIndex] = useState<number | null>(null)
  const [selectedNode, setSelectedNode] = useState<SelectedNode | null>(null)
  const iframeRefs = useRef<Map<number, HTMLIFrameElement>>(new Map())
  const [refreshKeys, setRefreshKeys] = useState<Record<number, number>>({})

  const isExternalDrag = (e: React.DragEvent) =>
    e.dataTransfer.types.includes('application/partcopy-section')

  // === Internal reorder: block drag ===
  const handleDragStart = (i: number) => {
    dragRef.current = i
    setDragIndex(i)
  }
  const handleDragEnd = () => {
    dragRef.current = null
    setDragIndex(null)
    setDragOverIndex(null)
    setInsertDropIndex(null)
  }

  // === Inserter zone (between blocks) ===
  const handleInserterDragOver = (e: React.DragEvent, idx: number) => {
    e.preventDefault()
    e.stopPropagation()
    if (isExternalDrag(e)) {
      e.dataTransfer.dropEffect = 'copy'
    }
    setInsertDropIndex(idx)
  }
  const handleInserterDragLeave = (e: React.DragEvent) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const { clientX, clientY } = e
    if (clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom) {
      setInsertDropIndex(null)
    }
  }
  const handleInserterDrop = (e: React.DragEvent, idx: number) => {
    e.preventDefault()
    e.stopPropagation()
    const sectionData = e.dataTransfer.getData('application/partcopy-section')
    if (sectionData && onAddToCanvas) {
      try { onAddToCanvas(JSON.parse(sectionData), idx) } catch {}
    } else if (dragRef.current !== null) {
      const from = dragRef.current
      if (idx !== from && idx !== from + 1) {
        const to = idx < from ? idx : idx - 1
        onMove(from, to)
      }
    }
    dragRef.current = null
    setDragIndex(null)
    setDragOverIndex(null)
    setInsertDropIndex(null)
  }

  // === Empty canvas ===
  const handleEmptyDragOver = (e: React.DragEvent) => {
    if (isExternalDrag(e)) {
      e.preventDefault()
      e.dataTransfer.dropEffect = 'copy'
      setInsertDropIndex(0)
    }
  }
  const handleEmptyDrop = (e: React.DragEvent) => {
    e.preventDefault()
    const sectionData = e.dataTransfer.getData('application/partcopy-section')
    if (sectionData && onAddToCanvas) {
      try { onAddToCanvas(JSON.parse(sectionData), 0) } catch {}
    }
    setInsertDropIndex(null)
  }

  const handleNodeSelect = useCallback((node: SelectedNode | null) => {
    setSelectedNode(node)
  }, [])

  const handleApplyPatch = useCallback((patch: any) => {
    if (editingIndex === null) return
    const iframe = iframeRefs.current.get(editingIndex)
    if (iframe?.contentWindow) {
      iframe.contentWindow.postMessage({ type: 'pc:apply-patch', patch }, window.location.origin)
    }
  }, [editingIndex])

  const handleCodeSaved = useCallback(() => {
    if (codeEditingIndex !== null) {
      setRefreshKeys(prev => ({ ...prev, [codeEditingIndex]: (prev[codeEditingIndex] || 0) + 1 }))
    }
  }, [codeEditingIndex])

  const editingItem = editingIndex !== null ? items[editingIndex] : null
  const codeEditingItem = codeEditingIndex !== null ? items[codeEditingIndex] : null
  const isDragging = dragIndex !== null

  // === Empty state with onboarding ===
  if (items.length === 0) {
    const isDropping = insertDropIndex !== null
    return (
      <main
        className={`canvas ${isDropping ? 'canvas-drop-active' : ''}`}
        onDragOver={handleEmptyDragOver}
        onDragLeave={() => setInsertDropIndex(null)}
        onDrop={handleEmptyDrop}
      >
        <div className="canvas-empty">
          {isDropping ? (
            <>
              <div className="canvas-empty-drop-icon">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M12 5v14M5 12h14" strokeLinecap="round" />
                </svg>
              </div>
              <p className="canvas-empty-drop-text">ここにドロップして追加</p>
            </>
          ) : (
            <div className="canvas-onboarding">
              <div className="onboarding-step">
                <div className="onboarding-num">1</div>
                <div className="onboarding-text">
                  <strong>サイトを分析</strong>
                  <span>URLバーからサイトを読み込む</span>
                </div>
              </div>
              <div className="onboarding-connector" />
              <div className="onboarding-step">
                <div className="onboarding-num">2</div>
                <div className="onboarding-text">
                  <strong>パーツを選ぶ</strong>
                  <span>ライブラリからドラッグ</span>
                </div>
              </div>
              <div className="onboarding-connector" />
              <div className="onboarding-step">
                <div className="onboarding-num">3</div>
                <div className="onboarding-text">
                  <strong>ページを組む</strong>
                  <span>並べ替え・編集・プレビュー</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>
    )
  }

  // === Inserter between blocks ===
  const renderInserter = (idx: number) => {
    const isActive = insertDropIndex === idx
    return (
      <div
        key={`ins-${idx}`}
        className={`block-inserter ${isActive ? 'active' : ''} ${isDragging ? 'show-zone' : ''}`}
        onDragOver={e => handleInserterDragOver(e, idx)}
        onDragLeave={handleInserterDragLeave}
        onDrop={e => handleInserterDrop(e, idx)}
      >
        <div className="block-inserter-line">
          <span className="block-inserter-btn" title="セクションを追加">+</span>
        </div>
      </div>
    )
  }

  return (
    <div className="canvas-with-inspector">
      <main className="canvas">
        <div className="canvas-header">
          <h2>ページビルダー <span className="canvas-block-count">{items.length} ブロック</span></h2>
          {editingIndex !== null && (
            <button className="inspector-btn" onClick={() => { setEditingIndex(null); setSelectedNode(null) }}>
              編集を閉じる
            </button>
          )}
        </div>
        <div className="canvas-blocks">
          {renderInserter(0)}
          {items.map((item, i) => {
            const rk = refreshKeys[i] || 0
            const htmlUrlWithKey = item.section.htmlUrl
              ? `${item.section.htmlUrl}${item.section.htmlUrl.includes('?') ? '&' : '?'}v=${rk}`
              : item.section.htmlUrl
            const familyLabel = FAMILY_META_MAP[item.section.block_family]?.label || item.section.block_family

            return (
              <React.Fragment key={item.canvas.id}>
                <div
                  className={`canvas-block ${dragIndex === i ? 'dragging' : ''} ${dragOverIndex === i ? 'drag-over' : ''} ${editingIndex === i ? 'editing' : ''}`}
                  tabIndex={0}
                  role="group"
                  aria-label={`Block ${i + 1}: ${familyLabel}`}
                  draggable={editingIndex === null}
                  onDragStart={() => handleDragStart(i)}
                  onDragOver={e => { e.preventDefault(); setDragOverIndex(i) }}
                  onDrop={() => {
                    if (dragRef.current !== null && dragRef.current !== i) {
                      onMove(dragRef.current, i)
                    }
                    dragRef.current = null; setDragIndex(null); setDragOverIndex(null); setInsertDropIndex(null)
                  }}
                  onDragEnd={handleDragEnd}
                  onKeyDown={e => {
                    if (e.key === 'Delete' || e.key === 'Backspace') {
                      if (editingIndex === null && document.activeElement === e.currentTarget) {
                        e.preventDefault()
                        onRemove(item.canvas.id)
                      }
                    }
                  }}
                >
                  <div className="canvas-block-toolbar">
                    <span className="drag-handle" aria-label="Drag to reorder">&#9776;</span>
                    <span className="canvas-block-badge" style={{ background: FAMILY_COLORS[item.section.block_family] || '#94a3b8' }}>
                      {familyLabel}
                    </span>
                    <span className="canvas-block-source">
                      {item.section.source_sites?.normalized_domain || ''}
                    </span>
                    <div className="canvas-block-actions">
                      <button
                        className="code-btn"
                        onClick={() => setCodeEditingIndex(codeEditingIndex === i ? null : i)}
                        title="HTMLコード編集"
                        aria-label="Edit HTML code"
                      >
                        &lt;/&gt;
                      </button>
                      <button
                        className={`edit-btn ${editingIndex === i ? 'active' : ''}`}
                        onClick={() => {
                          setEditingIndex(editingIndex === i ? null : i)
                          setSelectedNode(null)
                        }}
                        aria-label={editingIndex === i ? 'Close visual editor' : 'Open visual editor'}
                      >
                        {editingIndex === i ? '閉じる' : '編集'}
                      </button>
                      <button className="move-btn" onClick={() => i > 0 && onMove(i, i - 1)} disabled={i === 0} aria-label="Move block up">&#9650;</button>
                      <button className="move-btn" onClick={() => i < items.length - 1 && onMove(i, i + 1)} disabled={i === items.length - 1} aria-label="Move block down">&#9660;</button>
                      <button className="canvas-remove-btn" onClick={() => onRemove(item.canvas.id)} aria-label="Remove block">&times;</button>
                    </div>
                  </div>
                  <div className="canvas-block-preview">
                    {editingIndex === i ? (
                      <EditableSourceFrame
                        sectionId={item.section.id}
                        onNodeSelect={handleNodeSelect}
                      />
                    ) : (
                      <SourcePreviewFrame
                        htmlUrl={htmlUrlWithKey}
                      />
                    )}
                  </div>
                </div>
                {renderInserter(i + 1)}
              </React.Fragment>
            )
          })}
        </div>
      </main>

      {editingIndex !== null && editingItem && (
        <NodeInspector
          sectionId={editingItem.section.id}
          selectedNode={selectedNode}
          onApplyPatch={handleApplyPatch}
          patchSetId={null}
        />
      )}

      {codeEditingItem && (
        <CodeEditor
          sectionId={codeEditingItem.section.id}
          onClose={() => setCodeEditingIndex(null)}
          onSaved={handleCodeSaved}
        />
      )}
    </div>
  )
}
