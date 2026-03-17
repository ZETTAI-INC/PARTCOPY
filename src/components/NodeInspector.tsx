/**
 * NodeInspector — 選択されたノードの編集パネル。
 * テキスト、リンク、画像、スタイルトークンの編集 → パッチ生成。
 */
import React, { useState, useEffect, useCallback } from 'react'
import { apiFetch } from '../api'
import type { SelectedNode } from './EditableSourceFrame'

interface NodeDetail {
  id: string
  stable_key: string
  node_type: string
  tag_name: string
  text_content: string | null
  attrs_jsonb: Record<string, string>
  computed_style_jsonb: Record<string, string>
}

interface Patch {
  nodeStableKey: string
  op: string
  payload: Record<string, any>
}

interface Props {
  sectionId: string
  selectedNode: SelectedNode | null
  onApplyPatch: (patch: Patch) => void
  patchSetId: string | null
}

const STYLE_FIELDS = [
  { key: 'color', label: '文字色', type: 'color' },
  { key: 'background-color', label: '背景色', type: 'color' },
  { key: 'font-size', label: 'フォントサイズ', type: 'text', placeholder: '16px' },
  { key: 'font-weight', label: '太さ', type: 'select', options: ['normal', 'bold', '100', '200', '300', '400', '500', '600', '700', '800', '900'] },
  { key: 'padding', label: 'パディング', type: 'text', placeholder: '8px 16px' },
  { key: 'margin', label: 'マージン', type: 'text', placeholder: '0 auto' },
  { key: 'border-radius', label: '角丸', type: 'text', placeholder: '8px' },
  { key: 'border', label: 'ボーダー', type: 'text', placeholder: '1px solid #ccc' },
] as const

