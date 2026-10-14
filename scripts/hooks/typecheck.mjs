#!/usr/bin/env node
// Claude Code PostToolUse hook: after an edit to a .ts file, type-check the project.
// Exit 2 + stderr feeds the errors straight back to Claude so it fixes them immediately.
// Pure Node (no jq/bash) so it works on macOS, Linux and Windows.
import { typecheck } from '../lib/common.mjs';

let raw = '';
for await (const chunk of process.stdin) raw += chunk;
let file = '';
try { const j = JSON.parse(raw || '{}'); file = j.tool_input?.file_path ?? j.tool_response?.filePath ?? ''; } catch {}
if (!file.endsWith('.ts')) process.exit(0);

const errors = typecheck();   // null = TypeScript not installed yet → don't block
if (errors?.length) {
  process.stderr.write(`TypeScript errors after editing ${file} (fix before continuing):\n${errors.slice(0, 25).join('\n')}\n`);
  process.exit(2);
}
