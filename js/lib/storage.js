const KEYS = {
  draft: "app:draft",
  results: "app:results",
  config: "app:config",
  dayEntries: "app:dayEntries",
  dayFeedbacks: "app:dayFeedbacks",
  userAdjustments: "app:userAdjustments",
  adjustmentAppliedDates: "app:adjustmentAppliedDates",
  adjustmentPendingByDate: "app:adjustmentPendingByDate",
};

const DEFAULT_USER_ADJUSTMENTS = {
  Vref: 0,
  kG_plus: 0,
  kG_minus: 0,
  ks: 0,
  tauAch: 0,
  tauPlantar: 0,
  beta_v: {},
  beta_u: {},
  beta_d: {},
  beta_s: {},
};

export function saveDraft(draft) {
  localStorage.setItem(KEYS.draft, JSON.stringify(draft));
}
export function loadDraft() {
  const s = localStorage.getItem(KEYS.draft);
  return s ? JSON.parse(s) : null;
}
export function clearDraft() {
  localStorage.removeItem(KEYS.draft);
}

export function saveConfig(cfg) {
  localStorage.setItem(KEYS.config, JSON.stringify(cfg));
}
export function loadConfig() {
  const s = localStorage.getItem(KEYS.config);
  return s ? JSON.parse(s) : null;
}
export function clearConfig() {
  localStorage.removeItem(KEYS.config);
}

export function saveResults(results) {
  localStorage.setItem(KEYS.results, JSON.stringify(results));
}

