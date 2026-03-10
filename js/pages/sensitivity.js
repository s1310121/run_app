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

function fmtCompactValue(x, digits = 4) {
  const n = Number(x);
  if (!Number.isFinite(n)) return "—";
  const abs = Math.abs(n);
  if (abs >= 1000) return n.toFixed(0);
  if (abs >= 100) return n.toFixed(1);
  if (abs >= 10) return n.toFixed(2);
  return n.toFixed(digits);
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
  const el = $("status");
  if (el) el.textContent = msg || "";
}

function setErrors(msg) {
  const el = $("errors");
  if (el) el.textContent = msg || "";
}

function setText(id, value) {
  const el = $(id);
  if (el) el.textContent = value ?? "";
}

function renderCurrentBaseline(baseCfg) {
  if (!baseCfg) {
    setText("currentBaselineView", "まだ基準設定がありません。");
    return;
  }

  const text =
    `ks=${baseCfg.ks}\n` +
    `kG_plus=${baseCfg.kG_plus}\n` +
    `kG_minus=${baseCfg.kG_minus}\n` +
    `Vref=${baseCfg.Vref}\n` +
    `tauAch=${baseCfg.tauAch}\n` +
    `tauPlantar=${baseCfg.tauPlantar}\n` +
    `betaScale=${baseCfg.betaScale}`;

  setText("currentBaselineView", text);
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

function getMetricDescription(metricKey) {
  const map = {
    finalG: "全身指標の安定性を見る指標です。",
    finalMaxS: "最終日の局所スパイクの強さを見る指標です。",
    peakMaxS: "期間中でもっとも強いスパイク反応を見る指標です。",
    warnCount: "閾値を超えた日数で、警告の出やすさを見ます。",
    peakMaxM_eff: "期間中の局所有効負荷ピークを見ます。",
  };
  return map[metricKey] ?? "";
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
      return safeNum(row.peakMaxM ?? row.peakMaxM_eff);
    default:
      return null;
  }
}

let latestSweepRows = [];
let latestBaseCfg = null;

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

function compareMaybeNumber(a, b, tol = 1e-9) {
  const an = safeNum(a);
  const bn = safeNum(b);

  if (Number.isFinite(an) && Number.isFinite(bn)) {
    return Math.abs(an - bn) <= tol;
  }
  return String(a ?? "") === String(b ?? "");
}

function normalizeBaseCfg(cfg) {
  return {
    ks: safeNum(cfg?.ks) ?? safeNum(DEFAULT_CONFIG.ks) ?? 0.5,
    kG_plus: safeNum(cfg?.kG_plus) ?? safeNum(DEFAULT_CONFIG.kG_plus) ?? 10,
    kG_minus: safeNum(cfg?.kG_minus) ?? safeNum(DEFAULT_CONFIG.kG_minus) ?? 10,
    Vref: safeNum(cfg?.Vref) ?? safeNum(DEFAULT_CONFIG.Vref) ?? 3.0,
    tauAch: safeNum(cfg?.tauAch) ?? safeNum(DEFAULT_CONFIG.tauAch) ?? 0.1,
    tauPlantar:
      safeNum(cfg?.tauPlantar) ?? safeNum(DEFAULT_CONFIG.tauPlantar) ?? 0.05,
    betaScale: safeNum(cfg?.betaScale) ?? 1,
  };
}

function buildBaseCfgFromForm(rawBaseCfg, grid) {
  return {
    ks:
      safeNum(grid?.ks?.[0]) ??
      safeNum(rawBaseCfg?.ks) ??
      safeNum(DEFAULT_CONFIG.ks) ??
      0.5,
    kG_plus:
      safeNum(grid?.kG_plus?.[0]) ??
      safeNum(rawBaseCfg?.kG_plus) ??
      safeNum(DEFAULT_CONFIG.kG_plus) ??
      10,
    kG_minus:
      safeNum(grid?.kG_minus?.[0]) ??
      safeNum(rawBaseCfg?.kG_minus) ??
      safeNum(DEFAULT_CONFIG.kG_minus) ??
      10,
    Vref:
      safeNum(grid?.Vref?.[0]) ??
      safeNum(rawBaseCfg?.Vref) ??
      safeNum(DEFAULT_CONFIG.Vref) ??
      3.0,
    tauAch:
      safeNum(grid?.tauAch?.[0]) ??
      safeNum(rawBaseCfg?.tauAch) ??
      safeNum(DEFAULT_CONFIG.tauAch) ??
      0.1,
    tauPlantar:
      safeNum(grid?.tauPlantar?.[0]) ??
      safeNum(rawBaseCfg?.tauPlantar) ??
      safeNum(DEFAULT_CONFIG.tauPlantar) ??
      0.05,
    betaScale:
      safeNum(grid?.betaScale?.[0]) ??
      safeNum(rawBaseCfg?.betaScale) ??
      1,
  };
}

