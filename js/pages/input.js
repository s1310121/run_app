import { DEFAULT_CONFIG } from "../core/constants.js";
import { expandDays, runModel } from "../core/model.js";
import { validateDayInput, validateDays } from "../lib/validate.js";
import {
  saveDraft,
  loadDraft,
  saveResults,
  saveConfig,
  loadConfig,
  upsertDayEntry,
  upsertDayEntries,
  loadDayEntries,
  removeDayEntry,
  clearDayEntries,
  replaceDayEntries,
} from "../lib/storage.js";

function getVal(id) {
  return document.getElementById(id)?.value ?? "";
}

function num(id) {
  return Number(getVal(id));
}

function setVal(id, v) {
  const el = document.getElementById(id);
  if (el) el.value = v;
}

function readForm() {
  return {
    date: getVal("date"),
    steps: num("steps"),
    dist_km: num("dist_km"),
    time_min: num("time_min"),
    RPE: num("RPE"),
    up_pct: num("up_pct"),
    down_pct: num("down_pct"),
    up_grade_pct: num("up_grade_pct"),
    down_grade_pct: num("down_grade_pct"),
    surface_paved_pct: num("surface_paved_pct"),
    surface_trail_pct: num("surface_trail_pct"),
    surface_treadmill_pct: num("surface_treadmill_pct"),
    surface_track_pct: num("surface_track_pct"),
  };
}

function writeForm(d) {
  setVal("date", d.date ?? "");
  setVal("steps", d.steps ?? 0);
  setVal("dist_km", d.dist_km ?? 0);
  setVal("time_min", d.time_min ?? 0);
  setVal("RPE", d.RPE ?? 0);
  setVal("up_pct", d.up_pct ?? 0);
  setVal("down_pct", d.down_pct ?? 0);
  setVal("up_grade_pct", d.up_grade_pct ?? 0);
  setVal("down_grade_pct", d.down_grade_pct ?? 0);
  setVal("surface_paved_pct", d.surface_paved_pct ?? 0);
  setVal("surface_trail_pct", d.surface_trail_pct ?? 0);
  setVal("surface_treadmill_pct", d.surface_treadmill_pct ?? 0);
  setVal("surface_track_pct", d.surface_track_pct ?? 0);
}

function showErrors(errors = []) {
  const box = document.getElementById("errors");
  if (!box) return;
  box.innerHTML = errors.map((e) => `<li>${e}</li>`).join("");
  box.style.display = errors.length ? "block" : "none";
}

function showWarnings(warnings = []) {
  const box = document.getElementById("warnings");
  if (!box) return;
  box.innerHTML = warnings.map((w) => `<li>${w}</li>`).join("");
  box.style.display = warnings.length ? "block" : "none";
}

function formatNumber(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function sortDays(days) {
  return [...days].sort((a, b) => String(a.date).localeCompare(String(b.date)));
}

function getHistorySummary(days) {
  const sorted = sortDays(days);
  if (!sorted.length) {
    return {
      count: 0,
      start: "-",
      end: "-",
    };
  }

  return {
    count: sorted.length,
    start: sorted[0].date ?? "-",
    end: sorted[sorted.length - 1].date ?? "-",
  };
}

function renderHistory() {
  const days = loadDayEntries();
  const sorted = sortDays(days);

  const summaryBox = document.getElementById("historySummary");
  const listBox = document.getElementById("historyList");
  const emptyBox = document.getElementById("historyEmpty");

  if (!summaryBox || !listBox) return;

  const summary = getHistorySummary(sorted);
  summaryBox.innerHTML = `
    <div>保存件数: ${summary.count}日分</div>
    <div>期間: ${summary.start} ～ ${summary.end}</div>
  `;

  if (!sorted.length) {
    listBox.innerHTML = "";
    if (emptyBox) emptyBox.style.display = "block";
    return;
  }

  if (emptyBox) emptyBox.style.display = "none";

  listBox.innerHTML = sorted
    .map(
      (d) => `
        <div class="history-row" data-date="${d.date}">
          <div><strong>${d.date}</strong></div>
          <div>steps: ${formatNumber(d.steps)}</div>
          <div>dist_km: ${formatNumber(d.dist_km)}</div>
          <div>time_min: ${formatNumber(d.time_min)}</div>
          <div>RPE: ${formatNumber(d.RPE)}</div>
          <div>up_pct: ${formatNumber(d.up_pct)}</div>
          <div>down_pct: ${formatNumber(d.down_pct)}</div>
          <button type="button" class="btnDeleteHistory" data-date="${d.date}">
            この日を削除
          </button>
        </div>
      `
    )
    .join("");

  listBox.querySelectorAll(".btnDeleteHistory").forEach((btn) => {
    btn.addEventListener("click", () => {
      const date = btn.dataset.date;
      if (!date) return;
      removeDayEntry(date);
      renderHistory();
    });
  });
}

function bindHistoryActions() {
  document.getElementById("btnClearHistory")?.addEventListener("click", () => {
    const ok = confirm("保存済み履歴をすべて削除しますか？");
    if (!ok) return;
    clearDayEntries();
    renderHistory();
  });
}

/* ===== CSV parser (robust) ===== */
function splitLine(line) {
  const seps = [",", "\t", ";"];
  let bestSep = ",";
  let bestCount = -1;

  for (const s of seps) {
    const c = line.split(s).length - 1;
    if (c > bestCount) {
      bestCount = c;
      bestSep = s;
    }
  }

  const out = [];
  let cur = "";
  let inQ = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];

    if (ch === '"') {
      if (inQ && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQ = !inQ;
      }
      continue;
    }

    if (!inQ && ch === bestSep) {
      out.push(cur.trim());
      cur = "";
    } else {
      cur += ch;
    }
  }

  out.push(cur.trim());
  return out;
}

