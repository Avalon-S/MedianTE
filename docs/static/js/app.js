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

    var svg = el("svg", { viewBox: "0 0 1000 230", role: "img" }, root);
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
      if (ref.length) {
        var lo = Math.min.apply(null, ref), hi = Math.max.apply(null, ref);
        el("rect", { x: X(lo) - 8, y: LY - 34, width: X(hi) - X(lo) + 16, height: 68, rx: 10,
          style: "fill:var(--median-soft)" }, svg);
        txt(svg, X(lo) - 8, LY + 52, mode === "sparse" ? "range of the clean predictions" : "where the clean predictions were",
          { "font-size": 13, style: "fill:var(--median)" });
      }
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

  // ── wire up ─────────────────────────────────────────────────────────────
  numberLine(document.getElementById("w-sparse"), "sparse");
  numberLine(document.getElementById("w-common"), "common");
  if (window.MTE) {
    mainChart(document.getElementById("c-main"), window.MTE.table);
    fig1Chart(document.getElementById("c-fig1"), document.getElementById("fig1-legend"), window.MTE.fig1);
  }
  bars();

  var cb = document.getElementById("copyBib");
  cb.addEventListener("click", function () {
    var t = document.getElementById("bibText").textContent;
    (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(
      function () { cb.textContent = "Copied"; setTimeout(function () { cb.textContent = "Copy"; }, 1500); },
      function () { cb.textContent = "Select and copy"; });
  });
})();
