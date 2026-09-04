// window.lucide (vendor/lucide.js UMD 빌드)에서 아이콘 SVG 문자열을 가져오는 헬퍼.
// lucide.createElement는 실제 SVG DOM 엘리먼트를 반환하므로 outerHTML로 문자열화한다.
export function icon(name, size = 16) {
  const def = window.lucide?.icons?.[name]
  if (!def) return ''
  const el = window.lucide.createElement(def, { width: size, height: size, class: 'lucide-icon' })
  return el.outerHTML
}
