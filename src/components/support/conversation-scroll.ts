export function conversationScrollChange(before: string[], after: string[]): 'prepend' | 'append' | 'same' | 'replace' {
  if (before.length === after.length && before.every((id, index) => id === after[index])) return 'same';
  if (!before.length) return after.length ? 'append' : 'same';
  const start = after.indexOf(before[0]);
  if (start > 0 && before.every((id, index) => after[start + index] === id)) return 'prepend';
  if (start === 0 && before.every((id, index) => after[index] === id) && after.length > before.length) return 'append';
  return 'replace';
}

export function preservedConversationTop(top: number, addedBefore: number): number {
  return Math.max(0, top + addedBefore);
}
