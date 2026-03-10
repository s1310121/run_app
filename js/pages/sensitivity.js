import { runModel } from "../core/model.js";
import { loadResults, loadConfig } from "../lib/storage.js";
import { DEFAULT_CONFIG, BODY_PARTS } from "../core/constants.js";

function $(id) {
  return document.getElementById(id);
}

function csvEscape(x) {
  const s = x === null || x === undefined ? "" : String(x);
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replaceAll('"', '""')}"`;
  }
  return s;
}

function escapeHtml(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function parseList(str) {
  return String(str || "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length)
    .map(Number)
    .filter((x) => Number.isFinite(x));
}

function downloadText(filename, text, mime = "text/csv;charset=utf-8") {
  const needsBom = mime.toLowerCase().includes("text/csv");
  const blob = needsBom
    ? new Blob(["\uFEFF", text], { type: mime })
    : new Blob([text], { type: mime });

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function restoreDaysFromResults(results) {
  return results.map((r) => ({ ...r.input }));
}

function safeNum(x) {
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
}

function fmtValue(x, digits = 4) {
  const n = Number(x);
  return Number.isFinite(n) ? n.toFixed(digits) : "—";
}

function scaleMap(mapObj, scale) {
  const out = {};
  for (const [k, v] of Object.entries(mapObj ?? {})) {
    out[k] = (v ?? 0) * scale;
  }
  return out;
}

function summarize(res) {
  const theta = Math.log(1.5);
  const ready = res.filter(
    (r) => r?.meta?.standardizationReady && Number.isFinite(r?.global?.maxS)
  );
  const last = ready.length ? ready[ready.length - 1] : null;

  let peak = null;
  for (const r of ready) {
    if (!peak || r.global.maxS > peak.global.maxS) peak = r;
  }

  const exceedCount = ready.reduce(
    (acc, r) => acc + (r.global.maxS > theta ? 1 : 0),
    0
  );

  let peakTop3 = "";
  if (peak) {
    const rows = BODY_PARTS
      .map((p) => ({ p, S: peak.parts?.[p]?.S }))
      .filter((x) => Number.isFinite(x.S))
      .sort((a, b) => b.S - a.S)
      .slice(0, 3);
    peakTop3 = rows
      .map((x) => `${x.p}:${Number(x.S).toFixed(3)}`)
      .join("|");
  }

  let peakMaxM = null;
  for (const r of ready) {
    const vals = BODY_PARTS.map((p) => safeNum(r.parts?.[p]?.m_eff)).filter(
      Number.isFinite
    );
    if (!vals.length) continue;
    const m = Math.max(...vals);
    if (peakMaxM === null || m > peakMaxM) peakMaxM = m;
  }

  const lastDiff_Knee_Thigh =
    last &&
    Number.isFinite(last.parts?.["膝"]?.S) &&
    Number.isFinite(last.parts?.["大腿"]?.S)
      ? Math.abs(last.parts["膝"].S - last.parts["大腿"].S)
      : "";

  const lastDiff_Ach_Post =
    last &&
    Number.isFinite(last.parts?.["アキレス腱"]?.S) &&
    Number.isFinite(last.parts?.["後下腿"]?.S)
      ? Math.abs(last.parts["アキレス腱"].S - last.parts["後下腿"].S)
      : "";

  const lastDiff_Plantar_Ankle =
    last &&
    Number.isFinite(last.parts?.["足底部"]?.S) &&
    Number.isFinite(last.parts?.["足関節・足背部"]?.S)
      ? Math.abs(last.parts["足底部"].S - last.parts["足関節・足背部"].S)
      : "";

  const peakDiff_Knee_Thigh =
    peak &&
    Number.isFinite(peak.parts?.["膝"]?.S) &&
    Number.isFinite(peak.parts?.["大腿"]?.S)
      ? Math.abs(peak.parts["膝"].S - peak.parts["大腿"].S)
      : "";

  const peakDiff_Ach_Post =
    peak &&
    Number.isFinite(peak.parts?.["アキレス腱"]?.S) &&
    Number.isFinite(peak.parts?.["後下腿"]?.S)
      ? Math.abs(peak.parts["アキレス腱"].S - peak.parts["後下腿"].S)
      : "";

  const peakDiff_Plantar_Ankle =
    peak &&
    Number.isFinite(peak.parts?.["足底部"]?.S) &&
    Number.isFinite(peak.parts?.["足関節・足背部"]?.S)
      ? Math.abs(peak.parts["足底部"].S - peak.parts["足関節・足背部"].S)
      : "";

  return {
    lastDate: last?.date ?? "",
    lastG: last?.global?.G ?? "",
    lastMaxS: last?.global?.maxS ?? "",
    peakDate: peak?.date ?? "",
    peakMaxS: peak?.global?.maxS ?? "",
    peakPart: peak?.global?.maxPart ?? "",
    exceedCount,
    peakTop3,
    peakMaxM: peakMaxM ?? "",
    lastDiff_Knee_Thigh,
    lastDiff_Ach_Post,
    lastDiff_Plantar_Ankle,
    peakDiff_Knee_Thigh,
    peakDiff_Ach_Post,
    peakDiff_Plantar_Ankle,
  };
}

function setStatus(msg) {
  $("status").textContent = msg || "";
}

function setErrors(msg) {
  $("errors").textContent = msg || "";
}

function setSummary(caseCount, metricLabel, rangeLabel) {
  if ($("summaryCaseCount")) $("summaryCaseCount").textContent = String(caseCount ?? "-");
  if ($("summaryMetric")) $("summaryMetric").textContent = metricLabel ?? "-";
  if ($("summaryRange")) $("summaryRange").textContent = rangeLabel ?? "-";
}

function getMetricLabel(metricKey) {
  const map = {
    finalG: "最終日の G",
    finalMaxS: "最終日の maxS",
    peakMaxS: "期間内ピーク maxS",
    warnCount: "θ超過回数",
    peakMaxM_eff: "peakMaxM_eff",
  };
  return map[metricKey] ?? metricKey;
}

function getMetricValue(row, metricKey) {
  switch (metricKey) {
    case "finalG":
      return safeNum(row.lastG);
    case "finalMaxS":
      return safeNum(row.lastMaxS);
    case "peakMaxS":
      return safeNum(row.peakMaxS);
    case "warnCount":
      return safeNum(row.exceedCount);
    case "peakMaxM_eff":
      return safeNum(row.peakMaxM);
    default:
      return null;
  }
}

let latestSweepRows = [];
let tableSortKey = "peakMaxS";
let tableSortAsc = false;

function compareValues(a, b) {
  const an = safeNum(a);
  const bn = safeNum(b);

  if (Number.isFinite(an) && Number.isFinite(bn)) {
    return an - bn;
  }

  const as = String(a ?? "");
  const bs = String(b ?? "");
  return as.localeCompare(bs, "ja");
}

function getSortedRows(rows) {
  const out = [...rows];
  out.sort((ra, rb) => {
    const cmp = compareValues(ra[tableSortKey], rb[tableSortKey]);
    return tableSortAsc ? cmp : -cmp;
  });
  return out;
}

function renderResultTable(rows) {
  const box = $("resultTable");
  if (!box) return;

  if (!rows.length) {
    box.innerHTML = `<div class="muted">まだ結果がありません。</div>`;
    return;
  }

  const sortedRows = getSortedRows(rows);

  const columns = [
    { key: "ks", label: "ks" },
    { key: "kG_plus", label: "kG+" },
    { key: "kG_minus", label: "kG-" },
    { key: "Vref", label: "Vref" },
    { key: "tauAch", label: "tauAch" },
    { key: "tauPlantar", label: "tauPlantar" },
    { key: "betaScale", label: "betaScale" },
    { key: "lastG", label: "lastG" },
    { key: "lastMaxS", label: "lastMaxS" },
    { key: "peakMaxS", label: "peakMaxS" },
    { key: "peakPart", label: "peakPart" },
    { key: "exceedCount", label: "θ超過回数" },
    { key: "peakMaxM", label: "peakMaxM_eff" },
  ];

  const thead = `
    <tr>
      ${columns
        .map((col) => {
          const active = col.key === tableSortKey;
          const arrow = active ? (tableSortAsc ? " ▲" : " ▼") : "";
          return `<th>
            <button
              type="button"
              class="sort-btn"
              data-sort-key="${escapeHtml(col.key)}"
              style="all:unset; cursor:pointer; font-weight:700;"
            >${escapeHtml(col.label + arrow)}</button>
          </th>`;
        })
        .join("")}
    </tr>
  `;

  const tbody = sortedRows
    .map(
      (r) => `
        <tr>
          <td>${escapeHtml(r.ks)}</td>
          <td>${escapeHtml(r.kG_plus)}</td>
          <td>${escapeHtml(r.kG_minus)}</td>
          <td>${escapeHtml(r.Vref)}</td>
          <td>${escapeHtml(r.tauAch)}</td>
          <td>${escapeHtml(r.tauPlantar)}</td>
          <td>${escapeHtml(r.betaScale)}</td>
          <td>${escapeHtml(fmtValue(r.lastG, 4))}</td>
          <td>${escapeHtml(fmtValue(r.lastMaxS, 4))}</td>
          <td>${escapeHtml(fmtValue(r.peakMaxS, 4))}</td>
          <td>${escapeHtml(r.peakPart ?? "")}</td>
          <td>${escapeHtml(r.exceedCount)}</td>
          <td>${escapeHtml(fmtValue(r.peakMaxM, 4))}</td>
        </tr>
      `
    )
    .join("");

  box.innerHTML = `<table class="grid"><thead>${thead}</thead><tbody>${tbody}</tbody></table>`;

  box.querySelectorAll("[data-sort-key]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const key = btn.dataset.sortKey;
      if (!key) return;

      if (tableSortKey === key) {
        tableSortAsc = !tableSortAsc;
      } else {
        tableSortKey = key;
        tableSortAsc = true;
      }
      renderResultTable(latestSweepRows);
    });
  });
}

