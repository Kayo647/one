// exp.js —— 三个参数实验：从 crank-slider.html 抽取真实 sliderX/sliderVx 执行
import { readFileSync } from 'node:fs';

const html = readFileSync('crank-slider.html', 'utf8');
const grab = (name) => html.match(new RegExp('function ' + name + '\\([\\s\\S]*?\\n  \\}'))[0];
const { sliderX, sliderVx } = new Function(grab('sliderX') + '\n' + grab('sliderVx') + '\nreturn {sliderX, sliderVx};')();

console.log('（sliderX / sliderVx 直接取自 crank-slider.html 的真实源码）\n');

const TAU = Math.PI * 2;
const N = 72000;                                  // 0.005° 步长
const f = (v, d = 2) => v.toFixed(d);

function analyze(name, r, L, w) {
  const xs = [];
  for (let i = 0; i <= N; i++) xs.push(sliderX(TAU * i / N, r, L));
  const xMax = Math.max(...xs), xMin = Math.min(...xs);
  const stroke = xMax - xMin, mid = (xMax + xMin) / 2, mean = xs.reduce((a, b) => a + b, 0) / (N + 1);

  // 谐波分析：x(θ) − mean = Σ a_k cos kθ + b_k sin kθ
  let a1 = 0, b1 = 0, a2 = 0, b2 = 0;
  for (let i = 0; i <= N; i++) {
    const t = TAU * i / N, x = xs[i] - mean;
    a1 += x * Math.cos(t); b1 += x * Math.sin(t);
    a2 += x * Math.cos(2 * t); b2 += x * Math.sin(2 * t);
  }
  const A1 = 2 * Math.hypot(a1, b1) / (N + 1), A2 = 2 * Math.hypot(a2, b2) / (N + 1);

  // 峰值速度：排除端点（θ=0 与 2π 处 v=0，会漏掉真实峰值）
  let vPeak = 0, tPeak = 0;
  for (let i = 1; i < N; i++) {
    const t = TAU * i / N, v = Math.abs(w * sliderVx(t, r, L));
    if (v > vPeak) { vPeak = v; tPeak = t; }
  }
  const vMean = stroke / (TAU / w);

  // 对称性核对：x 关于 θ=π 对称，即 x(2π−δ) 应严格等于 x(δ)
  let mirror = 0;
  for (let i = 1; i < 180; i++) {
    const dl = i * Math.PI / 180;
    mirror = Math.max(mirror, Math.abs(sliderX(TAU - dl, r, L) - sliderX(dl, r, L)));
  }
  // 速度非均匀度：θ=90° 处（行程中段靠内）的速度与峰值速度之比
  const vMid90 = Math.abs(w * sliderVx(Math.PI / 2, r, L));
  // 偏离纯正弦的程度（相对半行程）
  let wav = 0;
  for (let i = 0; i <= N; i++) {
    const t = TAU * i / N;
    wav = Math.max(wav, Math.abs((xs[i] - mean) - A1 * Math.cos(t)));
  }

  // 连杆直线到回转中心 O 的最近距离
  let dMin = Infinity, dAt = 0;
  for (let i = 0; i <= N; i++) {
    const t = TAU * i / N;
    const ax = r * Math.cos(t), ay = r * Math.sin(t);
    const bx = sliderX(t, r, L), by = 0;
    const dx = bx - ax, dy = by - ay, len2 = dx * dx + dy * dy;
    let u = -(ax * dx + ay * dy) / len2; u = Math.max(0, Math.min(1, u));
    const d = Math.hypot(ax + u * dx, ay + u * dy);
    if (d < dMin) { dMin = d; dAt = t; }
  }

  return { name, r, L, w, xMax, xMin, stroke, mid, mean, A1, A2,
    a2Ratio: A2 / A1, vPeak, tPeak, vMean, vPeakOverMean: vPeak / vMean,
    mirror, vMid90, vMid90Ratio: vMid90 / vPeak, wavRatio: wav / (stroke / 2),
    dMin, dAt, period: TAU / w, ls: L / r };
}

