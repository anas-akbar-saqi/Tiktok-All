/* ============================================================
   CASIO fx-991ES PLUS  —  script.js
   ============================================================ */
"use strict";

// ══════════ STATE ══════════
const S = {
  input: "",
  cursorPos: 0,
  result: "",
  shiftOn: false,
  alphaOn: false,
  hypOn: false,
  angleMode: "DEG", // DEG | RAD | GRAD
  memory: 0,
  ans: 0,
  history: [],
  histIdx: -1,
  isError: false,
  lastWasEq: false,
};

// ══════════ DOM ══════════
const elInput = document.getElementById("display-input");
const elResult = document.getElementById("display-result");
const elScreen = document.getElementById("display-screen");
const elCalc = document.getElementById("calculator");
const elHistList = document.getElementById("history-list");
const elHistPanel = document.getElementById("history-panel");
const elHistToggle = document.getElementById("history-toggle");
const elHistClear = document.getElementById("history-clear");
const elAngleBadge = document.getElementById("angle-badge");

const indShift = document.getElementById("ind-shift");
const indAlpha = document.getElementById("ind-alpha");
const indDeg = document.getElementById("ind-deg");
const indRad = document.getElementById("ind-rad");
const indGrad = document.getElementById("ind-grad");
const indMath = document.getElementById("ind-math");

// ══════════ ANGLE HELPERS ══════════
const toRad = (x) =>
  S.angleMode === "RAD"
    ? x
    : S.angleMode === "GRAD"
      ? (x * Math.PI) / 200
      : (x * Math.PI) / 180;
const fromRad = (x) =>
  S.angleMode === "RAD"
    ? x
    : S.angleMode === "GRAD"
      ? (x * 200) / Math.PI
      : (x * 180) / Math.PI;

// ══════════ MATH ENGINE ══════════
function preprocess(expr) {
  return expr
    .replace(/÷/g, "/")
    .replace(/×/g, "*")
    .replace(/−/g, "-")
    .replace(/×10\^/g, "*10^")
    .replace(/(\d)\s*\(/g, "$1*(")
    .replace(/\)\s*\(/g, ")*(")
    .replace(/\)\s*(\d)/g, ")*$1")
    .replace(/π/g, "PI")
    .replace(
      /(\d)(sin|cos|tan|asin|acos|atan|sinh|cosh|tanh|sqrt|cbrt|log|ln|exp|abs)/g,
      "$1*$2",
    )
    .replace(/PI(sin|cos|tan|sqrt|cbrt|log|ln|exp)/g, "PI*$1");
}

function tokenise(s) {
  const toks = [];
  let i = 0;
  while (i < s.length) {
    if (/\s/.test(s[i])) {
      i++;
      continue;
    }
    if (/[0-9]/.test(s[i]) || (s[i] === "." && /[0-9]/.test(s[i + 1] || ""))) {
      let n = "";
      while (i < s.length && /[0-9.]/.test(s[i])) n += s[i++];
      if (i < s.length && s[i] === "E") {
        n += "E";
        i++;
        if (s[i] === "+" || s[i] === "-") n += s[i++];
        while (i < s.length && /[0-9]/.test(s[i])) n += s[i++];
      }
      toks.push({ t: "num", v: parseFloat(n) });
      continue;
    }
    const fns = [
      "sinh",
      "cosh",
      "tanh",
      "asin",
      "acos",
      "atan",
      "sin",
      "cos",
      "tan",
      "sqrt",
      "cbrt",
      "log10",
      "log2",
      "log",
      "ln",
      "exp",
      "abs",
      "factorial",
      "nCr",
      "nPr",
      "Ans",
      "ans",
      "PI",
      "e",
    ];
    let hit = false;
    for (const fn of fns.sort((a, b) => b.length - a.length)) {
      if (s.slice(i).startsWith(fn)) {
        toks.push({ t: "fn", v: fn });
        i += fn.length;
        hit = true;
        break;
      }
    }
    if (hit) continue;
    if ("+-*/^(),%".includes(s[i])) {
      toks.push({ t: "op", v: s[i] });
      i++;
      continue;
    }
    i++;
  }
  return toks;
}

