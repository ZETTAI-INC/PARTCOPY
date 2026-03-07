import React, { useRef } from 'react'
import { ExtractedBlock, CanvasBlock } from '../types'

interface CanvasItem {
  canvas: CanvasBlock
  block: ExtractedBlock
}

interface Props {
  blocks: CanvasItem[]
  onClose: () => void
}

export function ExportModal({ blocks, onClose }: Props) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const allStylesheetUrls = [...new Set(blocks.flatMap(b => b.block.stylesheetUrls || []))]
  const stylesheetLinks = allStylesheetUrls
    .map(href => `<link rel="stylesheet" href="${href}">`)
    .join('\n')
  const combinedHtml = blocks.map(b => b.block.html).join('\n\n')
  const exportCode = `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Generated Site</title>
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

  const handleCopy = () => {
    if (textareaRef.current) {
      textareaRef.current.select()
      navigator.clipboard.writeText(exportCode)
    }
  }

  const handleDownload = () => {
    const blob = new Blob([exportCode], { type: 'text/html' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'site.html'
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Export HTML</h2>
          <button className="modal-close" onClick={onClose}>&times;</button>
        </div>
        <div className="modal-body">
          <textarea
            ref={textareaRef}
            className="export-textarea"
            value={exportCode}
            readOnly
          />
        </div>
        <div className="modal-footer">
          <button className="copy-btn" onClick={handleCopy}>Copy</button>
          <button className="download-btn" onClick={handleDownload}>Download HTML</button>
        </div>
      </div>
    </div>
  )
}
