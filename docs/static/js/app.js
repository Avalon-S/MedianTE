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
      if (above) {
        el("path", { d: "M" + x + " " + (LY - 16) + " l-11 -20 h22 z", style: "fill:" + color }, g);
        txt(g, x, LY - 46, label, { "text-anchor": "middle", "font-size": 17, "font-weight": 700, style: "fill:" + color });
      } else {
        el("path", { d: "M" + x + " " + (LY + 16) + " l-11 20 h22 z", style: "fill:" + color }, g);
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
      // ghosts + arrows for moved predictions
      for (i = 0; i < M; i++) {
        if (!bad[i] || push === 0) continue;
        el("circle", { cx: X(CLEAN[i]), cy: LY, r: 9, "stroke-width": 2,
          style: "fill:var(--surface);stroke:var(--ink-3)" }, svg);
      }
      for (i = 0; i < M; i++) {
        var cx = Math.min(X(v[i]), X1 + 4);
        el("circle", { cx: cx, cy: LY, r: 10, "stroke-width": 2.5,
          style: "stroke:var(--surface);fill:" + (bad[i] ? "var(--mean)" : "var(--ink-2)") }, svg);
      }
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
        el("circle", { cx: X(r.median), cy: cy, r: 6.5, style: "fill:var(--median)" }, svg);
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

  /* ── Cyrene: ripples of the past ─────────────────────────────────────────
     Two touches in the spirit of the palette (Cyrene, Honkai: Star Rail: Ice, Path of Remembrance), drawn after how
     her Ultimate and her Skill look in the game.
     1. When the page opens, night falls over the hero and its text turns light. Meteors cross it and the largest lands
        in the middle; ripples spread from there and a figure of eight of light opens. Twelve crystals come on around
        it in four groups of three, one for each of the twelve demigods who took up the coreflames of the Titans of
        Amphoreus (the Titans come in four triads: the Pillars, Fate, Creation, Calamity). The crystals flow into the
        centre and become a crystal heart in a wreath of small hearts, the thirteenth; in the story she comes to hold
        all twelve coreflames. The heart flares, day returns, petals scatter across the hero, and a flower opens where
        each crystal stood. The game introduces her with a meteor, ripples in the river of life, thirteen colours and
        the flowers of the past blooming tomorrow. Clicking the title plays it again.
     2. In the first widget the range of the clean predictions is the Zone her Skill opens, hung with sheer drapes and
        flowers as in the game. It holds while fewer than half of the predictions are corrupted and scatters into
        petals the moment half or more are, which is where the median's guarantee ends; it opens again when the count
        drops back below half (numberLine above).
     Nothing moves with prefers-reduced-motion. */
  function initReverie() {
    var hero = document.querySelector(".hero");
    var cv = null, g = null, W = 0, H = 0, raf = 0, t0 = 0, dark = false, stars = [], streaks = [], petals = [], sprites = null;
    var LILAC = cssVar("--median") || "#6a4fd8", PINK = cssVar("--accent") || "#d65aa8";
    var MIST = "#cdbdff", ROSE = "#ff9fd2", CYAN = "#8fe9ff", AMBER = "#ffcf7a", WHITE = "#ffffff";
    // ms after play(): night falls over DUSK while meteors cross from STREAK0; the largest lands at HIT and ripples
    // spread, each over RIP; the figure of eight opens from INF over INFD; the crystals come on from LIT, flow into the
    // centre from FLOW (each over FLOWD) and become the heart from HEART; it flares at FLARE, day returns from DAWN over
    // DAWND, and the petals and flowers are gone by DUR
    var DUSK = 450, STREAK0 = 120, HIT = 1000, FALL = 650, RIP = 1600, INF = 1050, INFD = 800, LIT = 1500, FLOW = 2900,
      FLOWD = 550, HEART = 3350, FLARE = 4100, DAWN = 4200, DAWND = 1000, DUR = 6800;
    // in units of the radius: the ring the crystals stand on. FLAT is how flat the water looks (a ring on it is FLAT
    // times as tall as it is wide); SLOPE is the angle of the meteors below the horizontal.
    var RING = 0.95, FLAT = 0.4, SLOPE = (34 * Math.PI) / 180;
    // Four triads, lit clockwise from the upper left. They are spaced by length along the ring, not by angle: on a
    // ring this flat, equal angles would crowd the triads at the sides into one row. Neighbours within a triad are a
    // sixteenth of the way round, and the triads are twice as far from each other.
    var lights = [], arc = [0], i, n = 720;
    for (i = 1; i <= n; i++) {                    // length along the ring from its leftmost point, clockwise
      var a0 = -Math.PI + (TAU * (i - 1)) / n, a1 = -Math.PI + (TAU * i) / n;
      arc.push(arc[i - 1] + Math.hypot(Math.cos(a1) - Math.cos(a0), FLAT * (Math.sin(a1) - Math.sin(a0))));
    }
    for (i = 0; i < 12; i++) {
      var tri = Math.floor(i / 3), m = i % 3, at = arc[n] * (1 / 8 + tri / 4 + (m - 1) / 16), j = 0;
      while (arc[j + 1] < at) j++;
      lights.push({ th: -Math.PI + (TAU * (j + (at - arc[j]) / (arc[j + 1] - arc[j]))) / n, t: LIT + 230 * tri + 65 * m,
        c: hsl((330 + 30 * i) % 360, 0.85, 0.7) });
    }

    function size() {                             // the canvas covers the hero, which changes height when the fonts arrive
      var w = hero.clientWidth, h = hero.clientHeight;
      if (w === W && h === H) return;
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = w; H = h; cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    function glow(x, y, r, c, a) {                // a soft round light
      if (a <= 0 || r <= 0.3) return;
      var gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, rgba(c, a)); gr.addColorStop(0.4, rgba(c, a * 0.45)); gr.addColorStop(1, rgba(c, 0));
      g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
    }
    function sparkle(x, y, s, c, a) {             // a four-pointed glint
      if (s <= 0.3 || a <= 0) return;
      g.beginPath();
      for (var k = 0; k < 8; k++) {
        var r = k % 2 ? s * 0.18 : s, an = -Math.PI / 2 + (k * Math.PI) / 4;
        if (k) g.lineTo(x + Math.cos(an) * r, y + Math.sin(an) * r); else g.moveTo(x + Math.cos(an) * r, y + Math.sin(an) * r);
      }
      g.closePath(); g.fillStyle = rgba(c, a); g.fill();
    }
    function beam(hx, hy, tx, ty, w, c0, c1, a) { // a streak of light, bright at its head (hx, hy) and gone at its tail
      if (a <= 0) return;
      var gr = g.createLinearGradient(hx, hy, tx, ty);
      gr.addColorStop(0, rgba(c0, a)); gr.addColorStop(0.3, rgba(c1, a * 0.6)); gr.addColorStop(1, rgba(c1, 0));
      g.strokeStyle = gr; g.lineWidth = w; g.lineCap = "round";
      g.beginPath(); g.moveTo(hx, hy); g.lineTo(tx, ty); g.stroke();
    }
    function flare(x, y, s, a) {                  // a star flare: a soft core and long thin spikes
      if (a <= 0 || s <= 1) return;
      glow(x, y, s * 0.22, WHITE, 0.9 * a);
      var sp = [[0, 1], [Math.PI / 2, 0.42], [Math.PI / 4, 0.24], [-Math.PI / 4, 0.24]];
      for (var k = 0; k < sp.length; k++) {
        var dx = Math.cos(sp[k][0]) * s * sp[k][1], dy = Math.sin(sp[k][0]) * s * sp[k][1];
        beam(x, y, x + dx, y + dy, 2, WHITE, MIST, a); beam(x, y, x - dx, y - dy, 2, WHITE, MIST, a);
      }
    }
    // night over the hero: indigo above, violet below, a nebula, stars. d (0 to 1) turns it into a pale dawn sky by way
    // of a sunrise in violet and pink: mixing dark straight into light would pass through grey.
    var SKY = [["#120c30", "#5a36b8", "#eee4ff"], ["#271a5e", "#c45bbf", "#fbe2f1"], ["#40257c", "#ff9ec4", "#fff0f6"]];
    function skyAt(k, d) { return d < 0.5 ? mix(SKY[k][0], SKY[k][1], d * 2) : mix(SKY[k][1], SKY[k][2], d * 2 - 1); }
    function sky(a, d, now) {
      if (a <= 0) return;
      g.globalAlpha = a;
      var gr = g.createLinearGradient(0, 0, 0, H);
      gr.addColorStop(0, skyAt(0, d)); gr.addColorStop(0.6, skyAt(1, d)); gr.addColorStop(1, skyAt(2, d));
      g.fillStyle = gr; g.fillRect(0, 0, W, H);
      var m = Math.max(W, H) * 0.5, nb = g.createRadialGradient(W / 2, H * 0.58, 0, W / 2, H * 0.58, m);
      nb.addColorStop(0, rgba(mix("#9664f0", "#ffffff", d), 0.42)); nb.addColorStop(0.45, rgba(PINK, 0.14));
      nb.addColorStop(1, rgba(PINK, 0));
      g.fillStyle = nb; g.fillRect(0, 0, W, H);
      g.globalCompositeOperation = "lighter";
      for (var k = 0; k < stars.length && d < 1; k++) {
        var s = stars[k], tw = (0.6 + 0.4 * Math.sin(now / s.w + s.ph)) * (1 - d);
        if (s.big) sparkle(s.x * W, s.y * H, s.r * 3.5, s.c, 0.85 * tw);
        else { g.fillStyle = rgba(s.c, s.a * tw); g.fillRect(s.x * W, s.y * H, s.r, s.r); }
      }
      g.globalCompositeOperation = "source-over";
      g.globalAlpha = 1;
    }
    function ripple(c, R, q, col, a) {            // one ring on the water; q runs from 0 to 1
      if (q < 0 || q > 1 || a <= 0) return;
      var rx = R * (0.05 + 1.45 * easeOut(q)), al = 0.8 * a * Math.pow(1 - q, 1.3);
      g.lineWidth = Math.max(1.2, R * 0.01) * (1 - 0.5 * q);
      g.strokeStyle = rgba(col, al); g.beginPath(); g.ellipse(c[0], c[1], rx, rx * FLAT, 0, 0, TAU); g.stroke();
      g.strokeStyle = rgba(col, 0.35 * al); g.beginPath(); g.ellipse(c[0], c[1], 0.94 * rx, 0.94 * rx * FLAT, 0, 0, TAU); g.stroke();
    }
    function infinity(c, R, f, a, now) {          // a figure of eight of light, open to fraction f from where it crosses
      if (f <= 0 || a <= 0) return;
      var A = R * 1.6, B = R * 0.62, ph = (f * Math.PI) / 2, N = 56, k, s;
      // strands of the ribbon: colour, how far it wanders from the curve, width, opacity
      var strands = [[MIST, 0, 2.4, 0.75], [CYAN, 0.04, 1.2, 0.5], [ROSE, -0.04, 1.2, 0.5], [WHITE, 0.015, 1, 0.65]];
      g.lineCap = "round"; g.lineJoin = "round";
      for (s = 0; s < strands.length; s++) {
        var st = strands[s];
        g.strokeStyle = rgba(st[0], st[3] * a); g.lineWidth = st[2];
        for (var b = 0; b < 2; b++) {             // the two strokes that cross at the centre, about theta = 0 and theta = pi
          g.beginPath();
          for (k = 0; k <= N; k++) {
            var th = b * Math.PI - ph + (2 * ph * k) / N;
            var x = c[0] + A * Math.sin(th), y = c[1] + B * Math.sin(th) * Math.cos(th) + st[1] * R * Math.sin(3 * th + now / 400);
            if (k) g.lineTo(x, y); else g.moveTo(x, y);
          }
          g.stroke();
        }
      }
      for (k = 0; k < 30; k++) {                  // glints along it, where it is already open
        var t2 = (k * 2.39996) % TAU;            // spread round the curve by the golden angle
        if (Math.min(t2, TAU - t2) > ph && Math.abs(t2 - Math.PI) > ph) continue;
        sparkle(c[0] + A * Math.sin(t2), c[1] + B * Math.sin(t2) * Math.cos(t2), R * 0.028 * (0.6 + 0.4 * Math.sin(now / 110 + k)),
          k % 3 ? WHITE : CYAN, 0.85 * a);
      }
    }
    function crystal(x, y, w, h, hue, a, gold, rot) { // an elongated hexagonal crystal, lit from inside in its own colour
      if (w <= 0.5 || a <= 0) return;
      g.save(); g.translate(x, y); g.rotate(rot);
      function hex(dx) {
        g.beginPath(); g.moveTo(dx, -h / 2); g.lineTo(dx + w / 2, -h / 4); g.lineTo(dx + w / 2, h / 4);
        g.lineTo(dx, h / 2); g.lineTo(dx - w / 2, h / 4); g.lineTo(dx - w / 2, -h / 4); g.closePath();
      }
      hex(0);
      var gr = g.createLinearGradient(0, -h / 2, 0, h / 2);
      gr.addColorStop(0, rgba("#9b7cf5", 0.42 * a)); gr.addColorStop(1, rgba("#4a2ba6", 0.42 * a));
      g.fillStyle = gr; g.fill();
      glow(0, 0, h * 0.4, hue, 0.72 * a);         // the light inside, in its own colour
      g.lineWidth = 1.1;                          // the cut edges, with a fringe of colour on either side
      hex(-1.5); g.strokeStyle = rgba(CYAN, 0.55 * a); g.stroke();
      hex(1.5); g.strokeStyle = rgba(ROSE, 0.55 * a); g.stroke();
      hex(0); g.strokeStyle = rgba("#f1ebff", 0.95 * a); g.lineWidth = 1.4; g.stroke();
      g.beginPath(); g.moveTo(0, -h / 2); g.lineTo(0, h / 2); g.moveTo(-w / 2, -h / 4); g.lineTo(0, 0); g.lineTo(w / 2, -h / 4);
      g.strokeStyle = rgba("#f1ebff", 0.35 * a); g.lineWidth = 0.8; g.stroke();   // facets
      if (gold > 0) { hex(0); g.strokeStyle = rgba(AMBER, gold * a); g.lineWidth = 2.6; g.stroke(); }
      g.restore();
    }
    function heartPath(x, y, s, rot) {            // a heart about s wide, point down, turned by rot
      var pts = [], cs = Math.cos(rot), sn = Math.sin(rot);
      for (var k = 0; k < 32; k++) {
        var t = (k / 32) * TAU, hx = 16 * Math.pow(Math.sin(t), 3),
          hy = -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)) - 2.5;
        hx *= s / 32; hy *= s / 32;
        pts.push([x + hx * cs - hy * sn, y + hx * sn + hy * cs]);
      }
      g.beginPath(); g.moveTo(pts[0][0], pts[0][1]);
      for (k = 1; k < pts.length; k++) g.lineTo(pts[k][0], pts[k][1]);
      g.closePath();
      return pts;
    }
    function crystalHeart(x, y, s, a) {           // a cut crystal heart: a glow, a body, facets in shifting colours, a rim
      if (s <= 1 || a <= 0) return;
      glow(x, y, s * 1.2, ROSE, 0.42 * a);
      var pts = heartPath(x, y, s, 0), k;
      var gr = g.createRadialGradient(x - s * 0.18, y - s * 0.15, 0, x, y, s * 0.65);
      gr.addColorStop(0, rgba(WHITE, 0.6 * a)); gr.addColorStop(0.45, rgba(ROSE, 0.42 * a)); gr.addColorStop(1, rgba(LILAC, 0.55 * a));
      g.fillStyle = gr; g.fill();
      var IR = [CYAN, ROSE, MIST, "#9fb6ff"];
      for (k = 0; k < pts.length; k += 2) {       // facets: triangles from a point inside to the rim, in turn
        var p0 = pts[k], p1 = pts[(k + 2) % pts.length];
        g.beginPath(); g.moveTo(x - s * 0.06, y - s * 0.02); g.lineTo(p0[0], p0[1]); g.lineTo(p1[0], p1[1]); g.closePath();
        g.fillStyle = rgba(IR[(k / 2) % 4], 0.32 * a); g.fill();
        g.strokeStyle = rgba(WHITE, 0.28 * a); g.lineWidth = 0.8; g.stroke();
      }
      heartPath(x - 1.5, y, s, 0); g.strokeStyle = rgba(CYAN, 0.5 * a); g.lineWidth = 1.2; g.stroke();
      heartPath(x + 1.5, y, s, 0); g.strokeStyle = rgba(ROSE, 0.5 * a); g.stroke();
      heartPath(x, y, s, 0); g.strokeStyle = rgba(WHITE, 0.95 * a); g.lineWidth = Math.max(1.6, s * 0.03); g.stroke();
    }
    function wreath(x, y, r, f, a) {              // her halo: two arcs of small white hearts rising round the heart
      if (f <= 0 || a <= 0) return;
      for (var side = -1; side <= 1; side += 2) {
        var span = TAU / 2 - 0.6;                  // each arc runs from below the heart to just short of the top
        g.beginPath();
        for (var k = 0; k <= 40 * f; k++) {
          var an = Math.PI / 2 - side * (0.35 + (span * k) / 40), px = x + Math.cos(an) * r, py = y + Math.sin(an) * r;
          if (k) g.lineTo(px, py); else g.moveTo(px, py);
        }
        g.strokeStyle = rgba(WHITE, 0.55 * a); g.lineWidth = 1.2; g.stroke();
        for (var q = 0; q < 12; q++) {            // the leaves are hearts, smaller towards the top, tilted the way it grows
          var u = (q + 0.6) / 12.6;
          if (u > f) break;
          var an2 = Math.PI / 2 - side * (0.35 + span * u), hs = r * (0.2 - 0.1 * u) * Math.min(1, (f - u) * 8);
          var out = an2 - side * 0.55, hx = x + Math.cos(an2) * r + Math.cos(out) * hs * 0.45, hy = y + Math.sin(an2) * r + Math.sin(out) * hs * 0.45;
          heartPath(hx, hy, hs, out + Math.PI / 2);
          g.fillStyle = rgba(WHITE, 0.92 * a); g.fill();
        }
      }
    }
    function starFlower(x, y, r, hue, a) {        // a small white flower with five pointed petals and a coloured heart
      if (r <= 0.5 || a <= 0) return;
      g.save(); g.translate(x, y); g.globalAlpha = a;
      glow(0, 0, r * 1.6, ROSE, 0.35);
      for (var k = 0; k < 5; k++) {
        g.save(); g.rotate((k * TAU) / 5);
        g.beginPath(); g.moveTo(0, 0); g.bezierCurveTo(r * 0.45, -r * 0.3, r * 0.3, -r * 0.85, 0, -r);
        g.bezierCurveTo(-r * 0.3, -r * 0.85, -r * 0.45, -r * 0.3, 0, 0); g.closePath();
        var gr = g.createLinearGradient(0, 0, 0, -r);
        gr.addColorStop(0, hue); gr.addColorStop(0.45, "#ffffff"); gr.addColorStop(1, "#ffffff");
        g.fillStyle = gr; g.fill();
        g.strokeStyle = rgba(PINK, 0.55); g.lineWidth = 0.8; g.stroke();
        g.restore();
      }
      g.fillStyle = rgba(AMBER, 0.95); g.beginPath(); g.arc(0, 0, r * 0.16, 0, TAU); g.fill();
      g.restore();
    }
    function makeSprites() {                      // petals, drawn once: rounded, a little notched, narrowing to the base
      return [["#f06aae", "#ffe3f1"], ["#b394ff", "#f7f1ff"], ["#ff9ec9", "#ffffff"]].map(function (v) {
        var oc = document.createElement("canvas"), o;
        oc.width = 48; oc.height = 64; o = oc.getContext("2d"); o.translate(24, 32);
        o.beginPath(); o.moveTo(0, 28); o.bezierCurveTo(-22, 14, -22, -18, -8, -27); o.quadraticCurveTo(0, -21, 8, -27);
        o.bezierCurveTo(22, -18, 22, 14, 0, 28); o.closePath();
        var gr = o.createLinearGradient(0, 28, 0, -27); gr.addColorStop(0, v[0]); gr.addColorStop(1, v[1]);
        o.fillStyle = gr; o.fill(); o.strokeStyle = "rgba(255,255,255,.65)"; o.lineWidth = 1.2; o.stroke();
        o.beginPath(); o.moveTo(0, 22); o.quadraticCurveTo(2.5, 0, 0, -18); o.strokeStyle = "rgba(255,255,255,.4)"; o.stroke();
        return oc;
      });
    }
    function spawn() {
      var R = Math.random, k, C = [WHITE, WHITE, WHITE, MIST, CYAN, ROSE];
      stars.length = 0; streaks.length = 0; petals.length = 0;
      for (k = 0; k < 170; k++) {
        stars.push({ x: R(), y: R(), r: 0.8 + R() * 1.2, a: 0.35 + R() * 0.55, w: 180 + R() * 420, ph: R() * TAU,
          c: C[Math.floor(R() * C.length)], big: k < 12 });
      }
      for (k = 0; k < 16; k++) {                  // starting on the top edge or beyond the right edge, in px from there
        streaks.push({ x: (0.15 + 1.2 * R()) * W, y: -30 - R() * 60, t: STREAK0 + R() * 1300, v: 1.1 + R() * 0.9,
          len: 90 + R() * 160, w: 0.8 + R() * 1.6, a: 0.45 + R() * 0.5 });
      }
      for (k = 0; k < 70; k++) {                  // the petals the heart breaks into: speeds in px/ms for a radius of 230
        var an = R() * TAU, v = 0.25 + R() * 0.75;
        petals.push({ vx: Math.cos(an) * v * 1.6, vy: Math.sin(an) * v * 0.55 - 0.12, s: 0.35 + R() * 0.45, rot: R() * TAU,
          vr: (R() - 0.5) * 0.008, fl: R() * TAU, vf: 0.004 + R() * 0.006, sw: 6 + R() * 14, wf: 0.002 + R() * 0.002,
          sp: Math.floor(R() * 3), life: 1900 + R() * 700 });
      }
    }
    function frame(now) {
      size();
      var t = now - t0, c = [W / 2, H / 2], R = clamp(Math.min(H / 2 - 14, W / 2 - 14, 400), 110, 400), k, u;
      // the sky first turns pale (d), then lifts (night falls to 0); the text turns dark again as soon as it is pale
      var dw = clamp((t - DAWN) / DAWND, 0, 1), d = easeOut(clamp(dw * 1.7, 0, 1));
      var night = t < DAWN ? easeOut(clamp(t / DUSK, 0, 1)) : 1 - dw * dw;
      if (dark && t >= DAWN + 120) { dark = false; hero.classList.remove("night"); }
      g.clearRect(0, 0, W, H);
      sky(night, d, now);
      night *= 1 - d;                             // what shines fades as the sky turns pale
      g.globalCompositeOperation = "lighter";      // everything that shines adds its light to the night

      for (k = 0; k < streaks.length; k++) {      // meteors cross the sky from the upper right
        var s = streaks[k], tt = t - s.t, ux = -Math.cos(SLOPE), uy = Math.sin(SLOPE);
        if (tt < 0) continue;
        var hx = s.x + ux * s.v * tt, hy = s.y + uy * s.v * tt, tl = Math.min(s.len, s.v * tt);
        if (hy - uy * tl > H + 10 || hx - ux * tl < -10) continue;
        var al = s.a * Math.min(1, tt / 120) * night;
        beam(hx, hy, hx - ux * tl, hy - uy * tl, s.w, WHITE, MIST, al);
      }
      var p = (t - (HIT - FALL)) / FALL;
      if (p >= 0 && p < 1) {                      // and the largest falls into the middle
        var e = Math.pow(p, 1.6), sx = c[0] + Math.cos(SLOPE) * 2.3 * R, sy = c[1] - Math.sin(SLOPE) * 2.3 * R;
        var mx = sx + (c[0] - sx) * e, my = sy + (c[1] - sy) * e, mux = -Math.cos(SLOPE), muy = Math.sin(SLOPE);
        var ml = R * (0.4 + 0.9 * Math.min(1, 1.5 * p)), nx = -muy * 2.2, ny = mux * 2.2;
        beam(mx + nx, my + ny, mx + nx - mux * ml, my + ny - muy * ml, 3, CYAN, CYAN, 0.5);
        beam(mx - nx, my - ny, mx - nx - mux * ml, my - ny - muy * ml, 3, ROSE, ROSE, 0.5);
        beam(mx, my, mx - mux * ml, my - muy * ml, Math.max(3, R * 0.02), WHITE, MIST, 0.95);
        glow(mx, my, R * 0.12, MIST, 0.9); sparkle(mx, my, R * 0.08, WHITE, 1);
      }
      if (t >= HIT) {                             // the river of life ripples where it lands
        var th = t - HIT;
        if (th < 380) { glow(c[0], c[1], R * (0.15 + (0.5 * th) / 380), MIST, 0.9 * (1 - th / 380)); flare(c[0], c[1], R * (1 - th / 380), 1 - th / 380); }
        for (k = 0; k < 3; k++) ripple(c, R, (th - 220 * k) / RIP, [MIST, ROSE, CYAN][k], night);
      }
      // the figure of eight (her Ultimate: "of the vow, infinity") opens, and gives way as the crystals move in
      infinity(c, R, easeOut(clamp((t - INF) / INFD, 0, 1)), night * clamp(1 - (t - FLOW) / 700, 0, 1), now);

      // twelve crystals come on around it, one for each demigod, each with a gold edge as it lights (as a teammate is
      // picked out in the game); then each flows into the centre along a curve that turns as it closes in
      var arrived = 0;
      for (k = 0; k < 12; k++) {
        var L = lights[k], lt = t - L.t;
        if (lt < 0) continue;
        var dep = 0.85 + 0.15 * Math.sin(L.th), f0 = FLOW + 25 * k;
        u = (t - f0) / FLOWD;
        if (u >= 1) { arrived++; continue; }
        var cx = c[0] + Math.cos(L.th) * RING * R, cy = c[1] + Math.sin(L.th) * RING * R * FLAT + Math.sin(now / 500 + k) * 3 * dep;
        var sc = dep * Math.max(0, easeOutBack(clamp(lt / 320, 0, 1))), rot = 0;
        if (u > 0) {
          var ff = easeInOut(u), an = L.th + 0.8 * ff, rr = RING * R * (1 - ff);
          var ox = cx, oy = cy;
          cx = c[0] + Math.cos(an) * rr; cy = c[1] + Math.sin(an) * rr * FLAT; sc *= 1 - 0.75 * ff; rot = 1.4 * ff;
          beam(cx, cy, cx + (ox - cx) * 0.35, cy + (oy - cy) * 0.35, 2, WHITE, L.c, 0.7 * night);
        }
        crystal(cx, cy, R * 0.13 * sc, R * 0.3 * sc, L.c, night, clamp(1 - lt / 520, 0, 1), rot);
      }
      // the thirteenth: they become a crystal heart in a wreath of small hearts. It flares, and day returns.
      var hb = clamp((t - HEART) / 600, 0, 1), fade = t < DAWN ? 1 : clamp(1 - (t - DAWN) / 650, 0, 1);
      if (t >= FLOW) glow(c[0], c[1], R * (0.12 + (0.12 * arrived) / 12), ROSE, ((0.55 * arrived) / 12) * fade);
      if (hb > 0) {
        var hs = R * 0.42 * Math.max(0, easeOutBack(hb)) * (1 + 0.035 * Math.sin(now / 150));
        crystalHeart(c[0], c[1] + R * 0.02, hs, fade);
        wreath(c[0], c[1], R * 0.5, easeOut(clamp((t - HEART - 150) / 750, 0, 1)), fade);
      }
      u = (t - FLARE) / 650;
      if (u > -0.25 && u < 1) {
        var fe = u < 0 ? 1 + u / 0.25 : 1 - u;
        flare(c[0], c[1], R * 1.9 * fe, fe);
        glow(c[0], c[1], R * 0.6 * fe, WHITE, 0.6 * fe);
      }
      u = clamp(dw * 1.7, 0, 1);
      if (u > 0 && u < 1) {                       // dawn: a warm light that spreads from the heart as the sky turns pale
        var dg = g.createRadialGradient(c[0], c[1], 0, c[0], c[1], Math.max(W, H) * (0.25 + 0.6 * u)), da = Math.sin(Math.PI * u);
        dg.addColorStop(0, rgba("#fff1e6", 0.4 * da)); dg.addColorStop(0.5, rgba(ROSE, 0.18 * da)); dg.addColorStop(1, rgba(ROSE, 0));
        g.fillStyle = dg; g.fillRect(0, 0, W, H);
      }
      g.globalCompositeOperation = "source-over";

      // a flower opens where each crystal stood, and the heart's petals drift down
      var gone = clamp(1 - (t - (DUR - 900)) / 900, 0, 1);
      for (k = 0; k < 12; k++) {
        var bt = (t - (DAWN + 150 + 30 * k)) / 550;
        if (bt <= 0) continue;
        var Lk = lights[k], dk = 0.85 + 0.15 * Math.sin(Lk.th);
        starFlower(c[0] + Math.cos(Lk.th) * RING * R, c[1] + Math.sin(Lk.th) * RING * R * FLAT,
          R * 0.085 * dk * Math.max(0, easeOutBack(clamp(bt, 0, 1))), Lk.c, gone);
      }
      var ps = R / 230, pz = Math.max(0.7, ps);
      for (k = 0; k < petals.length; k++) {
        var pe = petals[k], pt = t - FLARE, pu = pt / pe.life;
        if (pu < 0 || pu > 1) continue;
        var dr = (1 - Math.exp(-0.0022 * pt)) / 0.0022;   // air slows them quickly; then they sink and sway
        var px = c[0] + pe.vx * ps * dr + Math.sin(pt * pe.wf + pe.fl) * pe.sw * Math.min(1, pt / 400);
        var py = c[1] + pe.vy * ps * dr + 0.00006 * pt * pt * ps;
        var pa = Math.min(1, pt / 120) * (pu < 0.6 ? 1 : 1 - (pu - 0.6) / 0.4) * clamp((H - py) / 70, 0, 1);
        if (pa <= 0) continue;
        g.save(); g.translate(px, py); g.rotate(pe.rot + pe.vr * pt); g.scale(pe.s * pz * Math.cos(pe.fl + pe.vf * pt), pe.s * pz);
        g.globalAlpha = pa; g.drawImage(sprites[pe.sp], -24, -32); g.restore();
      }
      g.globalAlpha = 1;

      if (t < DUR) raf = requestAnimationFrame(frame);
      else stop();
    }
    function stop() {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      if (g) g.clearRect(0, 0, W, H);
      if (cv) cv.hidden = true;
      if (dark) { dark = false; hero.classList.remove("night"); }
    }
    function play() {
      if (reduce || document.hidden || !hero) return;
      if (!cv) {
        cv = document.createElement("canvas");
        cv.className = "reverie"; cv.setAttribute("aria-hidden", "true");
        hero.insertBefore(cv, hero.firstChild);
        g = cv.getContext("2d");
        sprites = makeSprites();
        document.addEventListener("visibilitychange", function () { if (document.hidden && raf) stop(); });
      }
      cv.hidden = false; W = H = 0; size(); spawn();
      dark = true; hero.classList.add("night");
      t0 = performance.now();
      if (!raf) raf = requestAnimationFrame(frame);
    }
    return { play: play };
  }

  // ── wire up ─────────────────────────────────────────────────────────────
  numberLine(document.getElementById("w-sparse"), "sparse");
  numberLine(document.getElementById("w-common"), "common");
  if (window.MTE) {
    mainChart(document.getElementById("c-main"), window.MTE.table);
    fig1Chart(document.getElementById("c-fig1"), document.getElementById("fig1-legend"), window.MTE.fig1);
  }
  bars();
  try {                                           // the opening once (at the top of the page), again on the title
    var reverie = initReverie(), title = document.querySelector(".hero h1");
    if ((window.scrollY || 0) < 160) setTimeout(reverie.play, 300);
    if (title) title.addEventListener("click", reverie.play);
  } catch (e) { console.error(e); }

  var cb = document.getElementById("copyBib");
  cb.addEventListener("click", function () {
    var t = document.getElementById("bibText").textContent;
    (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(
      function () { cb.textContent = "Copied"; setTimeout(function () { cb.textContent = "Copy"; }, 1500); },
      function () { cb.textContent = "Select and copy"; });
  });
})();
