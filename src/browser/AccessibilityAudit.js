/**
 * Accessibility tree analysis — pure functions, no browser dependency.
 *
 * Operates on AX node arrays produced by page.accessibility.snapshot().
 * Node schema: { role, name, value?, level?, checked?, expanded?,
 *               disabled?, required?, description?, children? }
 */

/** Interactive ARIA roles that must have an accessible name. */
export const INTERACTIVE_ROLES = Object.freeze(new Set([
  'button', 'link', 'textbox', 'checkbox', 'radio', 'combobox',
  'listbox', 'option', 'menuitem', 'menuitemcheckbox', 'menuitemradio',
  'slider', 'spinbutton', 'switch', 'tab', 'treeitem',
]));

/** Heading roles. */
export const HEADING_ROLES = Object.freeze(new Set(['heading']));

/**
 * Recursively flatten an AX tree into a plain array of nodes (children removed).
 * @param {object|null} root
 * @returns {object[]}
 */
export function flattenTree(root) {
  if (!root) return [];
  const nodes = [];
  function walk(node) {
    const { children, ...rest } = node;
    nodes.push(rest);
    if (Array.isArray(children)) children.forEach(walk);
  }
  walk(root);
  return nodes;
}

/**
 * Filter nodes by ARIA role (case-insensitive).
 * @param {object[]} nodes
 * @param {string} role
 */
export function findByRole(nodes, role) {
  const r = String(role).toLowerCase();
  return nodes.filter((n) => String(n.role || '').toLowerCase() === r);
}

/**
 * Filter nodes whose accessible name contains the given substring (case-insensitive).
 * @param {object[]} nodes
 * @param {string} nameSubstring
 */
export function findByName(nodes, nameSubstring) {
  const q = String(nameSubstring).toLowerCase();
  return nodes.filter((n) => String(n.name || '').toLowerCase().includes(q));
}

/**
 * Find interactive elements that lack an accessible name.
 * Returns nodes with role in INTERACTIVE_ROLES and empty/null name.
 * @param {object[]} nodes
 * @returns {object[]}
 */
export function findMissingNames(nodes) {
  return nodes.filter((n) => {
    if (!INTERACTIVE_ROLES.has(String(n.role || '').toLowerCase())) return false;
    return !n.name || !String(n.name).trim();
  });
}

/**
 * Find heading level order violations (level jumping by more than 1).
 * e.g. h1 → h3 is a violation; h2 → h3 is not.
 * @param {object[]} nodes
 * @returns {{ node: object, prevLevel: number, level: number }[]}
 */
export function findHeadingOrderViolations(nodes) {
  const headings = nodes.filter((n) => HEADING_ROLES.has(String(n.role || '').toLowerCase()) && n.level);
  const violations = [];
  for (let i = 1; i < headings.length; i++) {
    const prev = Number(headings[i - 1].level);
    const curr = Number(headings[i].level);
    if (curr > prev + 1) {
      violations.push({ node: headings[i], prevLevel: prev, level: curr });
    }
  }
  return violations;
}

/**
 * Find disabled interactive elements (role in INTERACTIVE_ROLES and disabled=true).
 * @param {object[]} nodes
 */
export function findDisabled(nodes) {
  return nodes.filter((n) => INTERACTIVE_ROLES.has(String(n.role || '').toLowerCase()) && n.disabled === true);
}

/**
 * Group nodes by ARIA role.
 * @param {object[]} nodes
 * @returns {Object.<string, object[]>}
 */
export function groupByRole(nodes) {
  const groups = {};
  for (const node of nodes) {
    const role = node.role || 'unknown';
    if (!groups[role]) groups[role] = [];
    groups[role].push(node);
  }
  return groups;
}

/**
 * Summarize accessibility tree with basic violation counts.
 * @param {object[]} nodes
 * @returns {{ total, byRole, missingNames: object[], headingViolations: object[] }}
 */
export function summarize(nodes) {
  const byRole = {};
  for (const node of nodes) {
    const role = node.role || 'unknown';
    byRole[role] = (byRole[role] || 0) + 1;
  }
  return {
    total:              nodes.length,
    byRole,
    missingNames:       findMissingNames(nodes),
    headingViolations:  findHeadingOrderViolations(nodes),
  };
}
