/**
 * Unified-diff patches without git (Git is optional on Windows, and a fresh Mac may not have it).
 * Reads the multi-file format `git diff` writes, so existing fixes/<n>.patch files keep working.
 *
 *   const plan = planPatch(text, root, { reverse })   → { ok, writes: [{ path, content | null }], error }
 *   commit(plan)                                       → writes / deletes the files
 *   makePatch(baseDir, curDir, prefix)                 → patch text from two folders (text files only)
 */
import { parsePatch, applyPatch, reversePatch, createTwoFilesPatch } from 'diff';
import { existsSync, readFileSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { walk } from './common.mjs';

const strip = (name) => (name === '/dev/null' ? null : name.replace(/^[ab]\//, '').split('\t')[0]);

export function planPatch(text, root, { reverse = false } = {}) {
  if (/^GIT binary patch/m.test(text)) return { ok: false, writes: [], error: 'binary changes are not supported' };
  const writes = [];
  for (let p of parsePatch(text)) {
    if (!p.hunks.length && !p.oldFileName) continue;
    if (reverse) p = reversePatch(p);
    const from = strip(p.oldFileName), to = strip(p.newFileName), path = to ?? from;
    if (!path) continue;
    const file = join(root, from ?? path);
    if (from && !existsSync(file)) return { ok: false, writes, error: `${from}: file not found` };
    if (!from && existsSync(join(root, path))) return { ok: false, writes, error: `${path}: already exists` };
    const raw = from ? readFileSync(file, 'utf8') : '';
    let out = applyPatch(raw, p, { autoConvertLineEndings: true });   // keeps each line's ending, byte for byte
    // mixed endings (one LF line a tool added to a CRLF file, common on Windows) make autoConvertLineEndings give up:
    // only then, retry on LF text and give the result the file's dominant ending
    if (out === false && raw.includes('\r\n')) {
      const crlf = (raw.match(/\r\n/g) ?? []).length > (raw.match(/(?<!\r)\n/g) ?? []).length;
      out = applyPatch(raw.replace(/\r\n/g, '\n'), p, { autoConvertLineEndings: true });
      if (out !== false && crlf) out = out.replace(/\n/g, '\r\n');
    }
    if (out === false) return { ok: false, writes, error: `${path}: hunks don't match the current file` };
    writes.push({ path: join(root, path), content: to ? out : null });
  }
  return { ok: writes.length > 0, writes, error: writes.length ? '' : 'empty patch' };
}

export function commit(plan) {
  for (const w of plan.writes) {
    if (w.content === null) rmSync(w.path, { force: true });
    else { mkdirSync(dirname(w.path), { recursive: true }); writeFileSync(w.path, w.content); }
  }
}

const isBinary = (buf) => buf.subarray(0, 8000).includes(0);
/** patch text turning baseDir into curDir, with paths written as `${prefix}/<file>` (a/ and b/ like git) */
export function makePatch(baseDir, curDir, prefix) {
  const files = new Set([...walk(baseDir).map((f) => relative(baseDir, f)), ...walk(curDir).map((f) => relative(curDir, f))]);
  const parts = [], skipped = [];
  for (const rel of [...files].sort()) {
    const a = join(baseDir, rel), b = join(curDir, rel);
    const A = existsSync(a) ? readFileSync(a) : null, B = existsSync(b) ? readFileSync(b) : null;
    if (A && B && A.equals(B)) continue;
    if ((A && isBinary(A)) || (B && isBinary(B))) { skipped.push(rel); continue; }
    const name = `${prefix}/${rel.split('\\').join('/')}`;
    parts.push(createTwoFilesPatch(A ? `a/${name}` : '/dev/null', B ? `b/${name}` : '/dev/null', A?.toString('utf8') ?? '', B?.toString('utf8') ?? '', '', '', { context: 3 }));
  }
  return { text: parts.join(''), skipped };
}
