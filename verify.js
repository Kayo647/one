// verify.js —— 最终验收：所有几何量都从 crank-slider.html 里解析/执行得来，
// 不在本文件里重复硬编码参数，避免「测试与实现各说各话」。
import { readFileSync } from 'node:fs';

const html = readFileSync('crank-slider.html', 'utf8');

/* ================= 1. 从文件解析参数与静态结构 ================= */
const literal = (re, name) => {
  const m = html.match(re);
  if (!m) throw new Error('无法从文件中解析 ' + name);
  return m[1];
};
const R = +literal(/const R\s*=\s*([\d.]+)/, 'R');
const L = +literal(/const L\s*=\s*([\d.]+)/, 'L');
const W = +literal(/const W0\s*=\s*([\d.]+)/, 'W0');
const SCALE = +literal(/const SCALE\s*=\s*([\d.]+)/, 'SCALE');
const OXM = html.match(/const OX\s*=\s*([\d.]+)\s*,\s*OY\s*=\s*([\d.]+)/);
const OX = +OXM[1], OY = +OXM[2];

let fail = 0;
const ok = (c, msg, extra = '') => { if (!c) { fail++; console.log('  ✗ ' + msg + (extra ? '  ' + extra : '')); } else console.log('  ✓ ' + msg + (extra ? '  ' + extra : '')); };
// A0：从 HTML **静态标记**解析（用于检查初始位形是否自洽）
const A0 = (id, a) => {
  const m = new RegExp('id="' + id + '"([^>]*?)/?>').exec(html);
  if (!m) throw new Error('SVG 中缺少 #' + id);
  const mm = new RegExp('(?:^|\\s)' + a + '="([^"]*)"').exec(m[1]);
  return mm ? mm[1] : null;
};

console.log('文件参数： r=' + R + ' mm，L=' + L + ' mm，ω=' + W + ' rad/s，SCALE=' + SCALE + ' 单位/mm，O=(' + OX + ',' + OY + ')');

/* ================= 2. 直接执行文件里的真实脚本（DOM 桩） ================= */
const store = new Map();
let rafCb = null;
const el = (id) => {
  if (!store.has(id)) {
    const attrs = new Map();
    const tag = new RegExp('id="' + id + '"([^>]*?)/?>').exec(html);
    if (tag) for (const [, k, v] of tag[1].matchAll(/([\w:-]+)="([^"]*)"/g)) attrs.set(k, String(v));
    store.set(id, {
      id, textContent: '', value: id === 'omega' ? '2' : '', handlers: new Map(),
      addEventListener(t, fn) { this.handlers.set(t, fn); },
      setAttribute(k, v) { attrs.set(k, String(v)); },
      getAttribute: (k) => attrs.get(k) ?? null
    });
  }
  return store.get(id);
};
const scriptSrc = html.match(/<script>([\s\S]*?)<\/script>/)[1];
new Function('document', 'requestAnimationFrame', scriptSrc)(
  { getElementById: (id) => el(id) }, (cb) => { rafCb = cb; });
// 该脚本是 IIFE，内部变量取不到；通过故意触发一次错误不行，
// 改为从源码文本中提取 sliderX/sliderVx 求值，用于与 SVG 输出对照。
const grabFn = (name) => html.match(new RegExp('function ' + name + '\\([\\s\\S]*?\\n  \\}'))[0];
const { sliderX, sliderVx } = (() => {
  const src = 'const R=' + R + ',L=' + L + ';' + grabFn('sliderX') + '\n' + grabFn('sliderVx') + '\nreturn {sliderX,sliderVx};';
  return new Function(src)();
})();

const S = (id, a) => el(id).getAttribute(a);            // 读 DOM 桩的**实时**属性
const N = (id, a) => parseFloat(S(id, a));
const trx = (id) => {
  const t = S(id, 'transform');
  const m = /translate\(([-\d.]+),([-\d.]+)\)/.exec(t);
  if (!m) throw new Error(id + ' 的 transform 异常: ' + t);
  return { x: +m[1], y: +m[2] };
};

