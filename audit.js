// audit.js —— 把目标 HTML 的真实脚本放进 DOM 桩里运行，逐帧量取构件坐标与时间行为
// 用法： node audit.js slider-crank-buggy.html
//        node audit.js slider-crank-fixed.html
import { readFileSync } from 'node:fs';

const SRC = process.argv[2] || 'slider-crank-buggy.html';
const html = readFileSync(SRC, 'utf8');
const scriptSrc = html.match(/<script>([\s\S]*?)<\/script>/)[1];

/* ---------------- 最小 DOM 桩 ---------------- */
let seq = 0;
function makeNode(tag, id) {
  return {
    __tag: tag, __id: id || null, __seq: seq++, attrs: new Map(), children: [], parent: null,
    _text: '', handlers: new Map(), value: '',
    setAttribute(k, v) { this.attrs.set(k, String(v)); },
    getAttribute(k) { return this.attrs.has(k) ? this.attrs.get(k) : null; },
    appendChild(c) { c.parent = this; this.children.push(c); return c; },
    remove() { if (this.parent) { const i = this.parent.children.indexOf(this); if (i >= 0) this.parent.children.splice(i, 1); this.parent = null; } },
    replaceChildren() { for (const c of this.children) c.parent = null; this.children.length = 0; },
    addEventListener(t, fn) { this.handlers.set(t, fn); },
    get textContent() { return this._text; },
    set textContent(v) { this._text = String(v); },
    get innerHTML() { return this._text; },
    set innerHTML(v) { this._text = String(v); this.children.length = 0; },
    querySelectorAll(sel) {
      const cls = sel.replace(/^\./, ''); const out = [];
      const walk = (n) => { for (const c of n.children) { if ((c.attrs.get('class') || '').split(/\s+/).includes(cls)) out.push(c); walk(c); } };
      walk(this); return out;
    }
  };
}
const byId = new Map();
const createdNodes = [];
for (const [, id] of html.matchAll(/id="([^"]+)"/g)) byId.set(id, null);
const doc = {
  createElementNS: (ns, tag) => { const n = makeNode(tag); createdNodes.push(n); return n; },
  getElementById(id) {
    if (!byId.get(id)) {
      const n = makeNode('html:' + id, id);
      const tag = new RegExp('id="' + id + '"([^>]*?)/?>').exec(html);
      if (tag) for (const [, k, v] of tag[1].matchAll(/([\w-]+)="([^"]*)"/g)) {
        if (k === 'value') n.value = v; else n.setAttribute(k, v);
      }
      const out = new RegExp('id="' + id + '"[^>]*>([^<]*)<').exec(html);
      if (out && !/[<>=]/.test(out[1])) n._text = out[1];
      byId.set(id, n);
    }
    return byId.get(id);
  }
};
let rafCb = null;
new Function('document', 'requestAnimationFrame', 'performance', scriptSrc)(
  doc, (cb) => { rafCb = cb; return 1; }, { now: () => 0 });

/* ---------------- 节点定位 ---------------- */
const mech = byId.get('mech');
const walkAll = (root, fn) => { fn(root); for (const c of root.children) walkAll(c, fn); };
const find = (pred) => {
  let hit = null;
  walkAll(mech, (n) => { if (!hit && pred(n)) hit = n; });
  if (hit) return hit;
  for (const n of createdNodes) { if (pred(n)) return n; }
  return null;
};
const byDomId = (id) => find((n) => n.__id === id);
const crankLine = byDomId('crank') || find((n) => n.__tag === 'line' && n.getAttribute('stroke-width') === '5');
const rodLine = byDomId('rod') || find((n) => n.__tag === 'line' && n.getAttribute('stroke-width') === '4');
const sliderRect = byDomId('slider') || find((n) => n.__tag === 'rect');
const pinB = byDomId('pinA') || find((n) => n.__tag === 'circle' && n.getAttribute('fill') === 'var(--crank)');
const pinC = byDomId('pinB') || find((n) => n.__tag === 'circle' && n.getAttribute('fill') === 'var(--rod)');
const arcPath = byDomId('angleArc') || find((n) => n.__tag === 'path');
const staticTextHolder = byDomId('hudTexts');
const mechGs = mech.children.filter((c) => c.__tag === 'g');
const hudG = staticTextHolder || mechGs[1];
const hudTexts = () => (staticTextHolder
  ? staticTextHolder.children.filter((c) => c.__tag === 'text')
  : (hudG ? hudG.children.filter((c) => c.__tag === 'text') : []));

const num = (n, a) => (n ? parseFloat(n.getAttribute(a)) : NaN);
let fail = 0;
const ok = (c, msg, extra = '') => {
  if (!c) { fail++; console.log('  x ' + msg + (extra ? '  ' + extra : '')); }
  else console.log('  v ' + msg + (extra ? '  ' + extra : ''));
};
const literal = (re) => { const m = html.match(re); if (!m) throw new Error('解析失败 ' + re); return m[1]; };

