export function isBlankSelfQuestionImportRow(item: unknown): boolean {
  if (!item || typeof item !== 'object') return true;
  return Object.entries(item).every(([key, value]) => {
    const normalizedKey = key.replace(/^\uFEFF/, '').trim().toLowerCase();
    if (['__row', 'row', '题目状态', 'question_status'].includes(normalizedKey)) return true;
    return value === undefined || value === null || String(value).trim() === '';
  });
}
