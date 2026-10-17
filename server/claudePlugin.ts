/** Dev/preview server routes. The API key is read here, server-side, and never
 * reaches the browser.
 *
 *   POST /api/compile  { messages }        → { text }   one Claude call
 *   POST /api/cache    { expression, asm } → { ok }     save a verified result
 */

import fs from 'node:fs';
import path from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin, Connect } from 'vite';
import Anthropic from '@anthropic-ai/sdk';
import { MODEL, SYSTEM_PROMPT } from '../src/compiler/prompt.js';
import { parseExpression } from '../src/compiler/expr.js';
import { verifyProgram } from '../src/compiler/verify.js';

const CACHE_FILE = path.resolve('src/compiler/cache.json');

function readBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => { data += chunk; });
    req.on('end', () => {
      try { resolve(JSON.parse(data || '{}')); } catch (e) { reject(e); }
    });
    req.on('error', reject);
  });
}

function send(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
}

function routes(apiKey: string | undefined): Connect.NextHandleFunction {
  const client = apiKey ? new Anthropic({ apiKey }) : null;

  return async (req, res, next) => {
    if (req.method !== 'POST' || !req.url?.startsWith('/api/')) return next();

    try {
      if (req.url === '/api/compile') {
        if (!client) {
          return send(res, 503, { error: 'No ANTHROPIC_API_KEY on the server. Add it to .env.local and restart.' });
        }
        const { messages } = (await readBody(req)) as { messages: Anthropic.MessageParam[] };
        if (!Array.isArray(messages) || messages.length === 0 || messages.length > 7) {
          return send(res, 400, { error: 'Bad request' });
        }
        const response = await client.beta.messages.create({
          model: MODEL,
          max_tokens: 16000,
          output_config: { effort: 'medium' },
          betas: ['server-side-fallback-2026-07-01'],
          fallbacks: 'default',
          system: SYSTEM_PROMPT,
          messages,
        } as Parameters<typeof client.beta.messages.create>[0]) as Anthropic.Beta.BetaMessage;

        if (response.stop_reason === 'refusal') {
          return send(res, 502, { error: 'Claude declined this request.' });
        }
        const text = response.content
          .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text')
          .map((b) => b.text)
          .join('\n');
        return send(res, 200, { text, model: response.model });
      }

      if (req.url === '/api/cache') {
        const { expression, asm, attempts } = (await readBody(req)) as { expression: string; asm: string; attempts: number };
        // Never trust the client: re-verify before anything is written.
        const expr = parseExpression(expression);
        if (!verifyProgram(asm, expr).ok) return send(res, 400, { error: 'Program does not verify' });
        const cache = fs.existsSync(CACHE_FILE) ? JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8')) : {};
        cache[expr.text] = { asm, attempts, model: MODEL, verifiedAt: new Date().toISOString() };
        fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2) + '\n');
        return send(res, 200, { ok: true });
      }

      return next();
    } catch (err) {
      if (err instanceof Anthropic.AuthenticationError) return send(res, 401, { error: 'The server API key was rejected.' });
      if (err instanceof Anthropic.RateLimitError) return send(res, 429, { error: 'Rate limited. Try again in a moment.' });
      if (err instanceof Anthropic.APIError) return send(res, 502, { error: `Claude API error ${err.status ?? ''}`.trim() });
      if (err instanceof Anthropic.APIConnectionError) return send(res, 502, { error: 'Could not reach the Claude API.' });
      return send(res, 500, { error: err instanceof Error ? err.message : 'Server error' });
    }
  };
}

export function claudePlugin(apiKey: string | undefined): Plugin {
  return {
    name: 'no-delete-claude',
    configureServer(server) { server.middlewares.use(routes(apiKey)); },
    configurePreviewServer(server) { server.middlewares.use(routes(apiKey)); },
  };
}
