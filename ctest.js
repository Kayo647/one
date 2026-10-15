// ctest.js —— 只测「把 r 滑杆拉到最大」时两个文件各自如何处理装配约束
import { readFileSync } from 'node:fs';

function load(file) {
  const html = readFileSync(file, 'utf8');
  const src = html.match(/<script>([\s\S]*?)<\/script>/)[1];
  const mk = (tag, id) => ({
    __tag: tag, __id: id || null, attrs: new Map(), children: [], parent: null, _text: '', handlers: new Map(), value: '',
    setAttribute(k, v) { this.attrs.set(k, String(v)); }, getAttribute(k) { return this.attrs.get(k) ?? null; },
    appendChild(c) { c.parent = this; this.children.push(c); return c; },
    remove() { if (this.parent) { const i = this.parent.children.indexOf(this); if (i >= 0) this.parent.children.splice(i, 1); this.parent = null; } },
    replaceChildren() { this.children.length = 0; },
    addEventListener(t, fn) { this.handlers.set(t, fn); },
    get textContent() { return this._text; }, set textContent(v) { this._text = String(v); },
    get innerHTML() { return this._text; }, set innerHTML(v) { this._text = String(v); this.children.length = 0; },
    querySelectorAll: () => []
  });
  const byId = new Map();
  for (const [, id] of html.matchAll(/id="([^"]+)"/g)) byId.set(id, null);
  const doc = {
    createElementNS: (ns, tag) => mk(tag),
    getElementById(id) {
      if (!byId.get(id)) {
        const n = mk('html:' + id, id);
        const tag = new RegExp('id="' + id + '"([^>]*?)/?>').exec(html);
        if (tag) for (const [, k, v] of tag[1].matchAll(/([\w-]+)="([^"]*)"/g)) { if (k === 'value') n.value = v; else n.setAttribute(k, v); }
        const out = new RegExp('id="' + id + '"[^>]*>([^<]*)<').exec(html);
        if (out && !/[<>=]/.test(out[1])) n._text = out[1];
        byId.set(id, n);
      }
      return byId.get(id);
    }
  };
  new Function('document', 'requestAnimationFrame', 'performance', src)(doc, () => 1, { now: () => 0 });
  return { get: (id) => doc.getElementById(id), html };
}

for (const f of ['slider-crank-buggy.html', 'slider-crank-fixed.html']) {
  const { get, html } = load(f);
  const rMax = +html.match(/id="inpR"[^>]*max="(\d+)"/)[1];
  const lMax = +html.match(/id="inpL"[^>]*max="(\d+)"/)[1];
  const lMin = +html.match(/id="inpL"[^>]*min="(\d+)"/)[1];
  const beforeL = get('outL').textContent;
  // 先按真实交互把 L 拉小，再拉大 r，逼近 L − r < 5
  get('inpL').handlers.get('input')({ target: { value: String(lMin) } });
  const midL = get('outL').textContent, midWarn = get('warnMsg').textContent;
  get('inpR').handlers.get('input')({ target: { value: String(rMax) } });
  const outR = get('outR').textContent, outL = get('outL').textContent;
  const inpR = get('inpR').value, inpL = get('inpL').value, warn = get('warnMsg').textContent;
  const r = +outR.replace(/[^\d.]/g, ''), L = +outL.replace(/[^\d.]/g, '');
  console.log('[' + f + '] L 滑杆拉到 min=' + lMin + ' 后，再把 r 滑杆拉到 max=' + rMax);
  console.log('   中间态：L 显示 ' + beforeL + ' -> ' + midL + '，警告=' + JSON.stringify(midWarn));
  console.log('   最终态：r 显示 ' + outR + '（滑杆 value=' + inpR + '），L 显示 ' + outL + '（滑杆 value=' + inpL + '）');
  console.log('   此时 r=' + r + '，L=' + L + ' => L - r = ' + (L - r) + '  ' + ((L - r) >= 5 ? '满足 L >= r+5' : '违反约束'));
  console.log('   最终警告: ' + JSON.stringify(warn));
  console.log('');
}
