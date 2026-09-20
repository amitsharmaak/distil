/**
 * Parses the JSON object literal that starts at `offset` inside a larger text
 * (a script tag, an RSC payload), tolerating whatever follows the object.
 * Returns null when the braces never balance or the slice is not valid JSON.
 */
export function readJsonObjectAt(source: string, offset: number): Record<string, unknown> | null {
  let depth = 0;
  let inString = false;
  for (let index = offset; index < source.length; index += 1) {
    const char = source[index];
    if (inString) {
      if (char === "\\") index += 1;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') inString = true;
    else if (char === "{") depth += 1;
    else if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        try {
          return JSON.parse(source.slice(offset, index + 1)) as Record<string, unknown>;
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}
