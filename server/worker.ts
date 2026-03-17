/**
 * Extract Worker v3 - Complete Site Download
 *
 * Pipeline:
 * 1. downloadSite: HTML/CSS/画像/フォントを全て直接ダウンロード → URL書き換え
 * 2. Section detection (Puppeteer page.evaluate)
 * 3. Classify + Canonicalize + Store each section (with rewritten URLs)
 * 4. DOM snapshot for editing
 */
import {
  claimQueuedJob,
  cleanupOldData,
  createSectionDomSnapshot,
  createSourcePage,
  createSourceSection,
  failCrawlRun,
  findBlockVariantByKey,
  insertBlockInstance,
  insertPageAssets,
  insertSectionNodes,
  updateCrawlRun,
  updateSourceSite,
  writeStoredFile
} from './local-store.js'
import { HAS_SUPABASE, supabaseAdmin } from './supabase.js'
import { STORAGE_BUCKETS } from './storage-config.js'
import { launchBrowser } from './capture-runner.js'
import { downloadSite } from './site-downloader.js'
import { detectSections, screenshotSection } from './section-detector.js'
import { extractStyleSummary, generateLayoutSignature } from './style-extractor.js'
import { classifySection, type RawSection } from './classifier.js'
import { classifySectionsWithAI } from './ai-classifier.js'
import { canonicalizeSection } from './canonicalizer.js'
import { parseSectionDOM } from './dom-parser.js'
import { logger } from './logger.js'

/**
 * Simplify HTML for AI classification: strip inline styles, long attributes,
 * and deeply nested content while preserving the structural skeleton.
 */
function simplifyHTML(html: string, maxLen: number): string {
  let simplified = html
    // Remove inline styles (huge noise)
    .replace(/\s+style="[^"]*"/gi, '')
    // Remove data-* attributes
    .replace(/\s+data-[a-z-]+="[^"]*"/gi, '')
    // Remove srcset (long image lists)
    .replace(/\s+srcset="[^"]*"/gi, '')
    // Shorten src/href to just the filename
    .replace(/\s+(src|href)="([^"]{80,})"/gi, (_, attr, val) => {
      const short = val.split('/').pop()?.slice(0, 40) || val.slice(0, 40)
      return ` ${attr}="${short}..."`
    })
    // Collapse whitespace
    .replace(/\s{2,}/g, ' ')
    // Remove SVG contents (keep the tag)
    .replace(/<svg[^>]*>[\s\S]*?<\/svg>/gi, '<svg/>')

  if (simplified.length <= maxLen) return simplified

  // If still too long, take first half + last quarter for structural overview
  const firstPart = simplified.slice(0, Math.floor(maxLen * 0.7))
  const lastPart = simplified.slice(-Math.floor(maxLen * 0.25))
  return `${firstPart}\n... (truncated) ...\n${lastPart}`
}

const WORKER_ID = `worker-${process.pid}`
const POLL_INTERVAL = 3000
const MAX_RETRIES = 3
const RETRY_BASE_DELAY_S = 5
const DATA_RETENTION_DAYS = Number(process.env.DATA_RETENTION_DAYS) || 30
const CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1000 // 24 hours

let shuttingDown = false
process.on('SIGTERM', () => { shuttingDown = true; logger.info('Shutdown signal received', { signal: 'SIGTERM', workerId: WORKER_ID }); setTimeout(() => process.exit(0), 3000).unref() })
process.on('SIGINT', () => { shuttingDown = true; logger.info('Shutdown signal received', { signal: 'SIGINT', workerId: WORKER_ID }); setTimeout(() => process.exit(0), 3000).unref() })

async function uploadBuffer(bucket: string, path: string, data: Buffer | string, contentType: string): Promise<string> {
  const buffer = typeof data === 'string' ? Buffer.from(data, 'utf-8') : data

  if (!HAS_SUPABASE) {
    await writeStoredFile(bucket, path, buffer, contentType)
    return path
  }

  for (let attempt = 0; attempt < 3; attempt++) {
    const { error } = await supabaseAdmin.storage.from(bucket).upload(path, buffer, { contentType, upsert: true })
    if (!error) return path
    if (attempt < 2 && /timeout|gateway|5\d\d/i.test(error.message)) {
      logger.warn('Upload retry', { attempt: attempt + 1, bucket, path, error: error.message })
      await new Promise(r => setTimeout(r, 2000 * (attempt + 1)))
      continue
    }
    throw new Error(`Storage upload failed (${bucket}/${path}): ${error.message}`)
  }
  return path
}

