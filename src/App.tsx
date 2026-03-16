import React, { useState, useCallback, useEffect, useRef } from 'react'
import { SourceSection, CanvasBlock, CrawlJob, JobStatus } from './types'
import { URLInput } from './components/URLInput'
import { PartsPanel } from './components/PartsPanel'
import { Canvas } from './components/Canvas'
import { Preview } from './components/Preview'
import { Library } from './components/Library'
import { ProjectManager } from './components/ProjectManager'
import { ErrorBoundary } from './components/ErrorBoundary'
import { apiFetch } from './api'
import './styles.css'

type View = 'editor' | 'preview' | 'library' | 'projects'

const CANVAS_STORAGE_KEY = 'partcopy:canvas'
const CANVAS_STORAGE_VERSION = 1
const EXCLUDED_FAMILIES = new Set(['navigation', 'footer'])

// 警告しきい値
const WARN_LIBRARY_SECTIONS = 200
const WARN_CANVAS_BLOCKS = 15
const WARN_SITES = 10

function loadCanvasFromStorage(): CanvasBlock[] {
  try {
    const raw = localStorage.getItem(CANVAS_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!parsed || parsed.version !== CANVAS_STORAGE_VERSION) return []
    return Array.isArray(parsed.canvas) ? parsed.canvas : []
  } catch { return [] }
}

