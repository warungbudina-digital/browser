// ─────────────────────────────────────────────────────────────────────────────
// Role inference
// ─────────────────────────────────────────────────────────────────────────────

function inferRole(node) {
  if (node.role) return node.role;
  const tag = node.tagName.toLowerCase();

  if (/^h[1-6]$/.test(tag)) return 'heading';
  if (tag === 'button')   return 'button';
  if (tag === 'a')        return 'link';
  if (tag === 'textarea') return 'textbox';
  if (tag === 'select')   return 'combobox';
  if (tag === 'img')      return 'img';
  if (tag === 'li')       return 'listitem';
  if (tag === 'nav')      return 'navigation';
  if (tag === 'main')     return 'main';
  if (tag === 'header')   return 'banner';
  if (tag === 'footer')   return 'contentinfo';
  if (tag === 'aside')    return 'complementary';
  if (tag === 'form')     return 'form';
  if (tag === 'input') {
    const type = (node.inputType || 'text').toLowerCase();
    if (['submit', 'button', 'reset'].includes(type)) return 'button';
    if (type === 'checkbox') return 'checkbox';
    if (type === 'radio')    return 'radio';
    if (type === 'range')    return 'slider';
    return 'textbox';
  }
  return tag;
}

function inferName(node) {
  return node.ariaLabel || node.name || node.placeholder ||
         node.alt || node.title || node.text || node.selector;
}

function locatorRecipe(node, nth) {
  return {
    selector:  node.selector,
    role:      inferRole(node),
    name:      inferName(node),
    nth,
    inputType: node.inputType || null,
    tagName:   node.tagName.toLowerCase(),
  };
}

function nodeAriaState(node) {
  return {
    checked:  node.ariaChecked  ?? null,
    expanded: node.ariaExpanded ?? null,
    disabled: node.ariaDisabled ?? null,
    required: node.ariaRequired ?? null,
    current:  node.ariaCurrent  ?? null,
  };
}

function formatLine(ref, node, interactive) {
  const role = inferRole(node);
  const name = inferName(node);

  // Role token — headings show level
  const roleToken = (role === 'heading' && node.headingLevel)
    ? `heading(${node.headingLevel})`
    : role;

  const bits = [roleToken];
  if (name) bits.push(JSON.stringify(name));

  // ARIA state annotations
  if (node.ariaChecked   === 'true')  bits.push('[checked]');
  if (node.ariaChecked   === 'false') bits.push('[unchecked]');
  if (node.ariaExpanded  === 'true')  bits.push('[expanded]');
  if (node.ariaExpanded  === 'false') bits.push('[collapsed]');
  if (node.ariaDisabled  === 'true')  bits.push('[disabled]');
  if (node.ariaRequired  === 'true')  bits.push('[required]');
  if (node.ariaCurrent && node.ariaCurrent !== 'false') {
    bits.push(`[current=${node.ariaCurrent}]`);
  }

  if (node.selector) bits.push(`selector=${node.selector}`);
  bits.push(interactive ? `[ref=${ref}]` : `[${ref}]`);
  return bits.join(' ');
}

// ─────────────────────────────────────────────────────────────────────────────
// Snapshot builder
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build a snapshot object from DOM node arrays.
 *
 * @param {{
 *   targetId: string,
 *   url: string,
 *   title: string,
 *   nodes: object[],
 *   interactive?: boolean,
 *   limit?: number,
 *   frameEntries?: Array<{ frameIndex: number, frameUrl: string, nodes: object[] }>
 * }}
 */
