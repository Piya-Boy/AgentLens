export const MAX_LOG_LINE_LENGTH = 500;

function isUnsafeCodePoint(codePoint: number): boolean {
  return (
    codePoint <= 0x1f ||
    (codePoint >= 0x7f && codePoint <= 0x9f) ||
    codePoint === 0x2028 ||
    codePoint === 0x2029 ||
    (codePoint >= 0x202a && codePoint <= 0x202e) ||
    (codePoint >= 0x2066 && codePoint <= 0x2069)
  );
}

/**
 * Makes text that came from outside safe for a one-line log entry: line breaks, other control
 * characters and text-direction overrides are shown as escapes so they cannot forge or hide
 * entries, and a very long value is cut.
 */
export function safeLogText(text: string): string {
  let result = "";
  for (const character of text) {
    const codePoint = character.codePointAt(0) ?? 0;
    result += isUnsafeCodePoint(codePoint) ? `\\u{${codePoint.toString(16)}}` : character;
  }
  if (result.length > MAX_LOG_LINE_LENGTH) {
    return `${result.slice(0, MAX_LOG_LINE_LENGTH)}... (${String(result.length - MAX_LOG_LINE_LENGTH)} more characters)`;
  }
  return result;
}
