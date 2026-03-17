import React, { useState, useEffect, useRef } from 'react'

const ANALYSIS_STEPS = [
  { key: 'fetch',    cmd: 'fetch --headless',       label: 'ページ取得' },
  { key: 'render',   cmd: 'render --javascript',    label: 'レンダリング' },
  { key: 'detect',   cmd: 'detect --sections',      label: 'セクション検出' },
  { key: 'classify', cmd: 'classify --ai claude',    label: 'AI分類' },
  { key: 'store',    cmd: 'store --deduplicate',    label: '保存' },
]

function getActiveStep(status: string): number {
  if (status.includes('分類')) return 3
  if (status.includes('検出')) return 2
  if (status.includes('レンダリング')) return 1
  if (status.includes('読み込み')) return 0
  return 0
}

interface Props {
  onSubmit: (url: string, genre: string, tags: string[], mode: 'own' | 'reference') => void
  loading: boolean
  error: string | null
  jobStatus: string | null
}

export function URLInput({ onSubmit, loading, error, jobStatus }: Props) {
  const [url, setUrl] = useState('')
  const [mode, setMode] = useState<'own' | 'reference'>('own')
  const [logs, setLogs] = useState<string[]>([])
  const [elapsed, setElapsed] = useState(0)
  const logRef = useRef<HTMLDivElement>(null)
  const timerRef = useRef<NodeJS.Timeout | null>(null)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!url.trim() || loading) return
    let finalUrl = url.trim()
    if (!/^https?:\/\//.test(finalUrl)) finalUrl = 'https://' + finalUrl
    setLogs([`$ partcopy analyze ${finalUrl}`])
    setElapsed(0)
    onSubmit(finalUrl, '', [], mode)
  }

  // Timer
  useEffect(() => {
    if (loading) {
      timerRef.current = setInterval(() => setElapsed(p => p + 1), 1000)
    } else {
      if (timerRef.current) clearInterval(timerRef.current)
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [loading])

  // Add log lines as status changes
  useEffect(() => {
    if (!jobStatus) return
    const step = getActiveStep(jobStatus)
    const s = ANALYSIS_STEPS[step]
    if (!s) return
    const sectionMatch = jobStatus.match(/(\d+) パーツ/)
    const extra = sectionMatch ? ` (${sectionMatch[1]} found)` : ''
    const line = `  ${s.cmd}${extra}`
    setLogs(prev => {
      if (prev[prev.length - 1] === line) return prev
      return [...prev, line]
    })
  }, [jobStatus])

  // Done
  useEffect(() => {
    if (!loading && logs.length > 1 && !error) {
      setLogs(prev => {
        const last = prev[prev.length - 1]
        if (last?.startsWith('  done')) return prev
        return [...prev, `  done in ${elapsed}s`]
      })
    }
  }, [loading, error, elapsed, logs.length])

  // Auto scroll log
  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight
  }, [logs])

  const activeStep = jobStatus ? getActiveStep(jobStatus) : -1

  return (
    <div className="url-input-bar">
      <div className="url-section-inner">
        <div className="url-mode-toggle" role="tablist">
          <button role="tab" aria-selected={mode === 'own'} className={`mode-pill ${mode === 'own' ? 'active' : ''}`} onClick={() => setMode('own')}>
            自社サイト分析
          </button>
          <button role="tab" aria-selected={mode === 'reference'} className={`mode-pill ${mode === 'reference' ? 'active' : ''}`} onClick={() => setMode('reference')}>
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

        {(loading || logs.length > 1) && (
          <div className="analysis-terminal">
            <div className="terminal-header">
              <div className="terminal-dots">
                <span className="terminal-dot red" />
                <span className="terminal-dot yellow" />
                <span className="terminal-dot green" />
              </div>
              <span className="terminal-title">partcopy analyze</span>
              {loading && <span className="terminal-timer">{elapsed}s</span>}
            </div>
            <div className="terminal-body" ref={logRef}>
              {logs.map((line, i) => (
                <div key={i} className={`terminal-line ${line.startsWith('$') ? 'cmd' : line.includes('done') ? 'success' : ''}`}>
                  {line}
                  {i === logs.length - 1 && loading && <span className="terminal-cursor" />}
                </div>
              ))}
            </div>
            {loading && (
              <div className="terminal-steps">
                {ANALYSIS_STEPS.map((s, i) => (
                  <div key={s.key} className={`terminal-step ${i < activeStep ? 'done' : i === activeStep ? 'active' : ''}`}>
                    <span className="terminal-step-indicator">
                      {i < activeStep ? (
                        <svg width="10" height="10" viewBox="0 0 12 12" fill="none"><path d="M2.5 6L5 8.5L9.5 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                      ) : i === activeStep ? (
                        <span className="terminal-step-pulse" />
                      ) : (
                        <span className="terminal-step-empty" />
                      )}
                    </span>
                    <span className="terminal-step-label">{s.label}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
        {error && <div className="url-error">{error}</div>}
      </div>
    </div>
  )
}
