const KEYS = {
  draft: "app:draft",
  results: "app:results",
  config: "app:config",
  dayEntries: "app:dayEntries",
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
    map.set(day.date, day); // 同日なら上書き
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

export function clearAllAppData() {
  Object.values(KEYS).forEach((k) => localStorage.removeItem(k));
}