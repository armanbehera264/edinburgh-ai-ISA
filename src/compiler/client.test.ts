import { afterEach, describe, expect, it, vi } from 'vitest';
import { compile, type CompileRun } from './client.js';

afterEach(() => vi.unstubAllGlobals());

function fakeServer(replies: string[]) {
  const bodies: { messages: { role: string; content: string }[] }[] = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: { body: string }) => {
    if (url === '/api/cache') return new Response('{"ok":true}');
    bodies.push(JSON.parse(init.body));
    return new Response(JSON.stringify({ text: replies[bodies.length - 1] }), { status: 200 });
  }));
  return bodies;
}

describe('compile loop', () => {
  it('feeds a failed check back to Claude and accepts the fixed program', async () => {
    const bodies = fakeServer([
      '```asm\nADD r3, r1\nADD r3, r2\n```',               // wrong: forgot the *2
      '```asm\nADD r3, r1\nADD r3, r1\nADD r3, r2\n```',   // right
    ]);
    const snapshots: CompileRun[] = [];
    const run = await compile('z = x*2 + y', { preferCache: false }, (r) => snapshots.push(r));

    expect(run.result?.ok).toBe(true);
    expect(run.attempts.map((a) => a.status)).toEqual(['failed', 'passed']);
    // The second request carries Claude's first answer and the concrete failure.
    expect(bodies[1].messages).toHaveLength(3);
    expect(bodies[1].messages[2].content).toMatch(/should be z=/);
    expect(snapshots.some((s) => s.attempts[0]?.status === 'asking')).toBe(true);
  });

  it('gives up after three failed attempts and never accepts unverified code', async () => {
    fakeServer(['MOV r3, r1', 'MOV r3, r1', 'MOV r3, r1']);
    const run = await compile('x + y', { preferCache: false }, () => {});
    expect(run.attempts).toHaveLength(3);
    expect(run.result).toBeNull();
  });

  it('reports a server error without crashing', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: 'No ANTHROPIC_API_KEY' }), { status: 503 })));
    const run = await compile('x + y', { preferCache: false }, () => {});
    expect(run.attempts[0].status).toBe('error');
    expect(run.attempts[0].error).toMatch(/ANTHROPIC_API_KEY/);
  });
});
