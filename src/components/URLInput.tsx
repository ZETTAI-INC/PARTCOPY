import React, { useState } from 'react'

interface Props {
  onSubmit: (url: string) => void
  loading: boolean
  error: string | null
}

export function URLInput({ onSubmit, loading, error }: Props) {
  const [url, setUrl] = useState('')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!url.trim() || loading) return
    let finalUrl = url.trim()
    if (!/^https?:\/\//.test(finalUrl)) {
      finalUrl = 'https://' + finalUrl
    }
    onSubmit(finalUrl)
  }

  return (
    <div className="url-input-bar">
      <form onSubmit={handleSubmit} className="url-form">
        <input
          type="text"
          value={url}
          onChange={e => setUrl(e.target.value)}
          placeholder="URLを入力してパーツを抽出 (例: https://example.co.jp)"
          className="url-field"
          disabled={loading}
        />
        <button type="submit" className="extract-btn" disabled={loading}>
          {loading ? (
            <span className="spinner" />
          ) : (
            'Extract Parts'
          )}
        </button>
      </form>
      {error && <div className="error-msg">{error}</div>}
    </div>
  )
}
