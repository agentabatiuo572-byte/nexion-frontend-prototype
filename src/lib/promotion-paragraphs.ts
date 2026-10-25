/** Remove repeated published paragraphs without paraphrasing financial terms. */
export function uniquePromotionParagraphs(value: string, alreadyShown: readonly string[] = []): string {
  const paragraphs = (text: string) => text.split(/\n+/).map(row => row.trim()).filter(Boolean);
  const key = (text: string) => text.replace(/\s+/g, ' ').trim();
  const seen = new Set(alreadyShown.flatMap(paragraphs).map(key));
  return paragraphs(value).filter(row => {
    const normalized = key(row);
    if (seen.has(normalized)) return false;
    seen.add(normalized);
    return true;
  }).join('\n\n');
}
