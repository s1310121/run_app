// js/core/colorConfig.js

export const COLOR = {
  text: "#111111",
  muted: "#666666",
  grid: "#DDDDDD",
  axis: "#DDDDDD",
  guide: "#F0F0F0",

  spike: {
    recovery: "#0072B2",
    neutral: "#E0E0E0",
    increase: "#D55E00",
    warn: "#CC0000",
    thetaLine: "#888888",
    zeroLine: "#888888",
  },

  charts: {

    /* 外的負荷分解 */
    extTerms: {
      term_speed: "#0072B2",
      term_slope: "#009E73",
      term_surface: "#E69F00",
    },

    /* スパイク指数 */
    spike: {
      G: "#111111",
      maxS: "#D55E00",
    },

    /* 部位別ラインカラー（9部位） */
    parts: {

      /* 体幹 */
      "腰骨盤部": "#CC79A7",

      /* 股関節 */
      "股関節殿部": "#0072B2",

      /* 大腿 */
      "大腿": "#009E73",

      /* 膝 */
      "膝": "#E69F00",

      /* 前下腿 */
      "前下腿": "#56B4E9",

      /* 後下腿 */
      "後下腿": "#0072B2",

      /* アキレス腱 */
      "アキレス腱": "#D55E00",

      /* 足底 */
      "足底部": "#8B4513",

      /* 足関節・足背 */
      "足関節・足背部": "#7F7F7F",
    },
  },
};


/* S_k → 色 */
export function colorForSpikeS(S, theta = Math.log(1.5)) {

  const s = Number(S);
  const th = Number(theta);

  if (!Number.isFinite(s)) return COLOR.spike.neutral;

  if (Number.isFinite(th) && s >= th)
    return COLOR.spike.warn;

  if (s > 0)
    return COLOR.spike.increase;

  if (s < 0)
    return COLOR.spike.recovery;

  return COLOR.spike.neutral;
}