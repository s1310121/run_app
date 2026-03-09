export const BODY_PARTS = Object.freeze([
  "腰骨盤部",
  "股関節殿部",
  "大腿",
  "膝",
  "前下腿",
  "後下腿",
  "アキレス腱",
  "足底部",
  "足関節・足背部",
]);

// 内的負荷を主として配分する収縮系部位
export const CONTRACTILE_PARTS = Object.freeze([
  "腰骨盤部",
  "股関節殿部",
  "大腿",
  "前下腿",
  "後下腿",
]);

// 直接内的負荷を持たず、必要に応じて結合項のみを受ける部位
export const PASSIVE_OR_JOINT_PARTS = Object.freeze([
  "膝",
  "アキレス腱",
  "足底部",
  "足関節・足背部",
]);

// 路面係数
export const SURFACE_COEFF = Object.freeze({
  paved: 0.0,
  trail: 1.0,
  treadmill: 0.1,
  track: 0.2,
});

// 外的負荷の基準部位重み
export const W0 = Object.freeze({
  "腰骨盤部": 0.08,
  "股関節殿部": 0.13,
  "大腿": 0.16,
  "膝": 0.17,
  "前下腿": 0.11,
  "後下腿": 0.12,
  "アキレス腱": 0.08,
  "足底部": 0.07,
  "足関節・足背部": 0.08,
});

// softmax の切片 a_k = ln(w_k^0)
export const A0 = Object.freeze(
  Object.fromEntries(
    Object.entries(W0).map(([part, value]) => [part, Math.log(value)])
  )
);

// 内的負荷の基準配分 m_k^0（収縮系のみ）
// 合計 1.0
export const M0 = Object.freeze({
  "腰骨盤部": 0.18,
  "股関節殿部": 0.22,
  "大腿": 0.28,
  "前下腿": 0.14,
  "後下腿": 0.18,
});

// 腱・足底への結合係数
export const TAU = Object.freeze({
  Ach: 0.25,
  Plantar: 0.10,
});

// 速度感度 b_v,k
export const BETA_V = Object.freeze({
  "腰骨盤部": 0.18,
  "股関節殿部": 0.22,
  "大腿": 0.15,
  "膝": -0.02,
  "前下腿": -0.06,
  "後下腿": -0.04,
  "アキレス腱": -0.06,
  "足底部": -0.04,
  "足関節・足背部": -0.03,
});

// 上り感度 b_u,k
export const BETA_U = Object.freeze({
  "腰骨盤部": 0.04,
  "股関節殿部": 0.10,
  "大腿": 0.10,
  "膝": 0.00,
  "前下腿": -0.02,
  "後下腿": 0.18,
  "アキレス腱": 0.14,
  "足底部": 0.02,
  "足関節・足背部": 0.04,
});

// 下り感度 b_d,k
export const BETA_D = Object.freeze({
  "腰骨盤部": 0.00,
  "股関節殿部": 0.04,
  "大腿": 0.16,
  "膝": 0.20,
  "前下腿": 0.10,
  "後下腿": 0.06,
  "アキレス腱": 0.02,
  "足底部": 0.00,
  "足関節・足背部": 0.04,
});

// 路面感度 b_s,k
export const BETA_S = Object.freeze({
  "腰骨盤部": 0.02,
  "股関節殿部": 0.04,
  "大腿": 0.02,
  "膝": -0.02,
  "前下腿": 0.12,
  "後下腿": 0.10,
  "アキレス腱": 0.06,
  "足底部": 0.10,
  "足関節・足背部": 0.14,
});

 export const TIME_CONSTANTS_BY_PART = Object.freeze({
   "腰骨盤部": Object.freeze({ Na: 7, Nc: 28 }),
   "股関節殿部": Object.freeze({ Na: 7, Nc: 28 }),
   "大腿": Object.freeze({ Na: 7, Nc: 28 }),
   "膝": Object.freeze({ Na: 7, Nc: 35 }),
   "前下腿": Object.freeze({ Na: 7, Nc: 28 }),
   "後下腿": Object.freeze({ Na: 7, Nc: 28 }),
   "アキレス腱": Object.freeze({ Na: 10, Nc: 56 }),
   "足底部": Object.freeze({ Na: 10, Nc: 56 }),
   "足関節・足背部": Object.freeze({ Na: 7, Nc: 35 }),
 });

export const DEFAULT_CONFIG = Object.freeze({
  // 外的総負荷
  Vref: 3.0,
  kG_plus: 10.0,
  kG_minus: 10.0,
  ks: 0.5,

  // 標準化・EWMA
  // 後方互換のため残す
  Na: 7,
  Nc: 28,
  B: 28,

  // 部位別時定数（拡張用）
  timeConstantsByPart: TIME_CONSTANTS_BY_PART,

  // 数値安定
  eps: 1e-8,
  tol: 1e-6,

  // 腱・足底への結合係数
  tauAch: TAU.Ach,
  tauPlantar: TAU.Plantar,

  // 基準部位重み
  w0: W0,

  // softmax 切片
  a0: A0,

  // 内的負荷基準配分
  m0: M0,

  // softmax 感度係数
  beta_v: BETA_V,
  beta_u: BETA_U,
  beta_d: BETA_D,
  beta_s: BETA_S,

  // 路面係数
  surfaceCoeff: SURFACE_COEFF,
});

// 参考用の警告閾値
export const THETA = Math.log(1.5);

// 表示や検証のための既定順
export const DEFAULT_PART_ORDER = BODY_PARTS;

// 収縮系のうち、結合元となる基準部位
export const COUPLING_SOURCE_PART = "後下腿";

// 結合先
export const COUPLING_TARGETS = Object.freeze({
  achilles: "アキレス腱",
  plantar: "足底部",
});