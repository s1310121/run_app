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

  // 実効内的負荷配分の最大値
  let peakMaxM = null;
  for (const r of ready) {
    const vals = BODY_PARTS.map((p) => safeNum(r.parts?.[p]?.m_eff)).filter(
      Number.isFinite
    );
    if (!vals.length) continue;
    const m = Math.max(...vals);
    if (peakMaxM === null || m > peakMaxM) peakMaxM = m;
  }

  // 新9部位での差分監査
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

$("btnBack").addEventListener("click", () => (location.href = "./output.html"));

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

  setStatus(`完了: ${count} 通り（CSVを保存します）`);
  downloadText("sensitivity_sweep.csv", lines.join("\n"));
});