/** 常用示例词，便于快速体验 */
export const PRESET_TEXTS = [
  '永',
  '汉字',
  '笔顺',
  '中国',
  '学习',
  '春天',
  '明月',
  '山水',
  '读书',
  '天地人',
  '一二三四五',
  '上下左右',
] as const

/** 提取字符串中的汉字（CJK 统一汉字） */
export function extractHanzi(text: string): string[] {
  return Array.from(text).filter((ch) => /[\u4e00-\u9fff]/.test(ch))
}
