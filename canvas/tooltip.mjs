/**
 * tooltip.mjs — hover tooltip that follows the cursor.
 */

let _el = null;

export function initTooltip() {
  _el = document.createElement('div');
  _el.className = 'node-tooltip';
  _el.style.display = 'none';
  document.body.appendChild(_el);
  document.addEventListener('pointermove', e => {
    if (_el.style.display === 'none') return;
    _el.style.left = (e.clientX + 14) + 'px';
    _el.style.top  = (e.clientY - 10) + 'px';
  });
}

export function showTooltip(label, type, x, y) {
  if (!_el) return;
  _el.innerHTML =
    `<span class="tt-label">${_esc(label)}</span>` +
    `<span class="tt-type">${_esc(type)}</span>`;
  _el.style.display = 'flex';
  _el.style.left = (x + 14) + 'px';
  _el.style.top  = (y - 10) + 'px';
}

export function hideTooltip() {
  if (_el) _el.style.display = 'none';
}

function _esc(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
