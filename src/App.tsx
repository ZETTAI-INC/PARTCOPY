import React, { useState, useCallback } from 'react'
import { ExtractedBlock, CanvasBlock } from './types'
import { URLInput } from './components/URLInput'
import { PartsPanel } from './components/PartsPanel'
import { Canvas } from './components/Canvas'
import { Preview } from './components/Preview'
import { ExportModal } from './components/ExportModal'
import './styles.css'

type View = 'editor' | 'preview'

export default function App() {
  const [parts, setParts] = useState<ExtractedBlock[]>([])
  const [canvas, setCanvas] = useState<CanvasBlock[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [view, setView] = useState<View>('editor')
  const [showExport, setShowExport] = useState(false)

  const handleExtract = useCallback(async (url: string) => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url })
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Extraction failed')
      }
      const data = await res.json()
      setParts(prev => [...prev, ...data.parts])
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  const addToCanvas = useCallback((blockId: string) => {
    setCanvas(prev => [...prev, { id: crypto.randomUUID(), blockId, order: prev.length }])
  }, [])

  const removeFromCanvas = useCallback((canvasId: string) => {
    setCanvas(prev => prev.filter(c => c.id !== canvasId))
  }, [])

  const moveBlock = useCallback((fromIndex: number, toIndex: number) => {
    setCanvas(prev => {
      const next = [...prev]
      const [moved] = next.splice(fromIndex, 1)
      next.splice(toIndex, 0, moved)
      return next.map((c, i) => ({ ...c, order: i }))
    })
  }, [])

  const removePart = useCallback((partId: string) => {
    setParts(prev => prev.filter(p => p.id !== partId))
    setCanvas(prev => prev.filter(c => c.blockId !== partId))
  }, [])

  const canvasBlocks = canvas.map(c => ({
    canvas: c,
    block: parts.find(p => p.id === c.blockId)!
  })).filter(c => c.block)

  return (
    <div className="app">
      <header className="app-header">
        <div className="app-logo">
          <h1>PARTCOPY</h1>
          <span className="app-tagline">URL to Parts Builder</span>
        </div>
        <div className="app-actions">
          <button
            className={`view-btn ${view === 'editor' ? 'active' : ''}`}
            onClick={() => setView('editor')}
          >
            Editor
          </button>
          <button
            className={`view-btn ${view === 'preview' ? 'active' : ''}`}
            onClick={() => setView('preview')}
          >
            Preview
          </button>
          {canvas.length > 0 && (
            <button className="export-btn" onClick={() => setShowExport(true)}>
              Export HTML
            </button>
          )}
        </div>
      </header>

      <URLInput onSubmit={handleExtract} loading={loading} error={error} />

      {view === 'editor' ? (
        <div className="editor-layout">
          <PartsPanel
            parts={parts}
            onAdd={addToCanvas}
            onRemove={removePart}
          />
          <Canvas
            blocks={canvasBlocks}
            onRemove={removeFromCanvas}
            onMove={moveBlock}
          />
        </div>
      ) : (
        <Preview blocks={canvasBlocks} />
      )}

      {showExport && (
        <ExportModal
          blocks={canvasBlocks}
          onClose={() => setShowExport(false)}
        />
      )}
    </div>
  )
}
