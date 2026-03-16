import React, { useEffect, useState, useCallback } from 'react'

interface SiteImage {
  originalUrl: string
  storagePath: string
  downloadUrl: string
  size: number
}

interface SiteEntry {
  siteId: string
  domain: string
  images: SiteImage[]
}

export function ImageGallery() {
  const [sites, setSites] = useState<SiteEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedSite, setSelectedSite] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const fetchSites = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      // Get all sites from sections
      const res = await fetch('/api/library?limit=200')
      const data = await res.json()
      const sections = data.sections || []

      // Extract unique sites
      const siteMap = new Map<string, string>()
      for (const s of sections) {
        if (s.site_id && s.source_sites?.normalized_domain) {
          siteMap.set(s.site_id, s.source_sites.normalized_domain)
        }
      }

      // Fetch images for each site
      const entries: SiteEntry[] = []
      for (const [siteId, domain] of siteMap) {
        try {
          const imgRes = await fetch(`/api/sites/${siteId}/images`)
          const imgData = await imgRes.json()
          if (imgData.images?.length > 0) {
            entries.push({ siteId, domain, images: imgData.images })
          }
        } catch {}
      }
      setSites(entries)
      if (entries.length > 0 && !selectedSite) {
        setSelectedSite(entries[0].siteId)
      }
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [selectedSite])

  useEffect(() => {
    fetchSites()
  }, [])

  const currentSite = sites.find(s => s.siteId === selectedSite)

  const handleDownload = async (img: SiteImage) => {
    try {
      const res = await fetch(img.downloadUrl)
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      const filename = img.originalUrl.split('/').pop()?.split('?')[0] || 'image'
      a.download = filename
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch {}
  }

  const handleDownloadAll = async () => {
    if (!currentSite) return
    for (const img of currentSite.images) {
      await handleDownload(img)
    }
  }

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes}B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)}MB`
  }

  if (loading) {
    return <div className="image-gallery"><div className="image-gallery-loading">画像を読み込み中...</div></div>
  }

  if (error) {
    return <div className="image-gallery"><div className="image-gallery-empty">{error}</div></div>
  }

  if (sites.length === 0) {
    return (
      <div className="image-gallery">
        <div className="image-gallery-empty">
          <p>画像がありません</p>
          <p className="image-gallery-hint">サイトを分析すると画像が自動的に収集されます</p>
        </div>
      </div>
    )
  }

  return (
    <div className="image-gallery">
      <div className="image-gallery-header">
        <select
          className="image-gallery-site-select"
          value={selectedSite || ''}
          onChange={e => setSelectedSite(e.target.value)}
        >
          {sites.map(s => (
            <option key={s.siteId} value={s.siteId}>
              {s.domain} ({s.images.length}枚)
            </option>
          ))}
        </select>
        {currentSite && (
          <button className="image-gallery-download-all" onClick={handleDownloadAll}>
            全画像ダウンロード ({currentSite.images.length}枚)
          </button>
        )}
      </div>
      <div className="image-gallery-grid">
        {currentSite?.images.map((img, i) => (
          <div key={i} className="image-gallery-card" onClick={() => handleDownload(img)}>
            <div className="image-gallery-thumb">
              <img src={img.downloadUrl} alt="" loading="lazy" />
            </div>
            <div className="image-gallery-info">
              <span className="image-gallery-name" title={img.originalUrl}>
                {img.originalUrl.split('/').pop()?.split('?')[0] || 'image'}
              </span>
              <span className="image-gallery-size">{formatSize(img.size)}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
