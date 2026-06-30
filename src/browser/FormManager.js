/**
 * Form field utilities — pure functions, no browser dependency.
 *
 * Field schema: { tag, type, name, id, value, disabled, required, options? }
 */

/**
 * Filter fields by type (input type, 'select', 'textarea', etc.).
 * @param {{ type: string }[]} fields
 * @param {string} type
 */
export function filterByType(fields, type) {
  return fields.filter((f) => f.type === type);
}

/**
 * Filter fields by name — substring string or RegExp.
 * @param {{ name: string|null }[]} fields
 * @param {string|RegExp} pattern
 */
export function filterByName(fields, pattern) {
  if (pattern instanceof RegExp) return fields.filter((f) => f.name != null && pattern.test(f.name));
  return fields.filter((f) => f.name != null && f.name.includes(String(pattern)));
}

/**
 * Return only required fields.
 * @param {{ required: boolean }[]} fields
 */
export function filterRequired(fields) {
  return fields.filter((f) => f.required);
}

/**
 * Return only disabled fields.
 * @param {{ disabled: boolean }[]} fields
 */
export function filterDisabled(fields) {
  return fields.filter((f) => f.disabled);
}

/**
 * Summarize fields — total count, distribution by type, required/disabled counts.
 * @param {{ type: string, required: boolean, disabled: boolean }[]} fields
 * @returns {{ total: number, byType: Object.<string,number>, required: number, disabled: number }}
 */
export function summarize(fields) {
  const byType = {};
  let required = 0;
  let disabled = 0;
  for (const f of fields) {
    const t = f.type || 'unknown';
    byType[t] = (byType[t] || 0) + 1;
    if (f.required) required++;
    if (f.disabled) disabled++;
  }
  return { total: fields.length, byType, required, disabled };
}