class Parser {
  constructor(toks) {
    this.toks = toks;
    this.p = 0;
  }
  peek() {
    return this.toks[this.p];
  }
  eat() {
    return this.toks[this.p++];
  }
  expect(v) {
    const t = this.eat();
    if (!t || t.v !== v) throw new Error("Syntax ERROR");
    return t;
  }

  expr(minP = 0) {
    let L = this.unary();
    while (true) {
      const op = this.peek();
      if (!op || op.t !== "op") break;
      const prec = { "+": 1, "-": 1, "*": 2, "/": 2, "%": 2, "^": 3 }[op.v];
      if (prec === undefined || prec <= minP) break;
      this.eat();
      if (op.v === "^") {
        L = Math.pow(L, this.expr(prec - 1));
      } else if (op.v === "+") {
        L += this.expr(prec);
      } else if (op.v === "-") {
        L -= this.expr(prec);
      } else if (op.v === "*") {
        L *= this.expr(prec);
      } else if (op.v === "/") {
        const R = this.expr(prec);
        if (R === 0) throw new Error("Math ERROR");
        L /= R;
      } else if (op.v === "%") {
        L = L % this.expr(prec);
      }
    }
    return L;
  }

  unary() {
    const t = this.peek();
    if (!t) throw new Error("Unexpected end");
    if (t.t === "op" && t.v === "-") {
      this.eat();
      return -this.primary();
    }
    if (t.t === "op" && t.v === "+") {
      this.eat();
      return this.primary();
    }
    return this.primary();
  }

  primary() {
    const t = this.peek();
    if (!t) throw new Error("Unexpected end");
    if (t.t === "num") {
      this.eat();
      return t.v;
    }
    if (t.t === "fn" && t.v === "PI") {
      this.eat();
      return Math.PI;
    }
    if (t.t === "fn" && t.v === "e") {
      this.eat();
      return Math.E;
    }
    if (t.t === "fn" && (t.v === "Ans" || t.v === "ans")) {
      this.eat();
      return S.ans;
    }
    if (t.t === "fn") {
      this.eat();
      this.expect("(");
      const a = this.expr(0);
      if (["nCr", "nPr"].includes(t.v)) {
        this.expect(",");
        const b = this.expr(0);
        this.expect(")");
        return applyBin(t.v, a, b);
      }
      if (this.peek() && this.peek().v === ",") {
        // two-arg function
        this.eat();
        const b = this.expr(0);
        if (this.peek() && this.peek().v === ")") this.eat();
        return applyBin(t.v, a, b);
      }
      if (this.peek() && this.peek().v === ")") this.eat();
      return applyFn(t.v, a);
    }
    if (t.t === "op" && t.v === "(") {
      this.eat();
      const v = this.expr(0);
      if (this.peek() && this.peek().v === ")") this.eat();
      return v;
    }
    throw new Error("Syntax ERROR");
  }
}

