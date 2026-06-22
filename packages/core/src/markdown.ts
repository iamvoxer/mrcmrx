/** Escape HTML (required before rendering chat Markdown). */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const CODE_PLACEHOLDER = '\x00CB';

/** Basic chat-bubble Markdown: code blocks, inline code, bold, lists, paragraphs. */
export function renderChatMarkdown(source: string): string {
  if (!source.trim()) return '';

  const codeBlocks: string[] = [];
  let text = source.replace(/```([\w-]*)\r?\n([\s\S]*?)```/g, (_m, lang: string, code: string) => {
    const idx = codeBlocks.length;
    const langClass = lang.trim() ? ` language-${escapeHtml(lang.trim())}` : '';
    const body = escapeHtml(code.replace(/\r?\n$/, ''));
    codeBlocks.push(`<pre class="md-pre"><code class="md-code${langClass}">${body}</code></pre>`);
    return `${CODE_PLACEHOLDER}${idx}${CODE_PLACEHOLDER}`;
  });

  text = escapeHtml(text);

  function inline(s: string): string {
    return s
      .replace(/`([^`\n]+)`/g, '<code class="md-inline-code">$1</code>')
      .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
  }

  text = text.replace(
    new RegExp(`${CODE_PLACEHOLDER}(\\d+)${CODE_PLACEHOLDER}`, 'g'),
    (_m, i) => codeBlocks[Number(i)] ?? '',
  );

  return text
    .split(/\n{2,}/)
    .map((block) => {
      const trimmed = block.trim();
      if (!trimmed) return '';
      if (trimmed.startsWith('<pre class="md-pre">')) return trimmed;
      const lines = trimmed.split('\n');
      if (lines.length > 0 && lines.every((l) => /^- /.test(l))) {
        return `<ul class="md-list">${lines.map((l) => `<li>${inline(l.slice(2))}</li>`).join('')}</ul>`;
      }
      return `<p>${lines.map((l) => inline(l)).join('<br>')}</p>`;
    })
    .filter(Boolean)
    .join('');
}