function isBaselineRow(row, baseCfg) {
  if (!row || !baseCfg) return false;
  return (
    compareMaybeNumber(row.ks, baseCfg.ks) &&
    compareMaybeNumber(row.kG_plus, baseCfg.kG_plus) &&
    compareMaybeNumber(row.kG_minus, baseCfg.kG_minus) &&
    compareMaybeNumber(row.Vref, baseCfg.Vref) &&
    compareMaybeNumber(row.tauAch, baseCfg.tauAch) &&
    compareMaybeNumber(row.tauPlantar, baseCfg.tauPlantar) &&
    compareMaybeNumber(row.betaScale, baseCfg.betaScale)
  );
}

function findBaselineRow(rows, baseCfg) {
  return rows.find((r) => isBaselineRow(r, baseCfg)) || null;
}

function filterRowsOneAtATime(rows, paramKey, baseCfg) {
  return rows.filter((r) => {
    if (!baseCfg) return false;

    const checks = {
      ks: paramKey === "ks" ? true : compareMaybeNumber(r.ks, baseCfg.ks),
      kG_plus:
        paramKey === "kG_plus"
          ? true
          : compareMaybeNumber(r.kG_plus, baseCfg.kG_plus),
      kG_minus:
        paramKey === "kG_minus"
          ? true
          : compareMaybeNumber(r.kG_minus, baseCfg.kG_minus),
      Vref:
        paramKey === "Vref" ? true : compareMaybeNumber(r.Vref, baseCfg.Vref),
      tauAch:
        paramKey === "tauAch"
          ? true
          : compareMaybeNumber(r.tauAch, baseCfg.tauAch),
      tauPlantar:
        paramKey === "tauPlantar"
          ? true
          : compareMaybeNumber(r.tauPlantar, baseCfg.tauPlantar),
      betaScale:
        paramKey === "betaScale"
          ? true
          : compareMaybeNumber(r.betaScale, baseCfg.betaScale),
    };

    return Object.values(checks).every(Boolean);
  });
}

function getSortedRows(rows) {
  const out = [...rows];
  out.sort((ra, rb) => {
    const cmp = compareValues(ra[tableSortKey], rb[tableSortKey]);
    return tableSortAsc ? cmp : -cmp;
  });
  return out;
}

function renderResultTable(rows, baseCfg) {
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
    .map((r) => {
      const strong = isBaselineRow(r, baseCfg) ? ' class="strong-row"' : "";
      return `
        <tr${strong}>
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
      `;
    })
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
      renderResultTable(latestSweepRows, latestBaseCfg);
    });
  });
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

function getOneAtATimePoints(rows, paramKey, metricKey, baseCfg) {
  return filterRowsOneAtATime(rows, paramKey, baseCfg)
    .map((r) => ({
      x: safeNum(r[paramKey]),
      y: getMetricValue(r, metricKey),
      row: r,
    }))
    .filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y))
    .sort((a, b) => a.x - b.x);
}

