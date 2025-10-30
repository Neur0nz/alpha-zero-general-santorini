const EVENT_HANDLER_PATTERN = /\son[a-z]+\s*=\s*("[^"]*"|'[^']*')/gi;
const SCRIPT_TAG_PATTERN = /<script[\s\S]*?>[\s\S]*?<\/script>/gi;
const FOREIGN_OBJECT_PATTERN = /<foreignObject[\s\S]*?>[\s\S]*?<\/foreignObject>/gi;
const JAVASCRIPT_HREF_PATTERN = /(xlink:)?href\s*=\s*("javascript:[^"]*"|'javascript:[^']*')/gi;

export function sanitizeSvgMarkup(svg: string): string {
  if (typeof svg !== 'string') {
    return '';
  }

  let sanitized = svg.trim();
  if (!sanitized) {
    return '';
  }

  sanitized = sanitized
    .replace(SCRIPT_TAG_PATTERN, '')
    .replace(FOREIGN_OBJECT_PATTERN, '')
    .replace(EVENT_HANDLER_PATTERN, '')
    .replace(JAVASCRIPT_HREF_PATTERN, '');

  if (typeof window !== 'undefined' && typeof window.DOMParser !== 'undefined' && typeof XMLSerializer !== 'undefined') {
    try {
      const parser = new window.DOMParser();
      const doc = parser.parseFromString(sanitized, 'image/svg+xml');
      const parseError = doc.getElementsByTagName('parsererror')[0];
      if (parseError) {
        return '';
      }
      const disallowedNodes = doc.querySelectorAll('script, foreignObject');
      disallowedNodes.forEach((node) => node.parentNode?.removeChild(node));
      const serializer = new XMLSerializer();
      const serialized = serializer.serializeToString(doc.documentElement);
      return serialized || '';
    } catch (error) {
      console.error('Failed to sanitize SVG markup using DOMParser:', error);
    }
  }

  return sanitized;
}
