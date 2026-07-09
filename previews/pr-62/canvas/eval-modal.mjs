/**
 * canvas/eval-modal.mjs — UGC eval logging for library docs.
 *
 * Opens a modal to capture user observations about a library entry,
 * then composes a pre-filled GitHub Issue URL and opens it in a new tab.
 *
 * Usage:
 *   mountEvalModal();           // call once at boot
 *   openEvalModal(libraryDoc);  // { id, title, domain, year }
 */

const GITHUB_ISSUES_URL = 'https://github.com/karx/kaaroViewer/issues/new';

let _modal = null;

export function mountEvalModal() {
  if (_modal) return;

  _modal = document.createElement('div');
  _modal.id = 'eval-modal';
  _modal.className = 'eval-modal hidden';
  _modal.setAttribute('role', 'dialog');
  _modal.setAttribute('aria-modal', 'true');
  _modal.setAttribute('aria-label', 'Library evaluation form');
  _modal._rating = 0;

  _modal.innerHTML = `
    <div class="eval-inner">
      <div class="eval-header">
        <span class="eval-header-label">◆ EVAL</span>
        <span id="eval-title" class="eval-doc-title"></span>
        <button id="eval-close" class="eval-close" aria-label="Close evaluation form">✕</button>
      </div>
      <div class="eval-body">
        <div class="eval-field eval-field-stars">
          <label class="eval-label">Rating</label>
          <div class="eval-stars" id="eval-stars" role="group" aria-label="Star rating 1 to 5">
            ${[1, 2, 3, 4, 5].map(n =>
              `<button class="eval-star" data-val="${n}" aria-label="${n} star${n > 1 ? 's' : ''}">★</button>`
            ).join('')}
          </div>
        </div>
        <div class="eval-field">
          <label class="eval-label" for="eval-worked">What worked</label>
          <textarea id="eval-worked" class="eval-textarea" rows="2"
            placeholder="Useful, illuminating, or well-structured aspects…"></textarea>
        </div>
        <div class="eval-field">
          <label class="eval-label" for="eval-confused">What was confusing</label>
          <textarea id="eval-confused" class="eval-textarea" rows="2"
            placeholder="Missing context, surprising gaps, wrong connections…"></textarea>
        </div>
        <div class="eval-field">
          <label class="eval-label" for="eval-nodes">Interesting nodes / insights</label>
          <textarea id="eval-nodes" class="eval-textarea" rows="2"
            placeholder="Which entities or insights stood out?"></textarea>
        </div>
        <div class="eval-field">
          <label class="eval-label" for="eval-notes">Observations</label>
          <textarea id="eval-notes" class="eval-textarea" rows="3"
            placeholder="Encoding gaps, ontology mismatches, accuracy issues, suggestions…"></textarea>
        </div>
      </div>
      <div class="eval-footer">
        <span class="eval-hint">Opens a pre-filled GitHub Issue in a new tab</span>
        <button id="eval-submit" class="eval-submit">Submit via GitHub ↗</button>
      </div>
    </div>`;

  document.body.appendChild(_modal);

  // ── Close ──────────────────────────────────────────────────────────────────
  _modal.querySelector('#eval-close').addEventListener('click', closeEvalModal);
  _modal.addEventListener('click', e => { if (e.target === _modal) closeEvalModal(); });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !_modal.classList.contains('hidden')) closeEvalModal();
  });

  // ── Stars ──────────────────────────────────────────────────────────────────
  const stars = _modal.querySelectorAll('.eval-star');
  stars.forEach(btn => {
    btn.addEventListener('click', () => {
      _modal._rating = +btn.dataset.val;
      _syncStars();
    });
    btn.addEventListener('mouseenter', () => {
      const hovered = +btn.dataset.val;
      stars.forEach(s => s.classList.toggle('eval-star-hover', +s.dataset.val <= hovered));
    });
    btn.addEventListener('mouseleave', () => {
      stars.forEach(s => s.classList.remove('eval-star-hover'));
    });
  });

  // ── Submit ─────────────────────────────────────────────────────────────────
  _modal.querySelector('#eval-submit').addEventListener('click', _submitEval);
}

function _syncStars() {
  const rating = _modal._rating;
  _modal.querySelectorAll('.eval-star').forEach(s => {
    s.classList.toggle('eval-star-on', +s.dataset.val <= rating);
  });
}

function _submitEval() {
  const doc = _modal._doc;
  if (!doc) return;

  const rating   = _modal._rating
    ? '⭐'.repeat(_modal._rating) + ` (${_modal._rating}/5)`
    : '_not rated_';
  const worked   = _modal.querySelector('#eval-worked').value.trim()   || '_not filled_';
  const confused = _modal.querySelector('#eval-confused').value.trim() || '_not filled_';
  const nodes    = _modal.querySelector('#eval-nodes').value.trim()    || '_not filled_';
  const notes    = _modal.querySelector('#eval-notes').value.trim()    || '_not filled_';
  const date     = new Date().toISOString().slice(0, 10);

  const title = `[eval] ${doc.title} — ${date}`;
  const body = [
    `## Library Eval: ${doc.title}`,
    ``,
    `| Field | Value |`,
    `|---|---|`,
    `| Doc ID | \`${doc.id}\` |`,
    `| Domain | ${doc.domain} |`,
    `| Year | ${doc.year} |`,
    `| Eval date | ${date} |`,
    ``,
    `## Rating`,
    rating,
    ``,
    `## What worked`,
    worked,
    ``,
    `## What was confusing`,
    confused,
    ``,
    `## Interesting nodes / insights`,
    nodes,
    ``,
    `## Observations`,
    notes,
    ``,
    `---`,
    `*Submitted from kaaroViewer library exploration via the EVAL button.*`,
  ].join('\n');

  const url = `${GITHUB_ISSUES_URL}?title=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}&labels=eval`;
  window.open(url, '_blank', 'noopener');
  closeEvalModal();
}

export function openEvalModal(doc) {
  if (!_modal) mountEvalModal();

  _modal._doc    = doc;
  _modal._rating = 0;

  _modal.querySelector('#eval-title').textContent      = doc.title;
  _modal.querySelector('#eval-worked').value           = '';
  _modal.querySelector('#eval-confused').value         = '';
  _modal.querySelector('#eval-nodes').value            = '';
  _modal.querySelector('#eval-notes').value            = '';
  _modal.querySelectorAll('.eval-star').forEach(s =>
    s.classList.remove('eval-star-on', 'eval-star-hover')
  );

  _modal.classList.remove('hidden');
  _modal.querySelector('#eval-close').focus();
}

export function closeEvalModal() {
  _modal?.classList.add('hidden');
}
