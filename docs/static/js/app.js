/* Median Temporal Ensembling — project page interactions.
   All plotted numbers come from static/data/data.js, exported from the paper's own table
   and figure data. Nothing here is typed by hand. */
(function () {
  "use strict";

  var SVGNS = "http://www.w3.org/2000/svg";
  function el(tag, attrs, parent) {
    var e = document.createElementNS(SVGNS, tag);
    for (var k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }
  function txt(parent, x, y, s, attrs) {
    var t = el("text", Object.assign({ x: x, y: y }, attrs || {}), parent);
    t.textContent = s;
    return t;
  }
  function fmt(v, d) { return (v >= 0 ? "" : "−") + Math.abs(v).toFixed(d == null ? 2 : d); }
  // a cut crystal of width w and height h centred on (x, y): an elongated hexagon, pointed at top and bottom
  function gemPts(x, y, w, h) {
    return [[x, y - h / 2], [x + w / 2, y - h / 4], [x + w / 2, y + h / 4], [x, y + h / 2], [x - w / 2, y + h / 4], [x - w / 2, y - h / 4]]
      .map(function (q) { return q[0].toFixed(1) + "," + q[1].toFixed(1); }).join(" ");
  }
  // one prediction: a lilac crystal when clean, a rose one with a crack when corrupted
  function crystalMark(parent, x, y, bad, w, h) {
    w = w || 17; h = h || 30;
    var g = el("g", {}, parent);
    el("polygon", { points: gemPts(x, y, w, h), "stroke-width": 1.3,
      style: bad ? "fill:var(--mean);stroke:#b0325c" : "fill:url(#g-gem);stroke:var(--median)" }, g);
    el("path", { d: "M" + x + " " + (y - h / 2 + 2) + "V" + (y + h / 2 - 2), "stroke-width": 0.9, style: "stroke:#fff;stroke-opacity:.8;fill:none" }, g);
    if (bad) el("polyline", { points: [x - 4, y - h * 0.3, x + 2, y - h * 0.05, x - 2, y + h * 0.08, x + 4, y + h * 0.32].join(" "),
      "stroke-width": 1.4, style: "stroke:#fff;fill:none;stroke-linejoin:round" }, g);
    return g;
  }
  // a heart about s wide centred on (x, y), its point turned to angle rot (0 = down)
  function heartD(x, y, s, rot) {
    var cs = Math.cos(rot), sn = Math.sin(rot), d = "";
    for (var k = 0; k < 28; k++) {
      var t = (k / 28) * Math.PI * 2, hx = 16 * Math.pow(Math.sin(t), 3),
        hy = -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)) - 2.5;
      hx *= s / 32; hy *= s / 32;
      d += (k ? "L" : "M") + (x + hx * cs - hy * sn).toFixed(1) + " " + (y + hx * sn + hy * cs).toFixed(1);
    }
    return d + "Z";
  }

  // ── motion and colour helpers (a canvas cannot read CSS variables, so colours are read once) ──
  var reduce = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  var TAU = Math.PI * 2;
  function clamp(x, a, b) { return x < a ? a : x > b ? b : x; }
  function easeOut(t) { return 1 - Math.pow(1 - t, 3); }
  function easeInOut(t) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(2 - 2 * t, 2) / 2; }
  function easeOutBack(t) { var c = 1.70158; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); }
  function cssVar(n) { return getComputedStyle(document.documentElement).getPropertyValue(n).trim(); }
  function hexRgb(h) {
    h = h.replace("#", "");
    if (h.length === 3) h = h.replace(/./g, "$&$&");
    var n = parseInt(h, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function mix(a, b, t) {
    var x = hexRgb(a), y = hexRgb(b);
    return "#" + x.map(function (v, i) { return ("0" + Math.round(v + (y[i] - v) * t).toString(16)).slice(-2); }).join("");
  }
  function rgba(h, a) { var c = hexRgb(h); return "rgba(" + c[0] + "," + c[1] + "," + c[2] + "," + a + ")"; }
  function hsl(h, s, l) {                         // as "#rrggbb", the form mix() and rgba() take
    var a = s * Math.min(l, 1 - l);
    function f(n) { var k = (n + h / 30) % 12; return ("0" + Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)))).toString(16)).slice(-2); }
    return "#" + f(0) + f(8) + f(4);
  }
  function debounce(fn, ms) { var t = 0; return function () { clearTimeout(t); t = setTimeout(fn, ms); }; }

  // ── tooltip ─────────────────────────────────────────────────────────────
  var tip = document.getElementById("tip");
  function showTip(ev, html) {
    tip.innerHTML = html; tip.classList.add("on");
    var x = ev.clientX + 14, y = ev.clientY + 14;
    if (x + 290 > window.innerWidth) x = ev.clientX - 290;
    tip.style.left = x + "px"; tip.style.top = y + "px";
  }
  function hideTip() { tip.classList.remove("on"); }

  // ── ACT's weights: exp(-m * age), m = 0.01, age 0 = newest, as deployed in ACT ──
  var M = 7;
  var W = (function () {
    var w = [], s = 0;
    for (var i = 0; i < M; i++) { var a = M - 1 - i; w.push(Math.exp(-0.01 * a)); s += w[i]; }
    return w.map(function (x) { return x / s; });
  })();
  var CLEAN = [0.12, 0.34, 0.24, 0.52, 0.43, 0.70, 0.61];   // index = query order, last = newest

  function wmean(v) { var s = 0; for (var i = 0; i < v.length; i++) s += W[i] * v[i]; return s; }
  function median(v) { var s = v.slice().sort(function (a, b) { return a - b; }); return s[(s.length - 1) / 2]; }

  // ── number-line widget ──────────────────────────────────────────────────
  function numberLine(root, mode) {
    var LO = -0.1, HI = 2.6, X0 = 60, X1 = 940, LY = 118;
    function X(v) { return X0 + (v - LO) / (HI - LO) * (X1 - X0); }
    var q = mode === "sparse" ? 1 : M, s = 55;

    // the drawing sits in a stage so that the petals of a scattering zone can play on a layer above it
    var stage = document.createElement("div"); stage.className = "nl-stage"; root.appendChild(stage);
    var svg = el("svg", { viewBox: "0 0 1000 230", role: "img" }, stage);
    var fx = el("svg", { viewBox: "0 0 1000 230", class: "nl-fx", "aria-hidden": "true" }, stage);
    var zoneWas = null, lastBand = null;
    var controls = document.createElement("div");
    controls.className = "controls";
    if (mode === "sparse") {
      controls.innerHTML =
        '<div><label>Corrupted predictions <b id="' + root.id + '-q"></b></label>' +
        '<input type="range" min="0" max="7" step="1" value="' + q + '" data-k="q"></div>' +
        '<div><label>How hard the attacker pushes <b id="' + root.id + '-s"></b></label>' +
        '<input type="range" min="0" max="100" step="1" value="' + s + '" data-k="s"></div>';
    } else {
      controls.innerHTML =
        '<div style="grid-column:1/-1"><label>Shift every prediction by the same amount <b id="' +
        root.id + '-s"></b></label>' +
        '<input type="range" min="0" max="100" step="1" value="' + s + '" data-k="s"></div>';
    }
    root.appendChild(controls);
    var readout = document.createElement("div"); readout.className = "readout"; root.appendChild(readout);
    var status = document.createElement("div"); status.className = "status"; root.appendChild(status);

    controls.addEventListener("input", function (e) {
      var k = e.target.getAttribute("data-k");
      if (k === "q") q = +e.target.value; else s = +e.target.value;
      draw();
    });

    var cleanMean = wmean(CLEAN), cleanMed = median(CLEAN);

    function marker(v, above, color, label) {
      var off = v > HI, x = off ? X1 + 6 : X(v);
      var g = el("g", {}, svg);
      if (above) {                                 // the median: a crystal pointing down at its value
        el("path", { d: "M" + x + " " + (LY - 19) + " l-10 -13 l10 -13 l10 13 z", style: "fill:" + color + ";stroke:#fff;stroke-width:1.2" }, g);
        txt(g, x, LY - 52, label, { "text-anchor": "middle", "font-size": 17, "font-weight": 700, style: "fill:" + color });
      } else {
        el("path", { d: "M" + x + " " + (LY + 19) + " l-11 19 h22 z", style: "fill:" + color }, g);
        txt(g, x + (off ? -16 : 16), LY + 33, label, { "text-anchor": off ? "end" : "start", "font-size": 17, "font-weight": 700, style: "fill:" + color });
      }
      if (off) txt(g, x - 4, above ? LY - 64 : LY + 56, "→ " + v.toFixed(2),
        { "text-anchor": "end", "font-size": 13, style: "fill:" + color });
    }

    // a four-pointed glint of size s at (x, y)
    function star4(g, x, y, s, style) {
      var p = "";
      for (var k = 0; k < 8; k++) {
        var r = k % 2 ? s * 0.25 : s, a = -Math.PI / 2 + (k * Math.PI) / 4;
        p += (k ? "L" : "M") + (x + r * Math.cos(a)).toFixed(1) + " " + (y + r * Math.sin(a)).toFixed(1);
      }
      el("path", { d: p + "Z", style: style }, g);
    }
    // the Zone, as her Skill opens it in the game: a soft band over the clean range, hung along its top with sheer
    // drapes knotted with flowers, with a pillar of light below each knot and two golden glints.
    // `form` plays it opening (the count has just dropped back below half).
    function zone(x, y, w, h, form) {
      var id = root.id + "-zone", defs = el("defs", {}, svg);
      var gr = el("linearGradient", { id: id + "-g", x1: 0, y1: 0, x2: 1, y2: 1 }, defs);
      el("stop", { offset: "0", style: "stop-color:var(--median-soft)" }, gr);
      el("stop", { offset: ".55", style: "stop-color:var(--bg-soft)" }, gr);
      el("stop", { offset: "1", style: "stop-color:var(--accent-soft)" }, gr);
      var lg = el("linearGradient", { id: id + "-l", x1: 0, y1: 0, x2: 0, y2: 1 }, defs);
      el("stop", { offset: "0", style: "stop-color:var(--median);stop-opacity:.28" }, lg);
      el("stop", { offset: "1", style: "stop-color:var(--median);stop-opacity:0" }, lg);
      // One bay of the drapes per 44 units: a knot in the middle with a flower on it, and half a swag on either side,
      // sagging to the edge of the bay where it meets the next. The pattern is anchored to the drawing, so the drapes
      // do not slide when the range changes.
      var pt = el("pattern", { id: id + "-p", patternUnits: "userSpaceOnUse", x: 0, y: y, width: 44, height: h }, defs);
      el("rect", { x: 19, y: 6, width: 6, height: h - 6, fill: "url(#" + id + "-l)" }, pt);
      el("path", { d: "M0 9C10 9 16 6 22 3C28 6 34 9 44 9L44 20C34 20 27 14 22 5C17 14 10 20 0 20Z",
        style: "fill:var(--median-soft);fill-opacity:.8;stroke:var(--median);stroke-opacity:.25;stroke-width:.7" }, pt);
      el("path", { d: "M0 4C8 4 15 3 22 1.5C29 3 36 4 44 4L44 15C36 15 28 11 22 4C16 11 8 15 0 15Z",
        style: "fill:#ffffff;fill-opacity:.92;stroke:var(--median);stroke-opacity:.4;stroke-width:.7" }, pt);
      for (var k = 0; k < 5; k++) {
        var a = -Math.PI / 2 + (k * TAU) / 5;
        el("circle", { cx: (22 + 2.7 * Math.cos(a)).toFixed(2), cy: (4 + 2.7 * Math.sin(a)).toFixed(2), r: 2.3,
          style: "fill:var(--accent);fill-opacity:.8" }, pt);
      }
      el("circle", { cx: 22, cy: 4, r: 1.5, style: "fill:#ffffff" }, pt);
      var g = el("g", { class: "zone" + (form ? " zone-in" : "") }, svg);
      el("rect", { x: x, y: y, width: w, height: h, rx: 10, fill: "url(#" + id + "-g)", "stroke-width": 1.6,
        "vector-effect": "non-scaling-stroke", style: "stroke:var(--median);stroke-opacity:.5" }, g);
      el("rect", { x: x, y: y, width: w, height: h, rx: 10, fill: "url(#" + id + "-p)" }, g);
      star4(g, x + 13, y + 27, 6, "fill:var(--gold)");
      star4(g, x + w - 13, y + h - 13, 5, "fill:var(--gold);fill-opacity:.8");
    }

    // the Zone scatters: its flowers come apart into petals that lift, then sink and sway as they fall, turning,
    // with a little golden dust
    var PETAL = "M0 6.5C-4.6 2 -4.2 -5 0 -6.5C4.2 -5 4.6 2 0 6.5Z", petals = [], fxRaf = 0;
    function scatter(x, y, w, h) {
      var R = Math.random, n = Math.max(14, Math.round((w * h) / 480)), g = el("g", {}, fx), t0 = performance.now(), mx = x + w / 2, i;
      for (i = 0; i < n; i++) {
        var px = x + 6 + R() * (w - 12), py = y + 6 + R() * (h - 12);
        petals.push({ el: el("path", { d: PETAL, style: "fill:var(" + (R() < 0.6 ? "--accent" : "--median") + ");fill-opacity:.6" }, g),
          x: px, y: py, vx: (px - mx) * 1.4 + (R() - 0.5) * 160, vy: -170 - R() * 150, s: 0.8 + R() * 0.7, rot: R() * 360,
          vr: (R() - 0.5) * 420, sw: 6 + R() * 12, wf: 4 + R() * 4, ph: R() * TAU, t0: t0, life: 1150 + R() * 450, dust: false });
      }
      for (i = 0; i < 12; i++) {
        var dx = x + R() * w, dy = y + R() * h;
        petals.push({ el: el("circle", { r: 1.3 + R() * 1.8, style: "fill:var(--gold);fill-opacity:.8" }, g),
          x: dx, y: dy, vx: (dx - mx) * 2 + (R() - 0.5) * 200, vy: -200 - R() * 180, t0: t0, life: 650 + R() * 250, dust: true });
      }
      if (!fxRaf) fxRaf = requestAnimationFrame(fall);
    }
    function fall(now) {
      fxRaf = 0;
      for (var i = petals.length - 1; i >= 0; i--) {
        var p = petals[i], u = (now - p.t0) / p.life, t = Math.max(0, now - p.t0) / 1000, x, y;
        if (u >= 1) { p.el.remove(); petals.splice(i, 1); continue; }
        if (p.dust) { x = p.x + p.vx * t; y = p.y + p.vy * t + 450 * t * t; }
        else {                                    // air slows a petal down quickly; then it sinks slowly and sways
          var e = (1 - Math.exp(-3.5 * t)) / 3.5;
          x = p.x + p.vx * e + Math.sin(t * p.wf + p.ph) * p.sw * Math.min(1, 3 * t);
          y = p.y + p.vy * e + 160 * t * t;
        }
        p.el.setAttribute("transform", "translate(" + x.toFixed(1) + " " + y.toFixed(1) + ")" +
          (p.dust ? "" : " rotate(" + (p.rot + p.vr * t).toFixed(1) + ") scale(" + p.s.toFixed(2) + ")"));
        p.el.setAttribute("opacity", (u < 0.35 ? 1 : 1 - (u - 0.35) / 0.65).toFixed(3));
      }
      Array.prototype.slice.call(fx.childNodes).forEach(function (n) { if (!n.childNodes.length) n.remove(); });
      if (petals.length) fxRaf = requestAnimationFrame(fall);
    }

    function draw() {
      while (svg.firstChild) svg.removeChild(svg.firstChild);
      var push = s / 100 * (mode === "sparse" ? 5.0 : 1.6);
      var bad = [], v = CLEAN.slice();
      for (var i = 0; i < M; i++) {
        var corrupted = mode === "sparse" ? i >= M - q : push > 0;     // newest q are corrupted
        bad.push(corrupted);
        if (corrupted) v[i] = CLEAN[i] + push;
      }
      // clean range: remaining clean predictions (sparse) or the original values (common-mode)
      var ref = mode === "sparse" ? CLEAN.filter(function (_, i) { return !bad[i]; }) : CLEAN;
      var bx = 0, by = LY - 34, bw = 0, bh = 68;
      if (ref.length) {
        var lo = Math.min.apply(null, ref), hi = Math.max.apply(null, ref);
        bx = X(lo) - 8; bw = X(hi) - X(lo) + 16;
      }
      if (mode === "sparse") {
        // while fewer than half are corrupted the clean range is a Zone of flowers; at half or more it scatters
        var holds = 2 * q < M;
        if (zoneWas === true && !holds && !reduce && lastBand) scatter(lastBand[0], lastBand[1], lastBand[2], lastBand[3]);
        if (holds) { zone(bx, by, bw, bh, zoneWas === false && !reduce); lastBand = [bx, by, bw, bh]; }
        else if (ref.length) el("rect", { x: bx, y: by, width: bw, height: bh, rx: 10, fill: "none", "stroke-width": 1.5,
          "stroke-dasharray": "6 6", "vector-effect": "non-scaling-stroke", style: "stroke:var(--median);stroke-opacity:.45" }, svg);
        zoneWas = holds;
      } else if (ref.length) {
        el("rect", { x: bx, y: by, width: bw, height: bh, rx: 10, style: "fill:var(--median-soft)" }, svg);
      }
      if (ref.length) txt(svg, bx, LY + 52, mode === "sparse" ? "range of the clean predictions" : "where the clean predictions were",
        { "font-size": 13, style: "fill:var(--median)" });
      el("line", { x1: X0 - 20, x2: X1 + 20, y1: LY, y2: LY, "stroke-width": 2, style: "stroke:var(--ink-3)" }, svg);
      // where the moved predictions were, and each prediction as a crystal
      for (i = 0; i < M; i++) {
        if (!bad[i] || push === 0) continue;
        el("polygon", { points: gemPts(X(CLEAN[i]), LY, 15, 27), "stroke-width": 1.4, "stroke-dasharray": "3 3",
          style: "fill:var(--surface);stroke:var(--ink-3)" }, svg);
      }
      for (i = 0; i < M; i++) crystalMark(svg, Math.min(X(v[i]), X1 + 4), LY, bad[i]);
      var mn = wmean(v), md = median(v);
      marker(md, true, "var(--median)", "median");
      marker(mn, false, "var(--mean)", "mean");

      var qb = document.getElementById(root.id + "-q"), sb = document.getElementById(root.id + "-s");
      if (qb) qb.textContent = q + " of " + M;
      if (sb) sb.textContent = Math.round(s) + "%";
      readout.innerHTML =
        '<span class="m">mean moved <b>' + fmt(mn - cleanMean) + "</b></span>" +
        '<span class="d">median moved <b>' + fmt(md - cleanMed) + "</b></span>";

      var inside = ref.length && md >= Math.min.apply(null, ref) - 1e-9 && md <= Math.max.apply(null, ref) + 1e-9;
      var msg, ok;
      if (mode === "common") {
        ok = push === 0;
        msg = push === 0
          ? "Drag the slider. Every prediction will move by the same amount."
          : "All seven predictions moved together, so they still agree with each other. There is nothing to outvote: the mean and the median both move with them.";
      } else if (q === 0) {
        ok = true; msg = "No prediction is corrupted. The mean and the median sit close together.";
      } else if (2 * q < M) {
        ok = inside;
        msg = "2q < M: " + q + " of " + M + " corrupted, fewer than half. The median stays inside the range of the clean predictions however hard the attacker pushes; the mean follows the push.";
      } else {
        ok = false;
        msg = "2q ≥ M: " + q + " of " + M + " corrupted, half or more. The guarantee no longer applies, and the median can be pulled out as well.";
      }
      status.className = "status " + (ok ? "ok" : "bad");
      status.innerHTML = '<span class="dot"></span><span>' + msg + "</span>";
    }
    draw();
  }

  // ── hero: where the action executed now comes from ─────────────────────
  // Seven queries, made at the last seven steps. Each predicts the next seven actions from the step at which it was
  // made, so all seven cover the action now; their predictions for it are dropped onto the number line below.
  // Corrupting a query adds the same push to all of its predictions, newest query first, as in the widget below.
  function ripplesWidget(root) {
    if (!root) return;
    var C0 = 150, DX = 62, Y0 = 30, DY = 20, NOW = M - 1, LY2 = 268, LO2 = -0.1, HI2 = 2.4, PUSH = 1.5, MAXQ = 5, q = 0, i, c;
    function CX(k) { return C0 + k * DX; }
    function V(v) { return C0 + ((v - LO2) / (HI2 - LO2)) * (CX(2 * M - 2) - C0); }
    var head = document.createElement("div"); head.className = "rip-head";
    head.innerHTML = '<span class="lbl">Where the action now comes from</span><span class="which">seven queries, one action dimension</span>';
    root.appendChild(head);
    var scroll = document.createElement("div"); scroll.className = "rip-scroll"; root.appendChild(scroll);
    var svg = el("svg", { viewBox: "0 0 1000 330", role: "img",
      "aria-label": "Seven overlapping action chunks, and the seven predictions they make for the action executed now" }, scroll);
    var colB = Y0 + (M - 1) * DY + 16;
    el("rect", { x: CX(NOW) - 22, y: Y0 - 18, width: 44, height: colB - Y0 + 18, rx: 10,
      style: "fill:var(--median-soft);stroke:var(--median);stroke-opacity:.4;stroke-dasharray:4 4" }, svg);
    txt(svg, CX(NOW), colB + 20, "NOW", { "text-anchor": "middle", "font-size": 13, "letter-spacing": "2",
      style: "fill:var(--median);font-family:var(--caps)" });
    txt(svg, 100, Y0 - 12, "query made at", { "text-anchor": "end", "font-size": 12 });
    var rows = [];
    for (i = 0; i < M; i++) {
      var y = Y0 + i * DY, g = el("g", {}, svg), cells = [];
      txt(g, 100, y + 4, i === M - 1 ? "t" : "t\u2212" + (M - 1 - i), { "text-anchor": "end", "font-size": 12.5 });
      var cap = el("rect", { x: CX(i) - 17, y: y - 8, width: (M - 1) * DX + 34, height: 16, rx: 8, class: "rip-cell",
        style: "fill:var(--median-soft);opacity:.75" }, g);
      var star = el("path", { d: "M" + (CX(i) - 30) + " " + (y - 7) + "l2 5 5 2 -5 2 -2 5 -2 -5 -5 -2 5 -2z", class: "rip-cell",
        style: "fill:var(--mean);opacity:0" }, g);
      for (c = i; c < i + M; c++) cells.push(el("polygon", { points: gemPts(CX(c), y, 9, 15), class: "rip-cell", "stroke-width": 1,
        style: "fill:url(#g-gem);stroke:var(--median)" + (c === NOW ? "" : ";opacity:.7") }, g));
      rows.push({ cap: cap, star: star, cells: cells });
    }
    // the predictions for now fall from the column onto the number line
    var fan = [];
    for (i = 0; i < M; i++) fan.push(el("line", { x1: CX(NOW), y1: colB + 30, x2: V(CLEAN[i]), y2: LY2 - 22, "stroke-width": 1,
      style: "stroke:var(--median);stroke-opacity:.2" }, svg));
    var band = el("rect", { y: LY2 - 21, height: 42, rx: 10, style: "fill:var(--median-soft);opacity:.85" }, svg);
    el("line", { x1: CX(0) - 20, x2: CX(2 * M - 2) + 20, y1: LY2, y2: LY2, "stroke-width": 2, style: "stroke:var(--ink-3)" }, svg);
    txt(svg, CX(0) - 20, LY2 + 52, "range of the clean predictions", { "font-size": 12.5, style: "fill:var(--median)" });
    var drops = [];
    for (i = 0; i < M; i++) {
      var dg = el("g", { class: "rip-drop", style: "transform:translate(" + V(CLEAN[i]) + "px," + LY2 + "px)" }, svg);
      drops.push({ g: dg, mark: crystalMark(dg, 0, 0, false, 15, 26) });
    }
    var med = el("g", { class: "rip-mark" }, svg), mea = el("g", { class: "rip-mark" }, svg);
    el("path", { d: "M0 -17l-9 -12 9 -12 9 12z", style: "fill:var(--median);stroke:#fff;stroke-width:1.2" }, med);
    txt(med, 0, -48, "median", { "text-anchor": "middle", "font-size": 15, "font-weight": 700, style: "fill:var(--median)" });
    el("path", { d: "M0 17l-10 17h20z", style: "fill:var(--mean)" }, mea);
    txt(mea, 14, 32, "mean", { "font-size": 15, "font-weight": 700, style: "fill:var(--mean)" });

    var foot = document.createElement("div"); foot.className = "rip-foot";
    foot.innerHTML = '<div class="controls"><button type="button" class="btn btn-primary" data-a="hit">Corrupt the newest clean query</button>' +
      '<button type="button" class="btn" data-a="reset">Reset</button></div><div class="verdict" aria-live="polite"></div>';
    root.appendChild(foot);
    var hit = foot.querySelector('[data-a="hit"]'), verdict = foot.querySelector(".verdict");
    var mean0 = wmean(CLEAN), med0 = median(CLEAN);
    foot.addEventListener("click", function (e) {
      var a = e.target.closest("button");
      if (!a) return;
      q = a.getAttribute("data-a") === "hit" ? Math.min(MAXQ, q + 1) : 0;
      update();
    });
    function update() {
      var v = CLEAN.map(function (x, k) { return k >= M - q ? x + PUSH + 0.07 * (k - (M - q)) : x; });
      rows.forEach(function (r, k) {
        var bad = k >= M - q;
        r.cap.style.fill = bad ? "var(--mean-soft)" : "var(--median-soft)";
        r.star.style.opacity = bad ? 1 : 0;
        r.cells.forEach(function (cl) { cl.style.fill = bad ? "var(--mean)" : "url(#g-gem)"; cl.style.stroke = bad ? "#b0325c" : "var(--median)"; });
      });
      drops.forEach(function (d, k) {
        var bad = k >= M - q;
        d.g.style.transform = "translate(" + V(v[k]) + "px," + LY2 + "px)";
        d.mark.firstChild.style.fill = bad ? "var(--mean)" : "url(#g-gem)";
        d.mark.firstChild.style.stroke = bad ? "#b0325c" : "var(--median)";
        fan[k].setAttribute("x2", V(v[k]));
        fan[k].style.stroke = bad ? "var(--mean)" : "var(--median)";
      });
      var clean = CLEAN.slice(0, M - q), lo = Math.min.apply(null, clean), hi = Math.max.apply(null, clean);
      band.setAttribute("x", V(lo) - 12); band.setAttribute("width", V(hi) - V(lo) + 24);
      var md = median(v), mn = wmean(v);
      med.style.transform = "translate(" + V(md) + "px," + LY2 + "px)";
      mea.style.transform = "translate(" + V(mn) + "px," + LY2 + "px)";
      var moved = "The mean moved <b style=\"color:var(--mean)\">" + fmt(mn - mean0) + "</b>, the median <b style=\"color:var(--median)\">" +
        fmt(md - med0) + "</b>.";
      if (q === 0) verdict.innerHTML = '<span class="pill ok">No corruption</span><span>The mean and the median sit close together.</span>';
      else if (2 * q < M) verdict.innerHTML = '<span class="pill ok">Median inside the clean range</span><span>' + q + " of " + M + " corrupted. " + moved + "</span>";
      else verdict.innerHTML = '<span class="pill bad">Guarantee gone</span><span>' + q + " of " + M + " corrupted, half or more. " + moved + "</span>";
      hit.disabled = q >= MAXQ;
    }
    update();
    // on a narrow screen the drawing scrolls sideways; start with the column of the action now in view
    if (scroll.scrollWidth > scroll.clientWidth)
      scroll.scrollLeft = (CX(NOW) / 1000) * scroll.scrollWidth - scroll.clientWidth * 0.6;
  }

  // her halo round the 0: two arcs of small hearts rising from below to just short of the top
  function wreathAround(root) {
    if (!root) return;
    var svg = el("svg", { viewBox: "0 0 190 160" }, root), cx = 95, cy = 70, r = 62;
    el("path", { d: "M" + (cx - 14) + " " + (cy + r - 2) + "A" + r + " " + r + " 0 1 1 " + (cx + 14) + " " + (cy + r - 2),
      fill: "none", "stroke-width": 1, style: "stroke:var(--median);stroke-opacity:.25" }, svg);
    for (var side = -1; side <= 1; side += 2) {
      for (var k = 0; k < 10; k++) {
        var u = (k + 0.6) / 10.6, an = Math.PI / 2 - side * (0.3 + (Math.PI - 0.55) * u);
        var out = an - side * 0.55, hs = 15 - 7 * u;
        var hx = cx + Math.cos(an) * r + Math.cos(out) * hs * 0.45, hy = cy + Math.sin(an) * r + Math.sin(out) * hs * 0.45;
        el("path", { d: heartD(hx, hy, hs, out + Math.PI / 2),
          style: "fill:" + (side < 0 ? "#c9b8ff" : "#f6b3d6") + ";fill-opacity:.75" }, svg);
      }
    }
  }

  // ── main table: dumbbell chart ──────────────────────────────────────────
  function mainChart(root, rows) {
    var LBL = 300, X0 = 320, X1 = 860, RH = 27, GAP = 16, TOP = 34;
    var groups = [], cur = null;
    rows.forEach(function (r) {
      var key = r.env + r.task + r.bb + r.h;
      if (!cur || cur.key !== key) { cur = { key: key, head: r, rows: [] }; groups.push(cur); }
      cur.rows.push(r);
    });
    var H = TOP + rows.length * RH + (groups.length - 1) * GAP + 30;
    var svg = el("svg", { viewBox: "0 0 1000 " + H }, root);
    function X(v) { return X0 + v * (X1 - X0); }
    [0, 0.25, 0.5, 0.75, 1].forEach(function (t) {
      el("line", { x1: X(t), x2: X(t), y1: TOP - 10, y2: H - 26, "stroke-width": 1, style: "stroke:var(--line)" }, svg);
      txt(svg, X(t), H - 8, t.toFixed(2), { "text-anchor": "middle", "font-size": 13 });
    });
    txt(svg, X(0.5), 16, "success rate  (PushT: coverage)", { "text-anchor": "middle", "font-size": 13, "font-weight": 600 });
    txt(svg, 945, 16, "Δ", { "text-anchor": "middle", "font-size": 14, "font-weight": 700 });
    var y = TOP;
    groups.forEach(function (g, gi) {
      if (gi) y += GAP;
      var h = g.head, name = h.env === "PushT" ? "PushT" : h.env + " " + h.task;
      var gy = y + g.rows.length * RH / 2;
      txt(svg, 8, gy - 3, name, { "font-size": 15, "font-weight": 700, style: "fill:var(--ink)" });
      txt(svg, 8, gy + 15, h.bb + " · h=" + h.h + " · clean " + h.clean[0].toFixed(2) + "→" + h.clean[1].toFixed(2),
        { "font-size": 12.5 });
      g.rows.forEach(function (r) {
        var cy = y + RH / 2;
        var band = el("rect", { x: 216, y: y + 1, width: 780, height: RH - 2, rx: 6, style: "fill:transparent" }, svg);
        txt(svg, 290, cy + 5, "q=" + r.q + (r.n !== 50 ? " (n=" + r.n + ")" : ""), { "text-anchor": "end", "font-size": 13 });
        el("line", { x1: X(r.mean), x2: X(r.median), y1: cy, y2: cy, "stroke-width": 4, "stroke-linecap": "round",
          style: "stroke:var(--median-soft)" }, svg);
        el("circle", { cx: X(r.mean), cy: cy, r: 6.5, style: "fill:var(--mean)" }, svg);
        el("path", { d: "M" + X(r.median) + " " + (cy - 8.5) + "l8 8.5 -8 8.5 -8 -8.5z", style: "fill:var(--median);stroke:#fff;stroke-width:1.2" }, svg);
        if (Math.abs(r.median - r.mean) < 1e-9)          // equal: keep the mean visible on top
          el("circle", { cx: X(r.mean), cy: cy, r: 3.2, style: "fill:var(--mean)" }, svg);
        txt(svg, 945, cy + 5, (r.delta >= 0 ? "+" : "") + r.delta.toFixed(3) + (r.holm ? " ★" : ""),
          { "text-anchor": "middle", "font-size": 13, "font-weight": r.holm ? 700 : 400,
            style: "fill:" + (r.holm ? "var(--median)" : "var(--ink-3)") });
        var html = "<b>" + name + "</b> · " + r.bb + " · h=" + r.h + " · q=" + r.q + " (n=" + r.n + ")<br>" +
          "mean " + r.mean.toFixed(3) + " → median " + r.median.toFixed(3) + "<br>" +
          "p = " + r.p_text.replace("×10^", "×10<sup>") + (r.p_text.indexOf("^") >= 0 ? "</sup>" : "") +
          (r.holm ? " · significant after Holm" : " · not significant after Holm");
        band.addEventListener("mousemove", function (ev) { band.style.fill = "var(--bg-soft)"; showTip(ev, html); });
        band.addEventListener("mouseleave", function () { band.style.fill = "transparent"; hideTip(); });
        y += RH;
      });
    });
    // put the interactive bands underneath the marks
    Array.prototype.forEach.call(svg.querySelectorAll("rect"), function (r) { svg.insertBefore(r, svg.firstChild); });
  }

  // ── figure 1 ────────────────────────────────────────────────────────────
  function fig1Chart(root, legendRoot, data) {
    var X0 = 70, X1 = 800, Y0 = 30, Y1 = 330, xmin = Math.log(0.75), xmax = Math.log(70), ymin = -0.25, ymax = 1.12;
    function X(v) { return X0 + (Math.log(v) - xmin) / (xmax - xmin) * (X1 - X0); }
    function Y(v) { return Y1 - (v - ymin) / (ymax - ymin) * (Y1 - Y0); }
    var svg = el("svg", { viewBox: "0 0 1000 380" }, root);
    [0, 0.5, 1].forEach(function (t) {
      el("line", { x1: X0, x2: X1, y1: Y(t), y2: Y(t), "stroke-width": 1, style: "stroke:var(--line)" }, svg);
      txt(svg, X0 - 10, Y(t) + 5, Math.round(t * 100) + "%", { "text-anchor": "end", "font-size": 14 });
    });
    el("line", { x1: X0, x2: X1, y1: Y(0), y2: Y(0), "stroke-width": 1.5, style: "stroke:var(--ink-3)" }, svg);
    [1, 4, 10, 50].forEach(function (t) {
      txt(svg, X(t), Y1 + 26, t + "×", { "text-anchor": "middle", "font-size": 14 });
    });
    txt(svg, (X0 + X1) / 2, Y1 + 50, "attack optimisation effort  (× published setting)", { "text-anchor": "middle", "font-size": 14, "font-weight": 600 });
    txt(svg, 20, (Y0 + Y1) / 2, "attack loss recovered", { "text-anchor": "middle", "font-size": 14, "font-weight": 600,
      transform: "rotate(-90 20 " + (Y0 + Y1) / 2 + ")" });

    var STY = {
      median_burst: { c: "var(--median)", dash: "", mk: "circle", fill: true, w: 3.2 },
      metric_burst: { c: "var(--mean)", dash: "2 6", mk: "tri", fill: false, w: 2.4 },
      metric_can: { c: "var(--mean)", dash: "", mk: "sq", fill: true, w: 2.6 },
      metric_square: { c: "var(--mean)", dash: "9 6", mk: "sq", fill: false, w: 2.6 }
    };
    function mark(g, kind, x, y, c, fill) {
      var st = "stroke:" + c + ";fill:" + (fill ? c : "var(--surface)");
      if (kind === "circle") return el("circle", { cx: x, cy: y, r: 7, "stroke-width": 2.4, style: st }, g);
      if (kind === "sq") return el("rect", { x: x - 6.5, y: y - 6.5, width: 13, height: 13, "stroke-width": 2.4, style: st }, g);
      return el("path", { d: "M" + x + " " + (y - 8) + " l7.5 13 h-15 z", "stroke-width": 2.4, style: st }, g);
    }
    function star(g, x, y, c) {
      var p = [];
      for (var i = 0; i < 10; i++) {
        var r = i % 2 ? 6 : 14, a = Math.PI / 5 * i - Math.PI / 2;
        p.push((x + r * Math.cos(a)).toFixed(1) + "," + (y + r * Math.sin(a)).toFixed(1));
      }
      return el("polygon", { points: p.join(" "), "stroke-width": 2.2, style: "fill:none;stroke:" + c }, g);
    }
    var labels = [];
    data.series.forEach(function (s) {
      var st = STY[s.id] || STY.metric_can, g = el("g", {}, svg);
      var pts = s.x.map(function (x, i) { return [X(x), Y(s.y[i])]; });
      el("polyline", { points: pts.map(function (p) { return p.join(","); }).join(" "), "stroke-width": st.w,
        "stroke-dasharray": st.dash, "stroke-linecap": "round", style: "fill:none;stroke:" + st.c }, g);
      s.x.forEach(function (x, i) {
        var lo = Y(s.y[i] - s.err[i]), hi = Y(s.y[i] + s.err[i]), px = X(x);
        el("line", { x1: px, x2: px, y1: lo, y2: hi, "stroke-width": 1.6, style: "stroke:" + st.c }, g);
        el("line", { x1: px - 5, x2: px + 5, y1: lo, y2: lo, "stroke-width": 1.6, style: "stroke:" + st.c }, g);
        el("line", { x1: px - 5, x2: px + 5, y1: hi, y2: hi, "stroke-width": 1.6, style: "stroke:" + st.c }, g);
        var m = mark(g, st.mk, px, Y(s.y[i]), st.c, st.fill);
        var html = "<b>" + s.label + "</b><br>" + x + "× (" + s.axis + ")<br>recovered " +
          Math.round(s.y[i] * 1000) / 10 + "% ± " + Math.round(s.err[i] * 1000) / 10 + "%";
        m.addEventListener("mousemove", function (ev) { showTip(ev, html); });
        m.addEventListener("mouseleave", hideTip);
        m.style.cursor = "pointer";
      });
      if (s.released != null) star(g, X(1), Y(s.released), st.c);
      var last = pts[pts.length - 1];
      labels.push({ x: last[0] + 16, y: last[1] + 5, s: s.label, c: st.c });
    });
    labels.sort(function (a, b) { return a.y - b.y; });
    for (var i = 1; i < labels.length; i++) if (labels[i].y - labels[i - 1].y < 20) labels[i].y = labels[i - 1].y + 20;
    labels.forEach(function (l) {
      txt(svg, l.x, l.y, l.s, { "font-size": 14.5, "font-weight": 700, style: "fill:" + l.c });
    });
    legendRoot.innerHTML =
      '<span><i style="background:var(--median)"></i>combinatorial: the median</span>' +
      '<span><i style="background:var(--mean)"></i>metric-type: encoder adversarial fine-tuning</span>';
  }

  // ── small bars ──────────────────────────────────────────────────────────
  function bars() {
    Array.prototype.forEach.call(document.querySelectorAll("[data-bars]"), function (b) {
      JSON.parse(b.getAttribute("data-bars")).forEach(function (r) {
        var c = r[2] === "ink" ? "var(--ink-3)" : "var(--" + r[2] + ")";
        var d = document.createElement("div"); d.className = "bar";
        d.innerHTML = "<span>" + r[0] + '</span><span class="track"><span class="fill" style="display:block;width:' +
          (r[1] * 100) + "%;background:" + c + '"></span></span><span class="v">' + r[1].toFixed(r[1] === 1 ? 2 : 3) + "</span>";
        b.appendChild(d);
      });
    });
  }

  /* ── Opening: the method on one action, in Cyrene's colours ─────────────
     A full-window opening of about five and a half seconds, drawn in the colours of her Ultimate (Cyrene, Honkai:
     Star Rail), that tells the method on one action:
     1. a frame of the can episode of the paper (Diffusion Policy, h=2, q=3; the median's arm, holding the can)
        appears in a crystal frame: the action executed now;
     2. the last eight queries each predicted that action. Their predictions fall onto a number line as crystals and
        the three from attacked queries crack (her Talent gathers what the others give into one; here eight predictions
        become one command);
     3. her Zone opens over the range of the clean predictions. The weighted mean is pulled out of it; the median, a
        crystal heart, stays inside;
     4. the count over the evaluation: the median left the clean range 0 times in 53,704 timesteps, the mean in 81-93%;
     5. the heart flies into the emblem above the title, and the page opens from it.
     The eight values are drawn for the opening; the frame and the counts are the paper's.
     The page is covered from the first paint (html.fx-on, set in the head, which lifts by itself if this never runs).
     A click, tap, key or the wheel skips it, and that press does nothing else; ?still skips it; ?fx=0.6 holds the frame
     at 60%. Clicking the title plays it again. Nothing plays under prefers-reduced-motion. */
  function initIntro() {
    var root = document.getElementById("intro"), doc = document.documentElement;
    var emblem = document.querySelector(".emblem");
    if (!root) return { play: function () {} };
    window.__introTook = true;
    var cv = root.querySelector("canvas"), g = cv.getContext("2d"), W = 0, H = 0, raf = 0, t0 = 0, playing = false;
    var LILAC = cssVar("--median") || "#6a4fd8", MEAN = cssVar("--mean") || "#e0507e";
    var MIST = "#cdbdff", ROSE = "#ff9fd2", CYAN = "#8fe9ff", AMBER = "#ffcf7a", WHITE = "#ffffff";
    var T = 5600, FADE = 4550, FLY0 = 4650, FLY1 = 5250, OPEN0 = 5100;
    var hold = (function () { var m = /[?&]fx=([0-9.]+)/.exec(location.search); return m ? clamp(+m[1], 0, 1) : -1; })();
    var img = new Image(); img.onload = function () { if (hold >= 0) draw(hold * T); };
    img.src = "static/img/intro_now.jpg";
    // the eight predictions of one action dimension, oldest query first; the newest three come from attacked queries
    var PRED = [0.20, 0.27, 0.24, 0.31, 0.22, 0.86, 0.91, 0.88], BAD = 3, NP = PRED.length;
    var CLEANP = PRED.slice(0, NP - BAD), LO = Math.min.apply(null, CLEANP), HI = Math.max.apply(null, CLEANP);
    var SORTED = PRED.slice().sort(function (a, b) { return a - b; }), MED = (SORTED[NP / 2 - 1] + SORTED[NP / 2]) / 2;
    var MEANV = (function () {                    // ACT's weights, exp(-0.01 * age), age 0 = newest
      var s = 0, w = 0;
      for (var i = 0; i < NP; i++) { var wi = Math.exp(-0.01 * (NP - 1 - i)); s += wi * PRED[i]; w += wi; }
      return s / w;
    })();
    var stars = [], R = Math.random;
    for (var k = 0; k < 220; k++) {
      stars.push({ x: R(), y: R(), r: 0.7 + R() * 1.3, a: 0.3 + R() * 0.6, w: 200 + R() * 500, ph: R() * TAU, big: k < 14,
        c: [WHITE, WHITE, WHITE, MIST, CYAN, ROSE][Math.floor(R() * 6)] });
    }

    function E(t, a, b) { return clamp((t - a) / (b - a), 0, 1); }
    function size() {
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = window.innerWidth; H = window.innerHeight;
      cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    function glow(x, y, r, c, a) {
      if (a <= 0 || r <= 0.3) return;
      var gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, rgba(c, a)); gr.addColorStop(0.4, rgba(c, a * 0.45)); gr.addColorStop(1, rgba(c, 0));
      g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
    }
    function sparkle(x, y, s, c, a) {
      if (s <= 0.3 || a <= 0) return;
      g.beginPath();
      for (var k = 0; k < 8; k++) {
        var r = k % 2 ? s * 0.18 : s, an = -Math.PI / 2 + (k * Math.PI) / 4;
        if (k) g.lineTo(x + Math.cos(an) * r, y + Math.sin(an) * r); else g.moveTo(x + Math.cos(an) * r, y + Math.sin(an) * r);
      }
      g.closePath(); g.fillStyle = rgba(c, a); g.fill();
    }
    function hex(x, y, w, h) {
      g.beginPath(); g.moveTo(x, y - h / 2); g.lineTo(x + w / 2, y - h / 4); g.lineTo(x + w / 2, y + h / 4);
      g.lineTo(x, y + h / 2); g.lineTo(x - w / 2, y + h / 4); g.lineTo(x - w / 2, y - h / 4); g.closePath();
    }
    function crystal(x, y, w, h, bad, a) {        // one prediction: a lilac cut crystal, or a rose one with a crack
      if (a <= 0 || w <= 0.5) return;
      g.save(); g.globalAlpha = a;
      glow(x, y, h * 0.9, bad ? MEAN : MIST, 0.35);
      hex(x, y, w, h);
      var gr = g.createLinearGradient(x, y - h / 2, x, y + h / 2);
      if (bad) { gr.addColorStop(0, "#ff9fbf"); gr.addColorStop(1, MEAN); }
      else { gr.addColorStop(0, "#ffffff"); gr.addColorStop(0.45, "#d9ccff"); gr.addColorStop(1, "#8f74ea"); }
      g.fillStyle = gr; g.fill();
      g.lineWidth = 1.2;
      hex(x - 1.3, y, w, h); g.strokeStyle = rgba(CYAN, 0.6); g.stroke();
      hex(x + 1.3, y, w, h); g.strokeStyle = rgba(ROSE, 0.6); g.stroke();
      hex(x, y, w, h); g.strokeStyle = "rgba(255,255,255,0.9)"; g.stroke();
      g.beginPath(); g.moveTo(x, y - h / 2 + 2); g.lineTo(x, y + h / 2 - 2); g.strokeStyle = "rgba(255,255,255,0.7)"; g.lineWidth = 0.9; g.stroke();
      if (bad) {
        g.beginPath(); g.moveTo(x - w * 0.25, y - h * 0.3); g.lineTo(x + w * 0.1, y - h * 0.05); g.lineTo(x - w * 0.1, y + h * 0.1);
        g.lineTo(x + w * 0.25, y + h * 0.32); g.strokeStyle = WHITE; g.lineWidth = 1.5; g.stroke();
      }
      g.restore();
    }
    function heart(x, y, s, a) {                  // the median: a cut crystal heart
      if (a <= 0 || s <= 1) return;
      var pts = [];
      for (var k = 0; k < 32; k++) {
        var tt = (k / 32) * TAU, hx = 16 * Math.pow(Math.sin(tt), 3),
          hy = -(13 * Math.cos(tt) - 5 * Math.cos(2 * tt) - 2 * Math.cos(3 * tt) - Math.cos(4 * tt)) - 2.5;
        pts.push([x + (hx * s) / 32, y + (hy * s) / 32]);
      }
      function path(dx) { g.beginPath(); pts.forEach(function (p, i) { if (i) g.lineTo(p[0] + dx, p[1]); else g.moveTo(p[0] + dx, p[1]); }); g.closePath(); }
      g.save(); g.globalAlpha = a;
      glow(x, y, s * 1.3, ROSE, 0.5);
      path(0);
      var gr = g.createRadialGradient(x - s * 0.18, y - s * 0.15, 0, x, y, s * 0.65);
      gr.addColorStop(0, "rgba(255,255,255,0.95)"); gr.addColorStop(0.45, rgba(ROSE, 0.85)); gr.addColorStop(1, rgba(LILAC, 0.9));
      g.fillStyle = gr; g.fill();
      for (var q = 0; q < pts.length; q += 4) {
        var p0 = pts[q], p1 = pts[(q + 4) % pts.length];
        g.beginPath(); g.moveTo(x - s * 0.05, y); g.lineTo(p0[0], p0[1]); g.lineTo(p1[0], p1[1]); g.closePath();
        g.fillStyle = rgba([CYAN, ROSE, MIST, "#9fb6ff"][(q / 4) % 4], 0.25); g.fill();
      }
      path(-1.5); g.strokeStyle = rgba(CYAN, 0.6); g.lineWidth = 1.2; g.stroke();
      path(1.5); g.strokeStyle = rgba(ROSE, 0.6); g.stroke();
      path(0); g.strokeStyle = WHITE; g.lineWidth = Math.max(1.5, s * 0.04); g.stroke();
      g.restore();
    }
    // fonts for the canvas text: small caps for labels, the display serif for numbers and names, Inter for prose
    function caps(px) { return px.toFixed(1) + 'px "Marcellus SC", "Cormorant Garamond", Georgia, serif'; }
    function serif(px, style) { return (style || "700") + " " + px.toFixed(1) + 'px "Cormorant Garamond", Georgia, serif'; }
    function sans(px, w) { return (w || "400") + " " + px.toFixed(1) + "px Inter, system-ui, sans-serif"; }
    function label(text, x, y, font, color, a, align) {
      if (a <= 0) return;
      g.save(); g.globalAlpha = a; g.fillStyle = color; g.textAlign = align || "center"; g.textBaseline = "middle";
      g.font = font; g.fillText(text, x, y); g.restore();
    }
    function sky(now, a) {
      var gr = g.createLinearGradient(0, 0, 0, H);
      gr.addColorStop(0, "#120c30"); gr.addColorStop(0.6, "#241a5c"); gr.addColorStop(1, "#3b2479");
      g.globalAlpha = a; g.fillStyle = gr; g.fillRect(0, 0, W, H);
      var nb = g.createRadialGradient(W / 2, H * 0.55, 0, W / 2, H * 0.55, Math.max(W, H) * 0.55);
      nb.addColorStop(0, "rgba(150,100,240,0.35)"); nb.addColorStop(0.5, "rgba(214,90,168,0.10)"); nb.addColorStop(1, "rgba(214,90,168,0)");
      g.fillStyle = nb; g.fillRect(0, 0, W, H);
      g.globalCompositeOperation = "lighter";
      stars.forEach(function (s) {
        var tw = 0.6 + 0.4 * Math.sin(now / s.w + s.ph);
        if (s.big) sparkle(s.x * W, s.y * H, s.r * 3.4, s.c, 0.8 * tw);
        else { g.fillStyle = rgba(s.c, s.a * tw); g.fillRect(s.x * W, s.y * H, s.r, s.r); }
      });
      g.globalCompositeOperation = "source-over"; g.globalAlpha = 1;
    }
    function emblemAt() {
      if (!emblem) return [W / 2, 80, 40];
      var r = emblem.getBoundingClientRect();
      return [r.left + r.width / 2, r.top + r.height / 2, r.width];
    }

    function draw(t) {
      // k scales everything with the window, with a floor so that text stays readable on a phone
      var k = clamp(Math.min(W / 1440, H / 900) * 1.15, 0.62, 1.3), keep = 1 - E(t, FADE, FADE + 320), i, narrow = W < 700;
      var IH = Math.min(H * 0.3, (W * (W < 700 ? 0.86 : 0.46) * 541) / 900), IW = (IH * 900) / 541, iy = H * (W < 700 ? 0.22 : 0.27);
      var LW = Math.min(W * (narrow ? 0.88 : 0.84), 880), x0 = W / 2 - LW / 2, ly = H * (narrow ? 0.58 : 0.62);
      function X(v) { return x0 + v * LW; }
      g.clearRect(0, 0, W, H);
      sky(t, 1);
      // 1. the action executed now: a frame of the can episode, in a crystal frame
      var fi = E(t, 150, 750), fy = iy + (1 - easeOut(fi)) * 30 * k;
      if (fi > 0 && keep > 0) {
        g.save(); g.globalAlpha = fi * keep;
        glow(W / 2, fy, IW * 0.75, LILAC, 0.25);
        g.fillStyle = "#0d0a24"; g.fillRect(W / 2 - IW / 2 - 6, fy - IH / 2 - 6, IW + 12, IH + 12);
        if (img.complete && img.naturalWidth) g.drawImage(img, W / 2 - IW / 2, fy - IH / 2, IW, IH);
        g.strokeStyle = rgba(MIST, 0.85); g.lineWidth = 1.4; g.strokeRect(W / 2 - IW / 2 - 6, fy - IH / 2 - 6, IW + 12, IH + 12);
        g.strokeStyle = rgba(MIST, 0.35); g.lineWidth = 1; g.strokeRect(W / 2 - IW / 2 - 11, fy - IH / 2 - 11, IW + 22, IH + 22);
        g.restore();
        crystal(W / 2 - IW / 2 - 9, fy - IH / 2 - 9, 10 * k, 18 * k, false, fi * keep);
        crystal(W / 2 + IW / 2 + 9, fy + IH / 2 + 9, 10 * k, 18 * k, false, fi * keep);
        label("THE ACTION EXECUTED NOW", W / 2, fy - IH / 2 - 30 * k, caps(13 * k), MIST, fi * keep);
      }
      // 2. the eight predictions of it fall onto a number line; the three from attacked queries crack
      var la = E(t, 800, 1200) * keep;
      if (la > 0) {
        g.save(); g.globalAlpha = la; g.strokeStyle = rgba(MIST, 0.6); g.lineWidth = 1.6;
        g.beginPath(); g.moveTo(x0 - 20, ly); g.lineTo(x0 + LW + 20, ly); g.stroke(); g.restore();
        label("EIGHT QUERIES PREDICTED IT", W / 2, ly + 86 * k, caps(12.5 * k), MIST, la * (1 - E(t, 3500, 3800)));
      }
      // 3. her Zone opens over the clean range (drawn under the crystals)
      var zo = easeOut(E(t, 2350, 2900)) * keep;
      if (zo > 0) {
        var zx0 = X(LO) - 18 * k, zx1 = X(HI) + 18 * k, zc = (zx0 + zx1) / 2, zw = (zx1 - zx0) * zo, zh = 70 * k;
        g.save();
        var zg = g.createLinearGradient(0, ly - zh / 2, 0, ly + zh / 2);
        zg.addColorStop(0, rgba(MIST, 0.32)); zg.addColorStop(1, rgba(ROSE, 0.14));
        g.fillStyle = zg; g.fillRect(zc - zw / 2, ly - zh / 2, zw, zh);
        g.strokeStyle = rgba(MIST, 0.8); g.lineWidth = 1.2; g.strokeRect(zc - zw / 2, ly - zh / 2, zw, zh);
        // the drapes along its top, knotted with flowers
        var bay = 26 * k, n = Math.max(1, Math.round(zw / bay));
        g.beginPath();
        for (i = 0; i < n; i++) {
          var a = zc - zw / 2 + (i * zw) / n, b = zc - zw / 2 + ((i + 1) * zw) / n;
          g.moveTo(a, ly - zh / 2); g.quadraticCurveTo((a + b) / 2, ly - zh / 2 + 12 * k, b, ly - zh / 2);
        }
        g.strokeStyle = "rgba(255,255,255,0.85)"; g.lineWidth = 1.4; g.stroke();
        for (i = 0; i <= n; i++) glow(zc - zw / 2 + (i * zw) / n, ly - zh / 2, 4 * k, ROSE, 0.9);
        g.restore();
        if (!narrow) label("THE CLEAN RANGE", zx0, ly + zh / 2 + 16 * k, caps(11 * k), MIST, zo * (1 - E(t, 3500, 3800)), "left");
      }
      for (i = 0; i < NP; i++) {
        var ft = E(t, 950 + i * 160, 950 + i * 160 + 560);
        if (ft <= 0) continue;
        var bad = i >= NP - BAD, sx = W / 2 + (i - (NP - 1) / 2) * 14 * k, sy = iy + IH / 2;
        var e = ft < 1 ? ft * ft : 1, xx = sx + (X(PRED[i]) - sx) * easeOut(ft), yy = sy + (ly - sy) * e;
        if (ft >= 1) yy = ly - Math.sin(Math.min(1, (t - (950 + i * 160 + 560)) / 220) * Math.PI) * 6 * k;
        crystal(xx, yy, 15 * k, 27 * k, bad && ft >= 1, keep);
        if (bad && ft >= 1) {
          var st = E(t, 950 + i * 160 + 560, 950 + i * 160 + 900);
          sparkle(xx, ly - 26 * k, 7 * k * (st < 1 ? Math.sin(Math.PI * st) + 0.6 : 0.6), MEAN, keep);
        }
      }
      label(narrow ? "ATTACKED" : "THREE FROM ATTACKED QUERIES", X(0.885), ly - 48 * k, caps(11.5 * k), ROSE, E(t, 2300, 2600) * keep * (1 - E(t, 3500, 3800)));
      // the weighted mean is pulled out of the Zone; the median, a crystal heart, stays inside
      var mt = E(t, 2800, 3500), mv = (LO + HI) / 2 + (MEANV - (LO + HI) / 2) * easeOut(mt), ma = E(t, 2750, 2950) * keep;
      if (ma > 0) {
        var mx = X(mv);
        g.save(); g.globalAlpha = ma; g.fillStyle = MEAN;
        g.beginPath(); g.moveTo(mx, ly + 20 * k); g.lineTo(mx - 11 * k, ly + 40 * k); g.lineTo(mx + 11 * k, ly + 40 * k); g.closePath(); g.fill();
        g.restore();
        label("weighted mean", mx, ly + 56 * k, serif(19 * k, "italic 600"), "#ffb0c8", ma);
      }
      var ht = E(t, 3050, 3650), hy = ly - 42 * k - easeOutBack(ht) * 4 * k;
      var hs = 34 * k * Math.max(0, easeOutBack(ht));
      var hx = X(MED), ha = E(t, 3050, 3200);
      // 5. the heart flies into the emblem above the title
      var fl = E(t, FLY0, FLY1), em = emblemAt();
      if (fl > 0) {
        var ef = easeInOut(fl), cx1 = (hx + em[0]) / 2, cy1 = Math.min(hy, em[1]) - 120 * k;
        var u1 = 1 - ef;
        hx = u1 * u1 * hx + 2 * u1 * ef * cx1 + ef * ef * em[0];
        hy = u1 * u1 * hy + 2 * u1 * ef * cy1 + ef * ef * em[1];
        hs = hs + (em[2] * 0.95 - hs) * ef;
      }
      if (ht > 0 && t < T) {
        g.globalCompositeOperation = "lighter"; glow(hx, hy, hs * 1.6, ROSE, 0.35 * ha); g.globalCompositeOperation = "source-over";
        heart(hx, hy, hs, ha);
        label("median", X(MED), ly - 86 * k, serif(19 * k, "italic 600"), MIST, E(t, 3200, 3450) * keep);
      }
      // 4. the count over the evaluation
      var ca = E(t, 3650, 3950) * keep, cn = Math.round(53704 * easeOut(E(t, 3700, 4350)));
      if (ca > 0) {
        var cy = ly + 112 * k;
        if (narrow) {
          label("0", W / 2, cy, sans(34 * k, "700"), MIST, ca);
          label("times the median left the clean range,", W / 2, cy + 26 * k, sans(13 * k), "#e6defc", ca);
          label("in " + cn.toLocaleString("en-US") + " timesteps", W / 2, cy + 44 * k, sans(13 * k), "#e6defc", ca);
          label("81\u201393%", W / 2, cy + 82 * k, sans(26 * k, "700"), "#ffb0c8", ca);
          label("of them, the weighted mean did", W / 2, cy + 106 * k, sans(13 * k), "#e6defc", ca);
        } else {
        label("0", W / 2 - 150 * k, cy, sans(40 * k, "700"), MIST, ca, "right");
        label("times the median left the clean range, in " + cn.toLocaleString("en-US") + " timesteps", W / 2 - 132 * k, cy, sans(15 * k), "#e6defc", ca, "left");
        label("81\u201393%", W / 2 - 150 * k, cy + 46 * k, sans(28 * k, "700"), "#ffb0c8", ca, "right");
        label("of them, the weighted mean did", W / 2 - 132 * k, cy + 46 * k, sans(15 * k), "#e6defc", ca, "left");
        }
      }
      // the page opens from the emblem: a hole in the night that grows from it
      var op = E(t, OPEN0, T);
      if (op > 0) {
        var rr = Math.hypot(W, H) * easeInOut(op);
        g.save(); g.globalCompositeOperation = "destination-out";
        var hg = g.createRadialGradient(em[0], em[1], rr * 0.82, em[0], em[1], rr + 2);
        hg.addColorStop(0, "rgba(0,0,0,1)"); hg.addColorStop(1, "rgba(0,0,0,0)");
        g.fillStyle = hg; g.beginPath(); g.arc(em[0], em[1], rr + 2, 0, TAU); g.fill();
        g.fillStyle = "#000"; g.beginPath(); g.arc(em[0], em[1], rr * 0.82, 0, TAU); g.fill();
        g.restore();
        g.strokeStyle = rgba(MIST, 0.7 * (1 - op)); g.lineWidth = 2; g.beginPath(); g.arc(em[0], em[1], rr, 0, TAU); g.stroke();
      }
    }

    function frame(now) {
      var t = now - t0;
      draw(Math.min(t, T));
      if (t >= T) finish(); else raf = requestAnimationFrame(frame);
    }
    function finish() {
      if (raf) cancelAnimationFrame(raf);
      raf = 0; playing = false;
      doc.classList.remove("fx-on");
      root.style.opacity = ""; root.style.background = "";
      g.clearRect(0, 0, W, H);
      if (emblem) { emblem.classList.remove("lit"); void emblem.getBoundingClientRect(); emblem.classList.add("lit"); }
    }
    function skip(ev) {                           // the press that ends the opening does nothing else
      if (!doc.classList.contains("fx-on")) return;
      ev.preventDefault(); ev.stopPropagation();
      hold = -1; playing = false;
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      root.style.transition = "opacity .28s"; root.style.opacity = "0";
      setTimeout(function () { root.style.transition = ""; finish(); }, 300);
    }
    ["click", "keydown", "wheel", "touchstart"].forEach(function (type) {
      window.addEventListener(type, skip, { capture: true, passive: false });
    });
    window.addEventListener("resize", debounce(function () { if (doc.classList.contains("fx-on")) { size(); if (hold >= 0) draw(hold * T); } }, 120));
    function play() {
      if (reduce) { finish(); return; }
      if (playing) return;
      window.scrollTo(0, 0);
      doc.classList.add("fx-on");
      size();
      root.style.background = "transparent";      // the canvas paints the night from here on
      if (hold >= 0) { draw(hold * T); return; }
      playing = true; t0 = performance.now();
      raf = requestAnimationFrame(frame);
    }
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { if (hold >= 0) draw(hold * T); });
    return { play: play, active: function () { return doc.classList.contains("fx-on"); } };
  }

  // ── wire up ─────────────────────────────────────────────────────────────
  ripplesWidget(document.getElementById("w-hero"));
  numberLine(document.getElementById("w-sparse"), "sparse");
  numberLine(document.getElementById("w-common"), "common");
  if (window.MTE) {
    mainChart(document.getElementById("c-main"), window.MTE.table);
    fig1Chart(document.getElementById("c-fig1"), document.getElementById("fig1-legend"), window.MTE.fig1);
  }
  bars();
  wreathAround(document.querySelector(".wreath"));
  try {                                           // the opening on arrival (the head set html.fx-on), again on the title
    var intro = initIntro(), title = document.querySelector(".hero h1");
    if (document.documentElement.classList.contains("fx-on")) intro.play();
    if (title) title.addEventListener("click", function () { if (!intro.active()) intro.play(); });
  } catch (e) { console.error(e); document.documentElement.classList.remove("fx-on"); }

  var cb = document.getElementById("copyBib");
  cb.addEventListener("click", function () {
    var t = document.getElementById("bibText").textContent;
    (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(
      function () { cb.textContent = "Copied"; setTimeout(function () { cb.textContent = "Copy"; }, 1500); },
      function () { cb.textContent = "Select and copy"; });
  });
})();
