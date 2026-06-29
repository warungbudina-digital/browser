function inferRole(node) {
  if (node.role) return node.role;
  const tag = node.tagName.toLowerCase();
  if (tag === 'button') return 'button';
  if (tag === 'a') return 'link';
  if (tag === 'textarea') return 'textbox';
  if (tag === 'select') return 'combobox';
  if (tag === 'img') return 'img';
  if (tag === 'input') {
    const type = (node.inputType || 'text').toLowerCase();
    if (['submit', 'button', 'reset'].includes(type)) return 'button';
    if (['checkbox'].includes(type)) return 'checkbox';
    if (['radio'].includes(type)) return 'radio';
    return 'textbox';
  }
  return tag;
}

function inferName(node) {
  return node.name || node.text || node.placeholder || node.ariaLabel || node.title || node.alt || node.selector;
}

function locatorRecipe(node, nth) {
  return {
    selector: node.selector,
    role: inferRole(node),
    name: inferName(node),
    nth,
    inputType: node.inputType || null,
    tagName: node.tagName.toLowerCase()
  };
}

function formatLine(ref, node, interactive) {
  const role = inferRole(node);
  const name = inferName(node);
  const bits = [role];
  if (name) bits.push(JSON.stringify(name));
  if (node.selector) bits.push(`selector=${node.selector}`);
  bits.push(interactive ? `[ref=${ref}]` : `[${ref}]`);
  return bits.join(' ');
}

export function buildSnapshotFromNodes({ targetId, url, title, nodes, interactive = false, limit = 150 }) {
  const duplicateCounter = new Map();
  const refs = [];
  const lines = [];

  for (const node of nodes.slice(0, limit)) {
    const key = `${inferRole(node)}|${inferName(node)}`;
    const nth = duplicateCounter.get(key) || 0;
    duplicateCounter.set(key, nth + 1);

    const ref = interactive ? `e${refs.length + 1}` : String(refs.length + 1);
    refs.push({ ref, recipe: locatorRecipe(node, nth) });
    lines.push(formatLine(ref, node, interactive));
  }

  const header = [`target=${targetId}`, `title=${title || ''}`, `url=${url || ''}`].join(' | ');
  return {
    targetId,
    url,
    title,
    interactive,
    refs,
    lines,
    text: `${header}\n${lines.join('\n')}`.trim(),
    stats: {
      refs: refs.length,
      lines: lines.length,
      interactive
    }
  };
}

export async function collectDomNodes(page, selector) {
  return page.evaluate((inputSelector) => {
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
          const siblings = Array.from(parent.children).filter((child) => child.tagName === current.tagName);
          if (siblings.length > 1) part += `:nth-of-type(${siblings.indexOf(current) + 1})`;
        }
        parts.unshift(part);
        current = current.parentElement;
      }
      return `body > ${parts.join(' > ')}`;
    }

    function isVisible(element) {
      const rect = element.getBoundingClientRect();
      const style = window.getComputedStyle(element);
      return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
    }

    function labelFor(element) {
      const ariaLabel = element.getAttribute('aria-label') || '';
      const placeholder = element.getAttribute('placeholder') || '';
      const alt = element.getAttribute('alt') || '';
      const title = element.getAttribute('title') || '';
      const text = (element.innerText || element.textContent || '').replace(/\s+/g, ' ').trim();
      const value = 'value' in element ? String(element.value || '').trim() : '';
      const name = ariaLabel || placeholder || alt || title || text || value;
      return {
        ariaLabel,
        placeholder,
        alt,
        title,
        text,
        name
      };
    }

    const root = inputSelector ? document.querySelector(inputSelector) : document.body;
    if (!root) throw new Error(`Selector not found: ${inputSelector}`);

    const selector = [
      'button', 'a', 'input', 'textarea', 'select', 'summary', '[role]', '[contenteditable="true"]',
      'label', 'option', 'img'
    ].join(',');

    return Array.from(root.querySelectorAll(selector))
      .filter((element) => isVisible(element))
      .map((element) => {
        const labels = labelFor(element);
        return {
          selector: cssPath(element),
          role: element.getAttribute('role') || '',
          tagName: element.tagName,
          inputType: element.getAttribute('type') || '',
          ...labels
        };
      });
  }, selector || null);
}