export function loadResults() {
  const s = localStorage.getItem(KEYS.results);
  if (!s) return null;
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

export function clearResults() {
  localStorage.removeItem(KEYS.results);
}

/* ===== 単日・CSV共通の履歴保存 ===== */
export function saveDayEntries(days) {
  localStorage.setItem(KEYS.dayEntries, JSON.stringify(days));
}

export function loadDayEntries() {
  const s = localStorage.getItem(KEYS.dayEntries);
  if (!s) return [];
  try {
    const arr = JSON.parse(s);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

export function upsertDayEntry(day) {
  const days = loadDayEntries();
  const idx = days.findIndex((d) => d.date === day.date);

  if (idx >= 0) {
    days[idx] = day;
  } else {
    days.push(day);
  }

  days.sort((a, b) => String(a.date).localeCompare(String(b.date)));
  saveDayEntries(days);
  return days;
}

export function upsertDayEntries(newDays) {
  const days = loadDayEntries();
  const map = new Map(days.map((d) => [d.date, d]));

  for (const day of newDays) {
    map.set(day.date, day);
  }

  const merged = Array.from(map.values()).sort((a, b) =>
    String(a.date).localeCompare(String(b.date))
  );

  saveDayEntries(merged);
  return merged;
}

export function replaceDayEntries(days) {
  const sorted = [...days].sort((a, b) =>
    String(a.date).localeCompare(String(b.date))
  );
  saveDayEntries(sorted);
  return sorted;
}

export function removeDayEntry(date) {
  const days = loadDayEntries().filter((d) => d.date !== date);
  saveDayEntries(days);
  return days;
}

export function clearDayEntries() {
  localStorage.removeItem(KEYS.dayEntries);
}

/* ===== 日付ごとの主観フィードバック ===== */
export function loadDayFeedbacks() {
  const s = localStorage.getItem(KEYS.dayFeedbacks);
  if (!s) return {};
  try {
    const obj = JSON.parse(s);
    return obj && typeof obj === "object" && !Array.isArray(obj) ? obj : {};
  } catch {
    return {};
  }
}

export function saveDayFeedbacks(map) {
  localStorage.setItem(KEYS.dayFeedbacks, JSON.stringify(map));
}

export function loadDayFeedback(date) {
  const map = loadDayFeedbacks();
  return map[date] ?? null;
}

export function upsertDayFeedback(date, feedback) {
  if (!date) return loadDayFeedbacks();
  const map = loadDayFeedbacks();
  map[date] = {
    ...feedback,
    date,
    updatedAt: new Date().toISOString(),
  };
  saveDayFeedbacks(map);
  return map;
}

export function removeDayFeedback(date) {
  const map = loadDayFeedbacks();
  delete map[date];
  saveDayFeedbacks(map);
  return map;
}

export function clearDayFeedbacks() {
  localStorage.removeItem(KEYS.dayFeedbacks);
}

/* ===== ユーザー補正値 ===== */
export function loadUserAdjustments() {
  const s = localStorage.getItem(KEYS.userAdjustments);
  if (!s) {
    return JSON.parse(JSON.stringify(DEFAULT_USER_ADJUSTMENTS));
  }

  try {
    const parsed = JSON.parse(s);
    return {
      ...DEFAULT_USER_ADJUSTMENTS,
      ...parsed,
      beta_v: { ...DEFAULT_USER_ADJUSTMENTS.beta_v, ...(parsed?.beta_v ?? {}) },
      beta_u: { ...DEFAULT_USER_ADJUSTMENTS.beta_u, ...(parsed?.beta_u ?? {}) },
      beta_d: { ...DEFAULT_USER_ADJUSTMENTS.beta_d, ...(parsed?.beta_d ?? {}) },
      beta_s: { ...DEFAULT_USER_ADJUSTMENTS.beta_s, ...(parsed?.beta_s ?? {}) },
    };
  } catch {
    return JSON.parse(JSON.stringify(DEFAULT_USER_ADJUSTMENTS));
  }
}

export function saveUserAdjustments(adjustments) {
  localStorage.setItem(KEYS.userAdjustments, JSON.stringify(adjustments));
}

export function clearUserAdjustments() {
  localStorage.removeItem(KEYS.userAdjustments);
}

/* ===== 反映済み日付の管理 ===== */
export function loadAdjustmentAppliedDates() {
  const s = localStorage.getItem(KEYS.adjustmentAppliedDates);
  if (!s) return {};
  try {
    const obj = JSON.parse(s);
    return obj && typeof obj === "object" && !Array.isArray(obj) ? obj : {};
  } catch {
    return {};
  }
}

export function saveAdjustmentAppliedDates(map) {
  localStorage.setItem(KEYS.adjustmentAppliedDates, JSON.stringify(map));
}

export function isAdjustmentApplied(date) {
  const map = loadAdjustmentAppliedDates();
  return !!map[date];
}

export function markAdjustmentApplied(date) {
  if (!date) return loadAdjustmentAppliedDates();
  const map = loadAdjustmentAppliedDates();
  map[date] = {
    applied: true,
    appliedAt: new Date().toISOString(),
  };
  saveAdjustmentAppliedDates(map);
  return map;
}

export function unmarkAdjustmentApplied(date) {
  const map = loadAdjustmentAppliedDates();
  delete map[date];
  saveAdjustmentAppliedDates(map);
  return map;
}

export function clearAdjustmentAppliedDates() {
  localStorage.removeItem(KEYS.adjustmentAppliedDates);
}

/* ===== 更新保留（2回連続ズレ判定用） ===== */
export function loadAdjustmentPendingByDate() {
  const s = localStorage.getItem(KEYS.adjustmentPendingByDate);
  if (!s) return {};
  try {
    const obj = JSON.parse(s);
    return obj && typeof obj === "object" && !Array.isArray(obj) ? obj : {};
  } catch {
    return {};
  }
}

export function saveAdjustmentPendingByDate(map) {
  localStorage.setItem(KEYS.adjustmentPendingByDate, JSON.stringify(map));
}

export function loadAdjustmentPending(date) {
  const map = loadAdjustmentPendingByDate();
  return map[date] ?? null;
}

export function upsertAdjustmentPending(date, payload) {
  if (!date) return loadAdjustmentPendingByDate();
  const map = loadAdjustmentPendingByDate();
  map[date] = {
    ...payload,
    date,
    updatedAt: new Date().toISOString(),
  };
  saveAdjustmentPendingByDate(map);
  return map;
}

export function removeAdjustmentPending(date) {
  const map = loadAdjustmentPendingByDate();
  delete map[date];
  saveAdjustmentPendingByDate(map);
  return map;
}

export function clearAdjustmentPendingByDate() {
  localStorage.removeItem(KEYS.adjustmentPendingByDate);
}

export function clearAllAppData() {
  Object.values(KEYS).forEach((k) => localStorage.removeItem(k));
}