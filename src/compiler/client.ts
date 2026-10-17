/** The compile → verify → retry loop, run in the browser so every attempt
 * can be shown live. The Claude call itself goes through the dev server. */

import cache from './cache.json';
import { parseExpression, type ParsedExpr } from './expr.js';
import { verifyProgram, type Verification } from './verify.js';
import { MAX_ATTEMPTS, compileRequest, retryRequest, extractAssembly } from './prompt.js';

export interface Attempt {
  n: number;
  status: 'asking' | 'checking' | 'passed' | 'failed' | 'error';
  asm?: string;
  verification?: Verification;
  error?: string;
}

export interface CompileRun {
  expr: ParsedExpr;
  source: 'claude' | 'cache';
  attempts: Attempt[];
  done: boolean;
  result: Verification | null;
}

type CacheEntry = { asm: string; attempts: number; model: string; verifiedAt: string };
const CACHE = cache as Record<string, CacheEntry>;

type Message = { role: 'user' | 'assistant'; content: string };

export function cachedExpressions(): string[] {
  return Object.keys(CACHE);
}

/** Runs the whole loop, calling `update` with a fresh snapshot after every change. */
export async function compile(
  input: string,
  opts: { preferCache: boolean },
  update: (run: CompileRun) => void,
): Promise<CompileRun> {
  const expr = parseExpression(input); // throws a friendly error for bad input
  const run: CompileRun = { expr, source: 'claude', attempts: [], done: false, result: null };
  const emit = () => update({ ...run, attempts: run.attempts.map((a) => ({ ...a })) });

  const hit = CACHE[expr.text];
  if (opts.preferCache && hit) {
    run.source = 'cache';
    const v = verifyProgram(hit.asm, expr); // cached code is re-verified, never trusted blindly
    run.attempts.push({ n: hit.attempts, status: v.ok ? 'passed' : 'failed', asm: hit.asm, verification: v });
    run.done = true;
    run.result = v.ok ? v : null;
    emit();
    return run;
  }

  const messages: Message[] = [{ role: 'user', content: compileRequest(expr.text) }];

  for (let n = 1; n <= MAX_ATTEMPTS; n++) {
    const attempt: Attempt = { n, status: 'asking' };
    run.attempts.push(attempt);
    emit();

    let reply: string;
    try {
      const res = await fetch('/api/compile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? `Server error ${res.status}`);
      reply = body.text as string;
    } catch (err) {
      attempt.status = 'error';
      attempt.error = err instanceof Error ? err.message : String(err);
      run.done = true;
      emit();
      return run;
    }

    attempt.asm = extractAssembly(reply);
    attempt.status = 'checking';
    emit();

    const v = verifyProgram(attempt.asm, expr);
    attempt.verification = v;
    attempt.status = v.ok ? 'passed' : 'failed';

    if (v.ok) {
      run.done = true;
      run.result = v;
      emit();
      // Best effort: remember good programs so the live demo doesn't need the API.
      fetch('/api/cache', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ expression: expr.text, asm: attempt.asm, attempts: n }),
      }).catch(() => {});
      return run;
    }

    emit();
    messages.push({ role: 'assistant', content: reply });
    messages.push({ role: 'user', content: retryRequest(v.feedback ?? 'Verification failed.') });
  }

  run.done = true;
  emit();
  return run;
}
