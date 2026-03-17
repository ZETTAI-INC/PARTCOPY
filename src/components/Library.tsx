import React, { useCallback, useEffect, useState } from 'react'
import { apiFetch } from '../api'
import { SourceSection, GenreInfo, BlockFamilyInfo } from '../types'
import { SourcePreviewFrame } from './SourcePreviewFrame'
import { FAMILY_COLORS, FAMILY_META, FAMILY_META_MAP, FAMILY_GROUP_LABELS } from '../constants'
import { CodePanel } from './CodePanel'

type SortOption = 'newest' | 'confidence' | 'family' | 'source'

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
  const [imageUrlsMap, setImageUrlsMap] = useState<Record<string, string[]>>({})
  const [expandedImageId, setExpandedImageId] = useState<string | null>(null)
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null)

  const familyLabelMap = families.reduce<Record<string, string>>((acc, family) => {
    acc[family.key] = family.label_ja || family.label || family.key
    return acc
  }, {})

  const fetchGenres = useCallback(async () => {
    try {
      const genreResponse = await apiFetch('/api/library/genres')
      if (!genreResponse.ok) throw new Error('ジャンル情報を取得できませんでした')
      const genreData = await genreResponse.json()
      setGenres(genreData.genres || [])
    } catch (fetchError: any) {
      setError(fetchError.message || 'ジャンル情報を取得できませんでした')
    }
  }, [])

  const fetchFamilies = useCallback(async () => {
    try {
      const params = selectedGenre ? `?genre=${encodeURIComponent(selectedGenre)}` : ''
      const familyResponse = await apiFetch(`/api/library/families${params}`)
      if (!familyResponse.ok) throw new Error('ファミリー情報を取得できませんでした')
      const familyData = await familyResponse.json()
      setFamilies(familyData.families || [])
    } catch (fetchError: any) {
      setError(fetchError.message || 'ファミリー情報を取得できませんでした')
    }
  }, [selectedGenre])

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
    fetchGenres()
  }, [fetchGenres])

  useEffect(() => {
    fetchFamilies()
  }, [fetchFamilies])

  useEffect(() => {
    fetchSections()
  }, [fetchSections])

  const [deletingId, setDeletingId] = useState<string | null>(null)

  const handleDelete = async (id: string) => {
    setError(null)
    setDeletingId(id)
    try {
      const response = await apiFetch(`/api/library/${id}`, { method: 'DELETE' })
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}))
        throw new Error(payload.error || '削除に失敗しました')
      }

      setSections(prev => prev.filter(section => section.id !== id))
      fetchGenres()
      fetchFamilies()
    } catch (deleteError: any) {
      setError(deleteError.message || '削除に失敗しました')
    } finally {
      setDeletingId(null)
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

  const fetchImageUrls = useCallback(async (sectionId: string) => {
    if (imageUrlsMap[sectionId]) return // already fetched
    try {
      const res = await apiFetch(`/api/sections/${sectionId}/html`)
      if (!res.ok) return
      const { html } = await res.json()
      const urls: string[] = []
      const imgRegex = /<img[^>]+src=["']([^"']+)["']/gi
      let match
      while ((match = imgRegex.exec(html)) !== null) {
        const src = match[1]
        if (src && !src.startsWith('data:')) urls.push(src)
      }
      // Also extract background-image urls
      const bgRegex = /background-image:\s*url\(["']?([^"')]+)["']?\)/gi
      while ((match = bgRegex.exec(html)) !== null) {
        const src = match[1]
        if (src && !src.startsWith('data:')) urls.push(src)
      }
      setImageUrlsMap(prev => ({ ...prev, [sectionId]: [...new Set(urls)] }))
    } catch {}
  }, [imageUrlsMap])

  const handleCopyUrl = (url: string) => {
    navigator.clipboard.writeText(url)
    setCopiedUrl(url)
    setTimeout(() => setCopiedUrl(null), 1500)
  }

  const toggleImageUrls = (sectionId: string) => {
    if (expandedImageId === sectionId) {
      setExpandedImageId(null)
    } else {
      setExpandedImageId(sectionId)
      fetchImageUrls(sectionId)
    }
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
                <div className="card-btn-group">
                  {section.features_jsonb?.hasImages && (
                    <button
                      className={`card-img-url-btn ${expandedImageId === section.id ? 'active' : ''}`}
                      onClick={(e) => { e.stopPropagation(); toggleImageUrls(section.id) }}
                      title="画像URLを表示"
                    >
                      IMG
                    </button>
                  )}
                  <button className="card-code-btn" onClick={(e) => { e.stopPropagation(); setCodeViewId(section.id) }} title="コードを見る">
                    &lt;/&gt;
                  </button>
                </div>
                {hoveredId === section.id && (
                  <div className="part-overlay-actions">
                    <button className="add-btn-large" onClick={() => onAddToCanvas(section)}>+ 追加</button>
                    <button className="remove-btn-small" onClick={() => handleDelete(section.id)} disabled={deletingId === section.id}>
                      {deletingId === section.id ? <span className="spinner" /> : '削除'}
                    </button>
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
              {expandedImageId === section.id && (
                <div className="card-image-urls">
                  <div className="card-image-urls-header">画像URL一覧</div>
                  {!imageUrlsMap[section.id] && <div className="card-image-urls-loading">読み込み中...</div>}
                  {imageUrlsMap[section.id]?.length === 0 && <div className="card-image-urls-empty">画像が見つかりません</div>}
                  {imageUrlsMap[section.id]?.map((url, i) => (
                    <div key={i} className="card-image-url-row">
                      <a href={url} target="_blank" rel="noopener noreferrer" className="card-image-url-link" title={url}>
                        {url.split('/').pop()?.split('?')[0] || url}
                      </a>
                      <button
                        className={`card-image-url-copy ${copiedUrl === url ? 'copied' : ''}`}
                        onClick={(e) => { e.stopPropagation(); handleCopyUrl(url) }}
                      >
                        {copiedUrl === url ? 'OK' : 'copy'}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      <CodePanel
        sectionId={codeViewId}
        sections={sections}
        onClose={() => setCodeViewId(null)}
      />
    </div>
  )
}
