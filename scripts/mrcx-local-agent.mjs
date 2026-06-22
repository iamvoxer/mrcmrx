#!/usr/bin/env node
/**
 * Local command adapter for mrcx — mirrors MockX/MockC outputs for end-to-end
 * integration testing without Cursor/Codex.
 *
 * Usage (invoked by CommandAgentAdapter):
 *   node scripts/mrcx-local-agent.mjs --mrcx-action X_ANALYZE --mrcx-prompt-file ...
 *
 * Debug env:
 *   MRCX_LOCAL_AGENT_FAIL=1  — exit 1 (test failure/retry)
 *   MRCX_LOCAL_AGENT_VERBOSE=1 — log parsed args to stderr
 */
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

function parseArgs(argv) {
  const opts = {};
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--mrcx-prompt-file') opts.promptFile = argv[++i];
    else if (a === '--mrcx-action') opts.action = argv[++i];
    else if (a === '--mrcx-task') opts.task = argv[++i];
    else if (a === '--mrcx-mode') opts.mode = argv[++i];
    else if (a === '--mrcx-room') opts.room = argv[++i];
  }
  return opts;
}

function readPrompt(promptFile) {
  if (!promptFile) return '';
  return fs.readFileSync(path.resolve(promptFile), 'utf8');
}

function listWorkspaceChangedFiles() {
  try {
    const tracked = execSync('git diff --name-only HEAD', {
      cwd: process.cwd(),
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    const untracked = execSync('git ls-files --others --exclude-standard', {
      cwd: process.cwd(),
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return [...tracked.split('\n'), ...untracked.split('\n')]
      .map((line) => line.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

function formatFilesChangedSection(files) {
  if (files.length === 0) {
    return '- (no changed files in git workspace relative to HEAD; may only have uncommitted markers)';
  }
  return files.map((f) => `- ${f}`).join('\n');
}

function extractBatchFocus(prompt) {
  const guidance = prompt.match(/X先生给出的实现指导：\n([\s\S]*?)\n\n要求：/);
  const firstLine = guidance?.[1]?.split('\n').find((l) => l.trim())?.trim();
  return firstLine ?? 'Complete this batch per Mr. X guidance';
}

function extractApprovedItems(prompt) {
  const match = prompt.match(/用户采纳的建议：\n([\s\S]*?)\n\n用户明确不采纳/);
  return match?.[1]?.trim() ?? '';
}

function maybeTouchWorkspace(action, mode) {
  if (mode !== 'workspace_write') return;
  if (action !== 'C_IMPLEMENT' && action !== 'C_FIX') return;
  const marker = path.join(process.cwd(), '.mrcx-local-agent-work.log');
  const line = `${new Date().toISOString()} ${action}\n`;
  fs.appendFileSync(marker, line, 'utf8');
}

function xAnalyze(task) {
  return `## Requirements Understanding
User wants to complete: ${task}

## Implementation Strategy
1. Map existing module boundaries first
2. Implement the core path in small steps
3. Add necessary tests

## Files/Modules to Watch
- src/ main logic directory
- Related test files

## Scenarios That Must Be Tested
- Main happy path
- Key edge cases

## Risks
- Scope creep
- Inconsistency with existing design

## Things to Avoid
- Unrelated refactors
- Premature abstraction

## Instructions for Mr. C
Implement in small steps per the strategy above; report file list and test results when done.`;
}

function cDiscuss() {
  return `## Feasibility Assessment
Mr. X's plan is feasible; no major architecture changes needed.

## Project Structure Observations
Standard monorepo layout; extend under packages/.

## Suggested Implementation Path
Follow Mr. X's instructions in small steps; get the main path working first.

## Questions for User
- None

## Brief Recommendation for User
Approve to begin implementation.`;
}

function formatTestsRunSection() {
  return `## Tests Run
- Not executed by local agent; rely on external \`npm run test\` results`;
}

function extractRoomId(prompt) {
  const m = prompt.match(/^room_id: (.+)$/m);
  return m?.[1]?.trim();
}

function loadRoomScopeOverrideFromDisk(prompt) {
  const roomId = extractRoomId(prompt);
  if (!roomId) return null;
  const overridePath = path.join(process.cwd(), '.mrcx', 'rooms', roomId, 'scope-override.md');
  try {
    const text = fs.readFileSync(overridePath, 'utf8').trim();
    return text || null;
  } catch {
    return null;
  }
}

function formatDifferencesFromGuidance(prompt) {
  const roomOverride = loadRoomScopeOverrideFromDisk(prompt);
  const promptOverride = prompt.match(/### 本房间人工 scope 裁定\n([\s\S]*?)(?=\n## |$)/);
  const hasScopeOverride = /## Scope Override/.test(prompt) || roomOverride || promptOverride;

  if (!hasScopeOverride) {
    return `## Differences from Mr. X Guidance
- None (prompt has no Scope Override; if X_ANALYZE disagrees with manual scope, declare with mrcx scope set)`;
  }

  const lines = [
    '## Differences from Mr. X Guidance',
    '- Difference: this batch Scope Override / manual scope ruling **takes priority over** X_ANALYZE guidance.',
  ];

  const body = roomOverride ?? promptOverride?.[1]?.trim();
  if (body) {
    for (const line of body.split('\n')) {
      const trimmed = line.trim();
      if (trimmed) {
        lines.push(`  ${trimmed.startsWith('-') ? trimmed : `- ${trimmed}`}`);
      }
    }
  } else {
    lines.push('- See prompt "Scope Override" block; out-of-scope items per room scope-override.md.');
  }

  return lines.join('\n');
}

function cImplement(task, prompt) {
  const files = listWorkspaceChangedFiles();
  const focus = extractBatchFocus(prompt);
  return `## Summary
Completed this batch for task "${task}". Focus: ${focus}

## Files Changed
${formatFilesChangedSection(files)}

## Design / Docs Changes
- None (code-focused batch)

## Code Changes
- ${focus}
- Files changed: ${files.length}

${formatTestsRunSection()}

## Known Risks
- Real commercial CLI not wired yet

${formatDifferencesFromGuidance(prompt)}

## Suggested Next Step
Run mrcx diff refresh (if status shows stale), then have Mr. X review this batch diff.`;
}

function xReview(task) {
  return `## Overall Judgment
Mr. C's local-agent implementation largely satisfies task "${task}"; ready for fix phase.

## Must Fix
- [MF-1] Add edge-case tests

## Should Fix
- [SF-1] Improve error message copy

## Nice to Have
- [NH-1] Add more comments

## Questions for Mr. C
- None

## Questions for User
- None

## Suggested Next Instruction for Mr. C
Address Must Fix items and report again.`;
}

function cFix(approved) {
  const files = listWorkspaceChangedFiles();
  return `## Fixed Items
${approved || '- [MF-1] Add edge-case tests'}

## Files Changed
${formatFilesChangedSection(files)}

${formatTestsRunSection()}

## Remaining Risks
- None

## Suggested Next Step
Have Mr. X do final check (review this batch diff only).`;
}

function xFinalCheck(task) {
  return `## Final Judgment
Can close out. Task "${task}" local-agent loop complete.

## Blocking Issues
- None

## Non-blocking Notes
- Later swap wrapper internals for Codex/Cursor

## Suggested Commit Message
feat: ${task}

## Release Notes / Summary
Command adapter local script trial wired.`;
}

function render(action, task, prompt, mode) {
  switch (action) {
    case 'X_ANALYZE':
      return xAnalyze(task);
    case 'C_DISCUSS':
      return cDiscuss();
    case 'C_IMPLEMENT':
      maybeTouchWorkspace(action, mode);
      return cImplement(task, prompt);
    case 'X_REVIEW':
      return xReview(task);
    case 'C_FIX':
      maybeTouchWorkspace(action, mode);
      return cFix(extractApprovedItems(prompt));
    case 'C_EXPLAIN':
      return '## Explanation\nCurrent design follows minimal-change principle; prioritize task goals.';
    case 'X_FINAL_OPINION':
      return '## Final Opinion\nAccept Mr. C\'s explanation; proceed with minimal fix.';
    case 'X_FINAL_CHECK':
      return xFinalCheck(task);
    default:
      process.stderr.write(`[mrcx-local-agent] unsupported action: ${action}\n`);
      process.exit(1);
  }
}

const opts = parseArgs(process.argv);
const prompt = readPrompt(opts.promptFile);
const task = opts.task ?? '';
const action = opts.action ?? '';

if (process.env.MRCX_LOCAL_AGENT_VERBOSE === '1') {
  process.stderr.write(
    `[mrcx-local-agent] action=${action} room=${opts.room} mode=${opts.mode} cwd=${process.cwd()}\n`,
  );
}

if (process.env.MRCX_LOCAL_AGENT_FAIL === '1') {
  process.stderr.write('[mrcx-local-agent] simulated failure (MRCX_LOCAL_AGENT_FAIL=1)\n');
  process.exit(1);
}

const body = render(action, task, prompt, opts.mode ?? 'read_only');
process.stdout.write(body);
process.stderr.write(`[mrcx-local-agent] ok action=${action}\n`);
process.exit(0);
