import React, { useState, useRef } from 'react'
import { ExtractedBlock, CanvasBlock, BlockType } from '../types'

const BLOCK_LABELS: Record<BlockType, string> = {
  hero: 'Hero', navigation: 'Nav', feature: 'Feature', cta: 'CTA',
  pricing: 'Pricing', testimonial: 'Testimonial', faq: 'FAQ',
  footer: 'Footer', contact: 'Contact', gallery: 'Gallery',
  stats: 'Stats', 'logo-cloud': 'Logo Cloud', content: 'Content', unknown: '?'
}

const BLOCK_COLORS: Record<BlockType, string> = {
  hero: '#3b82f6', navigation: '#6366f1', feature: '#10b981', cta: '#f59e0b',
  pricing: '#8b5cf6', testimonial: '#ec4899', faq: '#14b8a6',
  footer: '#6b7280', contact: '#f97316', gallery: '#06b6d4',
  stats: '#84cc16', 'logo-cloud': '#a855f7', content: '#64748b', unknown: '#94a3b8'
}

interface CanvasItem {
  canvas: CanvasBlock
  block: ExtractedBlock
}

interface Props {
  blocks: CanvasItem[]
  onRemove: (canvasId: string) => void
  onMove: (from: number, to: number) => void
}

export function Canvas({ blocks, onRemove, onMove }: Props) {
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)
  const dragRef = useRef<number | null>(null)

  const handleDragStart = (index: number) => {
    dragRef.current = index
    setDragIndex(index)
  }

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault()
    setDragOverIndex(index)
  }

  const handleDrop = (index: number) => {
    if (dragRef.current !== null && dragRef.current !== index) {
      onMove(dragRef.current, index)
    }
    dragRef.current = null
    setDragIndex(null)
    setDragOverIndex(null)
  }

  const handleDragEnd = () => {
    dragRef.current = null
    setDragIndex(null)
    setDragOverIndex(null)
  }

  if (blocks.length === 0) {
    return (
      <main className="canvas">
        <div className="canvas-empty">
          <div className="canvas-empty-icon">&#10010;</div>
          <h3>Canvas</h3>
          <p>左のパーツにホバーして「Canvas に追加」でブロックを配置</p>
          <p className="canvas-hint">ドラッグ&ドロップで順序を変更できます</p>
        </div>
      </main>
    )
  }

  return (
    <main className="canvas">
      <div className="canvas-header">
        <h2>Canvas ({blocks.length} blocks)</h2>
      </div>
      <div className="canvas-blocks">
        {blocks.map((item, index) => (
          <div
            key={item.canvas.id}
            className={`canvas-block ${dragIndex === index ? 'dragging' : ''} ${dragOverIndex === index ? 'drag-over' : ''}`}
            draggable
            onDragStart={() => handleDragStart(index)}
            onDragOver={e => handleDragOver(e, index)}
            onDrop={() => handleDrop(index)}
            onDragEnd={handleDragEnd}
          >
            <div className="canvas-block-toolbar">
              <span className="drag-handle">&#9776;</span>
              <span
                className="canvas-block-badge"
                style={{ background: BLOCK_COLORS[item.block.type] }}
              >
                {BLOCK_LABELS[item.block.type]}
              </span>
              <span className="canvas-block-source">
                {new URL(item.block.sourceUrl).hostname}
              </span>
              <div className="canvas-block-actions">
                <button
                  className="move-btn"
                  onClick={() => index > 0 && onMove(index, index - 1)}
                  disabled={index === 0}
                  title="Move up"
                >
                  &#9650;
                </button>
                <button
                  className="move-btn"
                  onClick={() => index < blocks.length - 1 && onMove(index, index + 1)}
                  disabled={index === blocks.length - 1}
                  title="Move down"
                >
                  &#9660;
                </button>
                <button
                  className="canvas-remove-btn"
                  onClick={() => onRemove(item.canvas.id)}
                  title="Remove"
                >
                  &times;
                </button>
              </div>
            </div>
            <div className="canvas-block-preview">
              {item.block.thumbnail ? (
                <img
                  src={item.block.thumbnail}
                  alt={`${item.block.type} section`}
                  className="canvas-block-img"
                />
              ) : (
                <div className="canvas-block-no-preview">
                  No preview available
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </main>
  )
}
