import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Message } from '../types.js';
import { xForwardBlock } from './chat-service.js';

test('xForwardBlock uses content only, not displayContent', () => {
  const msgs: Message[] = [
    {
      id: 'msg-1',
      roomId: 'room-1',
      stageId: 'stage-1',
      speaker: 'x',
      content: '请按此方案实现网关层。',
      displayContent: 'Reconnecting... 2/5\n\n▶ Get-Content ref.md\n\n请按此方案实现网关层。',
      createdAt: '2026-01-01T00:00:00.000Z',
    },
  ];
  const block = xForwardBlock(msgs);
  assert.ok(block.includes('请按此方案实现网关层。'));
  assert.ok(!block.includes('Reconnecting'));
  assert.ok(!block.includes('Get-Content'));
  assert.ok(!block.includes('▶'));
});

test('xForwardBlock joins multiple X messages by content', () => {
  const msgs: Message[] = [
    {
      id: 'msg-1',
      roomId: 'room-1',
      stageId: 'stage-1',
      speaker: 'x',
      content: '第一段结论',
      displayContent: 'status noise\n\n第一段结论',
      createdAt: '2026-01-01T00:00:00.000Z',
    },
    {
      id: 'msg-2',
      roomId: 'room-1',
      stageId: 'stage-1',
      speaker: 'x',
      content: '第二段结论',
      createdAt: '2026-01-01T00:00:01.000Z',
    },
  ];
  const block = xForwardBlock(msgs);
  assert.equal(block, '第一段结论\n\n---\n\n第二段结论');
});
