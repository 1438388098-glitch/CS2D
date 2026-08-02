// 轻量 DQN 库（零依赖纯 JS）：MLP 前向 + 反向传播 + Adam + 经验回放 + target 网络 + JSON 序列化
// 网络结构: 输入层 obs(n) → 隐层 hidden(tanh) → 输出层 Q 值(线性)
// 用法: net = new DQN({ input: 12, hidden: 24, output: 6 }); net.forward(obs); net.trainBatch(...)
//       序列化: net.toJSON() → { iw, hb, ow, ob }  反序列化: dqnFromJSON(json)

export const DQN_LEARN_RATE = 0.002;
export const DQN_GAMMA = 0.95;
export const DQN_EPS_START = 1.0;
export const DQN_EPS_END = 0.05;
export const DQN_EPS_DECAY = 0.9995; // 每步 ε 衰减
export const DQN_REPLAY_CAP = 20000;
export const DQN_BATCH = 32;
export const DQN_TARGET_SYNC = 500; // 每 N 步同步 target 网络

function tanh(x) { return Math.tanh(x); }
function dtanh(x) { const t = Math.tanh(x); return 1 - t * t; }

export class DQN {
  constructor({ input, hidden, output }) {
    this.input = input;
    this.hidden = hidden;
    this.output = output;
    this.reset();
  }

  reset() {
    const scale = (n) => Math.sqrt(2 / n);
    // iw[hidden][input+1]  行=隐层神经元, 列=输入(+偏置)
    this.iw = this._rand2d(this.hidden, this.input + 1, scale(this.input));
    // ow[output][hidden+1] 行=输出神经元, 列=隐层(+偏置)
    this.ow = this._rand2d(this.output, this.hidden + 1, scale(this.hidden));
    this.iwM = this._zeros(this.hidden, this.input + 1);
    this.iwV = this._zeros(this.hidden, this.input + 1);
    this.owM = this._zeros(this.output, this.hidden + 1);
    this.owV = this._zeros(this.output, this.hidden + 1);
  }

  _rand2d(r, c, s) {
    return Array.from({ length: r }, () => Array.from({ length: c }, () => (Math.random() * 2 - 1) * s));
  }
  _zeros(r, c) {
    return Array.from({ length: r }, () => new Array(c).fill(0));
  }

  // 前向: obs 数组 → Q 值数组
  forward(obs) {
    const n = this.input, h = this.hidden;
    if (obs.length !== n) throw new Error('DQN obs 维度错误: ' + obs.length + ' != ' + n);
    // 隐层激活
    this.hAct = new Array(h);
    for (let j = 0; j < h; j++) {
      let s = this.iw[j][n]; // 偏置
      const row = this.iw[j];
      for (let i = 0; i < n; i++) s += row[i] * obs[i];
      this.hAct[j] = tanh(s);
    }
    // 输出 Q 值
    const q = new Array(this.output);
    for (let k = 0; k < this.output; k++) {
      let s = this.ow[k][h]; // 偏置
      const row = this.ow[k];
      for (let j = 0; j < h; j++) s += row[j] * this.hAct[j];
      q[k] = s;
    }
    return q;
  }

  // 单个样本反向传播（标准 DQN TD 目标）: (s, a, r, s', done)
  // 返回 TD 误差（训练监控用）
  trainStep(s, a, r, s2, done) {
    let target;
    if (done) {
      target = r;
    } else {
      const q2 = this.forward(s2);
      let maxQ2 = -Infinity;
      for (let k = 0; k < q2.length; k++) if (q2[k] > maxQ2) maxQ2 = q2[k];
      target = r + DQN_GAMMA * maxQ2;
    }
    const qs = this.forward(s);
    const hAct = this.hAct;
    const delta = target - qs[a];
    // 输出层梯度（仅对执行的动作 a 有梯度）
    const oGrad = new Array(this.output).fill(0);
    oGrad[a] = delta;
    // 先算隐层梯度（必须用更新前的 ow），再更新权重
    const hGrad = new Array(this.hidden).fill(0);
    for (let j = 0; j < this.hidden; j++) {
      let sAcc = 0;
      for (let k = 0; k < this.output; k++) sAcc += this.ow[k][j] * oGrad[k];
      hGrad[j] = sAcc * dtanh(hAct[j]);
    }
    for (let k = 0; k < this.output; k++) {
      this._adam(this.owM[k], this.owV[k], this.ow[k], oGrad[k], hAct, this.hidden);
    }
    for (let j = 0; j < this.hidden; j++) {
      this._adam(this.iwM[j], this.iwV[j], this.iw[j], hGrad[j], s, this.input);
    }
    return delta;
  }

  // Adam 单行更新：row 是权重行（含偏置），g 是标量梯度，act 是输入激活（含偏置1）
  _adam(mRow, vRow, row, g, act, actN) {
    const t = 1e-8;
    for (let i = 0; i <= actN; i++) {
      const gx = g * (i < actN ? act[i] : 1);
      mRow[i] = 0.9 * mRow[i] + 0.1 * gx;
      vRow[i] = 0.999 * vRow[i] + 0.001 * gx * gx;
      row[i] += DQN_LEARN_RATE * mRow[i] / (Math.sqrt(vRow[i]) + t);
    }
  }

  // 从 target 网络复制权重
  copyFrom(other) {
    for (let j = 0; j < this.hidden; j++) for (let i = 0; i < this.input + 1; i++) this.iw[j][i] = other.iw[j][i];
    for (let k = 0; k < this.output; k++) for (let j = 0; j < this.hidden + 1; j++) this.ow[k][j] = other.ow[k][j];
  }

  toJSON() {
    return {
      input: this.input, hidden: this.hidden, output: this.output,
      iw: this.iw, ow: this.ow
    };
  }

  static fromJSON(j) {
    const net = new DQN({ input: j.input, hidden: j.hidden, output: j.output });
    net.iw = j.iw; net.ow = j.ow;
    return net;
  }
}

export function dqnFromJSON(j) {
  if (j instanceof DQN) return j;
  return DQN.fromJSON(j);
}

// 经验回放缓冲（环形）
export class ReplayBuffer {
  constructor(cap = DQN_REPLAY_CAP) {
    this.cap = cap;
    this.buf = [];
    this.pos = 0;
  }
  push(exp) {
    if (this.buf.length < this.cap) this.buf.push(exp);
    else this.buf[this.pos] = exp;
    this.pos = (this.pos + 1) % this.cap;
  }
  sample(batch) {
    const n = this.buf.length;
    if (n < batch) return null;
    const out = [];
    for (let i = 0; i < batch; i++) out.push(this.buf[Math.floor(Math.random() * n)]);
    return out;
  }
  get size() { return this.buf.length; }
}

// ε-greedy 动作选择
export function egreedy(net, obs, eps) {
  if (Math.random() < eps) return Math.floor(Math.random() * net.output);
  const q = net.forward(obs);
  let best = 0;
  for (let k = 1; k < q.length; k++) if (q[k] > q[best]) best = k;
  return best;
}
