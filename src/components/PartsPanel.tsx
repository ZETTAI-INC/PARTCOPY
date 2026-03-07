import React, { useState } from 'react'
import { ExtractedBlock, BlockType } from '../types'

const BLOCK_LABELS: Record<BlockType, string> = {
  hero: 'Hero',
  navigation: 'Navigation',
  feature: 'Feature',
  cta: 'CTA',
  pricing: 'Pricing',
  testimonial: 'Testimonial',
  faq: 'FAQ',
  footer: 'Footer',
  contact: 'Contact',
  gallery: 'Gallery',
  stats: 'Stats',
  'logo-cloud': 'Logo Cloud',
  content: 'Content',
  unknown: 'Unknown'
}

const BLOCK_COLORS: Record<BlockType, string> = {
  hero: '#3b82f6',
  navigation: '#6366f1',
  feature: '#10b981',
  cta: '#f59e0b',
  pricing: '#8b5cf6',
  testimonial: '#ec4899',
  faq: '#14b8a6',
  footer: '#6b7280',
  contact: '#f97316',
  gallery: '#06b6d4',
  stats: '#84cc16',
  'logo-cloud': '#a855f7',
  content: '#64748b',
  unknown: '#94a3b8'
}

interface Props {
  parts: ExtractedBlock[]
  onAdd: (id: string) => void
  onRemove: (id: string) => void
}

export function PartsPanel({ parts, onAdd, onRemove }: Props) {
  const [filter, setFilter] = useState<BlockType | 'all'>('all')
  const [hoveredId, setHoveredId] = useState<string | null>(null)

  const filtered = filter === 'all'
    ? parts
    : parts.filter(p => p.type === filter)

  const typeCounts = parts.reduce<Record<string, number>>((acc, p) => {
    acc[p.type] = (acc[p.type] || 0) + 1
    return acc
  }, {})

  if (parts.length === 0) {
    return (
      <aside className="parts-panel">
        <div className="parts-empty">
          <div className="parts-empty-icon">&#9881;</div>
          <p>URLを入力してサイトのパーツを抽出してください</p>
        </div>
      </aside>
    )
  }

  return (
    <aside className="parts-panel">
      <div className="parts-header">
        <h2>Parts ({parts.length})</h2>
      </div>

      <div className="parts-filters">
        <button
          className={`filter-btn ${filter === 'all' ? 'active' : ''}`}
          onClick={() => setFilter('all')}
        >
          All ({parts.length})
        </button>
        {Object.entries(typeCounts).sort((a, b) => b[1] - a[1]).map(([type, count]) => (
          <button
            key={type}
            className={`filter-btn ${filter === type ? 'active' : ''}`}
            onClick={() => setFilter(type as BlockType)}
          >
            <span
              className="filter-dot"
              style={{ background: BLOCK_COLORS[type as BlockType] }}
            />
            {BLOCK_LABELS[type as BlockType]} ({count})
          </button>
        ))}
      </div>

      <div className="parts-list">
        {filtered.map(part => (
          <div
            key={part.id}
            className={`part-card ${hoveredId === part.id ? 'hovered' : ''}`}
            onMouseEnter={() => setHoveredId(part.id)}
            onMouseLeave={() => setHoveredId(null)}
          >
            {/* Thumbnail - the main visual */}
            <div className="part-thumbnail-wrap">
              {part.thumbnail ? (
                <img
                  src={part.thumbnail}
                  alt={`${BLOCK_LABELS[part.type]} section`}
                  className="part-thumbnail"
                  loading="lazy"
                />
              ) : (
                <div className="part-thumbnail-placeholder">
                  No Preview
                </div>
              )}

              {/* Overlay badge */}
              <div className="part-overlay-top">
                <span
                  className="part-type-badge"
                  style={{ background: BLOCK_COLORS[part.type] }}
                >
                  {BLOCK_LABELS[part.type]}
                </span>
                <span className="part-confidence">
                  {Math.round(part.confidence * 100)}%
                </span>
              </div>

              {/* Hover overlay with actions */}
              {hoveredId === part.id && (
                <div className="part-overlay-actions">
                  <button className="add-btn-large" onClick={() => onAdd(part.id)}>
                    + Canvas に追加
                  </button>
                  <button className="remove-btn-small" onClick={() => onRemove(part.id)}>
                    削除
                  </button>
                </div>
              )}
            </div>

            {/* Meta info below thumbnail */}
            <div className="part-info-bar">
              <div className="part-meta-tags">
                {part.meta.hasImages && <span className="meta-tag">IMG</span>}
                {part.meta.hasCTA && <span className="meta-tag cta">CTA</span>}
                {part.meta.hasForm && <span className="meta-tag form">FORM</span>}
                {part.meta.headingCount > 0 && <span className="meta-tag">H{part.meta.headingCount}</span>}
                {part.meta.linkCount > 0 && <span className="meta-tag">Links:{part.meta.linkCount}</span>}
              </div>
              <div className="part-source">
                {new URL(part.sourceUrl).hostname}
              </div>
            </div>
          </div>
        ))}
      </div>
    </aside>
  )
}
