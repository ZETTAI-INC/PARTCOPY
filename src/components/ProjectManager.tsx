import React, { useState, useEffect, useCallback } from 'react'
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
      const res = await fetch('/api/projects')
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
      const res = await fetch('/api/projects', {
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
      await fetch(`/api/projects/${projectId}/save-canvas`, {
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
      const res = await fetch(`/api/projects/${projectId}/load-canvas`)
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
      await fetch(`/api/projects/${projectId}`, { method: 'DELETE' })
      setConfirmDelete(null)
      fetchProjects()
    } catch {
      // ignore
    }
  }

  return (
    <div className="project-manager">
      <div className="project-manager-header">
        <h2>Projects</h2>
        <form className="project-create-form" onSubmit={handleCreate}>
          <input
            type="text"
            className="project-name-input"
            placeholder="New project name..."
            value={newName}
            onChange={e => setNewName(e.target.value)}
          />
          <button type="submit" className="project-create-btn" disabled={!newName.trim()}>
            Create
          </button>
        </form>
      </div>

      {loading ? (
        <div className="project-loading">Loading projects...</div>
      ) : projects.length === 0 ? (
        <div className="project-empty">
          <p>No projects yet. Create one to save your Canvas layout.</p>
        </div>
      ) : (
        <div className="project-grid">
          {projects.map(project => (
            <div key={project.id} className="project-card">
              <div className="project-card-header">
                <h3>{project.name}</h3>
                <span className="project-card-meta">
                  {project.block_count || 0} blocks
                </span>
              </div>
              <div className="project-card-date">
                Updated: {new Date(project.updated_at).toLocaleDateString('ja-JP')}
              </div>
              <div className="project-card-actions">
                <button
                  className="project-action-btn save"
                  onClick={() => handleSave(project.id)}
                  disabled={saving === project.id || canvas.length === 0}
                >
                  {saving === project.id ? 'Saving...' : 'Save Canvas'}
                </button>
                <button
                  className="project-action-btn load"
                  onClick={() => handleLoad(project.id)}
                  disabled={loadingProject === project.id}
                >
                  {loadingProject === project.id ? 'Loading...' : 'Load'}
                </button>
                {confirmDelete === project.id ? (
                  <span className="project-confirm-delete">
                    <button className="project-action-btn danger" onClick={() => handleDelete(project.id)}>
                      Confirm
                    </button>
                    <button className="project-action-btn" onClick={() => setConfirmDelete(null)}>
                      Cancel
                    </button>
                  </span>
                ) : (
                  <button
                    className="project-action-btn danger-outline"
                    onClick={() => setConfirmDelete(project.id)}
                  >
                    Delete
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
