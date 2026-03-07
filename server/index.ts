import express from 'express'
import cors from 'cors'
import { extractParts } from './extractor.js'

const app = express()
app.use(cors())
app.use(express.json())

app.post('/api/extract', async (req, res) => {
  const { url } = req.body
  if (!url || typeof url !== 'string') {
    res.status(400).json({ error: 'URL is required' })
    return
  }
  try {
    new URL(url)
  } catch {
    res.status(400).json({ error: 'Invalid URL format' })
    return
  }
  try {
    const parts = await extractParts(url)
    res.json({ parts })
  } catch (err: any) {
    console.error('Extraction error:', err)
    res.status(500).json({ error: err.message || 'Failed to extract parts' })
  }
})

const PORT = 3001
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`)
})
