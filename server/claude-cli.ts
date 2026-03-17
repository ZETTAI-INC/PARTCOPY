/**
 * Claude Code CLI wrapper.
 * Calls `claude --print` subprocess instead of Anthropic API.
 * Uses the user's Claude Code subscription — no API key / token cost.
 */
import { execFile } from 'node:child_process'
import { logger } from './logger.js'

interface ClaudeCliOptions {
  /** Timeout in ms (default 120_000 = 2 min) */
  timeout?: number
  /** System prompt */
  systemPrompt?: string
  /** Model hint — ignored by CLI (uses subscription model), kept for documentation */
  model?: string
}

/**
 * Run a prompt through Claude Code CLI (`claude --print`).
 * Returns the raw text response.
 */
export function claudeGenerate(
  prompt: string,
  options: ClaudeCliOptions = {}
): Promise<string> {
  const timeout = options.timeout ?? 120_000

  return new Promise((resolve, reject) => {
    const args = ['--print']

    // Add system prompt if provided
    if (options.systemPrompt) {
      args.push('--system-prompt', options.systemPrompt)
    }

    // Prompt goes via stdin to avoid shell escaping issues
    args.push('--output-format', 'text')

    logger.info('Claude CLI: invoking', {
      promptLength: prompt.length,
      timeout,
      hasSystemPrompt: !!options.systemPrompt
    })

    const startTime = Date.now()

    const child = execFile('claude', args, {
      timeout,
      maxBuffer: 10 * 1024 * 1024, // 10MB
      env: { ...process.env }
    }, (error, stdout, stderr) => {
      const elapsed = Date.now() - startTime

      if (error) {
        logger.error('Claude CLI: failed', { error: error.message, elapsed, stderr })
        if ((error as any).killed || error.message.includes('TIMEOUT')) {
          reject(new Error(`Claude CLI timed out after ${timeout}ms`))
        } else {
          reject(new Error(`Claude CLI error: ${error.message}`))
        }
        return
      }

      const result = stdout.trim()
      logger.info('Claude CLI: response received', {
        outputLength: result.length,
        elapsed
      })

      if (!result) {
        reject(new Error('Claude CLI returned empty response'))
        return
      }

      resolve(result)
    })

    // Send prompt via stdin
    if (child.stdin) {
      child.stdin.write(prompt)
      child.stdin.end()
    }
  })
}

/**
 * Run a prompt and parse the response as JSON.
 * Extracts JSON from markdown fences if present.
 */
export async function claudeGenerateJSON<T = unknown>(
  prompt: string,
  options: ClaudeCliOptions = {}
): Promise<T> {
  const text = await claudeGenerate(prompt, options)

  // Try to extract JSON from markdown fences
  const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/)
  const jsonStr = jsonMatch ? jsonMatch[1] : text

  // Try to find JSON array or object
  const arrayMatch = jsonStr.match(/(\[[\s\S]*\])/)
  const objectMatch = jsonStr.match(/(\{[\s\S]*\})/)
  const raw = arrayMatch ? arrayMatch[1] : objectMatch ? objectMatch[1] : jsonStr

  return JSON.parse(raw.trim()) as T
}
