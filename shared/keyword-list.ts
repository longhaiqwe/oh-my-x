/**
 * 解析用户填写的关键词列表：按换行、英文逗号、中文逗号分隔，去掉首尾空白和空项
 */
export function parseKeywordList(raw: string | undefined | null): string[] {
  if (!raw) return []
  return raw
    .split(/[\n,，]/)
    .map((s) => s.trim())
    .filter(Boolean)
}