function groupRowsByParam(rows, paramKey, metricKey) {
  const groups = new Map();

  for (const row of rows) {
    const x = safeNum(row[paramKey]);
    const y = getMetricValue(row, metricKey);
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;

    const otherKeys = [
      "ks",
      "kG_plus",
      "kG_minus",
      "Vref",
      "tauAch",
      "tauPlantar",
      "betaScale",
    ].filter((k) => k !== paramKey);

    const groupLabel = otherKeys.map((k) => `${k}=${row[k]}`).join(", ");
    if (!groups.has(groupLabel)) groups.set(groupLabel, []);
    groups.get(groupLabel).push({ x, y });
  }

  const entries = Array.from(groups.entries()).map(([label, pts]) => ({
    label,
    points: pts.sort((a, b) => a.x - b.x),
  }));

  entries.sort((a, b) => a.label.localeCompare(b.label, "ja"));
  return entries.slice(0, 6);
}

function drawAxes(ctx, W, H, padL, padR, padT, padB, ymin, ymax, xmin, xmax) {
  const x0 = padL;
  const y0 = padT;
  const x1 = W - padR;
  const y1 = H - padB;

  ctx.clearRect(0, 0, W, H);
  ctx.strokeStyle = "#999";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x0, y1);
  ctx.lineTo(x1, y1);
  ctx.stroke();

  ctx.fillStyle = "#666";
  ctx.font = "12px system-ui";

  for (let t = 0; t <= 4; t++) {
    const yy = y0 + (y1 - y0) * (t / 4);
    const val = ymax - (ymax - ymin) * (t / 4);
    ctx.strokeStyle = "#ececec";
    ctx.beginPath();
    ctx.moveTo(x0, yy);
    ctx.lineTo(x1, yy);
    ctx.stroke();
    ctx.fillStyle = "#666";
    ctx.fillText(val.toFixed(3), 6, yy + 4);
  }

  for (let t = 0; t <= 4; t++) {
    const xx = x0 + (x1 - x0) * (t / 4);
    const val = xmin + (xmax - xmin) * (t / 4);
    ctx.fillText(val.toFixed(3), xx - 12, H - 10);
  }

  return {
    x0,
    y0,
    x1,
    y1,
    xAt: (v) => x0 + (x1 - x0) * ((v - xmin) / (xmax - xmin || 1)),
    yAt: (v) => y1 - (y1 - y0) * ((v - ymin) / (ymax - ymin || 1)),
  };
}

