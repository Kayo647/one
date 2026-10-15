// smoke.js —— 端到端冒烟测试：把工作区里的 HTML 真跑起来，看首帧渲染 + 交互是否正常
import { readFileSync } from 'node:fs';

function boot(file) {
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
  let rafCb = null;
  const reg = [];                                   // 所有动态创建的 SVG 节点
  const doc = {
    createElementNS: (ns, tag) => { const n = mk(tag); reg.push(n); return n; },
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
  new Function('document', 'requestAnimationFrame', 'performance', src)(
    doc, (cb) => { rafCb = cb; return 1; }, { now: () => 0 });
  // SVG 构件有两种建立方式（HTML 静态标签 / createElementNS 动态创建），都按 id 找
  const get = (id) => doc.getElementById(id);                       // 控件类
  const gfx = (id) => reg.find((n) => n.__id === id || n.attrs.get('id') === id) || null;   // 图形类
  return { get, gfx, reg, rafCb, html };
}

const check = (label, cond, detail = '') => {
  console.log('   ' + (cond ? '✓' : '✗') + ' ' + label + (detail ? '  ' + detail : ''));
  return cond ? 0 : 1;
};

let fail = 0;
for (const f of ['slider-crank-fixed.html', 'slider-crank-buggy.html']) {
  console.log('【' + f + '】');
  const { get, gfx, reg, rafCb } = boot(f);
  // 原版所有 SVG 构件都没有 id，故按结构兜底定位
  const crank = gfx('crank') || reg.find((n) => n.__tag === 'line' && n.attrs.get('stroke-width') === '5');
  const rod = gfx('rod') || reg.find((n) => n.__tag === 'line' && n.attrs.get('stroke-width') === '4');
  const slider = gfx('slider') || reg.find((n) => n.__tag === 'rect');
  const hud = gfx('outTheta') || reg.find((n) => n.__tag === 'text' && (n.textContent || '').includes('θ ='));
  const findShape = (tag, attr) => gfx(attr) || gfx(tag);

  const first = {
    crankX2: crank && crank.getAttribute('x2'),
    rodX2: rod && rod.getAttribute('x2'),
    slider: slider && slider.getAttribute('x'),
    theta: hud ? hud.textContent : ''
  };
  fail += check('启动即完成首帧渲染（曲柄/连杆/滑块都有坐标）',
    first.crankX2 != null && first.rodX2 != null && first.slider != null,
    JSON.stringify(first).slice(0, 96));
  // 驱动 30 帧后仍在更新
  const t0 = 0;
  const read = () => rod && rod.getAttribute('x2');
  const a = read();
  for (let i = 1; i <= 30; i++) rafCb(t0 + i * (1000 / 60));
  const b = read();
  fail += check('rAF 循环持续推进（连杆坐标发生变化）', a !== b, a + ' → ' + b);
  // 暂停 / 复位
  const play = get('btnPlay').handlers.get('click');
  fail += check('暂停按钮已绑定', typeof play === 'function');
  play();
  const c1 = read(); for (let i = 31; i <= 40; i++) rafCb(t0 + i * (1000 / 60));
  fail += check('暂停后坐标冻结', c1 === read(), c1);
  const reset = get('btnReset').handlers.get('click');
  fail += check('复位按钮已绑定', typeof reset === 'function');
  reset();
  const th = hud ? hud.textContent : '';
  fail += check('复位后 θ=0', /θ = 0\.0/.test(th), th);
  console.log('');
}
console.log(fail ? '❌ 冒烟测试失败 ' + fail + ' 项' : '✅ 冒烟测试全部通过');
if (fail) process.exitCode = 1;