const R0 = +literal(/const P = \{ r: (\d+)/);
const L0 = +literal(/,\s*L:\s*(\d+)/);
const W0 = +literal(/,\s*w:\s*([\d.]+)/);
console.log('审计对象：' + SRC + '    初始参数 r=' + R0 + ' L=' + L0 + ' w=' + W0);

/* 模拟真实拖动：浏览器先把控件 value 改成用户拖到的值，再派发 input 事件 */
function drag(id, value) {
  const node = byId.get(id);
  node.value = String(value);
  node.handlers.get('input')({ target: { value: String(value) } });
}

/* ================= A. 机构闭合：连杆末端是否等于滑块销 ================= */
console.log('\n[A] 连杆末端与滑块销是否重合（机构闭合条件）');
const snap = () => ({
  rx: num(rodLine, 'x2'), sx: num(sliderRect, 'x') + 28, cx: num(pinC, 'cx')
});
let dMax = 0, detach = 0, n = 0;
for (let i = 0; i < 500; i++) {
  rafCb(i * 1000 / 60);
  const s = snap();
  const d = Math.abs(s.rx - s.cx);
  if (d > dMax) dMax = d;
  if (d > 0.4) detach++;
  n++;
}
ok(dMax < 1e-9, '连杆末端与滑块销始终重合',
  '最大间距 ' + dMax.toFixed(3) + ' 世界单位（' + n + ' 帧中 ' + detach + ' 帧可见脱开）');
const theoMax = L0 - Math.sqrt(L0 * L0 - R0 * R0);
console.log('    解析对照：绘制偏差 = L - sqrt(L^2 - r^2 sin^2 t) 上界 = ' + theoMax.toFixed(3)
  + ' 世界单位 = ' + (theoMax * 1.5).toFixed(1) + ' px（屏幕倍率 1.5）');

/* ================= B. 主循环是否按真实时间积分 ================= */
console.log('\n[B] 主循环积分方式与帧率无关性');
const tickSrc = (scriptSrc.match(/function tick\([\s\S]*?\n\}/) || [''])[0].replace(/\s+/g, ' ');
ok(/theta \+= P\.w \* dt/.test(tickSrc), 'theta += w * dt（按真实时间积分）', tickSrc.slice(0, 110));
ok(!/theta \+= [\d.]+;/.test(tickSrc), '不是固定步长递增');
const fixed = (scriptSrc.match(/if \(running\) theta \+= ([\d.]+)/) || [])[1];

// 角度读数：扫所有 text 找带 "°" 的那个
const readDeg = () => {
  let v = null;
  walkAll(mech, (x) => {
    if (v === null && x.__tag === 'text' && /°/.test(x.textContent || '')) {
      const m = (x.textContent || '').match(/([\d.]+)°/);
      if (m) v = parseFloat(m[1]);
    }
  });
  return v;
};
const measure = (frameMs, count) => {
  byId.get('btnPlay').handlers.get('click')();
  byId.get('btnReset').handlers.get('click')();
  byId.get('btnPlay').handlers.get('click')();
  const t0 = 500000;
  for (let i = 1; i <= 2; i++) rafCb(t0 + i);
  for (let i = 1; i <= count; i++) rafCb(t0 + 2 + i * frameMs);
  return readDeg();
};
const deg60 = measure(1000 / 60, 60);
const deg30 = measure(1000 / 30, 30);
const deg20 = measure(50, 20);
ok(deg60 !== null && Math.abs(deg60 - W0 * 180 / Math.PI) < 1, 'w=2 时 1 s 转过 w rad = 114.6 度',
  (deg60 === null ? 'n/a' : deg60.toFixed(2)) + ' 度');
ok(deg60 !== null && Math.abs(deg60 - deg30) < 0.6 && Math.abs(deg60 - deg20) < 0.6,
  '不同帧率下 1 s 转角相同',
  '60fps=' + deg60 + '  30fps=' + deg30 + '  20fps=' + deg20);

/* ================= C. w 是否参与转速 ================= */
console.log('\n[C] 角速度 w');
drag('inpW', 6);
const deg60w6 = measure(1000 / 60, 60);
drag('inpW', 2);
ok(deg60 !== null && deg60w6 !== null && Math.abs(deg60w6 / deg60 - 3) < 0.1,
  'w 2->6 时转速变为 3 倍', deg60w6 + ' 度 vs ' + deg60 + ' 度');

/* ================= D. 写死的固定增量 ================= */
console.log('\n[D] 固定增量检查');
ok(fixed === undefined, '循环里没有写死的 theta 增量', '实测 theta += ' + fixed);
if (fixed !== undefined) {
  console.log('     => 该固定值对应角速度：60fps 下 ' + (+fixed * 60).toFixed(2)
    + ' rad/s，30fps 下 ' + (+fixed * 30).toFixed(2) + ' rad/s');
  console.log('     => 而 w 滑杆标称 ' + W0 + ' rad/s，两者无关');
}

/* ================= E. 颜色写法 ================= */
console.log('\n[E] SVG 颜色写法');
const bad = [];
for (const [name, node] of [['曲柄', crankLine], ['连杆', rodLine], ['滑块', sliderRect], ['曲柄销', pinB], ['十字头销', pinC]]) {
  const v = node && (node.getAttribute('stroke') || node.getAttribute('fill'));
  if (/var\(/.test(v || '')) bad.push(name + '=' + v);
}
ok(bad.length === 0, '颜色使用 SVG 可直接解析的值', bad.length ? '发现 var()：' + bad.join('，') : '全部合法');

/* ================= F. 参数变化时静态层是否累积 ================= */
console.log('\n[F] 参数变化后的静态层');
const c0 = hudTexts().length;
for (let i = 0; i < 3; i++) drag('inpR', 31 + i);
const c1 = hudTexts().length;
ok(c1 === c0, '静态标注数量稳定（不累积旧节点）', c0 + ' -> ' + c1 + ' 个 text 节点');
const countShapes = () => { let k = 0; walkAll(mech, (x) => { if (['circle', 'line', 'rect'].includes(x.__tag)) k++; }); return k; };
const s0 = countShapes();
for (let i = 0; i < 5; i++) drag('inpR', 31 + (i % 2));
const s1 = countShapes();
ok(s1 <= s0 + 2, '重复改参数不累积图形节点', s0 + ' -> ' + s1 + ' 个 circle/line/rect');

/* ================= G. 装配约束 L >= r + 5 ================= */
console.log('\n[G] 装配约束 L >= r + 5');
const lMax = +literal(/id="inpL"[^>]*max="(\d+)"/);
const lMin = +literal(/id="inpL"[^>]*min="(\d+)"/);
drag('inpL', lMin);                 // 先把 L 拉到最小
drag('inpR', 60);                   // 再把 r 拉大，逼近 L - r < 5
const nodeText = (id) => { const x = byId.get(id); return x ? x.textContent : '(该分支未取用)'; };
const outR = nodeText('outR'), outL = nodeText('outL'), warn = nodeText('warnMsg');
const val = (s) => +String(s).replace(/[^\d.]/g, '');
const ctrlVal = (id) => { const x = byId.get(id); return x ? x.value : ''; };
ok(val(outL) <= lMax, '夹紧后的 L 不超出 L 滑块量程', 'L=' + outL + '（max=' + lMax + '）');
ok(val(outR) === val(ctrlVal('inpR')), 'r 的读数与滑杆 value 一致（控件不脱节）',
  'outR=' + outR + ' vs inpR.value=' + ctrlVal('inpR'));
ok(val(outL) === val(ctrlVal('inpL')), 'L 的读数与滑杆 value 一致（控件不脱节）',
  'outL=' + outL + ' vs inpL.value=' + ctrlVal('inpL'));
ok(+ctrlVal('inpL') >= lMin && +ctrlVal('inpL') <= lMax, 'L 滑杆 value 仍在量程内',
  'inpL.value=' + ctrlVal('inpL') + ' ∈ [' + lMin + ',' + lMax + ']');
console.log('    警告文案: ' + JSON.stringify(warn));

/* ================= H. θ=0 时的角弧 ================= */
console.log('\n[H] theta=0 时的角弧路径');
byId.get('btnReset').handlers.get('click')();
const d = arcPath ? (arcPath.getAttribute('d') || '') : '';
if (d === '') {
  ok(true, 'theta=0 时角弧为空路径（起终点重合的 A 命令本就不渲染，清空是正确处理）', 'd=""');
} else {
  const m = /M ([\d.\-]+),([\d.\-]+) A ([\d.\-]+),([\d.\-]+) 0 (\d) (\d) ([\d.\-]+),([\d.\-]+)/.exec(d);
  if (m) {
    const degen = Math.abs(+m[1] - +m[7]) < 1e-9 && Math.abs(+m[2] - +m[8]) < 1e-9;
    ok(!degen, '角弧起终点不重合', '起点(' + m[1] + ',' + m[2] + ') 终点(' + m[7] + ',' + m[8] + ')');
  } else ok(false, '角弧路径可解析', String(d));
}

console.log('\n' + (fail ? 'XX 共确认 ' + fail + ' 处问题' : 'OK 未发现问题'));
if (fail) process.exitCode = 1;