function drawSensitivityLineChart(rows, paramKey, metricKey) {
  const canvas = $("chartSensitivityLine");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const W = canvas.width;
  const H = canvas.height;

  const groups = groupRowsByParam(rows, paramKey, metricKey);
  const allPts = groups.flatMap((g) => g.points);

  if (!allPts.length) {
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = "#666";
    ctx.font = "12px system-ui";
    ctx.fillText("（表示できるデータがありません）", 10, 20);
    return;
  }

  let xmin = Math.min(...allPts.map((p) => p.x));
  let xmax = Math.max(...allPts.map((p) => p.x));
  let ymin = Math.min(...allPts.map((p) => p.y));
  let ymax = Math.max(...allPts.map((p) => p.y));

  if (xmin === xmax) {
    xmin -= 1;
    xmax += 1;
  }
  if (ymin === ymax) {
    ymin -= 1;
    ymax += 1;
  }

  const { x0, y0, x1, xAt, yAt } = drawAxes(
    ctx,
    W,
    H,
    48,
    220,
    16,
    34,
    ymin,
    ymax,
    xmin,
    xmax
  );

  const palette = ["#1f77b4", "#d62728", "#2ca02c", "#9467bd", "#ff7f0e", "#17becf"];

  groups.forEach((g, idx) => {
    const color = palette[idx % palette.length];
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();

    g.points.forEach((p, i) => {
      const x = xAt(p.x);
      const y = yAt(p.y);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

    g.points.forEach((p) => {
      const x = xAt(p.x);
      const y = yAt(p.y);
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(x, y, 3, 0, Math.PI * 2);
      ctx.fill();
    });
  });

  let ly = y0 + 10;
  groups.forEach((g, idx) => {
    const color = palette[idx % palette.length];
    ctx.fillStyle = color;
    ctx.fillRect(x1 + 16, ly, 14, 4);
    ctx.fillStyle = "#333";
    ctx.font = "12px system-ui";
    const shortLabel = g.label.length > 26 ? g.label.slice(0, 26) + "…" : g.label;
    ctx.fillText(shortLabel, x1 + 38, ly + 6);
    ly += 22;
  });
}

function drawSensitivityBarChart(rows, paramKey, metricKey) {
  const canvas = $("chartSensitivityBar");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const W = canvas.width;
  const H = canvas.height;

  const points = rows
    .map((r) => ({
      x: safeNum(r[paramKey]),
      y: getMetricValue(r, metricKey),
    }))
    .filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y))
    .sort((a, b) => a.x - b.x);

  if (!points.length) {
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = "#666";
    ctx.font = "12px system-ui";
    ctx.fillText("（表示できるデータがありません）", 10, 20);
    return;
  }

  const base = points[0].y;
  const diffs = points.map((p) => ({ x: p.x, d: p.y - base }));

  let ymin = Math.min(...diffs.map((p) => p.d), 0);
  let ymax = Math.max(...diffs.map((p) => p.d), 0);
  if (ymin === ymax) {
    ymin -= 1;
    ymax += 1;
  }

  const padL = 48;
  const padR = 20;
  const padT = 16;
  const padB = 40;
  const x0 = padL;
  const y0 = padT;
  const x1 = W - padR;
  const y1 = H - padB;

  ctx.clearRect(0, 0, W, H);
  ctx.strokeStyle = "#999";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x0, y1);
  ctx.lineTo(x1, y1);
  ctx.stroke();

  const yAt = (v) => y1 - (y1 - y0) * ((v - ymin) / (ymax - ymin || 1));

  for (let t = 0; t <= 4; t++) {
    const yy = y0 + (y1 - y0) * (t / 4);
    const val = ymax - (ymax - ymin) * (t / 4);
    ctx.strokeStyle = "#ececec";
    ctx.beginPath();
    ctx.moveTo(x0, yy);
    ctx.lineTo(x1, yy);
    ctx.stroke();
    ctx.fillStyle = "#666";
    ctx.font = "12px system-ui";
    ctx.fillText(val.toFixed(3), 6, yy + 4);
  }

  const zeroY = yAt(0);
  ctx.strokeStyle = "#999";
  ctx.beginPath();
  ctx.moveTo(x0, zeroY);
  ctx.lineTo(x1, zeroY);
  ctx.stroke();

  const barAreaW = x1 - x0;
  const barW = Math.max(16, Math.min(60, barAreaW / Math.max(diffs.length, 1) - 8));

  diffs.forEach((p, i) => {
    const cx = x0 + barAreaW * ((i + 0.5) / diffs.length);
    const top = yAt(Math.max(p.d, 0));
    const bottom = yAt(Math.min(p.d, 0));
    const h = Math.max(2, Math.abs(bottom - top));

    ctx.fillStyle = p.d >= 0 ? "#4f8cff" : "#f08a8a";
    ctx.fillRect(cx - barW / 2, Math.min(top, bottom), barW, h);

    ctx.fillStyle = "#666";
    ctx.font = "12px system-ui";
    ctx.fillText(String(p.x), cx - 12, H - 12);
  });
}

