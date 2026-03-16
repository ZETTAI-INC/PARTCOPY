import React, { useCallback, useEffect, useState } from 'react'
import { apiFetch } from '../api'
import { SourceSection, GenreInfo, BlockFamilyInfo } from '../types'
import { SourcePreviewFrame } from './SourcePreviewFrame'
import { FAMILY_COLORS, FAMILY_META, FAMILY_META_MAP, FAMILY_GROUP_LABELS } from '../constants'
import { CodePanel } from './CodePanel'
import { ImageGallery } from './ImageGallery'

type SortOption = 'newest' | 'confidence' | 'family' | 'source'
type LibraryTab = 'sections' | 'images'

interface Props {
  onAddToCanvas: (section: SourceSection) => void
}

export function Library({ onAddToCanvas }: Props) {
  const [genres, setGenres] = useState<GenreInfo[]>([])
  const [families, setFamilies] = useState<BlockFamilyInfo[]>([])
  const [selectedGenre, setSelectedGenre] = useState<string | null>(null)
  const [selectedFamily, setSelectedFamily] = useState<string | null>(null)
  const [sections, setSections] = useState<SourceSection[]>([])
  const [loading, setLoading] = useState(false)
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [sortBy, setSortBy] = useState<SortOption>('newest')
  const [limit, setLimit] = useState(60)
  const [onlyCta, setOnlyCta] = useState(false)
  const [onlyForm, setOnlyForm] = useState(false)
  const [onlyImages, setOnlyImages] = useState(false)
  const [onlySubs, setOnlySubs] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [codeViewId, setCodeViewId] = useState<string | null>(null)
  const [tab, setTab] = useState<LibraryTab>('sections')

  const familyLabelMap = families.reduce<Record<string, string>>((acc, family) => {
    acc[family.key] = family.label_ja || family.label || family.key
    return acc
  }, {})

  const fetchMeta = useCallback(async () => {
    try {
      const [genreResponse, familyResponse] = await Promise.all([
        apiFetch('/api/library/genres'),
        apiFetch('/api/library/families')
      ])

      if (!genreResponse.ok || !familyResponse.ok) {
        throw new Error('ライブラリの集計情報を取得できませんでした')
      }

      const genreData = await genreResponse.json()
      const familyData = await familyResponse.json()
      setGenres(genreData.genres || [])
      setFamilies(familyData.families || [])
    } catch (fetchError: any) {
      setError(fetchError.message || 'ライブラリの集計情報を取得できませんでした')
    }
  }, [])

  const fetchSections = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      const params = new URLSearchParams()
      params.set('limit', String(limit))
      params.set('sort', sortBy)
      if (selectedGenre) params.set('genre', selectedGenre)
      if (selectedFamily) params.set('family', selectedFamily)
      if (query.trim()) params.set('q', query.trim())
      if (onlyCta) params.set('hasCta', 'true')
      if (onlyForm) params.set('hasForm', 'true')
      if (onlyImages) params.set('hasImages', 'true')
      if (onlySubs) params.set('onlySubs', 'true')

      const response = await apiFetch(`/api/library?${params.toString()}`)
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}))
        throw new Error(payload.error || 'ライブラリの取得に失敗しました')
      }

      const data = await response.json()
      setSections(data.sections || [])
    } catch (fetchError: any) {
      setSections([])
      setError(fetchError.message || 'ライブラリの取得に失敗しました')
    } finally {
      setLoading(false)
    }
  }, [limit, onlyCta, onlyForm, onlyImages, onlySubs, query, selectedFamily, selectedGenre, sortBy])

  useEffect(() => {
    fetchMeta()
  }, [fetchMeta])

  useEffect(() => {
    fetchSections()
  }, [fetchSections])

  const handleDelete = async (id: string) => {
    setError(null)

    try {
      const response = await apiFetch(`/api/library/${id}`, { method: 'DELETE' })
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}))
        throw new Error(payload.error || '削除に失敗しました')
      }

      setSections(prev => prev.filter(section => section.id !== id))
      fetchMeta()
    } catch (deleteError: any) {
      setError(deleteError.message || '削除に失敗しました')
    }
  }

  const resetControls = () => {
    setSelectedGenre(null)
    setSelectedFamily(null)
    setQuery('')
    setSortBy('newest')
    setLimit(60)
    setOnlyCta(false)
    setOnlyForm(false)
    setOnlyImages(false)
    setOnlySubs(false)
  }

  const totalGenreCount = genres.reduce((sum, genre) => sum + genre.count, 0)
  const hasActiveFilters = Boolean(
    selectedGenre ||
    selectedFamily ||
    query.trim() ||
    onlyCta ||
    onlyForm ||
    onlyImages ||
    onlySubs ||
    sortBy !== 'newest' ||
    limit !== 60
  )

  return (
    <div className="library">
      <div className="library-sidebar">
        <h3 className="library-sidebar-title">業種カテゴリ</h3>
        <button className={`library-genre-btn ${!selectedGenre ? 'active' : ''}`} onClick={() => setSelectedGenre(null)}>
          全て ({totalGenreCount})
        </button>
        {genres.map(genre => (
          <button
            key={genre.genre}
            className={`library-genre-btn ${selectedGenre === genre.genre ? 'active' : ''}`}
            onClick={() => setSelectedGenre(genre.genre)}
          >
            {genre.genre || 'untagged'} ({genre.count})
          </button>
        ))}

        <h3 className="library-sidebar-title" style={{ marginTop: 20 }}>セクションの種類</h3>
        <button className={`library-family-btn ${!selectedFamily ? 'active' : ''}`} onClick={() => setSelectedFamily(null)}>
          <span className="family-btn-dot" style={{ background: 'var(--text)' }} />
          <span className="family-btn-text">
            <span className="family-btn-label">すべて表示</span>
          </span>
        </button>
        {(['page_top', 'main_content', 'conversion', 'page_bottom'] as const).map(group => {
          const groupFamilies = FAMILY_META.filter(m => m.group === group)
            .filter(m => {
              const serverFamily = families.find(f => f.key === m.key)
              return serverFamily && (serverFamily.count ?? 0) > 0
            })
          if (groupFamilies.length === 0) return null
          return (
            <div key={group} className="family-group">
              <div className="family-group-label">{FAMILY_GROUP_LABELS[group]}</div>
              {groupFamilies.map(meta => {
                const serverFamily = families.find(f => f.key === meta.key)
                const count = serverFamily?.count ?? 0
                return (
                  <button
                    key={meta.key}
                    className={`library-family-btn ${selectedFamily === meta.key ? 'active' : ''}`}
                    onClick={() => setSelectedFamily(meta.key)}
                    title={meta.description}
                  >
                    <span className="family-btn-dot" style={{ background: FAMILY_COLORS[meta.key] || '#94a3b8' }} />
                    <span className="family-btn-text">
                      <span className="family-btn-label">{meta.label}</span>
                      <span className="family-btn-desc">{meta.description}</span>
                    </span>
                    <span className="family-btn-count">{count}</span>
                  </button>
                )
              })}
            </div>
          )
        })}
      </div>

      <div className="library-main">
        <div className="library-tab-bar">
          <button className={`library-tab ${tab === 'sections' ? 'active' : ''}`} onClick={() => setTab('sections')}>
            セクション
          </button>
          <button className={`library-tab ${tab === 'images' ? 'active' : ''}`} onClick={() => setTab('images')}>
            画像
          </button>
        </div>

        {tab === 'images' && <ImageGallery />}

        {tab === 'sections' && <>
        <div className="library-toolbar">
          <div className="library-search-row">
            <input
              type="search"
              className="library-search"
              value={query}
              onChange={event => setQuery(event.target.value)}
              placeholder="検索..."
            />
            <select
              className="library-sort-select"
              value={sortBy}
              onChange={event => setSortBy(event.target.value as SortOption)}
            >
              <option value="newest">新しい順</option>
              <option value="confidence">スコア順</option>
              <option value="family">種類順</option>
              <option value="source">参照元順</option>
            </select>
          </div>
          <div className="library-filter-row">
            <button className={`lib-filter-chip ${onlyImages ? 'active' : ''}`} onClick={() => setOnlyImages(prev => !prev)}>
              IMG
            </button>
            <button className={`lib-filter-chip ${onlyCta ? 'active' : ''}`} onClick={() => setOnlyCta(prev => !prev)}>
              CTA
            </button>
            <button className={`lib-filter-chip ${onlyForm ? 'active' : ''}`} onClick={() => setOnlyForm(prev => !prev)}>
              FORM
            </button>
            <span className="library-result-count">{sections.length}件</span>
            {hasActiveFilters && (
              <button className="library-reset-link" onClick={resetControls}>
                リセット
              </button>
            )}
          </div>
        </div>

        <div className="library-grid">
          {loading && <div className="library-loading">分析データを読み込み中...</div>}
          {!loading && error && (
            <div className="library-empty">
              <p>{error}</p>
            </div>
          )}
          {!loading && !error && sections.length === 0 && (
            <div className="library-empty">
              <p>条件に一致する構造パターンがありません</p>
              <p className="library-empty-hint">フィルターを変更するか、新しいサイトを分析してください</p>
            </div>
          )}
          {!loading && !error && sections.map(section => (
            <div
              key={section.id}
              className="library-card"
              draggable
              onDragStart={e => {
                e.dataTransfer.setData('application/partcopy-section', JSON.stringify(section))
                e.dataTransfer.effectAllowed = 'copy'
              }}
              onMouseEnter={() => setHoveredId(section.id)}
              onMouseLeave={() => setHoveredId(null)}
            >
              <div className="library-card-thumb">
                <SourcePreviewFrame htmlUrl={section.htmlUrl} maxHeight={260} scale={0.5} />
                <div className="part-overlay-top">
                  <span className="part-type-badge" style={{ background: FAMILY_COLORS[section.block_family] || '#94a3b8' }}>
                    {FAMILY_META_MAP[section.block_family]?.label || familyLabelMap[section.block_family] || section.block_family}
                  </span>
                  {section.is_sub_component && (
                    <span className="part-sub-badge">部品</span>
                  )}
                </div>
                <button className="card-code-btn" onClick={(e) => { e.stopPropagation(); setCodeViewId(section.id) }} title="コードを見る">
                  &lt;/&gt;
                </button>
                {hoveredId === section.id && (
                  <div className="part-overlay-actions">
                    <button className="add-btn-large" onClick={() => onAddToCanvas(section)}>+ 追加</button>
                    <button className="remove-btn-small" onClick={() => handleDelete(section.id)}>削除</button>
                  </div>
                )}
              </div>
              <div className="part-content library-card-content">
                {section.block_variant && <div className="part-variant">{section.block_variant}</div>}
                {section.text_summary && <p className="part-summary">{section.text_summary}</p>}
                <div className="library-card-info">
                  <div className="library-card-genre">
                    {section.source_sites?.genre && <span className="genre-badge">{section.source_sites.genre}</span>}
                    {section.source_sites?.tags?.map(tag => <span key={tag} className="tag-badge">{tag}</span>)}
                    {section.features_jsonb?.hasImages && <span className="meta-tag">IMG</span>}
                    {section.features_jsonb?.hasCTA && <span className="meta-tag cta">CTA</span>}
                    {section.features_jsonb?.hasForm && <span className="meta-tag form">FORM</span>}
                  </div>
                  <div className="part-source">{section.source_sites?.normalized_domain || ''}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
        </>}
      </div>

      <CodePanel
        sectionId={codeViewId}
        sections={sections}
        onClose={() => setCodeViewId(null)}
      />
    </div>
  )
}