export function NodeInspector({ sectionId, selectedNode, onApplyPatch, patchSetId }: Props) {
  const [nodeDetail, setNodeDetail] = useState<NodeDetail | null>(null)
  const [editText, setEditText] = useState('')
  const [editHref, setEditHref] = useState('')
  const [editSrc, setEditSrc] = useState('')
  const [editAlt, setEditAlt] = useState('')
  const [pendingPatches, setPendingPatches] = useState<Patch[]>([])
  const [undonePatches, setUndonePatches] = useState<Patch[]>([])
  const [styleValues, setStyleValues] = useState<Record<string, string>>({})
  const [savingPatches, setSavingPatches] = useState(false)
  const [applyingText, setApplyingText] = useState(false)
  const [applyingHref, setApplyingHref] = useState(false)
  const [applyingSrc, setApplyingSrc] = useState(false)
  const [removingNode, setRemovingNode] = useState(false)
  const [duplicatingNode, setDuplicatingNode] = useState(false)

  // ノード選択時にDBからノード詳細を取得
  useEffect(() => {
    if (!selectedNode) { setNodeDetail(null); return }
    apiFetch(`/api/sections/${sectionId}/dom`)
      .then(r => r.json())
      .then(data => {
        const node = (data.nodes || []).find((n: NodeDetail) => n.stable_key === selectedNode.stableKey)
        if (node) {
          setNodeDetail(node)
          setEditText(node.text_content || '')
          setEditHref(node.attrs_jsonb?.href || '')
          setEditSrc(node.attrs_jsonb?.src || '')
          setEditAlt(node.attrs_jsonb?.alt || '')
          // Initialize style values from computed styles
          const styles: Record<string, string> = {}
          for (const field of STYLE_FIELDS) {
            styles[field.key] = node.computed_style_jsonb?.[field.key] || ''
          }
          setStyleValues(styles)
        }
      })
      .catch(() => {})
  }, [selectedNode, sectionId])

  const applyAndRecord = useCallback((patch: Patch) => {
    onApplyPatch(patch)
    setPendingPatches(prev => [...prev, patch])
    setUndonePatches([]) // Clear redo stack on new action
  }, [onApplyPatch])

  const handleUndo = useCallback(() => {
    if (pendingPatches.length === 0) return
    const lastPatch = pendingPatches[pendingPatches.length - 1]
    setPendingPatches(prev => prev.slice(0, -1))
    setUndonePatches(prev => [...prev, lastPatch])

    // Apply reverse operation
    let reversePatch: Patch | null = null
    switch (lastPatch.op) {
      case 'set_text':
        // Revert to original text from nodeDetail
        reversePatch = { ...lastPatch, payload: { text: nodeDetail?.text_content || '' } }
        break
      case 'set_style_token':
        reversePatch = { ...lastPatch, payload: { property: lastPatch.payload.property, value: '' } }
        break
      case 'set_attr':
        reversePatch = { ...lastPatch, payload: { attr: lastPatch.payload.attr, value: nodeDetail?.attrs_jsonb?.[lastPatch.payload.attr] || '' } }
        break
    }
    if (reversePatch) onApplyPatch(reversePatch)
  }, [pendingPatches, onApplyPatch, nodeDetail])

  const handleRedo = useCallback(() => {
    if (undonePatches.length === 0) return
    const patch = undonePatches[undonePatches.length - 1]
    setUndonePatches(prev => prev.slice(0, -1))
    setPendingPatches(prev => [...prev, patch])
    onApplyPatch(patch)
  }, [undonePatches, onApplyPatch])

  const handleSetText = async () => {
    if (!selectedNode || !editText) return
    setApplyingText(true)
    try {
      applyAndRecord({
        nodeStableKey: selectedNode.stableKey,
        op: 'set_text',
        payload: { text: editText }
      })
    } finally {
      setApplyingText(false)
    }
  }

  const handleSetHref = async () => {
    if (!selectedNode || !editHref) return
    setApplyingHref(true)
    try {
      applyAndRecord({
        nodeStableKey: selectedNode.stableKey,
        op: 'set_attr',
        payload: { attr: 'href', value: editHref }
      })
    } finally {
      setApplyingHref(false)
    }
  }

  const handleSetSrc = async () => {
    if (!selectedNode || !editSrc) return
    setApplyingSrc(true)
    try {
      applyAndRecord({
        nodeStableKey: selectedNode.stableKey,
        op: 'replace_asset',
        payload: { src: editSrc, alt: editAlt }
      })
    } finally {
      setApplyingSrc(false)
    }
  }

  const handleRemove = async () => {
    if (!selectedNode) return
    setRemovingNode(true)
    try {
      applyAndRecord({
        nodeStableKey: selectedNode.stableKey,
        op: 'remove_node',
        payload: {}
      })
    } finally {
      setRemovingNode(false)
    }
  }

  // Ctrl+Z / Ctrl+Shift+Z
  React.useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'z') {
        e.preventDefault()
        if (e.shiftKey) handleRedo()
        else handleUndo()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [handleUndo, handleRedo])

  // パッチをサーバーに保存
  const savePatches = async () => {
    if (pendingPatches.length === 0) return
    setSavingPatches(true)
    try {
      let currentPatchSetId = patchSetId

      // パッチセットがなければ作成
      if (!currentPatchSetId) {
        const res = await apiFetch(`/api/sections/${sectionId}/patch-sets`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ label: 'Edit session' })
        })
        const data = await res.json()
        currentPatchSetId = data.patchSet?.id
      }

      if (!currentPatchSetId) return

      await apiFetch(`/api/patch-sets/${currentPatchSetId}/patches`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ patches: pendingPatches })
      })

      setPendingPatches([])
    } finally {
      setSavingPatches(false)
    }
  }

  if (!selectedNode) {
    return (
      <aside className="node-inspector">
        <div className="inspector-empty">
          <p>セクション内の要素をクリックして編集</p>
        </div>
      </aside>
    )
  }

  const isText = ['heading', 'paragraph', 'text', 'list_item', 'button'].includes(nodeDetail?.node_type || '')
  const isLink = nodeDetail?.node_type === 'link' || nodeDetail?.node_type === 'button'
  const isImage = nodeDetail?.node_type === 'image'

  return (
    <aside className="node-inspector">
      <div className="inspector-header">
        <h3>
          <span className="inspector-tag">&lt;{selectedNode.tagName}&gt;</span>
          <span className="inspector-type">{nodeDetail?.node_type || ''}</span>
        </h3>
        <span className="inspector-key">{selectedNode.stableKey}</span>
      </div>

      {/* テキスト編集 */}
      {isText && (
        <div className="inspector-section">
          <label>テキスト</label>
          <textarea
            value={editText}
            onChange={e => setEditText(e.target.value)}
            rows={3}
          />
          <button className="inspector-btn primary" onClick={handleSetText} disabled={applyingText}>
            {applyingText ? <span className="spinner" /> : 'テキスト適用'}
          </button>
        </div>
      )}

      {/* リンク編集 */}
      {isLink && (
        <div className="inspector-section">
          <label>リンク先 (href)</label>
          <input
            type="text"
            value={editHref}
            onChange={e => setEditHref(e.target.value)}
            placeholder="https://..."
          />
          <button className="inspector-btn" onClick={handleSetHref} disabled={applyingHref}>
            {applyingHref ? <span className="spinner" /> : 'リンク適用'}
          </button>
        </div>
      )}

      {/* 画像編集 */}
      {isImage && (
        <div className="inspector-section">
          <label>画像URL (src)</label>
          <input
            type="text"
            value={editSrc}
            onChange={e => setEditSrc(e.target.value)}
            placeholder="https://..."
          />
          <label>Alt テキスト</label>
          <input
            type="text"
            value={editAlt}
            onChange={e => setEditAlt(e.target.value)}
          />
          <button className="inspector-btn" onClick={handleSetSrc} disabled={applyingSrc}>
            {applyingSrc ? <span className="spinner" /> : '画像差し替え'}
          </button>
        </div>
      )}

      {/* 複製 & 削除 */}
      <div className="inspector-section inspector-actions-row">
        <button className="inspector-btn" disabled={duplicatingNode} onClick={async () => {
          if (!selectedNode) return
          setDuplicatingNode(true)
          try {
            // Use the selectedNode's textContent to build a rough duplicate
            // The iframe will handle it via insert_after patch
            const tagName = selectedNode.tagName
            const text = selectedNode.textContent?.slice(0, 500) || ''
            const duplicateHtml = `<${tagName}>${text}</${tagName}>`
            applyAndRecord({
              nodeStableKey: selectedNode.stableKey,
              op: 'insert_after',
              payload: { html: duplicateHtml }
            })
          } finally {
            setDuplicatingNode(false)
          }
        }} title="選択要素の直後に複製を挿入">
          {duplicatingNode ? <span className="spinner" /> : '複製'}
        </button>
        <button className="inspector-btn danger" onClick={handleRemove} disabled={removingNode}>
          {removingNode ? <span className="spinner" /> : '削除'}
        </button>
      </div>

      {/* スタイル編集 */}
      <div className="inspector-section">
        <label>スタイル編集</label>
        <div className="inspector-style-editor">
          {STYLE_FIELDS.map(field => (
            <div key={field.key} className="style-edit-row">
              <span className="style-edit-label">{field.label}</span>
              {field.type === 'color' ? (
                <div className="style-color-input">
                  <input
                    type="color"
                    value={styleValues[field.key] || '#000000'}
                    onChange={e => {
                      const val = e.target.value
                      setStyleValues(prev => ({ ...prev, [field.key]: val }))
                      if (selectedNode) {
                        applyAndRecord({
                          nodeStableKey: selectedNode.stableKey,
                          op: 'set_style_token',
                          payload: { property: field.key, value: val }
                        })
                      }
                    }}
                  />
                  <input
                    type="text"
                    className="style-color-text"
                    value={styleValues[field.key] || ''}
                    onChange={e => setStyleValues(prev => ({ ...prev, [field.key]: e.target.value }))}
                    onBlur={e => {
                      if (selectedNode && e.target.value) {
                        applyAndRecord({
                          nodeStableKey: selectedNode.stableKey,
                          op: 'set_style_token',
                          payload: { property: field.key, value: e.target.value }
                        })
                      }
                    }}
                    placeholder={field.key}
                  />
                </div>
              ) : field.type === 'select' ? (
                <select
                  value={styleValues[field.key] || ''}
                  onChange={e => {
                    const val = e.target.value
                    setStyleValues(prev => ({ ...prev, [field.key]: val }))
                    if (selectedNode && val) {
                      applyAndRecord({
                        nodeStableKey: selectedNode.stableKey,
                        op: 'set_style_token',
                        payload: { property: field.key, value: val }
                      })
                    }
                  }}
                >
                  <option value="">--</option>
                  {field.options?.map(opt => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </select>
              ) : (
                <input
                  type="text"
                  value={styleValues[field.key] || ''}
                  placeholder={(field as any).placeholder || ''}
                  onChange={e => setStyleValues(prev => ({ ...prev, [field.key]: e.target.value }))}
                  onBlur={e => {
                    if (selectedNode && e.target.value) {
                      applyAndRecord({
                        nodeStableKey: selectedNode.stableKey,
                        op: 'set_style_token',
                        payload: { property: field.key, value: e.target.value }
                      })
                    }
                  }}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && selectedNode && (e.target as HTMLInputElement).value) {
                      applyAndRecord({
                        nodeStableKey: selectedNode.stableKey,
                        op: 'set_style_token',
                        payload: { property: field.key, value: (e.target as HTMLInputElement).value }
                      })
                    }
                  }}
                />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Undo/Redo & 保存 */}
      {(pendingPatches.length > 0 || undonePatches.length > 0) && (
        <div className="inspector-section inspector-save">
          <div className="inspector-undo-row">
            <button className="inspector-btn small" onClick={handleUndo} disabled={pendingPatches.length === 0} title="Ctrl+Z">
              Undo
            </button>
            <button className="inspector-btn small" onClick={handleRedo} disabled={undonePatches.length === 0} title="Ctrl+Shift+Z">
              Redo
            </button>
            <span className="patch-count">{pendingPatches.length} 件</span>
          </div>
          {pendingPatches.length > 0 && (
            <button className="inspector-btn primary" onClick={savePatches} disabled={savingPatches}>
              {savingPatches ? <span className="spinner" /> : '変更を保存'}
            </button>
          )}
        </div>
      )}
    </aside>
  )
}