function updateChartsAndSummary() {
  const rows = latestSweepRows;
  const metricKey = $("chartMetric")?.value || "finalG";
  const paramKey = $("chartParam")?.value || "ks";

  if (!rows.length) {
    setSummary("-", "-", "-");
    renderResultTable([]);
    drawSensitivityLineChart([], paramKey, metricKey);
    drawSensitivityBarChart([], paramKey, metricKey);
    return;
  }

  const metricVals = rows
    .map((r) => getMetricValue(r, metricKey))
    .filter(Number.isFinite);

  const minV = metricVals.length ? Math.min(...metricVals) : null;
  const maxV = metricVals.length ? Math.max(...metricVals) : null;
  const rangeText =
    Number.isFinite(minV) && Number.isFinite(maxV)
      ? `${minV.toFixed(3)} ～ ${maxV.toFixed(3)}`
      : "-";

  setSummary(rows.length, getMetricLabel(metricKey), rangeText);
  renderResultTable(rows);
  drawSensitivityLineChart(rows, paramKey, metricKey);
  drawSensitivityBarChart(rows, paramKey, metricKey);
}

$("btnBack").addEventListener("click", () => (location.href = "./output.html"));
$("chartMetric")?.addEventListener("change", updateChartsAndSummary);
$("chartParam")?.addEventListener("change", updateChartsAndSummary);

