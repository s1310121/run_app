import {
  BODY_PARTS,
  CONTRACTILE_PARTS,
  DEFAULT_CONFIG,
  THETA,
  COUPLING_SOURCE_PART,
  COUPLING_TARGETS,
} from "./constants.js";

/** util */
function sum(arr) {
  return arr.reduce((a, b) => a + b, 0);
}

function alphaFromN(N) {
  return 2 / (N + 1);
}

function isFiniteNumber(x) {
  return Number.isFinite(x);
}

function toFiniteNumber(x, fallback = 0) {
  const n = Number(x);
  return Number.isFinite(n) ? n : fallback;
}

/** date helpers */
function addDays(dateStr, i) {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() + i);
  return d.toISOString().slice(0, 10);
}

/**
 * 1日入力をN日分に複製（連番日付）
 * @param {object} baseDay
 * @param {number} nDays
 */
export function expandDays(baseDay, nDays) {
  const rows = [];
  for (let i = 0; i < nDays; i++) {
    rows.push({ ...baseDay, date: addDays(baseDay.date, i) });
  }
  return rows;
}

/** 派生量 */
function computeDerived(day, cfg) {
  const distKm = toFiniteNumber(day.dist_km, 0);
  const timeMin = toFiniteNumber(day.time_min, 0);

  const D_m = distKm * 1000;
  const T_s = timeMin * 60;
  const V_mps = D_m / (T_s + cfg.eps);

  const upPct = toFiniteNumber(day.up_pct, 0);
  const downPct = toFiniteNumber(day.down_pct, 0);
  const upGradePct = toFiniteNumber(day.up_grade_pct, 0);
  const downGradePct = toFiniteNumber(day.down_grade_pct, 0);

  const G_plus = (upPct / 100) * (upGradePct / 100);
  const G_minus = (downPct / 100) * (downGradePct / 100);

  const pavedPct = toFiniteNumber(day.surface_paved_pct, 0);
  const trailPct = toFiniteNumber(day.surface_trail_pct, 0);
  const treadmillPct = toFiniteNumber(day.surface_treadmill_pct, 0);
  const trackPct = toFiniteNumber(day.surface_track_pct, 0);

  const c = cfg.surfaceCoeff;
  const S_surface =
    (
      pavedPct * c.paved +
      trailPct * c.trail +
      treadmillPct * c.treadmill +
      trackPct * c.track
    ) / 100.0;

  const surfaceSumPct =
    pavedPct + trailPct + treadmillPct + trackPct;

  const Vratio = V_mps / (cfg.Vref + cfg.eps);
  const r_v = (V_mps - cfg.Vref) / (cfg.Vref + cfg.eps);

  return {
    D_m,
    T_s,
    V_mps,
    Vratio,
    r_v,
    G_plus,
    G_minus,
    S_surface,
    surfaceSumPct,
  };
}

/** 外的総負荷・内的負荷（内訳も返す） */
function computeTotals(day, derived, cfg) {
  const term_steps = toFiniteNumber(day.steps, 0);
  const term_speed = derived.Vratio ** 2;
  const term_slope =
    1 + cfg.kG_plus * derived.G_plus + cfg.kG_minus * derived.G_minus;
  const term_surface = 1 + cfg.ks * derived.S_surface;

  const L_ext_total =
    term_steps * term_speed * term_slope * term_surface;

  const L_int = derived.T_s * toFiniteNumber(day.RPE, 0);

  return {
    L_ext_total,
    L_int,
    ext_terms: {
      term_steps,
      term_speed,
      term_slope,
      term_surface,
      Vratio: derived.Vratio,
    },
  };
}

/**
 * softmax（数値安定版）
 * - maxScore を引いてオーバーフローを防ぐ
 * - denom が不正なら一様分布へフォールバック
 */
function softmaxFromScores(scoreMap, eps = 1e-12) {
  const values = BODY_PARTS.map((k) => toFiniteNumber(scoreMap[k], 0));
  const maxScore = Math.max(...values);

  const expMap = {};
  let denom = 0;

  for (const k of BODY_PARTS) {
    const shifted = toFiniteNumber(scoreMap[k], 0) - maxScore;
    const v = Math.exp(shifted);
    expMap[k] = Number.isFinite(v) ? v : 0;
    denom += expMap[k];
  }

  const w = {};

  if (!Number.isFinite(denom) || denom <= eps) {
    const uniform = 1 / BODY_PARTS.length;
    for (const k of BODY_PARTS) {
      w[k] = uniform;
    }
    return { w, denom, maxScore };
  }

  for (const k of BODY_PARTS) {
    w[k] = expMap[k] / denom;
  }

  return { w, denom, maxScore };
}