function drawSensitivityLineChart(rows, paramKey, metricKey, baseCfg) {
  const canvas = $("chartSensitivityLine");
  if (!canvas) return;

  const ctx = canvas.getContext("2d");
  const W = canvas.width;
  const H = canvas.height;

  const points = getOneAtATimePoints(rows, paramKey, metricKey, baseCfg);

  if (!points.length) {
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = "#666";
    ctx.font = "12px system-ui";
    ctx.fillText("（表示できるデータがありません）", 10, 20);
    return;
  }

  let xmin = Math.min(...points.map((p) => p.x));
  let xmax = Math.max(...points.map((p) => p.x));
  let ymin = Math.min(...points.map((p) => p.y));
  let ymax = Math.max(...points.map((p) => p.y));

  if (xmin === xmax) {
    xmin -= 1;
    xmax += 1;
  }
  if (ymin === ymax) {
    ymin -= 1;
    ymax += 1;
  }

  const { xAt, yAt, x0, y0, x1 } = drawAxes(
    ctx,
    W,
    H,
    48,
    20,
    16,
    34,
    ymin,
    ymax,
    xmin,
    xmax
  );

  ctx.strokeStyle = "#2563eb";
  ctx.lineWidth = 2;
  ctx.beginPath();

  points.forEach((p, i) => {
    const x = xAt(p.x);
    const y = yAt(p.y);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();

  const baselineRow = findBaselineRow(rows, baseCfg);

  points.forEach((p) => {
    const x = xAt(p.x);
    const y = yAt(p.y);
    const isBase = baselineRow && isBaselineRow(p.row, baseCfg);

    ctx.fillStyle = isBase ? "#f59e0b" : "#2563eb";
    ctx.beginPath();
    ctx.arc(x, y, isBase ? 5 : 4, 0, Math.PI * 2);
    ctx.fill();
  });

  if (baselineRow) {
    const bx = xAt(safeNum(baselineRow[paramKey]) ?? xmin);
    const by = yAt(getMetricValue(baselineRow, metricKey) ?? ymin);

    ctx.strokeStyle = "#f59e0b";
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    ctx.moveTo(bx, y0);
    ctx.lineTo(bx, H - 34);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = "#92400e";
    ctx.font = "12px system-ui";
    ctx.fillText("基準", Math.min(bx + 6, x1 - 20), Math.max(by - 8, 18));
  }

  ctx.fillStyle = "#334155";
  ctx.font = "12px system-ui";
  ctx.fillText("青: 1変数感度の各点 / 黄: 基準ケース", x0 + 6, y0 + 16);
}

function drawSensitivityBarChart(rows, paramKey, metricKey, baseCfg) {
  const canvas = $("chartSensitivityBar");
  if (!canvas) return;

  const ctx = canvas.getContext("2d");
  const W = canvas.width;
  const H = canvas.height;

  const points = getOneAtATimePoints(rows, paramKey, metricKey, baseCfg);

  if (!points.length) {
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = "#666";
    ctx.font = "12px system-ui";
    ctx.fillText("（表示できるデータがありません）", 10, 20);
    return;
  }

  const baselineRow = findBaselineRow(rows, baseCfg);
  const baselineValue =
    baselineRow && Number.isFinite(getMetricValue(baselineRow, metricKey))
      ? getMetricValue(baselineRow, metricKey)
      : points[0].y;

  const diffs = points.map((p) => ({ x: p.x, d: p.y - baselineValue }));

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

function detectTrend(points) {
  if (points.length < 2) return "判定不可";

  const ys = points.map((p) => p.y);
  const maxY = Math.max(...ys);
  const minY = Math.min(...ys);
  const range = maxY - minY;

  if (range < 1e-12) return "ほぼ一定";

  let inc = 0;
  let dec = 0;

  for (let i = 1; i < ys.length; i++) {
    const diff = ys[i] - ys[i - 1];
    if (Math.abs(diff) < Math.max(range * 0.02, 1e-12)) continue;
    if (diff > 0) inc++;
    if (diff < 0) dec++;
  }

  if (inc > 0 && dec === 0) return "単調増加";
  if (dec > 0 && inc === 0) return "単調減少";
  if (inc === 0 && dec === 0) return "ほぼ一定";
  return "非単調";
}

function classifySensitivity(relativePct) {
  if (!Number.isFinite(relativePct)) return "判定不可";
  if (relativePct < 1) return "影響は小さい";
  if (relativePct < 5) return "影響は中程度";
  return "影響は大きい";
}

function getMetricSuccessGuide(metricKey, trend, relativePct) {
  const strength = classifySensitivity(relativePct);

  if (metricKey === "finalG") {
    if (relativePct < 3) {
      return "この結果は、全身指標として安定しており好ましいです。最終日のGは大きく崩れていません。";
    }
    return "最終日のGがやや大きく動いています。全身指標としての安定性は再確認するとよいです。";
  }

  if (metricKey === "peakMaxS") {
    if (trend === "単調増加" || trend === "単調減少" || relativePct >= 3) {
      return "ピークスパイク指標がパラメータ変化に反応しており、感度分析として読み取りやすい結果です。";
    }
    return "ピークスパイク指標の変化は小さめです。範囲を広げると差が見えやすくなる可能性があります。";
  }

  if (metricKey === "warnCount") {
    if (relativePct >= 5) {
      return "閾値超過回数が十分に変化しており、警告判定の感度を評価しやすい結果です。";
    }
    return "閾値超過回数の変化は小さめです。現在の条件では警告が出にくい可能性があります。";
  }

  if (metricKey === "peakMaxM_eff") {
    if (relativePct >= 3) {
      return "局所負荷ピークが変化しており、部位感度の違いを示しやすい結果です。";
    }
    return "局所負荷ピークの変化は小さめです。部位パラメータの範囲や入力条件を見直すと差が出やすくなります。";
  }

  if (metricKey === "finalMaxS") {
    if (relativePct >= 2) {
      return "最終日の局所スパイク指標が変化しており、感度が確認できます。";
    }
    return "最終日の局所スパイク指標の変化は小さめです。";
  }

  return `${strength}。`;
}

function summarizeSensitivity(rows, paramKey, metricKey, baseCfg) {
  const points = getOneAtATimePoints(rows, paramKey, metricKey, baseCfg);
  const baselineRow = findBaselineRow(rows, baseCfg);
  const metricLabel = getMetricLabel(metricKey);

  if (points.length < 2) {
    return {
      text: "解釈に十分なデータ点がありません。横軸パラメータ以外を基準値に固定したケースが2点以上必要です。",
      caseCount: points.length,
      minV: null,
      maxV: null,
      baselineV: baselineRow ? getMetricValue(baselineRow, metricKey) : null,
      relativePct: null,
      trend: "判定不可",
      baselineLabel: baselineRow
        ? `ks=${baselineRow.ks}, kG_plus=${baselineRow.kG_plus}, kG_minus=${baselineRow.kG_minus}, Vref=${baselineRow.Vref}, tauAch=${baselineRow.tauAch}, tauPlantar=${baselineRow.tauPlantar}, betaScale=${baselineRow.betaScale}`
        : "該当なし",
    };
  }

  const ys = points.map((p) => p.y);
  const minV = Math.min(...ys);
  const maxV = Math.max(...ys);
  const baselineV =
    baselineRow && Number.isFinite(getMetricValue(baselineRow, metricKey))
      ? getMetricValue(baselineRow, metricKey)
      : ys[0];

  const denom = Math.abs(baselineV) > 1e-12 ? Math.abs(baselineV) : 1;
  const relativePct = ((maxV - minV) / denom) * 100;
  const trend = detectTrend(points);
  const strength = classifySensitivity(relativePct);
  const guide = getMetricSuccessGuide(metricKey, trend, relativePct);

  const baselineLabel = baselineRow
    ? `ks=${baselineRow.ks}, kG_plus=${baselineRow.kG_plus}, kG_minus=${baselineRow.kG_minus}, Vref=${baselineRow.Vref}, tauAch=${baselineRow.tauAch}, tauPlantar=${baselineRow.tauPlantar}, betaScale=${baselineRow.betaScale}`
    : "基準ケースが今回の組合せに含まれていないため、先頭ケースを代替基準として扱いました。";

  const text =
    `${metricLabel} を ${paramKey} に対して1変数感度で確認したところ、` +
    `傾向は「${trend}」、相対変動幅は ${relativePct.toFixed(2)}% で、${strength}。\n` +
    `${guide}\n` +
    `基準ケース: ${baselineLabel}`;

  return {
    text,
    caseCount: points.length,
    minV,
    maxV,
    baselineV,
    relativePct,
    trend,
    baselineLabel,
  };
}

function setSummaryFromAnalysis(metricKey, analysis) {
  setText("summaryCaseCount", analysis?.caseCount ?? "-");
  setText("summaryMetric", getMetricLabel(metricKey));
  setText("summaryMetricSub", getMetricDescription(metricKey));

  if (Number.isFinite(analysis?.minV) && Number.isFinite(analysis?.maxV)) {
    setText(
      "summaryRange",
      `${fmtCompactValue(analysis.minV, 4)} ～ ${fmtCompactValue(analysis.maxV, 4)}`
    );
    setText(
      "summaryRangeSub",
      `最大 - 最小 = ${fmtCompactValue(analysis.maxV - analysis.minV, 4)}`
    );
  } else {
    setText("summaryRange", "-");
    setText("summaryRangeSub", "-");
  }

  if (Number.isFinite(analysis?.baselineV)) {
    setText("summaryBaseline", fmtCompactValue(analysis.baselineV, 4));
  } else {
    setText("summaryBaseline", "-");
  }
  setText(
    "summaryBaselineSub",
    analysis?.baselineLabel ?? "基準ケースが見つかりません"
  );

  if (Number.isFinite(analysis?.relativePct)) {
    setText("summaryRelative", `${analysis.relativePct.toFixed(2)}%`);
  } else {
    setText("summaryRelative", "-");
  }
  setText("summaryRelativeSub", classifySensitivity(analysis?.relativePct));

  setText("summaryTrend", analysis?.trend ?? "-");
  setText(
    "summaryTrendSub",
    analysis?.trend === "ほぼ一定"
      ? "変化はごく小さく、安定寄りです。"
      : analysis?.trend === "単調増加"
      ? "パラメータ増加とともに指標が上がる傾向です。"
      : analysis?.trend === "単調減少"
      ? "パラメータ増加とともに指標が下がる傾向です。"
      : analysis?.trend === "非単調"
      ? "単純な増減ではなく、途中で向きが変わります。"
      : "-"
  );
}

function updateChartsAndSummary() {
  const rows = latestSweepRows;
  const metricKey = $("chartMetric")?.value || "finalG";
  const paramKey = $("chartParam")?.value || "ks";
  const baseCfg =
    latestBaseCfg ??
    buildBaseCfgFromForm(loadConfig() ?? DEFAULT_CONFIG, buildCurrentGridFromInputs());

  renderCurrentBaseline(baseCfg);

  if (!rows.length) {
    setSummaryFromAnalysis(metricKey, {
      caseCount: 0,
      minV: null,
      maxV: null,
      baselineV: null,
      relativePct: null,
      trend: "-",
      baselineLabel: "-",
    });
    renderResultTable([], baseCfg);
    drawSensitivityLineChart([], paramKey, metricKey, baseCfg);
    drawSensitivityBarChart([], paramKey, metricKey, baseCfg);
    setText("sensitivityInsight", "まだ結果がありません。");
    setText("baselineInfo", "基準ケース: -");
    return;
  }

  const analysis = summarizeSensitivity(rows, paramKey, metricKey, baseCfg);

  setSummaryFromAnalysis(metricKey, analysis);
  renderResultTable(rows, baseCfg);
  drawSensitivityLineChart(rows, paramKey, metricKey, baseCfg);
  drawSensitivityBarChart(rows, paramKey, metricKey, baseCfg);
  setText("sensitivityInsight", analysis.text);
  setText("baselineInfo", `基準ケース: ${analysis.baselineLabel}`);
}

function buildCurrentGridFromInputs() {
  return {
    ks: parseList($("ks")?.value),
    kG_plus: parseList($("kG_plus")?.value),
    kG_minus: parseList($("kG_minus")?.value),
    Vref: parseList($("Vref")?.value),
    tauAch: parseList($("tauAch")?.value),
    tauPlantar: parseList($("tauPlantar")?.value),
    betaScale: parseList($("betaScale")?.value),
  };
}

function validateGrid(grid) {
  for (const [k, arr] of Object.entries(grid)) {
    if (!arr.length) {
      return `${k} の値が空です`;
    }
  }
  return "";
}

function attachEvents() {
  $("btnBack")?.addEventListener("click", () => {
    location.href = "./output.html";
  });

  $("chartMetric")?.addEventListener("change", updateChartsAndSummary);
  $("chartParam")?.addEventListener("change", updateChartsAndSummary);

  $("btnRun")?.addEventListener("click", () => {
    setErrors("");
    setStatus("");

    const rawBaseCfg = loadConfig() ?? DEFAULT_CONFIG;
    const grid = buildCurrentGridFromInputs();
    const err = validateGrid(grid);
    if (err) {
      setErrors(err);
      return;
    }

    const baseCfg = buildBaseCfgFromForm(rawBaseCfg, grid);
    latestBaseCfg = baseCfg;

    const baseResults = loadResults();
    if (!baseResults || !baseResults.length) {
      alert("結果がありません。先に入力→計算を実行してください。");
      return;
    }

    const days = restoreDaysFromResults(baseResults);

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
      "isBaseline",
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
                    ...rawBaseCfg,
                    ks,
                    kG_plus,
                    kG_minus,
                    Vref,
                    tauAch,
                    tauPlantar,
                    beta_v: scaleMap(
                      rawBaseCfg.beta_v ?? DEFAULT_CONFIG.beta_v,
                      betaScale
                    ),
                    beta_u: scaleMap(
                      rawBaseCfg.beta_u ?? DEFAULT_CONFIG.beta_u,
                      betaScale
                    ),
                    beta_d: scaleMap(
                      rawBaseCfg.beta_d ?? DEFAULT_CONFIG.beta_d,
                      betaScale
                    ),
                    beta_s: scaleMap(
                      rawBaseCfg.beta_s ?? DEFAULT_CONFIG.beta_s,
                      betaScale
                    ),
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
                    peakMaxM_eff: s.peakMaxM,
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
                    isBaselineRow(
                      {
                        ks,
                        kG_plus,
                        kG_minus,
                        Vref,
                        tauAch,
                        tauPlantar,
                        betaScale,
                      },
                      baseCfg
                    )
                      ? 1
                      : 0,
                  ].map(csvEscape);

                  lines.push(row.join(","));
                  count++;

                  if (count % 10 === 0 || count === totalCount) {
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
}

/* initial */
latestBaseCfg = buildBaseCfgFromForm(
  loadConfig() ?? DEFAULT_CONFIG,
  buildCurrentGridFromInputs()
);
attachEvents();
updateChartsAndSummary();