export default function App() {
  const [sections, setSections] = useState<SourceSection[]>([])
  const [canvas, setCanvas] = useState<CanvasBlock[]>(loadCanvasFromStorage)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [jobStatus, setJobStatus] = useState<string | null>(null)
  const [view, setView] = useState<View>('editor')
  const [dismissedWarnings, setDismissedWarnings] = useState<Set<string>>(new Set())
  const pollRef = useRef<NodeJS.Timeout | null>(null)

  // Persist canvas to localStorage (debounced to avoid excessive writes)
  useEffect(() => {
    const timer = setTimeout(() => {
      localStorage.setItem(CANVAS_STORAGE_KEY, JSON.stringify({ version: CANVAS_STORAGE_VERSION, canvas }))
    }, 300)
    return () => clearTimeout(timer)
  }, [canvas])

  // Restore sections for canvas items on mount, removing nav/footer
  useEffect(() => {
    const stored = loadCanvasFromStorage()
    if (stored.length === 0) return
    const sectionIds = [...new Set(stored.map(c => c.sectionId))]
    apiFetch(`/api/library?limit=200`)
      .then(r => r.json())
      .then(data => {
        const libSections: SourceSection[] = data.sections || []
        const libMap = new Map(libSections.map((s: SourceSection) => [s.id, s]))
        // Clean canvas: remove blocks whose sections are nav/footer or no longer in library
        const validIds = new Set(libSections.map(s => s.id))
        setCanvas(prev => {
          const cleaned = prev.filter(c => validIds.has(c.sectionId))
          return cleaned.length !== prev.length ? cleaned : prev
        })
        setSections(prev => {
          const seen = new Set(prev.map(s => s.id))
          const next = [...prev]
          for (const id of sectionIds) {
            if (seen.has(id) || !libMap.has(id)) continue
            seen.add(id)
            next.push(libMap.get(id)!)
          }
          return next
        })
      })
      .catch(() => {})
  }, [])

  const sourceCount = new Set(
    sections
      .map(section => section.source_sites?.normalized_domain)
      .filter((domain): domain is string => Boolean(domain))
  ).size

  // 警告メッセージ生成
  const warnings: Array<{ key: string; message: string }> = []
  if (sections.length >= WARN_LIBRARY_SECTIONS) {
    warnings.push({
      key: 'library',
      message: `ライブラリのセクション数が${sections.length}件に達しています。パフォーマンスやストレージに影響する可能性があります。不要なセクションを削除してください。`
    })
  }
  if (canvas.length >= WARN_CANVAS_BLOCKS) {
    warnings.push({
      key: 'canvas',
      message: `Canvasのブロック数が${canvas.length}個です。ブロックが多いとプレビューや書き出しが重くなる場合があります。`
    })
  }
  if (sourceCount >= WARN_SITES) {
    warnings.push({
      key: 'sites',
      message: `${sourceCount}サイト分のデータが蓄積されています。分析のたびにAI分類コスト（1回約3〜6円）が発生します。`
    })
  }
  const activeWarnings = warnings.filter(w => !dismissedWarnings.has(w.key))

  const dismissWarning = (key: string) => {
    setDismissedWarnings(prev => new Set([...prev, key]))
  }

  const stopPolling = () => {
    if (pollRef.current) {
      clearInterval(pollRef.current)
      pollRef.current = null
    }
  }

  useEffect(() => () => stopPolling(), [])

  const pollJob = useCallback((jobId: string) => {
    stopPolling()
    pollRef.current = setInterval(async () => {
      try {
        const res = await apiFetch(`/api/jobs/${jobId}`)
        const { job } = await res.json() as { job: CrawlJob }
        const STATUS_LABELS: Record<string, string> = {
          queued: 'キュー待機中...',
          claimed: 'ページを読み込み中...',
          rendering: 'ページをレンダリング中...',
          parsed: 'セクションを検出中...',
          normalizing: 'AIで分類・品質判定中...',
        }
        const label = STATUS_LABELS[job.status] || job.status
        const sectionInfo = job.section_count ? `${job.section_count} パーツ検出` : ''
        setJobStatus(`${label}${sectionInfo ? ` / ${sectionInfo}` : ''}`)

        if (job.status === 'done') {
          stopPolling()
          // Fetch sections
          const secRes = await apiFetch(`/api/jobs/${jobId}/sections`)
          const { sections: secs } = await secRes.json()
          setSections(prev => {
            const seen = new Set(prev.map(section => section.id))
            const next = [...prev]
            for (const section of secs) {
              if (seen.has(section.id)) continue
              seen.add(section.id)
              next.push(section)
            }
            return next
          })
          setLoading(false)
          setJobStatus(null)
        } else if (job.status === 'failed') {
          stopPolling()
          setError(job.error_message || 'Crawl failed')
          setLoading(false)
          setJobStatus(null)
        }
      } catch {
        // Ignore transient fetch errors
      }
    }, 2000)
  }, [])

  const handleExtract = useCallback(async (url: string, genre: string, tags: string[], mode: 'own' | 'reference') => {
    setLoading(true)
    setError(null)
    setJobStatus('分析開始...')
    try {
      const res = await apiFetch('/api/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, genre, tags })
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to create job')
      }
      const { jobId } = await res.json()
      setJobStatus('分析キュー待ち...')
      pollJob(jobId)
    } catch (err: any) {
      setError(err.message)
      setLoading(false)
      setJobStatus(null)
    }
  }, [pollJob])

  const addToCanvas = useCallback((sectionId: string) => {
    setCanvas(prev => {
      if (prev.some(c => c.sectionId === sectionId)) return prev
      return [...prev, { id: crypto.randomUUID(), sectionId, position: prev.length }]
    })
  }, [])

  const addSavedToCanvas = useCallback((section: SourceSection, atIndex?: number) => {
    console.log('[addSavedToCanvas]', section.id, section.block_family, { atIndex })
    if (EXCLUDED_FAMILIES.has(section.block_family)) {
      console.log('[addSavedToCanvas] excluded family:', section.block_family)
      return
    }
    setSections(prev => {
      if (prev.find(s => s.id === section.id)) {
        console.log('[addSavedToCanvas] section already in state:', section.id)
        return prev
      }
      return [...prev, section]
    })
    setCanvas(prev => {
      if (prev.some(c => c.sectionId === section.id)) {
        console.log('[addSavedToCanvas] already on canvas:', section.id)
        return prev
      }
      const newBlock = { id: crypto.randomUUID(), sectionId: section.id, position: 0 }
      if (atIndex !== undefined && atIndex >= 0 && atIndex <= prev.length) {
        const next = [...prev]
        next.splice(atIndex, 0, newBlock)
        return next.map((c, i) => ({ ...c, position: i }))
      }
      console.log('[addSavedToCanvas] added block:', newBlock.id, 'canvas size:', prev.length + 1)
      return [...prev, { ...newBlock, position: prev.length }]
    })
    setView('editor')
  }, [])

  const removeFromCanvas = useCallback((canvasId: string) => {
    setCanvas(prev => prev.filter(c => c.id !== canvasId))
  }, [])

  const moveBlock = useCallback((fromIndex: number, toIndex: number) => {
    setCanvas(prev => {
      const next = [...prev]
      const [moved] = next.splice(fromIndex, 1)
      next.splice(toIndex, 0, moved)
      return next.map((c, i) => ({ ...c, position: i }))
    })
  }, [])

  const removeSection = useCallback(async (sectionId: string) => {
    try {
      await apiFetch(`/api/sections/${sectionId}`, { method: 'DELETE' })
    } catch {}
    setSections(prev => prev.filter(s => s.id !== sectionId))
    setCanvas(prev => prev.filter(c => c.sectionId !== sectionId))
  }, [])

  const canvasItems = canvas.map(c => ({
    canvas: c,
    section: sections.find(s => s.id === c.sectionId)!
  })).filter(c => c.section && !EXCLUDED_FAMILIES.has(c.section.block_family))

  return (
    <div className="app">
      <ErrorBoundary>
      <header className="app-header">
        <div className="header-left">
          <a className="header-logo" onClick={() => setView('editor')}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><rect x="3" y="3" width="7" height="7" rx="1.5" fill="currentColor"/><rect x="14" y="3" width="7" height="7" rx="1.5" fill="currentColor" opacity="0.5"/><rect x="3" y="14" width="7" height="7" rx="1.5" fill="currentColor" opacity="0.5"/><rect x="14" y="14" width="7" height="7" rx="1.5" fill="currentColor" opacity="0.3"/></svg>
            <span className="header-logo-text">PARTCOPY</span>
          </a>
          <span className="header-separator" />
          <nav className="header-nav">
            <button className={`header-nav-link ${view === 'editor' ? 'active' : ''}`} onClick={() => setView('editor')}>
              ビルダー
            </button>
            <button className={`header-nav-link ${view === 'library' ? 'active' : ''}`} onClick={() => setView('library')}>
              ライブラリ
            </button>
            <button className={`header-nav-link ${view === 'preview' ? 'active' : ''}`} onClick={() => setView('preview')}>
              プレビュー
            </button>
            <button className={`header-nav-link ${view === 'projects' ? 'active' : ''}`} onClick={() => setView('projects')}>
              プロジェクト
            </button>
          </nav>
        </div>
        <div className="header-right">
          <div className="header-stats">
            <span className="header-stat"><strong>{sections.length}</strong> パーツ</span>
            <span className="header-stat"><strong>{canvas.length}</strong> Canvas</span>
            <span className="header-stat"><strong>{sourceCount}</strong> サイト</span>
          </div>
        </div>
      </header>

      {activeWarnings.length > 0 && (
        <div className="warning-banner-container">
          {activeWarnings.map(w => (
            <div key={w.key} className="warning-banner">
              <span className="warning-banner-icon">!</span>
              <span className="warning-banner-text">{w.message}</span>
              <button className="warning-banner-dismiss" onClick={() => dismissWarning(w.key)}>OK</button>
            </div>
          ))}
        </div>
      )}

      {view !== 'library' && (
        <URLInput onSubmit={handleExtract} loading={loading} error={error} jobStatus={jobStatus} />
      )}

      {view === 'editor' && (
        <div className="editor-layout">
          <div className="editor-sidebar">
            <Library onAddToCanvas={addSavedToCanvas} />
          </div>
          <Canvas items={canvasItems} onRemove={removeFromCanvas} onMove={moveBlock} onAddToCanvas={addSavedToCanvas} />
        </div>
      )}

      {view === 'preview' && <Preview items={canvasItems} />}

      {view === 'library' && <Library onAddToCanvas={addSavedToCanvas} />}

      {view === 'projects' && (
        <ProjectManager
          canvas={canvas}
          setCanvas={setCanvas}
          setSections={setSections}
          onSwitchToEditor={() => setView('editor')}
        />
      )}
      </ErrorBoundary>
    </div>
  )
}