/** 外的負荷分配：softmax */
function computeWeights(derived, cfg) {
  const z = {};

  for (const k of BODY_PARTS) {
    z[k] =
      toFiniteNumber(cfg.a0[k], 0) +
      toFiniteNumber(cfg.beta_v[k], 0) * derived.r_v +
      toFiniteNumber(cfg.beta_u[k], 0) * derived.G_plus +
      toFiniteNumber(cfg.beta_d[k], 0) * derived.G_minus +
      toFiniteNumber(cfg.beta_s[k], 0) * derived.S_surface;
  }

  const soft = softmaxFromScores(z, cfg.eps);
  const sumW = sum(BODY_PARTS.map((k) => soft.w[k]));

  return {
    z,
    w: soft.w,
    sumW,
  };
}

/** 外的部位負荷 */
function computeExternalByPart(L_ext_total, w) {
  const L_ext = {};
  for (const k of BODY_PARTS) {
    L_ext[k] = toFiniteNumber(w[k], 0) * L_ext_total;
  }
  return L_ext;
}

/**
 * 実効内的負荷配分係数
 * - 収縮系は m0 をそのまま使用
 * - 後下腿の一部をアキレス腱・足底部へ再配分
 * - 総和が必ず1になるように構成
 */
function computeEffectiveInternalWeights(cfg) {
  const m_eff = {};
  for (const k of BODY_PARTS) m_eff[k] = 0;

  const sourcePart = COUPLING_SOURCE_PART;
  const sourceBase = toFiniteNumber(cfg.m0[sourcePart], 0);

  const tauAch = toFiniteNumber(cfg.tauAch, 0);
  const tauPlantar = toFiniteNumber(cfg.tauPlantar, 0);

  // 安全対策：再配分率の合計が 1 を超えないように制限
  const tauSum = tauAch + tauPlantar;
  const scale = tauSum > 1 ? 1 / tauSum : 1;

  const tauAchSafe = tauAch * scale;
  const tauPlantarSafe = tauPlantar * scale;

  for (const k of CONTRACTILE_PARTS) {
    if (k === sourcePart) continue;
    m_eff[k] = toFiniteNumber(cfg.m0[k], 0);
  }

  m_eff[sourcePart] =
    (1 - tauAchSafe - tauPlantarSafe) * sourceBase;

  m_eff[COUPLING_TARGETS.achilles] =
    tauAchSafe * sourceBase;

  m_eff[COUPLING_TARGETS.plantar] =
    tauPlantarSafe * sourceBase;

  const sumM = sum(BODY_PARTS.map((k) => m_eff[k]));

  return {
    m_eff,
    sumM,
    tauAchSafe,
    tauPlantarSafe,
  };
}

/** 統合負荷 */
function computeIntegratedByPart(L_ext, L_int, cfg) {
  const internal = computeEffectiveInternalWeights(cfg);
  const L = {};

  for (const k of BODY_PARTS) {
    L[k] = toFiniteNumber(L_ext[k], 0) + toFiniteNumber(internal.m_eff[k], 0) * L_int;
  }

  return {
    L,
    m_eff: internal.m_eff,
    sumM: internal.sumM,
    tauAchSafe: internal.tauAchSafe,
    tauPlantarSafe: internal.tauPlantarSafe,
  };
}

/** lag平均（t-1..t-B） */
function lagMean(series, t, B) {
  let s = 0;
  for (let i = 1; i <= B; i++) {
    s += toFiniteNumber(series[t - i], 0);
  }
  return s / B;
}

/** EWMA update: A = (1-α)A + αx */
function ewmaUpdate(prev, x, alpha) {
  return (1 - alpha) * prev + alpha * x;
}

/**
 * 部位ごとの EWMA 時定数を取得
 * - 拡張設定があればそれを優先
 * - 未指定時は従来の共通 Na / Nc にフォールバック
 */
function getTimeConstantsForPart(part, cfg) {
  const tc = cfg.timeConstantsByPart?.[part];

  const Na = tc?.Na ?? cfg.Na;
  const Nc = tc?.Nc ?? cfg.Nc;

  return { Na, Nc };
}

/**
 * 標準化負荷
 * - 通常: L / (bar + eps)
 * - 完全ゼロ系列（L=0 かつ bar=0）: 平常として 1.0
 */
function computeStandardizedLoad(L, bar, cfg) {
  if (Math.abs(L) < cfg.tol && Math.abs(bar) < cfg.tol) {
    return 1.0;
  }
  return L / (bar + cfg.eps);
}

/**
 * 休養日判定
 * - 走行・主観負荷がすべて 0 の日は休養日とみなす
 */
function isRestDay(day, cfg) {
  return (
    Math.abs(toFiniteNumber(day.steps, 0)) < cfg.tol &&
    Math.abs(toFiniteNumber(day.dist_km, 0)) < cfg.tol &&
    Math.abs(toFiniteNumber(day.time_min, 0)) < cfg.tol &&
    Math.abs(toFiniteNumber(day.RPE, 0)) < cfg.tol
  );
}

