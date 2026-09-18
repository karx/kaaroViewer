/**
 * scripts/hero-html.mjs — standalone HTML export of a HeroVisual deck.
 *
 * Renders the deck through the real canvas renderers (canvas/slides.mjs) inside
 * jsdom, then wraps the result with the `.sl-*` rules from style.css and a tiny
 * inline navigator. No Three.js, no modules, no network: one file that opens
 * anywhere. Frames (canvas focus) are no-ops in the export.
 *
 *   import { exportHeroHTML } from './hero-html.mjs';
 *   await exportHeroHTML({ hero, doc, out: 'library/hero/x.hero.html' });
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import { heroToPlan, toCanvasDoc } from '../ui/hero.mjs';

const ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');

/** Pull every rule whose selector mentions .sl- (plus keyframes they use) from style.css. */
export function extractSlideCSS(css) {
  const out = [];
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let m;
  while ((m = re.exec(css))) {
    const sel = m[1].trim();
    if (sel.includes('.sl-') && !sel.startsWith('@')) out.push(`${sel} {${m[2]}}`);
  }
  return out.join('\n');
}

const NAV_SCRIPT = `
(function(){
  var track=document.querySelector('.sl-track'); if(!track) return;
  var slides=[].slice.call(track.querySelectorAll('.sl-slide'));
  var idx=0, index=document.querySelector('.sl-index'), title=document.querySelector('.sl-topbar-title'), fill=document.querySelector('.sl-progress-fill');
  function go(n){ idx=Math.max(0,Math.min(slides.length-1,n)); slides[idx].scrollIntoView({behavior:'smooth',inline:'start',block:'nearest'}); sync(); }
  function sync(){ slides.forEach(function(s,i){ s.classList.toggle('sl-active',i===idx); });
    if(index) index.textContent=String(idx+1).padStart(2,'0')+' / '+String(slides.length).padStart(2,'0');
    if(title) title.textContent=slides[idx].getAttribute('aria-label').replace(/^Slide \\d+ of \\d+: /,'');
    if(fill) fill.style.width=(slides.length>1?idx/(slides.length-1)*100:100).toFixed(1)+'%';
    document.querySelectorAll('.sl-dot').forEach(function(d,i){ d.classList.toggle('sl-dot-active',i===idx); }); }
  document.addEventListener('keydown',function(e){ if(e.key==='ArrowRight') go(idx+1); if(e.key==='ArrowLeft') go(idx-1); });
  var prev=document.querySelector('.sl-prev'), next=document.querySelector('.sl-next'); if(prev) prev.onclick=function(){go(idx-1)}; if(next) next.onclick=function(){go(idx+1)};
  document.querySelectorAll('.sl-dot').forEach(function(d,i){ d.onclick=function(){go(i)}; });
  document.querySelectorAll('[data-goto-slide]').forEach(function(el){ el.onclick=function(ev){ ev.preventDefault(); var id=el.getAttribute('data-goto-slide'); var i=slides.findIndex(function(s){return s.getAttribute('data-slide-id')===id}); if(i>=0) go(i); }; });
  document.querySelectorAll('.sl-paint-btn,.sl-mode-btn,.sl-close,.sl-eval-submit-btn').forEach(function(b){ b.style.display='none'; });
  var io=new IntersectionObserver(function(es){ es.forEach(function(e){ if(e.isIntersecting&&e.intersectionRatio>0.6){ idx=slides.indexOf(e.target); sync(); } }); },{root:track,threshold:[0.6]});
  slides.forEach(function(s){ io.observe(s); });
  sync();
})();`;

export async function exportHeroHTML({ hero, doc, out, cssPath = resolve(ROOT, 'style.css') }) {
  const dom = new JSDOM('<!doctype html><html><body><div class="middle"></div></body></html>', { pretendToBeVisual: true });
  const w = dom.window;
  // Globals the slide module touches at call time.
  Object.assign(globalThis, {
    window: w, document: w.document, CustomEvent: w.CustomEvent, Element: w.Element, HTMLElement: w.HTMLElement, Node: w.Node,
    IntersectionObserver: class { observe() {} unobserve() {} disconnect() {} takeRecords() { return []; } },
  });
  w.Element.prototype.scrollTo = () => {};
  w.Element.prototype.scrollIntoView = () => {};

  const slides = await import('../canvas/slides.mjs');
  slides.initSlides();
  const canvasDoc = doc.nodeLookup ? doc : toCanvasDoc(doc);
  slides.renderSlides(canvasDoc, { plan: heroToPlan(hero) });
  const wrap = w.document.getElementById('slides-wrap');
  wrap.classList.add('sl-visible');
  const deck = wrap.outerHTML;

  const css = extractSlideCSS(readFileSync(cssPath, 'utf8'));
  const title = hero.meta?.title ?? hero.meta?.id ?? 'HeroVisual';
  const decisions = hero.decisions?.counts ?? {};
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)} — HeroVisual</title>
<meta name="generator" content="kaaroViewer /herovisual · registry v${hero.registry?.version ?? '?'} · ${decisions.model ?? 0} model / ${decisions.heuristic ?? 0} heuristic decisions">
<style>
html,body{margin:0;background:#000;color:#ccccaa;font:13px/1.5 "Courier New",monospace;height:100%}
.middle{position:relative;height:100vh;overflow:hidden}
.sl-wrap{position:absolute;inset:0;display:flex;flex-direction:column}
.sl-track{flex:1 1 auto;display:flex;overflow-x:auto;scroll-snap-type:x mandatory;gap:16px;padding:16px}
.sl-slide{flex:0 0 min(720px,90vw);scroll-snap-align:start;overflow:auto}
${css}
.hv-foot{position:fixed;right:10px;bottom:6px;font-size:9px;color:#555533;letter-spacing:.08em}
</style>
</head>
<body>
<div class="middle">${deck}</div>
<div class="hv-foot">HEROVISUAL · ${escapeHtml(hero.meta?.id ?? '')} · ${escapeHtml(hero.meta?.generated ?? '')} · layout ${escapeHtml(hero.pages?.[0]?.layout ?? '')}</div>
<script type="application/json" id="hero-json">${JSON.stringify(hero).replace(/</g, '\\u003c')}</script>
<script>${NAV_SCRIPT}</script>
</body>
</html>
`;
  if (out) writeFileSync(out, html);
  return html;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
