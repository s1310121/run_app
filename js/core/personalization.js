import { BODY_PARTS, DEFAULT_CONFIG } from "./constants.js";

function addPartDelta(baseMap = {}, deltaMap = {}) {
  const out = {};
  for (const part of BODY_PARTS) {
    out[part] = (baseMap[part] ?? 0) + (deltaMap[part] ?? 0);
  }
  return out;
}

function mergeConfig(base = {}, override = {}) {
  return {
    ...base,
    ...override,
    w0: { ...(base.w0 ?? {}), ...(override.w0 ?? {}) },
    a0: { ...(base.a0 ?? {}), ...(override.a0 ?? {}) },
    m0: { ...(base.m0 ?? {}), ...(override.m0 ?? {}) },
    beta_v: { ...(base.beta_v ?? {}), ...(override.beta_v ?? {}) },
    beta_u: { ...(base.beta_u ?? {}), ...(override.beta_u ?? {}) },
    beta_d: { ...(base.beta_d ?? {}), ...(override.beta_d ?? {}) },
    beta_s: { ...(base.beta_s ?? {}), ...(override.beta_s ?? {}) },
    surfaceCoeff: {
      ...(base.surfaceCoeff ?? {}),
      ...(override.surfaceCoeff ?? {}),
    },
    timeConstantsByPart: {
      ...(base.timeConstantsByPart ?? {}),
      ...(override.timeConstantsByPart ?? {}),
    },
  };
}

function clamp(x, min, max) {
  return Math.min(max, Math.max(min, x));
}

export const DEFAULT_USER_ADJUSTMENTS = Object.freeze({
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
});

export function buildEffectiveConfig(userAdjustments = {}, savedConfig = {}) {
  const base = mergeConfig(DEFAULT_CONFIG, savedConfig);

  return {
    ...base,
    Vref: base.Vref + (userAdjustments.Vref ?? 0),
    kG_plus: base.kG_plus + (userAdjustments.kG_plus ?? 0),
    kG_minus: base.kG_minus + (userAdjustments.kG_minus ?? 0),
    ks: base.ks + (userAdjustments.ks ?? 0),
    tauAch: base.tauAch + (userAdjustments.tauAch ?? 0),
    tauPlantar: base.tauPlantar + (userAdjustments.tauPlantar ?? 0),
    beta_v: addPartDelta(base.beta_v, userAdjustments.beta_v),
    beta_u: addPartDelta(base.beta_u, userAdjustments.beta_u),
    beta_d: addPartDelta(base.beta_d, userAdjustments.beta_d),
    beta_s: addPartDelta(base.beta_s, userAdjustments.beta_s),
  };
}

export function sanitizeUserAdjustments(adjustments = {}) {
  return {
    ...DEFAULT_USER_ADJUSTMENTS,
    ...adjustments,
    beta_v: { ...(adjustments.beta_v ?? {}) },
    beta_u: { ...(adjustments.beta_u ?? {}) },
    beta_d: { ...(adjustments.beta_d ?? {}) },
    beta_s: { ...(adjustments.beta_s ?? {}) },
  };
}

export function getFeedbackStrength(feedback, targetPart = "") {
  if (!feedback || !targetPart) return 0;
  const fatigue = Number(feedback.fatigue?.[targetPart] ?? 0);
  const discomfort = Number(feedback.discomfort?.[targetPart] ?? 0);
  return fatigue + discomfort;
}

export function shouldAllowAdjustment(feedback, minStrength = 3) {
  if (!feedback?.topPart) {
    return {
      ok: false,
      reason: "最も負担を感じた部位が未選択です。",
    };
  }

  const strength = getFeedbackStrength(feedback, feedback.topPart);
  if (strength < minStrength) {
    return {
      ok: false,
      reason: `主観強度が弱いため、まだ反映しません（閾値: ${minStrength}, 現在: ${strength}）。`,
    };
  }

  return {
    ok: true,
    reason: "",
    strength,
  };
}

export function buildAdjustmentSignature(result, feedback) {
  const topPart = feedback?.topPart || "";
  const modelMaxPart = result?.global?.maxPart || "";

  const upPct = Number(result?.input?.up_pct ?? 0);
  const downPct = Number(result?.input?.down_pct ?? 0);
  const trailPct = Number(result?.input?.surface_trail_pct ?? 0);

  let conditionTag = "general";

  if (topPart === "膝" && downPct > 0) conditionTag = "down-knee";
  else if (topPart === "股関節殿部" && upPct > 0) conditionTag = "up-glute";
  else if (topPart === "後下腿" && upPct > 0) conditionTag = "up-calf";
  else if (topPart === "足底部" && trailPct > 0) conditionTag = "trail-plantar";
  else if (topPart === "前下腿" && trailPct > 0) conditionTag = "trail-shin";
  else if (topPart === "アキレス腱") conditionTag = "achilles";
  else if (topPart === "足関節・足背部" && trailPct > 0) conditionTag = "trail-ankle";

  return {
    topPart,
    modelMaxPart,
    conditionTag,
    mismatch: !!topPart && !!modelMaxPart && topPart !== modelMaxPart,
  };
}

export function isRepeatedMismatch(previousPending, currentSignature) {
  if (!previousPending || !currentSignature) return false;
  return (
    previousPending.topPart === currentSignature.topPart &&
    previousPending.modelMaxPart === currentSignature.modelMaxPart &&
    previousPending.conditionTag === currentSignature.conditionTag &&
    currentSignature.mismatch
  );
}

export function applyRuleBasedAdjustment(prevAdjustments, result, feedback) {
  const next = sanitizeUserAdjustments(prevAdjustments);

  if (!result?.input || !feedback) return next;

  const topPart = feedback.topPart || "";
  const modelMaxPart = result.global?.maxPart || "";

  const downPct = Number(result.input.down_pct ?? 0);
  const upPct = Number(result.input.up_pct ?? 0);
  const trailPct = Number(result.input.surface_trail_pct ?? 0);

  if (topPart && topPart !== modelMaxPart) {
    if (topPart === "膝" && downPct > 0) {
      next.beta_d["膝"] = clamp((next.beta_d["膝"] ?? 0) + 0.01, -0.15, 0.15);
    }

    if (topPart === "股関節殿部" && upPct > 0) {
      next.beta_u["股関節殿部"] = clamp(
        (next.beta_u["股関節殿部"] ?? 0) + 0.01,
        -0.15,
        0.15
      );
    }

    if (topPart === "アキレス腱") {
      next.tauAch = clamp((next.tauAch ?? 0) + 0.01, -0.15, 0.15);
    }

    if (topPart === "足底部" && trailPct > 0) {
      next.beta_s["足底部"] = clamp(
        (next.beta_s["足底部"] ?? 0) + 0.01,
        -0.15,
        0.15
      );
      next.tauPlantar = clamp((next.tauPlantar ?? 0) + 0.01, -0.10, 0.10);
    }

    if (topPart === "前下腿" && trailPct > 0) {
      next.beta_s["前下腿"] = clamp(
        (next.beta_s["前下腿"] ?? 0) + 0.01,
        -0.15,
        0.15
      );
    }

    if (topPart === "後下腿" && upPct > 0) {
      next.beta_u["後下腿"] = clamp(
        (next.beta_u["後下腿"] ?? 0) + 0.01,
        -0.15,
        0.15
      );
    }

    if (topPart === "足関節・足背部" && trailPct > 0) {
      next.beta_s["足関節・足背部"] = clamp(
        (next.beta_s["足関節・足背部"] ?? 0) + 0.01,
        -0.15,
        0.15
      );
    }
  }

  return next;
}