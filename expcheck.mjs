// expcheck.mjs —— 用 DOM 桩执行 三个参数实验.html 的绘图脚本，核对数值
import { readFileSync } from 'node:fs';

const html = readFileSync('三个参数实验.html', 'utf8');
const src = html.match(/<script>([\s\S]*?)<\/script>/)[1];

const NS = 'http://www.w3.org/2000/svg';
const mk = (tag) => ({
  __tag: tag, attrs: new Map(), children: [], _html: '',
  setAttribute(k, v) { this.attrs.set(k, v === null ? 'null' : String(v)); },
  getAttribute(k) { return this.attrs.has(k) ? this.attrs.get(k) : null; },
  appendChild(c) { this.children.push(c); return c; },
  set innerHTML(v) { this._html = String(v); this.children.length = 0; },
  get innerHTML() { return this._html; },
  querySelector() { return null; }
});
const chart = mk('svg');
const tbody = mk('tbody');
const doc = {
  getElementById: (id) => (id === 'chart' ? chart : null),
  createElementNS: (ns, tag) => mk(tag),
  createElement: (tag) => mk(tag),
  querySelector: (sel) => (sel === '#tbl tbody' ? tbody : null)
};
new Function('document', src)(doc);

const paths = chart.children.filter((c) => c.__tag === 'path');
const texts = [];
(function walk(n) { for (const c of n.children) { if (c.__tag === 'text') texts.push(c); walk(c); } })(chart);

let fail = 0;
const ok = (c, m, e = '') => { if (!c) { fail++; console.log('  x ' + m + (e ? '  ' + e : '')); } else console.log('  v ' + m + (e ? '  ' + e : '')); };

console.log('曲线 path 数量 = ' + paths.length + '（应为 4）');
ok(paths.length === 4, '四条曲线都已生成');
for (const p of paths) {
  const d = p.getAttribute('d') || '';
  const pts = d.split(/[ML]/).filter(Boolean);
  ok(pts.length === 721, '路径点数 721', 'stroke=' + p.getAttribute('stroke') + ' 点数=' + pts.length);
}
// 实验3 应与基准逐点重合：比较前两条（基准、E1）与第 4 条（E3）
const dA = paths[0].getAttribute('d'), dE3 = paths[3].getAttribute('d');
ok(dA === dE3, '实验3（ω=4）的路径与基准逐点完全相同（ω 不改变几何）');
const dE1 = paths[1].getAttribute('d'), dE2 = paths[2].getAttribute('d');
ok(dA !== dE1 && dA !== dE2, '实验1、实验2 的路径与基准不同（几何确实变了）');
// 表格行
console.log('\n表格输出（由页面脚本自己算出）：');
ok(tbody.children.length === 4, '表格四行已生成');
for (const tr of tbody.children) {
  const cells = [...tr.innerHTML.matchAll(/<td[^>]*>(.*?)<\/td>/g)].map((m) => m[1].replace(/<[^>]+>/g, ''));
  console.log('   ' + cells.join('  |  '));
}
// 关键数值断言
const rows = tbody.children.map((tr) => [...tr.innerHTML.matchAll(/<td[^>]*>(.*?)<\/td>/g)].map((m) => m[1]));
const num = (r, i) => parseFloat(String(rows[r][i]).replace(/<[^>]+>/g, ''));
ok(Math.abs(num(0, 5) - 60) < 0.05, '基准行程 = 60 mm', String(num(0, 5)));
ok(Math.abs(num(1, 5) - 100) < 0.05, '实验1 行程 = 100 mm（= 2r）', String(num(1, 5)));
ok(Math.abs(num(2, 5) - 60) < 0.05, '实验2 行程仍 = 60 mm（形状变、幅度不变）', String(num(2, 5)));
ok(Math.abs(num(2, 7) - 32) < 0.05, '实验2 中点 = 32 mm（= L）', String(num(2, 7)));
ok(Math.abs(num(3, 5) - num(0, 5)) < 1e-9, '实验3 行程与基准完全相同', String(num(3, 5)));
ok(Math.abs(num(3, 8) - num(0, 8)) < 1e-9, '实验3 谐波占比与基准完全相同', String(num(3, 8)));
ok(Math.abs(num(3, 10) - 1.571) < 0.01, '实验3 周期减半 = 1.571 s', String(num(3, 10)));

console.log('\n' + (fail ? 'XX 失败 ' + fail + ' 项' : 'OK 全部通过'));
if (fail) process.exitCode = 1;