function normHeader(h) {
  return String(h ?? "")
    .trim()
    .toLowerCase()
    .replaceAll(" ", "")
    .replaceAll("-", "_");
}

function mapHeaderKey(h) {
  const key = normHeader(h);
  const dict = {
    date: "date",
    day: "date",
    datetime: "date",

    steps: "steps",
    step: "steps",

    dist_km: "dist_km",
    distance_km: "dist_km",
    distancekm: "dist_km",
    dist: "dist_km",
    distance: "dist_km",
    km: "dist_km",

    time_min: "time_min",
    time: "time_min",
    duration_min: "time_min",
    duration: "time_min",
    minutes: "time_min",
    min: "time_min",

    rpe: "RPE",

    up_pct: "up_pct",
    up: "up_pct",

    down_pct: "down_pct",
    down: "down_pct",

    up_grade_pct: "up_grade_pct",
    up_grade: "up_grade_pct",
    upgrade: "up_grade_pct",

    down_grade_pct: "down_grade_pct",
    down_grade: "down_grade_pct",
    downgrade: "down_grade_pct",

    surface_paved_pct: "surface_paved_pct",
    paved_pct: "surface_paved_pct",
    paved: "surface_paved_pct",

    surface_trail_pct: "surface_trail_pct",
    trail_pct: "surface_trail_pct",
    trail: "surface_trail_pct",

    surface_treadmill_pct: "surface_treadmill_pct",
    treadmill_pct: "surface_treadmill_pct",
    treadmill: "surface_treadmill_pct",

    surface_track_pct: "surface_track_pct",
    track_pct: "surface_track_pct",
    track: "surface_track_pct",
  };
  return dict[key] ?? null;
}

function parseNumberSafe(x) {
  const s = String(x ?? "").trim();
  if (s === "") return NaN;
  return Number(s);
}

function normalizeDate(s) {
  if (!s) return "";
  const t = String(s).trim().replaceAll("/", "-");
  const m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) {
    const yyyy = m[1];
    const mm = String(m[2]).padStart(2, "0");
    const dd = String(m[3]).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }
  return t;
}