const rows = [
  analyze('A  基准   ', 30, 100, 2),
  analyze('E1 r=50   ', 50, 100, 2),
  analyze('E2 L=32   ', 30, 32, 2),
  analyze('E3 w=4    ', 30, 100, 4)
];
const [A, E1, E2, E3] = rows;

console.log('实验            r    L    w   L/r   行程(mm)   x范围(mm)         中点(mm)  曲线均值(mm)');
for (const q of rows) {
  console.log(q.name + String(q.r).padStart(4) + String(q.L).padStart(5) + String(q.w).padStart(5)
    + f(q.ls).padStart(7) + f(q.stroke, 1).padStart(10)
    + ('   [' + f(q.xMin, 1) + ', ' + f(q.xMax, 1) + ']').padEnd(19)
    + f(q.mid, 1).padStart(8) + f(q.mean, 2).padStart(13));
}

console.log('\n形状指标（都不含 w，故与转速无关）');
console.log('实验          二次谐波/基波 a2/a1   偏离纯正弦   对称残差   峰均比   峰速/θ=90°速度   峰值速度(mm/s) @θ   周期(s)');
for (const q of rows) {
  console.log(q.name + (f(q.a2Ratio * 100) + '%').padStart(18)
    + (f(q.wavRatio * 100) + '%').padStart(13)
    + (f(q.mirror, 6) + ' mm').padStart(12)
    + f(q.vPeakOverMean, 3).padStart(9)
    + f(q.vMid90Ratio, 3).padStart(16)
    + (f(q.vPeak, 1) + ' @' + f(q.tPeak * 180 / Math.PI, 1) + '°').padStart(19)
    + f(q.period, 3).padStart(10));
}

console.log('\n结论核对');
console.log('E1 行程 ' + f(A.stroke, 1) + ' -> ' + f(E1.stroke, 1) + '（= 2r，比值 ' + f(E1.stroke / A.stroke, 3)
  + '）；中点不变 = ' + f(E1.mid, 1) + '；非简谐度 ' + f(A.a2Ratio * 100) + '% -> ' + f(E1.a2Ratio * 100) + '%');
console.log('E2 行程 ' + f(E2.stroke, 1) + '（与基准相同）；中点 = ' + f(E2.mid, 1)
  + '；非简谐度 -> ' + f(E2.a2Ratio * 100) + '%；峰均比 -> ' + f(E2.vPeakOverMean, 3)
  + '（θ=90° 处速度仅为峰值的 ' + f(E2.vMid90Ratio * 100, 1) + '%，基准为 ' + f(A.vMid90Ratio * 100, 1) + '%）');
console.log('E3 行程差 ' + f(Math.abs(E3.stroke - A.stroke), 6) + ' mm，谐波占比差 '
  + f(Math.abs(E3.a2Ratio - A.a2Ratio) * 100, 6) + '%，对称残差差 ' + f(Math.abs(E3.mirror - A.mirror), 9)
  + ' mm  => 曲线完全相同；周期 ' + f(A.period, 3) + ' -> ' + f(E3.period, 3) + ' s');
console.log('几何对照：连杆到回转中心最近距离 —— 基准 ' + f(A.dMin) + ' mm（θ=' + f(A.dAt * 180 / Math.PI, 1)
  + '°）；E2 ' + f(E2.dMin) + ' mm（θ=' + f(E2.dAt * 180 / Math.PI, 1) + '°）；'
  + '滑块最近点 x_min：基准 ' + f(A.xMin, 1) + ' mm，E2 ' + f(E2.xMin, 1) + ' mm（= L − r）');
console.log('解析核对：cos(2π−θ)=cosθ 且 sin²(2π−θ)=sin²θ ⇒ x(2π−θ) ≡ x(θ)，'
  + '即曲线关于 θ=π 严格对称（对称残差恒为 0）⇒ 本机构是"对心曲柄滑块"，无急回特性。'
  + '\n          x(θ) 中不含 w ⇒ 实验 3 的曲线与基准逐点重合。');