$("btnRun").addEventListener("click", () => {
  setErrors("");
  setStatus("");

  const baseCfg = loadConfig() ?? DEFAULT_CONFIG;
  const baseResults = loadResults();

  if (!baseResults || !baseResults.length) {
    alert("結果がありません。先に入力→計算を実行してください。");
    return;
  }

  const days = restoreDaysFromResults(baseResults);

  const grid = {
    ks: parseList($("ks")?.value),
    kG_plus: parseList($("kG_plus")?.value),
    kG_minus: parseList($("kG_minus")?.value),
    Vref: parseList($("Vref")?.value),
    tauAch: parseList($("tauAch")?.value),
    tauPlantar: parseList($("tauPlantar")?.value),
    betaScale: parseList($("betaScale")?.value),
  };

  for (const [k, arr] of Object.entries(grid)) {
    if (!arr.length) {
      setErrors(`${k} の値が空です`);
      return;
    }
  }

  const totalCount =
    grid.ks.length *
    grid.kG_plus.length *
    grid.kG_minus.length *
    grid.Vref.length *
    grid.tauAch.length *
    grid.tauPlantar.length *
    grid.betaScale.length;

  const header = [
    "ks",
    "kG_plus",
    "kG_minus",
    "Vref",
    "tauAch",
    "tauPlantar",
    "betaScale",
    "lastDate",
    "lastG",
    "lastMaxS",
    "peakDate",
    "peakMaxS",
    "peakPart",
    "exceedCount(>theta)",
    "peakTop3(S)",
    "peakMaxM_eff",
    "|lastS_knee-thigh|",
    "|lastS_ach-postshank|",
    "|lastS_plantar-anklefoot|",
    "|peakS_knee-thigh|",
    "|peakS_ach-postshank|",
    "|peakS_plantar-anklefoot|",
  ];
  const lines = [header.join(",")];

  const sweepRows = [];

  let count = 0;
  setStatus(`実行中... 0 / ${totalCount}`);

  for (const ks of grid.ks) {
    for (const kG_plus of grid.kG_plus) {
      for (const kG_minus of grid.kG_minus) {
        for (const Vref of grid.Vref) {
          for (const tauAch of grid.tauAch) {
            for (const tauPlantar of grid.tauPlantar) {
              for (const betaScale of grid.betaScale) {
                const cfg = {
                  ...baseCfg,
                  ks,
                  kG_plus,
                  kG_minus,
                  Vref,
                  tauAch,
                  tauPlantar,
                  beta_v: scaleMap(baseCfg.beta_v ?? DEFAULT_CONFIG.beta_v, betaScale),
                  beta_u: scaleMap(baseCfg.beta_u ?? DEFAULT_CONFIG.beta_u, betaScale),
                  beta_d: scaleMap(baseCfg.beta_d ?? DEFAULT_CONFIG.beta_d, betaScale),
                  beta_s: scaleMap(baseCfg.beta_s ?? DEFAULT_CONFIG.beta_s, betaScale),
                };

                const res = runModel(days, cfg);
                const s = summarize(res);

                const rowObj = {
                  ks,
                  kG_plus,
                  kG_minus,
                  Vref,
                  tauAch,
                  tauPlantar,
                  betaScale,
                  lastDate: s.lastDate,
                  lastG: s.lastG,
                  lastMaxS: s.lastMaxS,
                  peakDate: s.peakDate,
                  peakMaxS: s.peakMaxS,
                  peakPart: s.peakPart,
                  exceedCount: s.exceedCount,
                  peakTop3: s.peakTop3,
                  peakMaxM: s.peakMaxM,
                  lastDiff_Knee_Thigh: s.lastDiff_Knee_Thigh,
                  lastDiff_Ach_Post: s.lastDiff_Ach_Post,
                  lastDiff_Plantar_Ankle: s.lastDiff_Plantar_Ankle,
                  peakDiff_Knee_Thigh: s.peakDiff_Knee_Thigh,
                  peakDiff_Ach_Post: s.peakDiff_Ach_Post,
                  peakDiff_Plantar_Ankle: s.peakDiff_Plantar_Ankle,
                };

                sweepRows.push(rowObj);

                const row = [
                  ks,
                  kG_plus,
                  kG_minus,
                  Vref,
                  tauAch,
                  tauPlantar,
                  betaScale,
                  s.lastDate,
                  s.lastG,
                  s.lastMaxS,
                  s.peakDate,
                  s.peakMaxS,
                  s.peakPart,
                  s.exceedCount,
                  s.peakTop3,
                  s.peakMaxM,
                  s.lastDiff_Knee_Thigh,
                  s.lastDiff_Ach_Post,
                  s.lastDiff_Plantar_Ankle,
                  s.peakDiff_Knee_Thigh,
                  s.peakDiff_Ach_Post,
                  s.peakDiff_Plantar_Ankle,
                ].map(csvEscape);

                lines.push(row.join(","));
                count++;

                if (count % 10 === 0) {
                  setStatus(`実行中... ${count} / ${totalCount}`);
                }
              }
            }
          }
        }
      }
    }
  }

  latestSweepRows = sweepRows;
  updateChartsAndSummary();

  setStatus(`完了: ${count} 通り（CSVを保存します）`);
  downloadText("sensitivity_sweep.csv", lines.join("\n"));
});

/* initial */
updateChartsAndSummary();