import React, { useState } from 'react'
import { ExtractedBlock, CanvasBlock } from '../types'

interface CanvasItem {
  canvas: CanvasBlock
  block: ExtractedBlock
}

interface Props {
  blocks: CanvasItem[]
}

export function Preview({ blocks }: Props) {
  const [mode, setMode] = useState<'screenshot' | 'live'>('screenshot')

  if (blocks.length === 0) {
    return (
      <div className="preview-container">
        <div className="canvas-empty">
          <p>Canvasにブロックを追加してください</p>
        </div>
      </div>
    )
  }

  // Build live preview with original stylesheets
  const allStylesheetUrls = [...new Set(blocks.flatMap(b => b.block.stylesheetUrls || []))]
  const stylesheetLinks = allStylesheetUrls
    .map(href => `<link rel="stylesheet" href="${href}">`)
    .join('\n')
  const combinedHtml = blocks.map(b => b.block.html).join('\n')
  const liveSrcDoc = `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
${stylesheetLinks}
<style>
body { margin: 0; }
img { max-width: 100%; height: auto; }
</style>
</head>
<body>
${combinedHtml}
</body>
</html>`

  return (
    <div className="preview-container">
      <div className="preview-mode-bar">
        <button
          className={`preview-mode-btn ${mode === 'screenshot' ? 'active' : ''}`}
          onClick={() => setMode('screenshot')}
        >
          Screenshot
        </button>
        <button
          className={`preview-mode-btn ${mode === 'live' ? 'active' : ''}`}
          onClick={() => setMode('live')}
        >
          Live HTML
        </button>
      </div>

      {mode === 'screenshot' ? (
        <div className="preview-screenshots">
          {blocks.map(item => (
            <div key={item.canvas.id} className="preview-section">
              {item.block.thumbnail ? (
                <img
                  src={item.block.thumbnail}
                  alt={`${item.block.type} section`}
                  className="preview-section-img"
                />
              ) : (
                <div className="preview-section-placeholder">
                  {item.block.type} - No preview
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <iframe
          srcDoc={liveSrcDoc}
          title="Full Preview"
          className="preview-iframe"
          sandbox="allow-same-origin allow-scripts"
        />
      )}
    </div>
  )
}