function applyFn(name, x) {
  switch (name) {
    case "sin":
      return Math.sin(toRad(x));
    case "cos":
      return Math.cos(toRad(x));
    case "tan":
      if (S.angleMode === "DEG" && Math.abs(x % 180) === 90)
        throw new Error("Math ERROR");
      return Math.tan(toRad(x));
    case "asin":
      if (Math.abs(x) > 1) throw new Error("Math ERROR");
      return fromRad(Math.asin(x));
    case "acos":
      if (Math.abs(x) > 1) throw new Error("Math ERROR");
      return fromRad(Math.acos(x));
    case "atan":
      return fromRad(Math.atan(x));
    case "sinh":
      return Math.sinh(x);
    case "cosh":
      return Math.cosh(x);
    case "tanh":
      return Math.tanh(x);
    case "sqrt":
      if (x < 0) throw new Error("Math ERROR");
      return Math.sqrt(x);
    case "cbrt":
      return Math.cbrt(x);
    case "log":
    case "log10":
      if (x <= 0) throw new Error("Math ERROR");
      return Math.log10(x);
    case "log2":
      if (x <= 0) throw new Error("Math ERROR");
      return Math.log2(x);
    case "ln":
      if (x <= 0) throw new Error("Math ERROR");
      return Math.log(x);
    case "exp":
      return Math.exp(x);
    case "abs":
      return Math.abs(x);
    case "factorial":
      return factorial(x);
    default:
      throw new Error("Unknown: " + name);
  }
}
function applyBin(name, a, b) {
  if (name === "nCr") return nCr(a, b);
  if (name === "nPr") return nPr(a, b);
  throw new Error("Unknown: " + name);
}

function factorial(n) {
  n = Math.round(n);
  if (n < 0 || n > 69) throw new Error("Math ERROR");
  let r = 1;
  for (let i = 2; i <= n; i++) r *= i;
  return r;
}
function nCr(n, r) {
  n = Math.round(n);
  r = Math.round(r);
  if (r < 0 || r > n) return 0;
  return factorial(n) / (factorial(r) * factorial(n - r));
}
function nPr(n, r) {
  n = Math.round(n);
  r = Math.round(r);
  if (r < 0 || r > n) return 0;
  return factorial(n) / factorial(n - r);
}

function calcExpr(expr) {
  if (expr.includes("∫(")) return evalIntegral(expr);
  if (expr.includes("d/dx(")) return evalDerivative(expr);
  const processed = preprocess(expr);
  const toks = tokenise(processed);
  if (!toks.length) return "";
  const p = new Parser(toks);
  const val = p.expr(0);
  if (p.peek()) throw new Error("Syntax ERROR");
  return val;
}

// ── Definite Integral (Simpson's rule) ──
function evalIntegral(expr) {
  const m = expr.match(/∫\((.+),([^,]+),([^,\)]+)\)/);
  if (!m) throw new Error("Syntax ERROR");
  const [, fExpr, aStr, bStr] = m;
  const a = calcExpr(aStr.trim());
  const b = calcExpr(bStr.trim());
  const N = 1000;
  const h = (b - a) / N;
  let sum = 0;
  for (let i = 0; i <= N; i++) {
    const x = a + i * h;
    const w = i === 0 || i === N ? 1 : i % 2 === 0 ? 2 : 4;
    const sub = fExpr.replace(/\bx\b/g, `(${x})`);
    sum += w * calcExpr(sub);
  }
  return (sum * h) / 3;
}

// ── Numerical Derivative ──
function evalDerivative(expr) {
  const m = expr.match(/d\/dx\((.+),([^,\)]+)\)/);
  if (!m) throw new Error("Syntax ERROR");
  const [, fExpr, xStr] = m;
  const xv = calcExpr(xStr.trim());
  const h = 1e-7;
  const f = (x) => {
    const sub = fExpr.replace(/\bx\b/g, `(${x})`);
    return calcExpr(sub);
  };
  return (f(xv + h) - f(xv - h)) / (2 * h);
}

// ── Format result ──
function fmt(v) {
  if (!isFinite(v)) throw new Error("Math ERROR");
  if (Number.isInteger(v) && Math.abs(v) < 1e15) return String(v);
  const rounded = Math.round(v * 1e10) / 1e10;
  if (
    Math.abs(rounded) >= 1e10 ||
    (Math.abs(rounded) < 1e-4 && rounded !== 0)
  ) {
    const e = v.toExponential(6).replace(/\.?0+(e)/, "$1");
    return e.replace("e+", "×10^").replace("e-", "×10^-").replace("e", "×10^");
  }
  return String(rounded);
}