/* ================= 3. 静态结构清单 ================= */
console.log('\n[1] SVG 部件清单（每个部件独立元素 + id）');
const need = {
  frame: '机架与导轨组', guideRail: '导轨', railSlot: '导轨滑槽', bearing: '机架轴承座',
  crankCircle: '曲柄轨迹圆(虚线)', crank: '曲柄', rod: '连杆', slider: '滑块', sliderGroup: '滑块组',
  pinA: '铰点 A', pinB: '铰点 B'
};
for (const [id, desc] of Object.entries(need)) ok(html.includes('id="' + id + '"'), desc + '  #' + id);
ok(/stroke-dasharray/.test(html.match(/id="crankCircle"[\s\S]*?\/>/)[0]), '曲柄轨迹圆为虚线（仅参考）');
ok(!/(innerHTML|createElement|appendChild|removeChild)/.test(html), '未重建/增删 SVG 节点（每帧只改坐标与 transform）');
ok(!/(setInterval|setTimeout)/.test(html), '未使用固定步长定时器');
ok(/requestAnimationFrame/.test(html), '使用 requestAnimationFrame 驱动');
ok(/<svg[\s\S]*<\/svg>/.test(html) && !/<img|https?:\/\/[^"]*\.(js|css)/.test(html), '内联 SVG、无外部资源/第三方库');

/* ================= 4. 初始位形自洽（曾发现此处不一致） ================= */
console.log('\n[2] 初始静态位形 = θ=0 时的解析位形');
const xAt0 = sliderX(0, R, L);
ok(Math.abs(xAt0 - (R + L)) < 1e-12, 'x(0) = r+L = ' + (R + L) + ' mm');
ok(Math.abs(N('crankCircle', 'r') - R * SCALE) < 1e-9, '轨迹圆半径 = r·SCALE', String(N('crankCircle', 'r')));
ok(N('origin', 'cx') === OX && N('origin', 'cy') === OY, '回转中心 O 与脚本一致，且落在导轨 y=' + OY + ' 上');
ok(Math.abs(N('crank', 'x1') - OX) < 1e-9 && Math.abs(N('crank', 'y1') - OY) < 1e-9, '曲柄起点 = O');
ok(Math.abs(N('pinA', 'cx') - (OX + R * SCALE)) < 1e-9 && Math.abs(N('pinA', 'cy') - OY) < 1e-9,
   '铰点 A 初值 = (O + r·SCALE) = (' + (OX + R * SCALE) + ',' + OY + ')');
ok(Math.abs(N('crank', 'x2') - N('pinA', 'cx')) < 1e-9, '曲柄末端与铰点 A 重合');
ok(Math.abs(N('rod', 'x1') - N('pinA', 'cx')) < 1e-9, '连杆起点与铰点 A 重合');
const sg0 = trx('sliderGroup');
// 额外检查：HTML **静态标记**也必须是 θ=0 位形（曾发现此处写成 θ=180° 的位置）
ok(Math.abs(parseFloat(A0('rod', 'x2')) - sg0.x) < 1e-9,
   '静态标记中连杆末端与滑块一致（不是滞后的旧值）',
   'rod.x2=' + A0('rod', 'x2') + ' vs sliderGroup=' + A0('sliderGroup', 'transform'));
ok(Math.abs((parseFloat(A0('rod', 'x2')) - parseFloat(A0('rod', 'x1'))) / SCALE - L) < 1e-9,
   '静态标记的连杆长度 = L = ' + L + ' mm',
   ((parseFloat(A0('rod', 'x2')) - parseFloat(A0('rod', 'x1'))) / SCALE).toFixed(3) + ' mm');
ok(Math.abs(sg0.x - (OX + xAt0 * SCALE)) < 1e-9 && Math.abs(sg0.y - OY) < 1e-9,
   '滑块初值 = (O + x(0)·SCALE) = (' + (OX + xAt0 * SCALE) + ',' + OY + ')', 'translate(' + sg0.x + ',' + sg0.y + ')');
ok(Math.abs(N('rod', 'x2') - sg0.x) < 1e-9 && Math.abs(N('rod', 'y2') - sg0.y) < 1e-9, '连杆末端与铰点 B 重合');
ok(Math.abs(Math.hypot(N('rod', 'x2') - N('rod', 'x1'), N('rod', 'y2') - N('rod', 'y1')) / SCALE - L) < 1e-9,
   '初始连杆长度 = L', (Math.hypot(N('rod', 'x2') - N('rod', 'x1'), N('rod', 'y2') - N('rod', 'y1')) / SCALE).toFixed(6) + ' mm');
ok(Math.abs(N('pinB', 'cx')) < 1e-9 && Math.abs(N('pinB', 'cy')) < 1e-9, '铰点 B 位于滑块组原点（同一 translate，结构上不可分离）');

/* ================= 5. 运动学：公式、极值、可解性 ================= */
console.log('\n[3] 运动学模型 x(θ) = r·cosθ + √(L²−r²sin²θ)');
ok(Math.abs(sliderX(0, R, L) - (R + L)) < 1e-12, 'θ=0 → r+L = ' + (R + L) + ' mm');
ok(Math.abs(sliderX(Math.PI, R, L) - (L - R)) < 1e-12, 'θ=π → L−r = ' + (L - R) + ' mm');
ok(Math.abs(sliderX(Math.PI / 2, R, L) - Math.sqrt(L * L - R * R)) < 1e-12, 'θ=π/2 → √(L²−r²)');
ok(L > R, 'L > r：机构可整周回转（本题 L=2r，是最苛刻的合法工况）');
let minRoot = Infinity, rng = [Infinity, -Infinity], maxBeta = 0, minGamma = Infinity;
for (let i = 0; i <= 200000; i++) {
  const t = (i / 200000) * 2 * Math.PI, s = Math.sin(t);
  minRoot = Math.min(minRoot, L * L - R * R * s * s);
  const x = sliderX(t, R, L);
  rng = [Math.min(rng[0], x), Math.max(rng[1], x)];
  maxBeta = Math.max(maxBeta, Math.abs(Math.asin(R * s / L) * 180 / Math.PI));
  minGamma = Math.min(minGamma, 90 - Math.abs(Math.asin(R * s / L) * 180 / Math.PI));
}
ok(minRoot > 0, '根号内 L²−r²sin²θ 恒正 ⇒ 全程有解', 'min=' + minRoot);
ok(Math.abs((rng[1] - rng[0]) - 2 * R) < 1e-9, '滑块行程 = 2r = ' + (2 * R) + ' mm', '[' + rng[0].toFixed(3) + ', ' + rng[1].toFixed(3) + ']');
ok(Math.abs(maxBeta - 30) < 1e-9, '连杆摆角峰值 = asin(r/L) = 30°', maxBeta.toFixed(4) + '°');
ok(minGamma > 40, '传动角最低 ' + minGamma.toFixed(2) + '°（>40°，机构可用）');
let maxVErr = 0;
for (let i = 0; i < 4000; i++) {
  const t = (i / 4000) * 2 * Math.PI + 0.011, h = 1e-7;
  maxVErr = Math.max(maxVErr, Math.abs((sliderX(t + h, R, L) - sliderX(t - h, R, L)) / (2 * h) - sliderVx(t, R, L)));
}
ok(maxVErr < 1e-5, 'HUD 用的速度解析式与中心差分一致', 'max err=' + maxVErr.toExponential(2));

/* ================= 6. 驱动真实 rAF 循环：三项验收 ================= */
console.log('\n[4] 执行文件中的真实 frame()/renderFrame()（rA F 时间戳驱动）');
console.log('    —— 验收项：两铰点不脱开、滑块不偏离导轨 ——');
let worstA = 0, worstRod = 0, worstRail = 0, worstB = 0, minBx = Infinity, maxBx = -Infinity;
let frames = 0, vPeak = 0;
const HP = 1e-9;
// 依次喂入真实帧间隔（含抖动、含大间隔），共约 30 s
const dts = [];
for (let i = 0; i < 1800; i++) dts.push(i % 5 === 4 ? 64 : 1000 / 60);
let clock = 0;
rafCb(clock);                                   // 首帧对时
let prevBx = null, prevT = 0;
for (const dtMs of dts) {
  clock += dtMs; rafCb(clock);
  const ax = N('pinA', 'cx'), ay = N('pinA', 'cy');
  const bx = trx('sliderGroup').x, by = trx('sliderGroup').y;
  worstA = Math.max(worstA, Math.abs(Math.hypot(ax - OX, ay - OY) - R * SCALE));
  worstRod = Math.max(worstRod, Math.abs(Math.hypot(bx - ax, by - ay) / SCALE - L));
  worstRail = Math.max(worstRail, Math.abs(by - OY));
  // 铰点 B 是滑块组内局部 (0,0)，其页面坐标即 (bx,by)，与滑块几何中心恒重合
  worstB = Math.max(worstB, Math.abs(N('pinB', 'cx')), Math.abs(N('pinB', 'cy')));
  minBx = Math.min(minBx, bx); maxBx = Math.max(maxBx, bx);
  if (prevBx !== null) vPeak = Math.max(vPeak, Math.abs(bx - prevBx) / (dtMs / 1000) / SCALE);
  prevBx = bx; frames++;
  // HUD 的 θ 是否为数值
  if (!Number.isFinite(parseFloat(el('outDeg').textContent))) throw new Error('θ 显示异常');
}
// 格式化会带来 5e-4 的舍入，故容差取 1e-3
ok(worstA < 1e-3, '铰点 A 始终在曲柄端点：|OA| ≡ r', 'max|err|=' + worstA.toExponential(2) + ' 单位');
ok(worstRod < 1e-3, '铰点 B 始终连在连杆上：|AB| ≡ L = ' + L + ' mm', 'max|err|=' + worstRod.toExponential(2) + ' mm');
ok(worstB < HP, '铰点 B 与滑块中心恒重合（同一 transform）', 'max|err|=' + worstB.toExponential(2));
ok(worstRail < HP, '滑块/铰点 B 的 y 恒等于导轨 y=' + OY + '（不偏离导轨）', 'max|err|=' + worstRail.toExponential(2));
ok(Math.abs((maxBx - minBx) - 2 * R * SCALE) < 0.01, '往复区间恰为 2r·SCALE = ' + (2 * R * SCALE),
   (maxBx - minBx).toFixed(2) + ' 单位');

console.log('\n    —— 验收项：匀速转动、转速与帧率/窗口切换无关 ——');
const degFor = (ms) => ((W * ms / 1000) % (2 * Math.PI)) * 180 / Math.PI;
const drive = (gen) => {
  el('btnToggle').handlers.get('click')();            // 暂停
  el('btnToggle').handlers.get('click')();            // 继续：脚本以此刻重新对时
  const t0 = clock;
  const d0 = parseFloat(el('outDeg').textContent);
  for (const dt of gen) { clock += dt; rafCb(clock); }
  const d1 = parseFloat(el('outDeg').textContent);
  return { ms: clock - t0, deg: d1, d0 };
};
const steadyGen = Array(600).fill(1000 / 60);
let r2 = 1; const jitGen = [];
for (let i = 0; i < 400; i++) { r2 = (r2 * 1103515245 + 12345) % 2147483648; jitGen.push(4 + r2 / 2147483648 * 60); }
const A10 = drive(steadyGen);
const B10 = drive(jitGen);
ok(Math.abs(A10.deg - degFor(A10.ms)) < 0.05, '定帧率 60fps：θ = ω·实际时长',
   A10.ms.toFixed(1) + ' ms → ' + A10.deg + '°（理论 ' + degFor(A10.ms).toFixed(2) + '°）');
ok(Math.abs(B10.deg - degFor(B10.ms)) < 0.05, '抖动 4~64ms：θ = ω·实际时长（与帧率无关）',
   B10.ms.toFixed(1) + ' ms → ' + B10.deg + '°（理论 ' + degFor(B10.ms).toFixed(2) + '°）');
// 窗口切换：暂停很久再继续，θ 不应跳变（lastTs 重置）
const before = parseFloat(el('outDeg').textContent);
clock += 600000; rafCb(clock);                       // 模拟 10 分钟后台（此时仍在运行）
const afterLong = parseFloat(el('outDeg').textContent);
ok(Math.abs(afterLong - before) < 0.05, '单次超大间隔后仍按真实时长积分（不跳变、不停摆）',
   before + '° → ' + afterLong + '°');
el('btnToggle').handlers.get('click')();             // 暂停
const paused = parseFloat(el('outDeg').textContent);
clock += 60000; rafCb(clock);
ok(parseFloat(el('outDeg').textContent) === paused, '暂停期间角度冻结', paused + '°');
el('btnToggle').handlers.get('click')();             // 继续
const justResumed = parseFloat(el('outDeg').textContent);
clock += 1000 / 60; rafCb(clock);
ok(Math.abs(parseFloat(el('outDeg').textContent) - justResumed) < 0.05,
   '从后台切回：继续后首帧不跳变', justResumed + '°');
// 角速度可调时 θ 仍只由 ω·dt 决定
el('omega').value = '4';
el('omega').handlers.get('input')();
ok(el('outOmega').textContent.startsWith('4'), 'ω 改变后 HUD 同步', el('outOmega').textContent);
const q0 = parseFloat(el('outDeg').textContent);
const q1 = drive([1000]).deg;
ok(Math.abs(((q1 - q0) + 360) % 360 - 4 * 180 / Math.PI) < 0.05, 'ω=4 时 1 s 转过 4 rad ≈ 229.18°',
   (((q1 - q0) + 360) % 360).toFixed(2) + '°');

console.log('\n[5] 复位与实时显示');
const bxBefore = trx('sliderGroup').x;
el('btnReset').handlers.get('click')();
ok(parseFloat(el('outDeg').textContent) === 0, '复位后 θ=0', el('outDeg').textContent);
ok(Math.abs(trx('sliderGroup').x - (OX + xAt0 * SCALE)) < 1e-9, '复位后滑块回到 x=r+L 位置');
ok(Math.abs(N('pinA', 'cx') - (OX + R * SCALE)) < 1e-9, '复位后铰点 A 回到 θ=0 位置');
ok(el('outDeg').textContent.endsWith('°') && el('outRad').textContent.endsWith('rad'),
   '同时给出角度制与弧度制', el('outDeg').textContent + ' / ' + el('outRad').textContent);
ok(el('outX').textContent.endsWith('mm'), '实时显示滑块位移 x(θ)', el('outX').textContent);
ok(el('strokeTxt').textContent.includes(String(2 * R)), '行程标注按参数生成', el('strokeTxt').textContent);

console.log('\n' + (fail ? '❌ 失败 ' + fail + ' 项' : '✅ 全部通过（共 ' + frames + ' 帧驱动）'));
if (fail) process.exitCode = 1;