/**
 * runModel: DayInput[] → DayResult[]
 * - B=28 lag mean
 * - t<B → standardizationReady=false
 * - 初回標準化成立日は A=C=1.0 から開始して更新
 */
export function runModel(days, config = DEFAULT_CONFIG) {
  const cfg = {
    ...DEFAULT_CONFIG,
    ...config,
    w0: { ...DEFAULT_CONFIG.w0, ...(config?.w0 ?? {}) },
    a0: { ...DEFAULT_CONFIG.a0, ...(config?.a0 ?? {}) },
    m0: { ...DEFAULT_CONFIG.m0, ...(config?.m0 ?? {}) },
    beta_v: { ...DEFAULT_CONFIG.beta_v, ...(config?.beta_v ?? {}) },
    beta_u: { ...DEFAULT_CONFIG.beta_u, ...(config?.beta_u ?? {}) },
    beta_d: { ...DEFAULT_CONFIG.beta_d, ...(config?.beta_d ?? {}) },
    beta_s: { ...DEFAULT_CONFIG.beta_s, ...(config?.beta_s ?? {}) },
    surfaceCoeff: {
      ...DEFAULT_CONFIG.surfaceCoeff,
      ...(config?.surfaceCoeff ?? {}),
    },
    timeConstantsByPart: {
      ...(DEFAULT_CONFIG.timeConstantsByPart ?? {}),
      ...(config?.timeConstantsByPart ?? {}),
    },
    B: 28,
  };

  const L_series = {};
  for (const k of BODY_PARTS) L_series[k] = [];

  const A_state = {};
  const C_state = {};
  for (const k of BODY_PARTS) {
    A_state[k] = null;
    C_state[k] = null;
  }

  const results = [];

  for (let t = 0; t < days.length; t++) {
    const day = days[t];

    const derived = computeDerived(day, cfg);
    const total = computeTotals(day, derived, cfg);
    const weights = computeWeights(derived, cfg);
    const L_ext = computeExternalByPart(total.L_ext_total, weights.w);
    const integrated = computeIntegratedByPart(L_ext, total.L_int, cfg);
    const restDay = isRestDay(day, cfg);

    for (const k of BODY_PARTS) {
      L_series[k].push(integrated.L[k]);
    }

    const standardizationReady = t >= cfg.B;

    const parts = {};
    for (const k of BODY_PARTS) {
      const tc = getTimeConstantsForPart(k, cfg);

      parts[k] = {
        z: weights.z[k],
        w: weights.w[k],
        L_ext: L_ext[k],
        L: integrated.L[k],
        m_eff: integrated.m_eff[k],
        Na: tc.Na,
        Nc: tc.Nc,
        alphaA: alphaFromN(tc.Na),
        alphaC: alphaFromN(tc.Nc),
        L_bar_lag: null,
        L_tilde: null,
        A: null,
        C: null,
        R: null,
        S: null,
      };
    }

    const surfaceSumOk =
      restDay || Math.abs(derived.surfaceSumPct - 100) < 1e-9;
    const sumW = weights.sumW;
    const sumWOk = Math.abs(sumW - 1) < cfg.tol;

    const sumExtParts = sum(BODY_PARTS.map((k) => L_ext[k]));
    const extError = Math.abs(sumExtParts - total.L_ext_total);
    const extOk = extError < cfg.tol;

    const sumM = integrated.sumM;
    const sumMOk = Math.abs(sumM - 1) < cfg.tol;

    const sumLParts = sum(BODY_PARTS.map((k) => integrated.L[k]));
    const totalError = Math.abs(
      sumLParts - (total.L_ext_total + total.L_int)
    );
    const totalOk = totalError < cfg.tol;

    const messages = [];
    if (!surfaceSumOk) {
      messages.push(
        `路面割合の合計が100%ではありません（現在: ${derived.surfaceSumPct}%）`
      );
    }
    if (!sumWOk) {
      messages.push(`Σw_k が 1 からずれています（Σw=${sumW}）`);
    }
    if (!extOk) {
      messages.push(
        `外的保存則誤差: |ΣL_ext_k − L_ext_total| = ${extError}`
      );
    }
    if (!sumMOk) {
      messages.push(`Σm_eff_k が 1 からずれています（Σm_eff=${sumM}）`);
    }
    if (!totalOk) {
      messages.push(
        `統合後保存則誤差: |ΣL_k − (L_ext_total+L_int)| = ${totalError}`
      );
    }

    if (standardizationReady) {
      const lagFromDate = days[t - cfg.B].date;
      const lagToDate = days[t - 1].date;

      const L_tilde = {};

      for (const k of BODY_PARTS) {
        const bar = lagMean(L_series[k], t, cfg.B);
        const tilde = computeStandardizedLoad(integrated.L[k], bar, cfg);

        parts[k].L_bar_lag = bar;
        parts[k].L_tilde = tilde;
        L_tilde[k] = tilde;
      }

      const isFirstReadyDay = t === cfg.B;

      for (const k of BODY_PARTS) {
        if (isFirstReadyDay) {
          A_state[k] = 1.0;
          C_state[k] = 1.0;
        }

        const tc = getTimeConstantsForPart(k, cfg);
        const alphaA_k = alphaFromN(tc.Na);
        const alphaC_k = alphaFromN(tc.Nc);

        A_state[k] = ewmaUpdate(A_state[k], L_tilde[k], alphaA_k);
        C_state[k] = ewmaUpdate(C_state[k], L_tilde[k], alphaC_k);

        let R;
        if (Math.abs(A_state[k]) < cfg.tol && Math.abs(C_state[k]) < cfg.tol) {
          R = 1.0;
        } else if (Math.abs(C_state[k]) < cfg.tol) {
          R = 1.0;
        } else {
          R = A_state[k] / C_state[k];
        }

        // log の安全性確保
        if (!Number.isFinite(R) || R <= 0) {
          R = 1.0;
        }

        const S = Math.log(R);

        parts[k].A = A_state[k];
        parts[k].C = C_state[k];
        parts[k].R = R;
        parts[k].S = S;
      }

      let maxS = -Infinity;
      let maxPart = BODY_PARTS[0];
      for (const k of BODY_PARTS) {
        if (parts[k].S > maxS) {
          maxS = parts[k].S;
          maxPart = k;
        }
      }

      const pi = 1 / BODY_PARTS.length;
      let sumExp = 0;
      for (const k of BODY_PARTS) {
        sumExp += pi * Math.exp(parts[k].S);
      }
      const G = Math.log(Math.max(sumExp, cfg.eps));
      const warn = maxS > THETA;

      const checks = {
        ok: surfaceSumOk && sumWOk && extOk && sumMOk && totalOk,
        messages,
        surfaceSumOk,
        surfaceSumPct: derived.surfaceSumPct,
        sumW,
        sumM,
        extConservation: {
          sumExtParts,
          extTotal: total.L_ext_total,
          absError: extError,
          ok: extOk,
        },
        totalConservation: {
          sumLParts,
          extPlusInt: total.L_ext_total + total.L_int,
          absError: totalError,
          ok: totalOk,
        },
        internalWeightCheck: {
          sumM,
          ok: sumMOk,
          tauAch: integrated.tauAchSafe,
          tauPlantar: integrated.tauPlantarSafe,
        },
        standardization: {
          ready: true,
          missingLagMeans: [],
          note: "B=28 lag mean uses t-1..t-28",
        },
      };

      results.push({
        date: day.date,
        meta: {
          dayIndex: t,
          standardizationReady: true,
          lagWindow: { from: lagFromDate, to: lagToDate, B: cfg.B },
        },
        input: { ...day },
        derived,
        total,
        weights: {
          z: weights.z,
          w: weights.w,
          sumW: weights.sumW,
        },
        parts,
        global: {
          theta: THETA,
          maxS,
          maxPart,
          warn,
          G,
        },
        checks,
      });
    } else {
      messages.push(
        "B=28のlag平均が未成立です（t<29）。標準化/EWMA/スパイクは未計算です。"
      );

      const checks = {
        ok: surfaceSumOk && sumWOk && extOk && sumMOk && totalOk,
        messages,
        surfaceSumOk,
        surfaceSumPct: derived.surfaceSumPct,
        sumW,
        sumM,
        extConservation: {
          sumExtParts,
          extTotal: total.L_ext_total,
          absError: extError,
          ok: extOk,
        },
        totalConservation: {
          sumLParts,
          extPlusInt: total.L_ext_total + total.L_int,
          absError: totalError,
          ok: totalOk,
        },
        internalWeightCheck: {
          sumM,
          ok: sumMOk,
          tauAch: integrated.tauAchSafe,
          tauPlantar: integrated.tauPlantarSafe,
        },
        standardization: {
          ready: false,
          missingLagMeans: BODY_PARTS,
          note: "B=28 lag mean uses t-1..t-28",
        },
      };

      results.push({
        date: day.date,
        meta: {
          dayIndex: t,
          standardizationReady: false,
          lagWindow: null,
        },
        input: { ...day },
        derived,
        total,
        weights: {
          z: weights.z,
          w: weights.w,
          sumW: weights.sumW,
        },
        parts,
        global: {
          theta: THETA,
          maxS: null,
          maxPart: null,
          warn: null,
          G: null,
        },
        checks,
      });
    }
  }

  return results;
}