function parseCsvText(csvText) {
  const lines = String(csvText ?? "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length === 0) return [];

  const firstCells = splitLine(lines[0]).map(normHeader);
  const hasHeader =
    firstCells.includes("date") &&
    (firstCells.includes("steps") || firstCells.includes("step"));

  let mappedHeader;
  let dataLines;

  if (hasHeader) {
    const rawHeader = splitLine(lines[0]);
    mappedHeader = rawHeader.map(mapHeaderKey);
    dataLines = lines.slice(1);
  } else {
    mappedHeader = [
      "date",
      "steps",
      "dist_km",
      "time_min",
      "RPE",
      "up_pct",
      "down_pct",
      "up_grade_pct",
      "down_grade_pct",
      "surface_paved_pct",
      "surface_trail_pct",
      "surface_treadmill_pct",
      "surface_track_pct",
    ];
    dataLines = lines;
  }

  const days = [];

  for (const line of dataLines) {
    const cells = splitLine(line);
    const obj = {};

    for (let i = 0; i < mappedHeader.length; i++) {
      const key = mappedHeader[i];
      if (!key) continue;
      obj[key] = cells[i] ?? "";
    }

    days.push({
      date: normalizeDate(obj.date),
      steps: parseNumberSafe(obj.steps),
      dist_km: parseNumberSafe(obj.dist_km),
      time_min: parseNumberSafe(obj.time_min),
      RPE: parseNumberSafe(obj.RPE),
      up_pct: parseNumberSafe(obj.up_pct),
      down_pct: parseNumberSafe(obj.down_pct),
      up_grade_pct: parseNumberSafe(obj.up_grade_pct),
      down_grade_pct: parseNumberSafe(obj.down_grade_pct),
      surface_paved_pct: parseNumberSafe(obj.surface_paved_pct),
      surface_trail_pct: parseNumberSafe(obj.surface_trail_pct),
      surface_treadmill_pct: parseNumberSafe(obj.surface_treadmill_pct),
      surface_track_pct: parseNumberSafe(obj.surface_track_pct),
    });
  }

  return days;
}

/* ===== init ===== */
const cfg = loadConfig() ?? DEFAULT_CONFIG;
saveConfig(cfg);

const draft = loadDraft();
if (draft) writeForm(draft);

document.getElementById("form")?.addEventListener("input", () => {
  saveDraft(readForm());
});

bindHistoryActions();
renderHistory();

/* ===== navigation ===== */
document.getElementById("btnBack")?.addEventListener("click", () => {
  location.href = "./start.html";
});

/* ===== 単日入力：履歴に追加して計算 ===== */
document.getElementById("btnCalc")?.addEventListener("click", () => {
  const baseDay = readForm();
  const v = validateDayInput(baseDay);

  if (!v.ok) {
    showErrors(v.errors);
    showWarnings(v.warnings ?? []);
    return;
  }

  showErrors([]);
  showWarnings(v.warnings ?? []);

  const allDays = upsertDayEntry(baseDay);
  renderHistory();

  saveConfig(cfg);
  const results = runModel(allDays, cfg);
  saveResults(results);
  location.href = "./output.html";
});

/* ===== 保存済み履歴で計算 ===== */
document.getElementById("btnCalcHistory")?.addEventListener("click", () => {
  const days = loadDayEntries();

  if (!days.length) {
    showErrors(["保存済み履歴がありません"]);
    showWarnings([]);
    return;
  }

  const v = validateDays(days);
  if (!v.ok) {
    showErrors(v.errors);
    showWarnings(v.warnings ?? []);
    return;
  }

  showErrors([]);
  showWarnings(v.warnings ?? []);

  saveConfig(cfg);
  const results = runModel(days, cfg);
  saveResults(results);
  location.href = "./output.html";
});

/* ===== CSV読み込み：履歴に追加し、フォームへ先頭行反映 ===== */
document.getElementById("btnLoadCsv")?.addEventListener("click", () => {
  const text = document.getElementById("csvText")?.value || "";
  const days = parseCsvText(text);

  if (!days.length) {
    showErrors(["CSVが空です"]);
    showWarnings([]);
    return;
  }

  const v = validateDays(days);
  if (!v.ok) {
    showErrors(v.errors);
    showWarnings(v.warnings ?? []);
    return;
  }

  showErrors([]);
  showWarnings(v.warnings ?? []);

  const mergedDays = upsertDayEntries(days);
  renderHistory();

  writeForm(days[0]);
  saveDraft(days[0]);

  alert(
    `CSV ${days.length}日分を履歴に追加しました（保存済み履歴: ${mergedDays.length}日分）`
  );
});

/* ===== CSV読み込み：履歴に追加して履歴全体で計算 ===== */
document.getElementById("btnCalcFromCsv")?.addEventListener("click", () => {
  const text = document.getElementById("csvText")?.value || "";
  const days = parseCsvText(text);

  if (!days.length) {
    showErrors(["CSVが空です"]);
    showWarnings([]);
    return;
  }

  const v = validateDays(days);
  if (!v.ok) {
    showErrors(v.errors);
    showWarnings(v.warnings ?? []);
    return;
  }

  showErrors([]);
  showWarnings(v.warnings ?? []);

  const mergedDays = upsertDayEntries(days);
  renderHistory();

  saveConfig(cfg);
  const results = runModel(mergedDays, cfg);
  saveResults(results);
  location.href = "./output.html";
});

/* ===== CSVで履歴を置き換え ===== */
document.getElementById("btnReplaceFromCsv")?.addEventListener("click", () => {
  const text = document.getElementById("csvText")?.value || "";
  const days = parseCsvText(text);

  if (!days.length) {
    showErrors(["CSVが空です"]);
    showWarnings([]);
    return;
  }

  const v = validateDays(days);
  if (!v.ok) {
    showErrors(v.errors);
    showWarnings(v.warnings ?? []);
    return;
  }

  const ok = confirm("現在の履歴を削除し、CSVの内容で置き換えますか？");
  if (!ok) return;

  showErrors([]);
  showWarnings(v.warnings ?? []);

  const replacedDays = replaceDayEntries(days);
  renderHistory();

  if (replacedDays.length > 0) {
    writeForm(replacedDays[0]);
    saveDraft(replacedDays[0]);
  }

  alert(`CSV ${replacedDays.length}日分で履歴を置き換えました`);
});

/* ===== 検証用：1日入力をN日複製して試算 ===== */
document.getElementById("btnCalcSim")?.addEventListener("click", () => {
  const baseDay = readForm();
  const v = validateDayInput(baseDay);

  if (!v.ok) {
    showErrors(v.errors);
    showWarnings(v.warnings ?? []);
    return;
  }

  showErrors([]);
  showWarnings(v.warnings ?? []);

  const nDays = Number(document.getElementById("nDays")?.value || 28);
  const days = expandDays(baseDay, nDays);

  saveConfig(cfg);
  const results = runModel(days, cfg);
  saveResults(results);
  location.href = "./output.html";
});

/* ===== debug helpers ===== */
window.__dayEntries = () => loadDayEntries();
window.__expandDays = expandDays;
window.__renderHistory = () => renderHistory();