// ── Fraction conversion ──
function toFrac(x) {
  if (!isFinite(x) || x === 0) return null;
  const tol = 1e-9;
  let h1 = 1,
    h2 = 0,
    k1 = 0,
    k2 = 1,
    b = x;
  do {
    const a = Math.floor(b);
    let t = h1;
    h1 = a * h1 + h2;
    h2 = t;
    t = k1;
    k1 = a * k1 + k2;
    k2 = t;
    b = 1 / (b - a);
  } while (Math.abs(x - h1 / k1) > Math.abs(x) * tol && k1 < 10000);
  if (k1 > 1000 || k1 <= 1) return null;
  return `${h1}/${k1}`;
}

// ══════════ DISPLAY UPDATE ══════════
function renderDisplay() {
  let d = S.input
    .replace(/\*/g, "×")
    .replace(/\//g, "÷")
    .replace(/−/g, "−")
    .replace(/sqrt\(/g, "√(")
    .replace(/cbrt\(/g, "³√(")
    .replace(/×10\^/g, "×10^");
  elInput.textContent = d;
  elResult.textContent = S.result;
  updateInds();
}

function updateInds() {
  indShift.classList.toggle("active", S.shiftOn);
  indAlpha.classList.toggle("active", S.alphaOn);
  indDeg.classList.toggle("active", S.angleMode === "DEG");
  indRad.classList.toggle("active", S.angleMode === "RAD");
  if (indGrad) indGrad.classList.toggle("active", S.angleMode === "GRAD");
}

// ══════════ INPUT HELPERS ══════════
function ins(text) {
  if (S.lastWasEq) {
    if (/^[+\-×÷*/^]/.test(text) || text === "−") {
      S.input = "Ans";
      S.cursorPos = 3;
    } else {
      S.input = "";
      S.cursorPos = 0;
    }
    S.result = "";
    S.lastWasEq = false;
  }
  S.input = S.input.slice(0, S.cursorPos) + text + S.input.slice(S.cursorPos);
  S.cursorPos += text.length;
  S.isError = false;
  renderDisplay();
}

function doEquals() {
  if (!S.input.trim()) return;
  try {
    const v = calcExpr(S.input);
    const r = fmt(v);
    S.ans = v;
    S.result = r;
    addHistory(S.input, r);
    S.lastWasEq = true;
    renderDisplay();
  } catch (e) {
    showErr(e.message || "Syntax ERROR");
  }
}

function showErr(msg) {
  S.result = msg;
  S.isError = true;
  elResult.textContent = msg;
  elScreen.classList.remove("shake");
  void elScreen.offsetWidth;
  elScreen.classList.add("shake");
  setTimeout(() => elScreen.classList.remove("shake"), 350);
}

function doDel() {
  if (S.isError) {
    doAC();
    return;
  }
  if (S.lastWasEq) {
    S.input = "";
    S.cursorPos = 0;
    S.result = "";
    S.lastWasEq = false;
    renderDisplay();
    return;
  }
  if (S.cursorPos === 0) return;
  const before = S.input.slice(0, S.cursorPos);
  const multiToks = [
    "asin(",
    "acos(",
    "atan(",
    "sinh(",
    "cosh(",
    "tanh(",
    "sin(",
    "cos(",
    "tan(",
    "sqrt(",
    "cbrt(",
    "log(",
    "ln(",
    "exp(",
    "abs(",
    "factorial(",
    "nCr(",
    "nPr(",
    "Ans",
    "×10^",
    "d/dx(",
    "∫(",
  ];
  for (const tok of multiToks) {
    if (before.endsWith(tok)) {
      S.input =
        S.input.slice(0, S.cursorPos - tok.length) + S.input.slice(S.cursorPos);
      S.cursorPos -= tok.length;
      renderDisplay();
      return;
    }
  }
  S.input = S.input.slice(0, S.cursorPos - 1) + S.input.slice(S.cursorPos);
  S.cursorPos--;
  renderDisplay();
}

function doAC() {
  S.input = "";
  S.cursorPos = 0;
  S.result = "";
  S.isError = false;
  S.lastWasEq = false;
  S.shiftOn = false;
  S.alphaOn = false;
  S.hypOn = false;
  renderDisplay();
  updateModBtns();
}

// ══════════ BUTTON HANDLER ══════════
function onAction(action, value) {
  // Modifier toggles
  if (action === "shift") {
    S.shiftOn = !S.shiftOn;
    if (S.shiftOn) S.alphaOn = false;
    updateModBtns();
    renderDisplay();
    return;
  }
  if (action === "alpha") {
    S.alphaOn = !S.alphaOn;
    if (S.alphaOn) S.shiftOn = false;
    updateModBtns();
    renderDisplay();
    return;
  }
  if (action === "hyp") {
    S.hypOn = !S.hypOn;
    document.getElementById("btn-hyp").classList.toggle("key-active", S.hypOn);
    return;
  }

  const SH = S.shiftOn,
    AL = S.alphaOn,
    HY = S.hypOn;
  S.shiftOn = false;
  S.alphaOn = false;
  S.hypOn = false;
  updateModBtns();
  document.getElementById("btn-hyp").classList.remove("key-active");

  switch (action) {
    // ─── Digits / dots ───
    case "digit":
      ins(value);
      break;
    case "dot":
      if (AL) ins("e");
      else if (SH) ins("π");
      else ins(".");
      break;

    // ─── Operators ───
    case "plus":
      ins("+");
      break;
    case "minus":
      ins("−");
      break;
    case "multiply":
      ins("×");
      break;
    case "divide":
      ins("÷");
      break;
    case "oparen":
      ins("(");
      break;
    case "cparen":
      ins(")");
      break;

    // ─── Clear / del / eq ───
    case "ac":
      doAC();
      break;
    case "del":
      doDel();
      break;
    case "equals":
      doEquals();
      break;
    case "on":
      doAC();
      break;

    // ─── Ans ───
    case "ans-btn":
      ins("Ans");
      break;

    // ─── Scientific ───
    case "square":
      SH ? ins("^3") : ins("^2");
      break;
    case "power":
      ins("^");
      break;
    case "sqrt":
      SH ? ins("cbrt(") : ins("sqrt(");
      break;
    case "inverse":
      ins("^(-1)");
      break;
    case "log":
      SH ? ins("10^(") : ins("log(");
      break;
    case "ln":
      SH ? ins("exp(") : ins("ln(");
      break;
    case "logbox":
      SH ? ins("10^(") : ins("log(");
      break;

    // ─── Trig ───
    case "sin":
      if (SH && HY) ins("asin(h(");
      else if (SH) ins("asin(");
      else if (HY) ins("sinh(");
      else ins("sin(");
      break;
    case "cos":
      if (SH && HY) ins("acos(h(");
      else if (SH) ins("acos(");
      else if (HY) ins("cosh(");
      else ins("cos(");
      break;
    case "tan":
      if (SH && HY) ins("atan(h(");
      else if (SH) ins("atan(");
      else if (HY) ins("tanh(");
      else ins("tan(");
      break;

    // ─── Negate ───
    case "negate":
      if (S.input === "" || S.lastWasEq) ins("-");
      else ins("(-");
      break;

    // ─── ×10^x ───
    case "exp10":
      if (SH) ins("Ans");
      else ins("×10^");
      break;

    // ─── Fraction ───
    case "fraction":
      if (S.result && S.lastWasEq) {
        const frac = toFrac(S.ans);
        if (frac) {
          S.result = frac;
          elResult.textContent = frac;
          return;
        }
      }
      ins("(");
      break;

    // ─── Calculus ───
    case "integral":
      SH ? ins("d/dx(") : ins("∫(");
      break;
    case "calc":
      doEquals();
      break;

    // ─── Mode ───
    case "mode":
      cycleAngle();
      break;

    // ─── S⟺D ───
    case "sd":
      doSD();
      break;

    // ─── ENG ───
    case "eng":
      doENG();
      break;

    // ─── RCL / STO ───
    case "rcl":
      if (SH) {
        S.memory = S.ans;
        S.result = "Sto→M";
        elResult.textContent = S.result;
      } else ins(String(S.memory));
      break;

    // ─── Memory M+ ───
    case "mem-plus":
      if (SH) {
        S.memory -= S.ans;
      } else {
        S.memory += S.ans;
      }
      S.result = "M=" + fmt(S.memory);
      elResult.textContent = S.result;
      break;

    // ─── DMS ───
    case "dms":
      doDMS();
      break;

    // ─── Navigation ───
    case "nav-left":
      if (S.cursorPos > 0) {
        S.cursorPos--;
        renderDisplay();
      }
      break;
    case "nav-right":
      if (S.cursorPos < S.input.length) {
        S.cursorPos++;
        renderDisplay();
      }
      break;
    case "nav-up":
      navHistory(-1);
      break;
    case "nav-down":
      navHistory(1);
      break;
    case "nav-center":
      doEquals();
      break;

    // ─── Matrix/other stubs ───
    case "matrix-op":
      break;
    case "inverse":
      ins("^(-1)");
      break;
  }
}

// ══════════ ANGLE ══════════
function cycleAngle() {
  S.angleMode =
    S.angleMode === "DEG" ? "RAD" : S.angleMode === "RAD" ? "GRAD" : "DEG";
  elAngleBadge.textContent = S.angleMode;
  updateInds();
}

// ══════════ S↔D ══════════
function doSD() {
  if (!S.result || typeof S.ans !== "number" || !isFinite(S.ans)) return;
  const frac = toFrac(S.ans);
  if (frac && S.result !== frac) {
    S.result = frac;
    elResult.textContent = frac;
  } else {
    S.result = fmt(S.ans);
    elResult.textContent = S.result;
  }
}

// ══════════ ENG ══════════
function doENG() {
  if (typeof S.ans !== "number" || !isFinite(S.ans) || S.ans === 0) return;
  const exp = Math.floor(Math.log10(Math.abs(S.ans)));
  const eng = Math.floor(exp / 3) * 3;
  const man = S.ans / Math.pow(10, eng);
  S.result = `${man.toPrecision(4)}×10^${eng}`;
  elResult.textContent = S.result;
}

// ══════════ DMS ══════════
function doDMS() {
  if (typeof S.ans !== "number") return;
  const v = S.ans;
  const d = Math.floor(v);
  const m = Math.floor((v - d) * 60);
  const sec = ((v - d) * 60 - m) * 60;
  S.result = `${d}°${m}'${sec.toFixed(2)}"`;
  elResult.textContent = S.result;
}

// ══════════ HISTORY ══════════
function addHistory(expr, res) {
  S.history.unshift({ expr, res });
  if (S.history.length > 40) S.history.pop();
  renderHistory();
}
function renderHistory() {
  elHistList.innerHTML = "";
  S.history.forEach((item) => {
    const d = document.createElement("div");
    d.className = "hist-item";
    d.innerHTML = `<div class="hist-expr">${esc(item.expr)}</div><div class="hist-res">${esc(item.res)}</div>`;
    d.onclick = () => {
      S.input = item.expr;
      S.cursorPos = S.input.length;
      S.result = item.res;
      S.lastWasEq = false;
      renderDisplay();
    };
    elHistList.appendChild(d);
  });
}
function navHistory(dir) {
  if (!S.history.length) return;
  S.histIdx = Math.max(-1, Math.min(S.history.length - 1, S.histIdx + dir));
  if (S.histIdx >= 0) {
    S.input = S.history[S.histIdx].expr;
    S.cursorPos = S.input.length;
    S.result = S.history[S.histIdx].res;
    S.lastWasEq = true;
  } else {
    S.input = "";
    S.cursorPos = 0;
    S.result = "";
  }
  renderDisplay();
}
function esc(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// ══════════ MODIFIER BUTTONS ══════════
function updateModBtns() {
  document
    .getElementById("btn-shift")
    .classList.toggle("key-active", S.shiftOn);
  document
    .getElementById("btn-alpha")
    .classList.toggle("key-active", S.alphaOn);
  elCalc.classList.toggle("calc-shift-on", S.shiftOn);
  elCalc.classList.toggle("calc-alpha-on", S.alphaOn);
}

// ══════════ RIPPLE ══════════
function ripple(el, e) {
  const r = document.createElement("span");
  r.className = "ripple";
  const rect = el.getBoundingClientRect();
  const sz = Math.max(rect.width, rect.height);
  const x = (e.clientX || rect.left + rect.width / 2) - rect.left - sz / 2;
  const y = (e.clientY || rect.top + rect.height / 2) - rect.top - sz / 2;
  r.style.cssText = `width:${sz}px;height:${sz}px;left:${x}px;top:${y}px`;
  el.appendChild(r);
  r.addEventListener("animationend", () => r.remove());
}

// ══════════ ATTACH EVENTS ══════════
// All .btn clicks
document.querySelectorAll(".btn").forEach((btn) => {
  btn.addEventListener("click", (e) => {
    ripple(btn, e);
    const a = btn.dataset.action;
    const v = btn.dataset.value;
    if (a) onAction(a, v);
  });
});

// Nav pad
document.querySelectorAll(".rnav").forEach((b) => {
  b.addEventListener("click", (e) => {
    if (b.dataset.action) onAction(b.dataset.action);
  });
});
const replayCore = document.querySelector(".replay-core");
if (replayCore)
  replayCore.addEventListener("click", () => onAction("nav-center"));

// History
elHistToggle.addEventListener("click", () =>
  elHistPanel.classList.toggle("open"),
);
elHistClear.addEventListener("click", () => {
  S.history = [];
  S.histIdx = -1;
  renderHistory();
});

// Angle badge
elAngleBadge.addEventListener("click", cycleAngle);

// ══════════ KEYBOARD ══════════
document.addEventListener("keydown", (e) => {
  if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;
  e.preventDefault();
  const k = e.key;
  if (k >= "0" && k <= "9") {
    onAction("digit", k);
    return;
  }
  const map = {
    ".": "dot",
    "+": "plus",
    "-": "minus",
    "*": "multiply",
    "/": "divide",
    "(": "oparen",
    ")": "cparen",
    "%": "cparen",
    "^": "power",
    Enter: "equals",
    "=": "equals",
    Backspace: "del",
    Escape: "ac",
    ArrowLeft: "nav-left",
    ArrowRight: "nav-right",
    ArrowUp: "nav-up",
    ArrowDown: "nav-down",
    s: "sin",
    c: "cos",
    t: "tan",
    l: "log",
    n: "ln",
    r: "sqrt",
    p: "dot", // dot with shift maps to π
  };
  if (k === "S") {
    onAction("sin");
    return;
  }
  if (k === "E") {
    ins("exp(");
    return;
  }
  if (map[k]) {
    onAction(map[k]);
    return;
  }
});

// ══════════ INIT ══════════
renderDisplay();
elAngleBadge.textContent = S.angleMode;

// Startup animation
window.addEventListener("load", () => {
  const c = document.getElementById("calculator");
  c.style.cssText =
    "opacity:0;transform:translateY(24px);transition:opacity .5s ease,transform .5s ease";
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      c.style.opacity = "1";
      c.style.transform = "translateY(0)";
    }),
  );
});