export function buildSnapshotFromNodes({
  targetId, url, title, nodes,
  interactive   = false,
  limit         = 150,
  frameEntries  = [],
}) {
  const duplicateCounter = new Map();
  const refs  = [];
  const lines = [];

  // ── Main frame elements ────────────────────────────────────────────────────
  const mainLimit = frameEntries.length > 0
    ? Math.max(50, Math.floor(limit * 0.7))
    : limit;

  for (const node of nodes.slice(0, mainLimit)) {
    const key = `${inferRole(node)}|${inferName(node)}`;
    const nth = duplicateCounter.get(key) ?? 0;
    duplicateCounter.set(key, nth + 1);

    const ref = interactive ? `e${refs.length + 1}` : String(refs.length + 1);
    refs.push({ ref, recipe: locatorRecipe(node, nth), frameIndex: 0, ariaState: nodeAriaState(node) });
    lines.push(formatLine(ref, node, interactive));
  }

  // ── iframe frames ──────────────────────────────────────────────────────────
  for (const { frameIndex, frameUrl, nodes: frameNodes } of frameEntries) {
    const perFrameLimit = Math.max(20, Math.floor((limit - mainLimit) / frameEntries.length));
    lines.push(`--- frame ${frameIndex}: ${frameUrl} ---`);

    const frameDupCounter = new Map();
    let frameElemCount = 0;

    for (const node of frameNodes.slice(0, perFrameLimit)) {
      const key = `${inferRole(node)}|${inferName(node)}`;
      const nth = frameDupCounter.get(key) ?? 0;
      frameDupCounter.set(key, nth + 1);

      frameElemCount++;
      const ref = interactive
        ? `f${frameIndex}e${frameElemCount}`
        : `f${frameIndex}${frameElemCount}`;

      refs.push({ ref, recipe: locatorRecipe(node, nth), frameIndex, ariaState: nodeAriaState(node) });
      lines.push(formatLine(ref, node, interactive));
    }
  }

  const header = [`target=${targetId}`, `title=${title || ''}`, `url=${url || ''}`].join(' | ');
  return {
    targetId,
    url,
    title,
    interactive,
    refs,
    lines,
    text:  `${header}\n${lines.join('\n')}`.trim(),
    stats: {
      refs:        refs.length,
      lines:       lines.length,
      interactive,
      frameCount:  frameEntries.length,
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// DOM collection — runs inside Playwright page / frame context
// ─────────────────────────────────────────────────────────────────────────────

const DOM_SELECTOR = [
  'button', 'a', 'input', 'textarea', 'select', 'summary',
  '[role]', '[contenteditable="true"]',
  'label', 'option', 'img',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
].join(',');

/**
 * Collect visible interactive + semantic DOM nodes from a page or frame.
 * @param {import('playwright').Page|import('playwright').Frame} pageOrFrame
 * @param {string|null} [selector]
 * @returns {Promise<object[]>}
 */
export async function collectDomNodes(pageOrFrame, selector) {
  return pageOrFrame.evaluate(({ inputSelector, domSelector }) => {
    function cssPath(element) {
      if (!(element instanceof Element)) return '';
      const parts = [];
      let current = element;
      while (current && current.nodeType === Node.ELEMENT_NODE && current !== document.body) {
        let part = current.tagName.toLowerCase();
        if (current.id) {
          part += `#${CSS.escape(current.id)}`;
          parts.unshift(part);
          break;
        }
        const parent = current.parentElement;
        if (parent) {
          const siblings = Array.from(parent.children).filter((c) => c.tagName === current.tagName);
          if (siblings.length > 1) part += `:nth-of-type(${siblings.indexOf(current) + 1})`;
        }
        parts.unshift(part);
        current = current.parentElement;
      }
      return `body > ${parts.join(' > ')}`;
    }

    function isVisible(element) {
      const rect  = element.getBoundingClientRect();
      const style = window.getComputedStyle(element);
      return rect.width > 0 && rect.height > 0 &&
             style.visibility !== 'hidden' && style.display !== 'none';
    }

    function labelFor(element) {
      const ariaLabel  = element.getAttribute('aria-label') || '';
      const placeholder = element.getAttribute('placeholder') || '';
      const alt        = element.getAttribute('alt') || '';
      const title      = element.getAttribute('title') || '';
      const text       = (element.innerText || element.textContent || '').replace(/\s+/g, ' ').trim();
      const value      = 'value' in element ? String(element.value || '').trim() : '';
      return { ariaLabel, placeholder, alt, title, text, name: ariaLabel || placeholder || alt || title || text || value };
    }

    const root = inputSelector ? document.querySelector(inputSelector) : document.body;
    if (!root) throw new Error(`Selector not found: ${inputSelector}`);

    return Array.from(root.querySelectorAll(domSelector))
      .filter((el) => isVisible(el))
      .map((el) => {
        const labels = labelFor(el);
        const tag    = el.tagName;
        return {
          selector:     cssPath(el),
          role:         el.getAttribute('role') || '',
          tagName:      tag,
          inputType:    el.getAttribute('type') || '',
          // ARIA states
          ariaExpanded: el.getAttribute('aria-expanded') || null,
          ariaChecked:  (tag === 'INPUT' && (el.type === 'checkbox' || el.type === 'radio'))
            ? String(el.checked)
            : el.getAttribute('aria-checked') || null,
          ariaDisabled: el.disabled
            ? 'true'
            : el.getAttribute('aria-disabled') || null,
          ariaRequired: el.required
            ? 'true'
            : el.getAttribute('aria-required') || null,
          ariaCurrent:  el.getAttribute('aria-current') || null,
          headingLevel: /^H[1-6]$/.test(tag) ? parseInt(tag[1]) : null,
          ...labels,
        };
      });
  }, { inputSelector: selector || null, domSelector: DOM_SELECTOR });
}

/**
 * Collect nodes from all accessible same-origin iframes.
 * Cross-origin frames are skipped silently.
 *
 * @param {import('playwright').Page} page
 * @param {number} [nodeLimit=50]
 * @returns {Promise<Array<{ frameIndex: number, frameUrl: string, nodes: object[] }>>}
 */
export async function collectFrameNodes(page, nodeLimit = 50) {
  const frames = page.frames();
  const result = [];

  for (let i = 1; i < frames.length; i++) {
    const frame    = frames[i];
    const frameUrl = frame.url();
    if (!frameUrl || frameUrl === 'about:blank') continue;

    try {
      const nodes = await collectDomNodes(frame, null);
      result.push({ frameIndex: i, frameUrl, nodes: nodes.slice(0, nodeLimit) });
    } catch {
      // Cross-origin or detached frame — skip silently
    }
  }

  return result;
}
