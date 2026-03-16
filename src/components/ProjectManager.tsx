import React, { useState, useEffect, useCallback } from 'react'
import { apiFetch } from '../api'
import { Project, CanvasBlock, SourceSection } from '../types'

interface Props {
  canvas: CanvasBlock[]
  setCanvas: (canvas: CanvasBlock[]) => void
  setSections: React.Dispatch<React.SetStateAction<SourceSection[]>>
  onSwitchToEditor: () => void
}

export function ProjectManager({ canvas, setCanvas, setSections, onSwitchToEditor }: Props) {
  const [projects, setProjects] = useState<Project[]>([])
  const [newName, setNewName] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)
  const [loadingProject, setLoadingProject] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)

  const fetchProjects = useCallback(async () => {
    try {
      const res = await apiFetch('/api/projects')
      const data = await res.json()
      setProjects(data.projects || [])
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchProjects() }, [fetchProjects])

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newName.trim()) return
    try {
      const res = await apiFetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName.trim() })
      })
      if (!res.ok) return
      setNewName('')
      fetchProjects()
    } catch {
      // ignore
    }
  }

  const handleSave = async (projectId: string) => {
    setSaving(projectId)
    try {
      const blocks = canvas.map(c => ({ sectionId: c.sectionId, position: c.position }))
      await apiFetch(`/api/projects/${projectId}/save-canvas`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ blocks })
      })
      fetchProjects()
    } catch {
      // ignore
    } finally {
      setSaving(null)
    }
  }

  const handleLoad = async (projectId: string) => {
    setLoadingProject(projectId)
    try {
      const res = await apiFetch(`/api/projects/${projectId}/load-canvas`)
      if (!res.ok) return
      const data = await res.json()
      const blocks: CanvasBlock[] = (data.blocks || []).map((b: any, i: number) => ({
        id: crypto.randomUUID(),
        sectionId: b.source_section_id,
        position: i
      }))
      const sections: SourceSection[] = data.sections || []

      setSections(prev => {
        const seen = new Set(prev.map(s => s.id))
        const next = [...prev]
        for (const s of sections) {
          if (!seen.has(s.id)) {
            seen.add(s.id)
            next.push(s)
          }
        }
        return next
      })
      setCanvas(blocks)
      onSwitchToEditor()
    } catch {
      // ignore
    } finally {
      setLoadingProject(null)
    }
  }

  const handleDelete = async (projectId: string) => {
    try {
      await apiFetch(`/api/projects/${projectId}`, { method: 'DELETE' })
      setConfirmDelete(null)
      fetchProjects()
    } catch {
      // ignore
    }
  }

  return (
    <div className="project-manager">
      <div className="project-section-inner">
        <div className="project-manager-header">
          <div>
            <h2>プロジェクト</h2>
            <p className="project-header-desc">Canvasのレイアウトを保存・復元できます</p>
          </div>
          <form className="project-create-form" onSubmit={handleCreate}>
            <input
              type="text"
              className="project-name-input"
              placeholder="プロジェクト名を入力"
              value={newName}
              onChange={e => setNewName(e.target.value)}
            />
            <button type="submit" className="project-create-btn" disabled={!newName.trim()}>
              作成
            </button>
          </form>
        </div>

        {loading ? (
          <div className="project-empty-state">
            <div className="project-empty-spinner" />
            <p>読み込み中...</p>
          </div>
        ) : projects.length === 0 ? (
          <div className="project-empty-state">
            <div className="project-empty-icon">
              <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
                <rect x="8" y="12" width="32" height="28" rx="4" stroke="currentColor" strokeWidth="2" fill="none"/>
                <path d="M16 8h16v4H16z" fill="currentColor" opacity="0.2"/>
                <path d="M16 12V10a2 2 0 012-2h12a2 2 0 012 2v2" stroke="currentColor" strokeWidth="2" fill="none"/>
                <path d="M24 24v8M20 28h8" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              </svg>
            </div>
            <p>プロジェクトがまだありません</p>
            <p className="project-empty-hint">上のフォームから作成して、Canvasを保存しましょう</p>
          </div>
        ) : (
          <div className="project-grid">
            {projects.map(project => (
              <div key={project.id} className="project-card">
                <div className="project-card-top">
                  <div className="project-card-icon">
                    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                      <rect x="2" y="4" width="16" height="14" rx="2" stroke="currentColor" strokeWidth="1.5" fill="none"/>
                      <path d="M2 8h16" stroke="currentColor" strokeWidth="1.5"/>
                      <circle cx="5" cy="6" r="0.75" fill="currentColor"/>
                      <circle cx="7.5" cy="6" r="0.75" fill="currentColor"/>
                    </svg>
                  </div>
                  <div className="project-card-info">
                    <h3>{project.name}</h3>
                    <span className="project-card-meta">
                      {project.block_count || 0} ブロック
                      <span className="project-card-date">
                        {new Date(project.updated_at).toLocaleDateString('ja-JP')} 更新
                      </span>
                    </span>
                  </div>
                </div>
                <div className="project-card-actions">
                  <button
                    className="pj-btn pj-btn-primary"
                    onClick={() => handleSave(project.id)}
                    disabled={saving === project.id || canvas.length === 0}
                  >
                    {saving === project.id ? '保存中...' : 'Canvas を保存'}
                  </button>
                  <button
                    className="pj-btn pj-btn-secondary"
                    onClick={() => handleLoad(project.id)}
                    disabled={loadingProject === project.id}
                  >
                    {loadingProject === project.id ? '読込中...' : '読み込む'}
                  </button>
                  {confirmDelete === project.id ? (
                    <span className="project-confirm-delete">
                      <button className="pj-btn pj-btn-danger" onClick={() => handleDelete(project.id)}>
                        削除する
                      </button>
                      <button className="pj-btn pj-btn-ghost" onClick={() => setConfirmDelete(null)}>
                        キャンセル
                      </button>
                    </span>
                  ) : (
                    <button
                      className="pj-btn pj-btn-ghost pj-btn-danger-text"
                      onClick={() => setConfirmDelete(project.id)}
                    >
                      削除
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
