import React, { useState } from 'react'

interface Props {
  onSubmit: (url: string, genre: string, tags: string[], mode: 'own' | 'reference') => void
  loading: boolean
  error: string | null
  jobStatus: string | null
}

export function URLInput({ onSubmit, loading, error, jobStatus }: Props) {
  const [url, setUrl] = useState('')
  const [mode, setMode] = useState<'own' | 'reference'>('own')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!url.trim() || loading) return
    let finalUrl = url.trim()
    if (!/^https?:\/\//.test(finalUrl)) finalUrl = 'https://' + finalUrl
    onSubmit(finalUrl, '', [], mode)
  }

  return (
    <div className="url-input-bar">
      <div className="url-section-inner">
        <div className="url-mode-toggle" role="tablist">
          <button
            role="tab"
            aria-selected={mode === 'own'}
            className={`mode-pill ${mode === 'own' ? 'active' : ''}`}
            onClick={() => setMode('own')}
          >
            自社サイト分析
          </button>
          <button
            role="tab"
            aria-selected={mode === 'reference'}
            className={`mode-pill ${mode === 'reference' ? 'active' : ''}`}
            onClick={() => setMode('reference')}
          >
            参考パターン収集
          </button>
        </div>

        <form onSubmit={handleSubmit} className="url-form">
          <div className="url-form-main">
            <div className="url-field-wrap">
              <svg className="url-field-icon" width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M6.5 1.5C3.73858 1.5 1.5 3.73858 1.5 6.5C1.5 9.26142 3.73858 11.5 6.5 11.5C9.26142 11.5 11.5 9.26142 11.5 6.5C11.5 3.73858 9.26142 1.5 6.5 1.5Z" stroke="currentColor" strokeWidth="1.5"/>
                <path d="M10.5 10.5L14.5 14.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
              <input
                type="text"
                value={url}
                onChange={e => setUrl(e.target.value)}
                placeholder={mode === 'own' ? '自社サイトのURLを入力' : '参考にしたいサイトのURLを入力'}
                className="url-field"
                disabled={loading}
              />
            </div>
            <button type="submit" className="extract-btn" disabled={loading}>
              {loading ? <span className="spinner" /> : '分析する'}
            </button>
          </div>
        </form>

        {jobStatus && (
          <div className="url-status">
            <span className="url-status-dot" />
            {jobStatus}
          </div>
        )}
        {error && <div className="url-error">{error}</div>}
      </div>
    </div>
  )
}