/**
 * セクションHTML内のURLをローカルアセットパスに書き換える。
 *
 * 1. 絶対URL（urlMap のキー）を直接置換
 * 2. 相対URL / ルート相対URLをページURLで解決し、urlMap にあれば置換
 */
function rewriteStoredHtml(
  html: string,
  finalPageUrl: string,
  _pageOrigin: string,
  sortedEntries: Array<[string, string]>,
  urlMap: Map<string, string>
) {
  let result = html

  // Step 1: 絶対URL の直接置換（長い順）
  for (const [originalUrl, localPath] of sortedEntries) {
    result = result.split(originalUrl).join(localPath)
  }

  // Step 2: 相対URL → 絶対URL → urlMap で置換
  result = result.replace(
    /(src|href|srcset|poster|action)=(["'])(?!data:|https?:\/\/|\/\/|#|mailto:|tel:|javascript:|\/?assets\/)((?:(?!\2).)*)\2/gi,
    (match, attr, q, rawPath) => {
      // srcset は複数URL がカンマ区切りのため個別に解決
      if (attr.toLowerCase() === 'srcset') {
        const rewritten = rawPath.split(',').map((segment: string) => {
          const parts = segment.trim().split(/\s+/)
          const url = parts[0]
          try {
            const resolved = new URL(url, finalPageUrl).href
            const local = urlMap.get(resolved)
            if (local) { parts[0] = local }
          } catch {}
          return parts.join(' ')
        }).join(', ')
        return `${attr}=${q}${rewritten}${q}`
      }

      try {
        const resolved = new URL(rawPath, finalPageUrl).href
        const local = urlMap.get(resolved)
        if (local) return `${attr}=${q}${local}${q}`
      } catch {}
      return match
    }
  )

  // Step 3: inline style の background-image url() も解決
  result = result.replace(
    /url\(\s*(['"]?)(?!data:|https?:\/\/|\/\/|\/?assets\/)((?:(?!\1\)).)*)\1\s*\)/gi,
    (match, q, rawPath) => {
      try {
        const resolved = new URL(rawPath, finalPageUrl).href
        const local = urlMap.get(resolved)
        if (local) return `url(${q}${local}${q})`
      } catch {}
      return match
    }
  )

  return result
}

async function claimJob(): Promise<any | null> {
  if (!HAS_SUPABASE) {
    return claimQueuedJob(WORKER_ID)
  }

  // Step 1: Find the oldest queued job
  const { data: candidates } = await supabaseAdmin
    .from('crawl_runs')
    .select('id')
    .eq('status', 'queued')
    .or(`run_after.is.null,run_after.lte.${new Date().toISOString()}`)
    .order('queued_at', { ascending: true })
    .limit(1)

  if (!candidates || candidates.length === 0) return null

  // Step 2: Claim it by updating status
  const { data, error } = await supabaseAdmin
    .from('crawl_runs')
    .update({ status: 'claimed', worker_id: WORKER_ID, started_at: new Date().toISOString() })
    .eq('id', candidates[0].id)
    .eq('status', 'queued') // optimistic lock
    .select('*, source_sites(*)')
    .single()

  if (error || !data) return null
  return data
}

async function failJob(jobId: string, code: string, message: string) {
  if (!HAS_SUPABASE) {
    await failCrawlRun(jobId, code, message)
    return
  }

  await supabaseAdmin
    .from('crawl_runs')
    .update({ status: 'failed', error_code: code, error_message: message, finished_at: new Date().toISOString() })
    .eq('id', jobId)
}

async function setCrawlRunStatus(jobId: string, patch: Record<string, any>) {
  if (!HAS_SUPABASE) {
    await updateCrawlRun(jobId, patch)
    return
  }

  await supabaseAdmin.from('crawl_runs').update(patch).eq('id', jobId)
}

async function createPageRecord(record: Record<string, any>) {
  if (!HAS_SUPABASE) {
    return createSourcePage(record as any)
  }

  const { data } = await supabaseAdmin
    .from('source_pages')
    .insert(record)
    .select()
    .single()
  return data
}

async function storePageAssets(records: Record<string, any>[]) {
  if (!records.length) return

  if (!HAS_SUPABASE) {
    await insertPageAssets(records)
    return
  }

  await supabaseAdmin.from('page_assets').insert(records)
}

async function createSectionRecord(record: Record<string, any>) {
  if (!HAS_SUPABASE) {
    return createSourceSection(record as any)
  }

  const { data, error } = await supabaseAdmin
    .from('source_sections')
    .insert(record)
    .select('id')
    .single()

  if (error || !data) {
    throw new Error(error?.message || 'Failed to insert source_section')
  }

  return data
}

async function createSnapshotRecord(record: Record<string, any>) {
  if (!HAS_SUPABASE) {
    return createSectionDomSnapshot(record as any)
  }

  const { data, error } = await supabaseAdmin
    .from('section_dom_snapshots')
    .insert(record)
    .select('id')
    .single()

  if (error || !data) {
    throw new Error(error?.message || 'Failed to insert DOM snapshot')
  }

  return data
}

async function storeSectionNodes(records: Record<string, any>[]) {
  if (!records.length) return

  if (!HAS_SUPABASE) {
    await insertSectionNodes(records as any)
    return
  }

  await supabaseAdmin.from('section_nodes').insert(records)
}

async function findVariantRecord(variantKey: string) {
  if (!HAS_SUPABASE) {
    return findBlockVariantByKey(variantKey)
  }

  const { data } = await supabaseAdmin
    .from('block_variants')
    .select('id')
    .eq('variant_key', variantKey)
    .single()

  return data
}

async function createBlockInstanceRecord(record: Record<string, any>) {
  if (!HAS_SUPABASE) {
    await insertBlockInstance(record)
    return
  }

  await supabaseAdmin.from('block_instances').insert(record)
}

async function markSiteAnalyzed(siteId: string) {
  const patch = {
    status: 'analyzed',
    last_crawled_at: new Date().toISOString()
  }

  if (!HAS_SUPABASE) {
    await updateSourceSite(siteId, patch)
    return
  }

  await supabaseAdmin.from('source_sites').update(patch).eq('id', siteId)
}

async function processJob(job: any) {
  const site = job.source_sites
  const url = site.homepage_url
  logger.info('Job started', { jobId: job.id, siteId: site.id, url, workerId: WORKER_ID })

  await setCrawlRunStatus(job.id, { status: 'rendering' })

  const browser = await launchBrowser()

  try {
    const page = await browser.newPage()

    // ========== Phase 1: Complete Site Download ==========
    logger.info('Phase 1: Downloading site', { jobId: job.id, url })
    const dl = await downloadSite(page, url, site.id, job.id)
    logger.info('Download complete', { jobId: job.id, title: dl.title, cssCount: dl.cssFiles.length, imageCount: dl.imageFiles.length, fontCount: dl.fontFiles.length })

    // ========== Phase 2: Store page-level data ==========
    await setCrawlRunStatus(job.id, { status: 'parsed' })

    // Upload rewritten HTML
    const finalHtmlPath = `${site.id}/${job.id}/final.html`
    await uploadBuffer(STORAGE_BUCKETS.RAW_HTML, finalHtmlPath, dl.finalHtml, 'text/html')

    // Full page screenshot (QA)
    let pageScreenshotPath: string | undefined
    try {
      const fullScreenshot = await page.screenshot({ fullPage: true }) as Buffer
      pageScreenshotPath = `${site.id}/${job.id}/fullpage.png`
      await uploadBuffer(STORAGE_BUCKETS.PAGE_SCREENSHOTS, pageScreenshotPath, fullScreenshot, 'image/png')
    } catch (ssErr: any) {
      logger.warn('Page screenshot failed', { jobId: job.id, error: ssErr.message })
    }

    // CSS bundle path (already uploaded by downloadSite)
    const cssBundlePath = `${site.id}/${job.id}/bundle.css`

    // Asset list
    const requestLog = JSON.stringify(dl.allAssets, null, 2)
    const requestLogPath = `${site.id}/${job.id}/assets.json`
    await uploadBuffer(STORAGE_BUCKETS.RAW_HTML, requestLogPath, requestLog, 'application/json')

    // Create source_page
    const sourcePage = await createPageRecord({
      crawl_run_id: job.id,
      site_id: site.id,
      url: page.url(),
      path: new URL(page.url()).pathname,
      page_type: 'home',
      title: dl.title,
      screenshot_storage_path: pageScreenshotPath,
      final_html_path: finalHtmlPath,
      request_log_path: requestLogPath,
      css_bundle_path: cssBundlePath
    })

    if (!sourcePage) throw new Error('Failed to create source_page')

    // Store page assets
    const assetRecords = dl.allAssets.slice(0, 200).map(a => ({
      page_id: sourcePage.id,
      asset_type: a.type,
      url: a.originalUrl,
      storage_path: a.storagePath,
      content_type: '',
      size_bytes: a.size,
      status_code: 200
    }))
    await storePageAssets(assetRecords)

    // ========== Phase 3: Section Detection ==========
    await setCrawlRunStatus(job.id, { status: 'normalizing' })

    const sections = await Promise.race([
      detectSections(page),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Section detection timed out after 45s')), 45000))
    ])
    logger.info('Sections detected', { jobId: job.id, sectionCount: sections.length })

    // Build URL rewrite map for section HTML
    const urlMap = new Map<string, string>()
    for (const asset of dl.allAssets) {
      urlMap.set(asset.originalUrl, asset.signedUrl)
    }
    const sortedEntries = [...urlMap.entries()].sort((a, b) => b[0].length - a[0].length)

    // ========== Phase 4: Pre-filter + AI Classify + Store ==========
    let sectionCount = 0
    const SKIP_FAMILIES = new Set(['navigation', 'footer'])
    const MIN_TEXT_LENGTH = 30
    const MIN_SECTION_HEIGHT = 60
    const MAX_SECTION_HTML_SIZE = 500_000

    // Pre-filter: remove obvious nav/footer and low-quality via heuristics
    const candidates = sections.filter(section => {
      const raw: RawSection = {
        tagName: section.tagName, outerHTML: section.outerHTML, textContent: section.textContent,
        boundingBox: section.boundingBox, computedStyles: section.computedStyles,
        hasImages: section.features.imageCount > 0, hasCTA: section.features.buttonCount > 0,
        hasForm: section.features.formCount > 0, headingCount: section.features.headingCount,
        linkCount: section.features.linkCount, cardCount: section.features.cardCount,
        childCount: section.features.childCount, classNames: section.classTokens.join(' '),
        id: section.idTokens[0] || ''
      }
      const heuristic = classifySection(raw, section.index, sections.length)
      if (SKIP_FAMILIES.has(heuristic.type)) {
        logger.debug('Section skipped (nav/footer)', { jobId: job.id, sectionIndex: section.index })
        return false
      }
      const isLowQuality = (
        section.textContent.trim().length < MIN_TEXT_LENGTH &&
        section.features.imageCount === 0 && section.features.formCount === 0
      ) || section.boundingBox.height < MIN_SECTION_HEIGHT
      if (isLowQuality && heuristic.confidence < 0.7) {
        logger.debug('Section skipped (low quality)', { jobId: job.id, sectionIndex: section.index })
        return false
      }
      if (section.outerHTML.length > MAX_SECTION_HTML_SIZE) {
        logger.warn('Section skipped (DOM too large)', { jobId: job.id, sectionIndex: section.index })
        return false
      }
      return true
    })

    // AI Classification (batch)
    logger.info('AI classifying sections', { jobId: job.id, count: candidates.length })
    const aiResults = await classifySectionsWithAI(
      candidates.map(s => ({
        index: s.index,
        textContent: s.textContent,
        features: s.features,
        classTokens: s.classTokens,
        tagName: s.tagName,
        boundingBox: s.boundingBox,
        outerHTMLSnippet: s.outerHTML.slice(0, 1500)
      }))
    )

    for (let i = 0; i < candidates.length; i++) {
      const section = candidates[i]
      const aiClass = aiResults[i]

      logger.debug('Processing section', {
        jobId: job.id, sectionIndex: section.index,
        aiType: aiClass.type, aiConfidence: aiClass.confidence, aiQuality: aiClass.quality_score
      })

      // Skip if AI says low quality
      if (aiClass.quality_score < 0.25) {
        logger.debug('Section skipped (AI low quality)', {
          jobId: job.id, sectionIndex: section.index, quality: aiClass.quality_score, reason: aiClass.reason
        })
        continue
      }

      // Skip nav/footer even if AI reclassified
      if (SKIP_FAMILIES.has(aiClass.type)) continue

      const classification = { type: aiClass.type, confidence: aiClass.confidence }
      const reusabilityScore = aiClass.quality_score

      const canonical = canonicalizeSection(section, classification.type)
      const finalPageUrl = page.url()

      // Rewrite URLs in section HTML
      const sectionHtml = rewriteStoredHtml(section.outerHTML, finalPageUrl, dl.pageOrigin, sortedEntries, urlMap)
      // Upload rewritten section HTML
      const rawPath = `${site.id}/${job.id}/raw_${section.index}.html`
      await uploadBuffer(STORAGE_BUCKETS.RAW_HTML, rawPath, sectionHtml, 'text/html')

      const previewHtml = rewriteStoredHtml(section.previewHTML, finalPageUrl, dl.pageOrigin, sortedEntries, urlMap)
      const previewPath = `${site.id}/${job.id}/preview_${section.index}.html`
      await uploadBuffer(STORAGE_BUCKETS.SANITIZED_HTML, previewPath, previewHtml, 'text/html')

      // QA screenshot - non-fatal
      let thumbnailPath: string | undefined
      try {
        const screenshotBuf = await screenshotSection(page, section.boundingBox)
        if (screenshotBuf) {
          thumbnailPath = `${site.id}/${job.id}/section_${section.index}.png`
          await uploadBuffer(STORAGE_BUCKETS.SECTION_THUMBNAILS, thumbnailPath, screenshotBuf, 'image/png')
        }
      } catch (thumbErr: any) {
        logger.warn('Thumbnail failed', { jobId: job.id, sectionIndex: section.index, error: thumbErr.message })
      }

      // Style summary + layout signature
      const styleSummary = extractStyleSummary(section)
      const layoutSig = generateLayoutSignature(section)

      // Store source_section
      const sectionRow = await createSectionRecord({
        page_id: sourcePage.id,
        site_id: site.id,
        order_index: section.index,
        dom_path: section.domPath,
        tag_name: section.tagName,
        bbox_json: section.boundingBox,
        raw_html_storage_path: rawPath,
        sanitized_html_storage_path: previewPath,
        thumbnail_storage_path: thumbnailPath,
        block_family: classification.type,
        block_variant: aiClass.variant || canonical?.variant,
        classifier_type: 'ai',
        classifier_confidence: classification.confidence,
        features_jsonb: {
          ...section.features,
          hasImages: (section.features.imageCount || 0) > 0,
          hasCTA: (section.features.buttonCount || 0) > 0,
          hasForm: (section.features.formCount || 0) > 0,
        },
        text_summary: section.textContent.slice(0, 500),
        layout_signature: layoutSig,
        image_count: section.features.imageCount,
        button_count: section.features.buttonCount,
        repeated_child_pattern: section.features.repeatedChildPattern,
        class_tokens: section.classTokens,
        id_tokens: section.idTokens,
        computed_style_summary: styleSummary,
        quality_score: reusabilityScore,
        // is_sub_component: not yet in Supabase schema
      })

      try {
        const snapshot = await Promise.race([
          parseSectionDOM(page, section, section.index),
          new Promise<never>((_, reject) => setTimeout(() => reject(new Error('DOM snapshot timed out after 30s')), 30000))
        ])
        if (snapshot.resolvedHtml && snapshot.nodes.length > 0) {
          const resolvedHtml = rewriteStoredHtml(snapshot.resolvedHtml, finalPageUrl, dl.pageOrigin, sortedEntries, urlMap)
          const resolvedPath = `${site.id}/${job.id}/resolved_${section.index}.html`
          const domJsonPath = `${site.id}/${job.id}/dom_${section.index}.json`

          await uploadBuffer(STORAGE_BUCKETS.SANITIZED_HTML, resolvedPath, resolvedHtml, 'text/html')
          await uploadBuffer(STORAGE_BUCKETS.SANITIZED_HTML, domJsonPath, JSON.stringify(snapshot.nodes), 'application/json')

          const snapshotRow = await createSnapshotRecord({
            section_id: sectionRow.id,
            snapshot_type: 'resolved',
            html_storage_path: resolvedPath,
            dom_json_path: domJsonPath,
            node_count: snapshot.nodeCount,
            css_strategy: 'resolved_inline'
          })

          const nodeRecords = snapshot.nodes.slice(0, 500).map(node => ({
            snapshot_id: snapshotRow.id,
            stable_key: node.stableKey,
            node_type: node.nodeType,
            tag_name: node.tagName,
            order_index: node.orderIndex,
            text_content: node.textContent,
            attrs_jsonb: node.attrs,
            bbox_json: node.bbox,
            computed_style_jsonb: node.computedStyle,
            editable: node.editable,
            selector_path: node.selectorPath
          }))

          await storeSectionNodes(nodeRecords)
        }
      } catch (snapshotErr: any) {
        logger.warn('DOM snapshot failed', { jobId: job.id, sectionIndex: section.index, error: snapshotErr.message })
      }

      // Store canonical block_instance
      if (canonical) {
        const variantRow = await findVariantRecord(canonical.variant)

        if (variantRow) {
          await createBlockInstanceRecord({
            source_section_id: sectionRow.id,
            block_variant_id: variantRow.id,
            slot_values_jsonb: canonical.slots,
            token_values_jsonb: canonical.tokens,
            quality_score: canonical.qualityScore,
            family_key: canonical.family,
            variant_key: canonical.variant,
            provenance_jsonb: {
              pageId: sourcePage.id,
              sectionId: sectionRow.id,
              sourceUrl: page.url(),
              domPath: section.domPath
            }
          })
        }
      }

      sectionCount++
    }

    // ========== Phase 5: Mark complete ==========
    await setCrawlRunStatus(job.id, {
      status: 'done',
      page_count: 1,
      section_count: sectionCount,
      finished_at: new Date().toISOString()
    })

    await markSiteAnalyzed(site.id)

    logger.info('Job completed', { jobId: job.id, siteId: site.id, url, sectionCount, assetCount: dl.allAssets.length })

  } catch (err: any) {
    const retryCount = Number(job.retry_count) || 0
    if (retryCount < MAX_RETRIES) {
      const nextRetry = retryCount + 1
      const delaySec = RETRY_BASE_DELAY_S * Math.pow(3, retryCount) // 5s, 15s, 45s
      const runAfter = new Date(Date.now() + delaySec * 1000).toISOString()
      logger.warn('Job failed, scheduling retry', { jobId: job.id, attempt: nextRetry, maxRetries: MAX_RETRIES, delaySec, error: err.message })
      await setCrawlRunStatus(job.id, {
        status: 'queued',
        retry_count: nextRetry,
        run_after: runAfter,
        worker_id: null,
        started_at: null,
        error_message: err.message
      })
    } else {
      logger.error('Job permanently failed', { jobId: job.id, retries: MAX_RETRIES, error: err.message })
      await failJob(job.id, 'PROCESSING_ERROR', `Failed after ${MAX_RETRIES} retries: ${err.message}`)
    }
  } finally {
    await browser.close()
  }
}

async function runCleanup() {
  if (HAS_SUPABASE) {
    try {
      const cutoff = new Date(Date.now() - DATA_RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString()

      // Find old crawl_runs
      const { data: oldRuns } = await supabaseAdmin
        .from('crawl_runs')
        .select('id, site_id')
        .lt('queued_at', cutoff)

      if (!oldRuns || oldRuns.length === 0) {
        logger.debug('Supabase cleanup: nothing to remove', { retentionDays: DATA_RETENTION_DAYS })
        return
      }

      const oldRunIds = oldRuns.map((r: any) => r.id)

      // Find pages for old runs
      const { data: oldPages } = await supabaseAdmin
        .from('source_pages')
        .select('id, final_html_path, screenshot_storage_path, css_bundle_path')
        .in('crawl_run_id', oldRunIds)

      const oldPageIds = (oldPages || []).map((p: any) => p.id)

      // Find sections for old pages
      const { data: oldSections } = oldPageIds.length > 0
        ? await supabaseAdmin
            .from('source_sections')
            .select('id, raw_html_storage_path, sanitized_html_storage_path, thumbnail_storage_path')
            .in('page_id', oldPageIds)
        : { data: [] }

      // Delete storage files (best-effort)
      const storagePaths: Array<{ bucket: string; paths: string[] }> = []
      const rawPaths: string[] = []
      const screenshotPaths: string[] = []
      const thumbnailPaths: string[] = []
      const sanitizedPaths: string[] = []

      for (const page of oldPages || []) {
        if (page.final_html_path) rawPaths.push(page.final_html_path)
        if (page.screenshot_storage_path) screenshotPaths.push(page.screenshot_storage_path)
        if (page.css_bundle_path) rawPaths.push(page.css_bundle_path)
      }
      for (const section of oldSections || []) {
        if (section.raw_html_storage_path) rawPaths.push(section.raw_html_storage_path)
        if (section.sanitized_html_storage_path) sanitizedPaths.push(section.sanitized_html_storage_path)
        if (section.thumbnail_storage_path) thumbnailPaths.push(section.thumbnail_storage_path)
      }

      // Batch delete storage files (Supabase supports batch remove)
      if (rawPaths.length > 0) {
        await supabaseAdmin.storage.from(STORAGE_BUCKETS.RAW_HTML).remove(rawPaths).catch(() => {})
      }
      if (screenshotPaths.length > 0) {
        await supabaseAdmin.storage.from(STORAGE_BUCKETS.PAGE_SCREENSHOTS).remove(screenshotPaths).catch(() => {})
      }
      if (thumbnailPaths.length > 0) {
        await supabaseAdmin.storage.from(STORAGE_BUCKETS.SECTION_THUMBNAILS).remove(thumbnailPaths).catch(() => {})
      }
      if (sanitizedPaths.length > 0) {
        await supabaseAdmin.storage.from(STORAGE_BUCKETS.SANITIZED_HTML).remove(sanitizedPaths).catch(() => {})
      }

      // Delete DB records (CASCADE handles related records)
      for (const runId of oldRunIds) {
        await supabaseAdmin.from('crawl_runs').delete().eq('id', runId)
      }

      logger.info('Supabase cleanup completed', {
        retentionDays: DATA_RETENTION_DAYS,
        deletedCrawlRuns: oldRunIds.length,
        deletedPages: oldPageIds.length,
        deletedSections: (oldSections || []).length
      })
    } catch (err: any) {
      logger.error('Supabase cleanup failed', { error: err.message })
    }
    return
  }

  try {
    const result = await cleanupOldData(DATA_RETENTION_DAYS)
    if (result.deletedCrawlRuns > 0) {
      logger.info('Data cleanup completed', { retentionDays: DATA_RETENTION_DAYS, ...result })
    } else {
      logger.debug('Data cleanup: nothing to remove', { retentionDays: DATA_RETENTION_DAYS })
    }
  } catch (err: any) {
    logger.error('Data cleanup failed', { error: err.message })
  }
}

async function pollLoop() {
  logger.info('Worker started', { workerId: WORKER_ID, pollIntervalMs: POLL_INTERVAL })

  // Run cleanup once at startup
  await runCleanup()

  // Schedule periodic cleanup every 24 hours
  const cleanupTimer = setInterval(runCleanup, CLEANUP_INTERVAL_MS)

  while (!shuttingDown) {
    try {
      const job = await claimJob()
      if (job) await processJob(job)
    } catch (err: any) {
      logger.error('Poll error', { workerId: WORKER_ID, error: err.message })
    }
    if (shuttingDown) break
    await new Promise(r => setTimeout(r, POLL_INTERVAL))
  }

  clearInterval(cleanupTimer)
  logger.info('Worker shut down gracefully', { workerId: WORKER_ID })
  process.exit(0)
}

pollLoop()
