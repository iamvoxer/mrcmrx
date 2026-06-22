import assert from 'node:assert/strict';
import { test } from 'node:test';
import { escapeHtml, renderChatMarkdown } from './markdown.js';

test('escapeHtml neutralizes tags', () => {
  assert.equal(escapeHtml('<script>alert(1)</script>'), '&lt;script&gt;alert(1)&lt;/script&gt;');
});

test('renderChatMarkdown renders fenced code block', () => {
  const html = renderChatMarkdown('```text\nhello\nworld\n```');
  assert.match(html, /<pre class="md-pre"><code class="md-code language-text">hello\nworld<\/code><\/pre>/);
});

test('renderChatMarkdown renders inline code and bold', () => {
  const html = renderChatMarkdown('use `rg` and **bold**');
  assert.match(html, /<code class="md-inline-code">rg<\/code>/);
  assert.match(html, /<strong>bold<\/strong>/);
});

test('renderChatMarkdown renders list', () => {
  const html = renderChatMarkdown('- one\n- two');
  assert.match(html, /<ul class="md-list"><li>one<\/li><li>two<\/li><\/ul>/);
});

test('renderChatMarkdown does not pass through raw html', () => {
  const html = renderChatMarkdown('<img onerror=alert(1)>');
  assert.ok(!html.includes('<img'));
  assert.ok(html.includes('&lt;img'));
});
