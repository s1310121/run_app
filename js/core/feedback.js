// app/js/core/feedback.js

import {
  BODY_PARTS,
  CONTRACTILE_PARTS,
  THETA,
  COUPLING_SOURCE_PART,
  COUPLING_TARGETS,
} from "./constants.js";

const DEFAULT_THETA = THETA;
const DEFAULT_BODY_PARTS = BODY_PARTS;

function num(x, fallback = NaN) {
  return Number.isFinite(x) ? x : fallback;
}

function fmt(x, digits = 3) {
  return Number.isFinite(x) ? x.toFixed(digits) : "—";
}

function signed(x, digits = 3) {
  if (!Number.isFinite(x)) return "—";
  return `${x >= 0 ? "+" : ""}${x.toFixed(digits)}`;
}

function safeDiv(a, b, fallback = NaN) {
  if (!Number.isFinite(a) || !Number.isFinite(b) || Math.abs(b) < 1e-12) return fallback;
  return a / b;
}

function safeLnRatio(a, b) {
  if (!(a > 0) || !(b > 0)) return NaN;
  return Math.log(a / b);
}

function getTheta(r) {
  return num(r?.global?.theta, DEFAULT_THETA);
}

function getLagB(r) {
  return num(r?.meta?.lagWindow?.B, 28);
}

function getBodyParts(r) {
  const keys = Object.keys(r?.parts ?? {});
  return keys.length ? keys : DEFAULT_BODY_PARTS;
}

function getDerivedTimeSeconds(r) {
  return num(r?.derived?.T_s, num(r?.derived?.T));
}

function getDerivedSpeed(r) {
  return num(r?.derived?.V_mps, num(r?.derived?.V));
}

function getVref(r) {
  return num(
    r?.total?.ext_terms?.Vref,
    num(r?.total?.Vref, num(r?.derived?.Vref, num(r?.config?.Vref, num(r?.params?.Vref))))
  );
}

function getSpeedRatio(r) {
  const extTermsVratio = num(r?.total?.ext_terms?.Vratio);
  if (Number.isFinite(extTermsVratio)) return extTermsVratio;

  const V = getDerivedSpeed(r);
  const Vref = getVref(r);
  return safeDiv(V, Vref);
}

function getPartEntries(r) {
  return getBodyParts(r).map((part) => {
    const p = r?.parts?.[part] ?? {};
    return {
      part,
      z: num(p.z),
      w: num(p.w),
      L_ext: num(p.L_ext),
      L: num(p.L),
      m_eff: num(p.m_eff),
      L_bar_lag: num(p.L_bar_lag),
      L_tilde: num(p.L_tilde),
      A: num(p.A),
      C: num(p.C),
      R: num(p.R),
      S: num(p.S),
    };
  });
}

function sortBySpikeDesc(entries) {
  return [...entries]
    .filter((x) => Number.isFinite(x.S))
    .sort((a, b) => b.S - a.S);
}

function sortByWeightDesc(entries) {
  return [...entries]
    .filter((x) => Number.isFinite(x.w))
    .sort((a, b) => b.w - a.w);
}

function sortByInternalWeightDesc(entries) {
  return [...entries]
    .filter((x) => Number.isFinite(x.m_eff) && x.m_eff > 0)
    .sort((a, b) => b.m_eff - a.m_eff);
}

export function labelForSpike(S, theta = DEFAULT_THETA) {
  if (!Number.isFinite(S)) return "評価不可";
  if (S > theta) return "WARN";
  if (S > 0) return "増加";
  if (S < 0) return "回復";
  return "中立";
}

export function describeSpikeLevel(S, theta = DEFAULT_THETA) {
  if (!Number.isFinite(S)) return "評価不可";
  if (S > theta) return "警告閾値超過";
  if (S >= theta * 0.6) return "強い上昇";
  if (S > 0) return "上昇";
  if (S <= -0.2) return "明確な回復";
  if (S < 0) return "回復";
  return "中立";
}

function labelForDifference(v) {
  if (!Number.isFinite(v)) return "不明";
  if (v > 0.25) return "大きく増加";
  if (v > 0.08) return "増加";
  if (v < -0.25) return "大きく減少";
  if (v < -0.08) return "減少";
  return "概ね不変";
}

function inferWarnLevel(r) {
  const theta = getTheta(r);
  const maxS = num(r?.global?.maxS);
  if (!Number.isFinite(maxS)) return "評価不可";
  if (maxS > theta) return "WARN";
  if (maxS > 0) return "注意域未満の上昇";
  if (maxS < 0) return "回復域";
  return "中立";
}

function buildHeadline(r) {
  const stdReady = !!r?.meta?.standardizationReady;
  const theta = getTheta(r);
  const maxPart = r?.global?.maxPart ?? "—";
  const maxS = num(r?.global?.maxS);
  const G = num(r?.global?.G);

  if (!stdReady) {
    return "本日は標準化に必要な履歴が未充足のため、スパイク指標の解釈は参考値です。";
  }

  if (r?.global?.warn) {
    return `本日は ${maxPart} のスパイクが最大であり、maxS=${fmt(maxS)}、G=${fmt(G)} と警告閾値 θ=${fmt(theta)} を上回る急増状態です。`;
  }

  return `本日の最大スパイク部位は ${maxPart} であり、maxS=${fmt(maxS)}、G=${fmt(G)} です。警告閾値 θ=${fmt(theta)} は上回っていません。`;
}

function buildSummary(r) {
  return {
    date: r?.date ?? "",
    warnLevel: inferWarnLevel(r),
    maxPart: r?.global?.maxPart ?? "—",
    maxS: num(r?.global?.maxS),
    G: num(r?.global?.G),
    theta: getTheta(r),
    standardizationReady: !!r?.meta?.standardizationReady,
  };
}

function buildOverallBlock(r) {
  const stdReady = !!r?.meta?.standardizationReady;
  const maxS = num(r?.global?.maxS);
  const maxPart = r?.global?.maxPart ?? "—";
  const G = num(r?.global?.G);
  const theta = getTheta(r);

  if (!stdReady) {
    return {
      title: "全体総評",
      body: `過去 ${getLagB(r)} 日分の履歴が未充足であるため、標準化後の全体スパイク指数および部位別スパイク指標の安定的な解釈はまだ行えません。`,
    };
  }

  let level = "安定状態";
  if (maxS > theta) level = "明確な急増状態";
  else if (maxS > 0) level = "軽度から中等度の上昇状態";
  else if (maxS < 0) level = "回復傾向";

  return {
    title: "全体総評",
    body: `全体スパイク指数 G=${fmt(G)}、最大部位別スパイク指標 maxS=${fmt(maxS)}（${maxPart}）であり、本日は ${level} と解釈されます。`,
  };
}

export function decomposeExternal(curr, prev) {
  if (!curr || !prev) return null;

  const ce = curr?.total?.ext_terms ?? {};
  const pe = prev?.total?.ext_terms ?? {};

  const d_lnN = safeLnRatio(num(ce.term_steps), num(pe.term_steps));

  const d_2lnV = (() => {
    const cv = getSpeedRatio(curr);
    const pv = getSpeedRatio(prev);
    if (!(cv > 0) || !(pv > 0)) return NaN;
    return 2 * Math.log(cv / pv);
  })();

  const d_lnSlope = safeLnRatio(num(ce.term_slope), num(pe.term_slope));
  const d_lnSurface = safeLnRatio(num(ce.term_surface), num(pe.term_surface));
  const d_lnExtTotal = safeLnRatio(num(curr?.total?.L_ext_total), num(prev?.total?.L_ext_total));

  const pieces = [d_lnN, d_2lnV, d_lnSlope, d_lnSurface].filter(Number.isFinite);
  const d_lnExtSum = pieces.length ? pieces.reduce((a, b) => a + b, 0) : NaN;

  return {
    d_lnN,
    d_2lnV,
    d_lnSlope,
    d_lnSurface,
    d_lnExtSum,
    d_lnExtTotal,
  };
}

function buildTrendBlock(curr, prev) {
  if (!prev) {
    return {
      title: "前日比較",
      body: "前日データがないため、当日の推移比較は行っていません。",
    };
  }

  if (!prev?.meta?.standardizationReady) {
    return {
      title: "前日比較",
      body: "前日は標準化未成立のため、maxS と G の前日比較は行っていません。",
    };
  }

  const maxSNow = num(curr?.global?.maxS);
  const maxSPrev = num(prev?.global?.maxS);
  const GNow = num(curr?.global?.G);
  const GPrev = num(prev?.global?.G);

  if (!Number.isFinite(maxSNow) || !Number.isFinite(maxSPrev) || !Number.isFinite(GNow) || !Number.isFinite(GPrev)) {
    return {
      title: "前日比較",
      body: "maxS または G の前日比較に必要な情報が不足しているため、比較は行っていません。",
    };
  }

  const sDiff = maxSNow - maxSPrev;
  const gDiff = GNow - GPrev;

  return {
    title: "前日比較",
    body: `maxS は前日比で ${labelForDifference(sDiff)}（差分 ${signed(sDiff)}）、G は ${labelForDifference(gDiff)}（差分 ${signed(gDiff)}）でした。`,
  };
}

function buildExternalBlock(curr, prev) {
  const ext = curr?.total?.ext_terms ?? {};
  const total = num(curr?.total?.L_ext_total);
  const steps = num(ext.term_steps, num(curr?.input?.steps));
  const V = getDerivedSpeed(curr);
  const Vratio = getSpeedRatio(curr);
  const termSlope = num(ext.term_slope);
  const termSurface = num(ext.term_surface);

  const partEntries = getPartEntries(curr);
  const topW = sortByWeightDesc(partEntries)[0];

  if (!prev) {
    return {
      title: "外的負荷",
      body: `本日の外的総負荷は L_ext_total=${fmt(total)} です。steps=${fmt(steps, 0)}、V=${fmt(V)} m/s、Vratio=${fmt(Vratio)}、term_slope=${fmt(termSlope)}、term_surface=${fmt(termSurface)} でした。外的分配では ${topW ? `${topW.part} が最大で w=${fmt(topW.w)}、z=${fmt(topW.z)}` : "最大部位は取得できませんでした"}。前日データが存在しないため、前日比較は行っていません。`,
    };
  }

  const d = decomposeExternal(curr, prev);
  if (!d) {
    return {
      title: "外的負荷",
      body: "外的負荷分解に必要な情報が不足しています。",
    };
  }

  const drivers = [
    ["steps", d.d_lnN],
    ["速度", d.d_2lnV],
    ["坂条件", d.d_lnSlope],
    ["路面条件", d.d_lnSurface],
  ].filter(([, v]) => Number.isFinite(v));

  const sorted = [...drivers].sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));
  const main = sorted[0];
  const second = sorted[1];
  const direction = total >= num(prev?.total?.L_ext_total) ? "増加" : "減少";

  const detail1 = main ? `主な寄与因子は ${main[0]}（${signed(main[1])}）` : "";
  const detail2 = second ? `、次いで ${second[0]}（${signed(second[1])}）` : "";
  const weightText = topW
    ? ` 部位分配では ${topW.part} が最大で、w=${fmt(topW.w)}、z=${fmt(topW.z)} でした。`
    : "";

  return {
    title: "外的負荷",
    body: `外的総負荷は L_ext_total=${fmt(total)} で、前日比では ${direction} しました。ΔlnL_ext_total=${signed(d.d_lnExtTotal)}、分解和=${signed(d.d_lnExtSum)} であり、${detail1}${detail2} が影響しています。${weightText}`,
    metrics: d,
  };
}

function buildInternalBlock(curr, prev) {
  const Lint = num(curr?.total?.L_int);
  const Tsec = getDerivedTimeSeconds(curr);
  const RPE = num(curr?.input?.RPE);

  const entries = getPartEntries(curr);
  const mRank = sortByInternalWeightDesc(entries);
  const topM = mRank[0];

  let compare = "";
  if (prev && Number.isFinite(prev?.total?.L_int) && prev.total.L_int > 0 && Lint > 0) {
    compare = ` 前日比では ΔlnL_int=${signed(Math.log(Lint / prev.total.L_int))} です。`;
  }

  let mText = "";
  if (topM) {
    mText = ` 実効内的負荷配分では ${topM.part} が最大で、m_eff=${fmt(topM.m_eff)} でした。`;
  }

  const ach = entries.find((x) => x.part === COUPLING_TARGETS.achilles);
  const plantar = entries.find((x) => x.part === COUPLING_TARGETS.plantar);

  let couplingText = "";
  if (ach || plantar) {
    const achText = ach && Number.isFinite(ach.m_eff) ? `${ach.part}=${fmt(ach.m_eff)}` : null;
    const plText = plantar && Number.isFinite(plantar.m_eff) ? `${plantar.part}=${fmt(plantar.m_eff)}` : null;
    const parts = [achText, plText].filter(Boolean);
    if (parts.length) {
      couplingText = ` ${COUPLING_SOURCE_PART} からの再配分により、${parts.join("、")} の結合項が設定されています。`;
    }
  }

  return {
    title: "内的負荷",
    body: `内的負荷は L_int=T×RPE=${fmt(Lint)} であり、T=${fmt(Tsec)} 秒、RPE=${fmt(RPE)} でした。これは主として収縮系部位（${CONTRACTILE_PARTS.join("・")}）へ加算されます。${compare}${mText}${couplingText}`,
  };
}

function buildInternalDistributionBlock(r) {
  const entries = getPartEntries(r);
  const ranked = sortByInternalWeightDesc(entries);

  if (!ranked.length) {
    return {
      title: "内的負荷配分",
      body: "実効内的負荷配分情報を取得できませんでした。",
    };
  }

  const top = ranked[0];
  const second = ranked[1];
  const ach = ranked.find((x) => x.part === COUPLING_TARGETS.achilles);
  const plantar = ranked.find((x) => x.part === COUPLING_TARGETS.plantar);

  let body = `実効内的負荷配分では ${top.part} が最大で m_eff=${fmt(top.m_eff)} でした。`;
  if (second) {
    body += ` 次点は ${second.part}（m_eff=${fmt(second.m_eff)}）です。`;
  }

  const couplingTargets = [ach, plantar].filter((x) => x && Number.isFinite(x.m_eff) && x.m_eff > 0);
  if (couplingTargets.length) {
    body += ` また、${COUPLING_SOURCE_PART} からの再配分により ${couplingTargets
      .map((x) => `${x.part}（m_eff=${fmt(x.m_eff)}）`)
      .join("、")} が内的負荷の一部を受けています。`;
  }

  return {
    title: "内的負荷配分",
    body,
  };
}

function buildStandardizationBlock(r) {
  const stdReady = !!r?.meta?.standardizationReady;
  const lag = r?.meta?.lagWindow ?? {};
  const ranked = sortBySpikeDesc(getPartEntries(r));

  if (!stdReady) {
    return {
      title: "標準化",
      body: `標準化は未成立です。過去 ${lag?.B ?? 28} 日分の履歴が必要であり、現時点では lag 平均に基づく相対評価を安定して行えません。`,
    };
  }

  const top = ranked[0];
  if (!top) {
    return {
      title: "標準化",
      body: "部位別標準化情報を取得できませんでした。",
    };
  }

  return {
    title: "標準化",
    body: `標準化後負荷では ${top.part} が最も高く、L_tilde=${fmt(top.L_tilde)} でした。これは当日の統合負荷が、その部位の過去${lag?.B ?? 28}日平均に対して相対的に高いことを示します。`,
  };
}

function buildEwmaBlock(r) {
  if (!r?.meta?.standardizationReady) {
    return {
      title: "EWMAとスパイク",
      body: "EWMA による急性・慢性比較は、標準化成立後に解釈するのが適切です。",
    };
  }

  const maxPart = r?.global?.maxPart;
  const p = r?.parts?.[maxPart];
  if (!p) {
    return {
      title: "EWMAとスパイク",
      body: "最大部位の EWMA 情報を取得できませんでした。",
    };
  }

  const A = num(p.A);
  const C = num(p.C);
  const R = num(p.R);
  const S = num(p.S);
  const theta = getTheta(r);

  let relation = "急性負荷と慢性負荷は同程度";
  if (A > C) relation = "急性負荷が慢性負荷を上回っています";
  else if (A < C) relation = "急性負荷が慢性負荷を下回っています";

  return {
    title: "EWMAとスパイク",
    body: `最大部位である ${maxPart} では A=${fmt(A)}、C=${fmt(C)}、R=${fmt(R)}、S=${fmt(S)} であり、${relation}。状態区分は ${describeSpikeLevel(S, theta)} です。`,
  };
}

function buildPartsBlock(r) {
  const theta = getTheta(r);
  const ranked = sortBySpikeDesc(getPartEntries(r)).slice(0, 9);

  return {
    title: "部位別ランキング",
    lines: ranked.map((x, i) => {
      const state = labelForSpike(x.S, theta);
      const detail = describeSpikeLevel(x.S, theta);

      let text = `${i + 1}位 ${x.part}: S=${fmt(x.S)}, R=${fmt(x.R)}, A=${fmt(x.A)}, C=${fmt(x.C)} (${state}/${detail})`;
      if (Number.isFinite(x.L_tilde)) text += `, L_tilde=${fmt(x.L_tilde)}`;
      if (Number.isFinite(x.w)) text += `, w=${fmt(x.w)}`;
      if (Number.isFinite(x.m_eff) && x.m_eff > 0) text += `, m_eff=${fmt(x.m_eff)}`;
      return text;
    }),
  };
}

function formatCheckValue(v, digits = 3) {
  if (typeof v === "boolean") return v ? "OK" : "NG";
  if (Number.isFinite(v)) return fmt(v, digits);
  if (Array.isArray(v)) return v.join(", ");
  if (v == null) return "—";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

function buildChecksBlock(r) {
  const c = r?.checks ?? {};
  const lines = [];

  if ("surfaceSumOk" in c) {
    lines.push(
      `surfaceSumOk: ${formatCheckValue(c.surfaceSumOk)}（surfaceSumPct=${formatCheckValue(c.surfaceSumPct, 3)}）`
    );
  }

  if ("sumW" in c) {
    lines.push(`sumW: ${formatCheckValue(c.sumW, 6)}`);
  }

  if ("sumM" in c) {
    lines.push(`sumM_eff: ${formatCheckValue(c.sumM, 6)}`);
  }

  if (c?.extConservation) {
    lines.push(
      `extConservation: absError=${formatCheckValue(c.extConservation.absError, 9)}, ok=${formatCheckValue(c.extConservation.ok)}`
    );
  }

  if (c?.totalConservation) {
    lines.push(
      `totalConservation: absError=${formatCheckValue(c.totalConservation.absError, 9)}, ok=${formatCheckValue(c.totalConservation.ok)}`
    );
  }

  if (c?.internalWeightCheck) {
    lines.push(
      `internalWeightCheck: sumM=${formatCheckValue(c.internalWeightCheck.sumM, 6)}, ok=${formatCheckValue(c.internalWeightCheck.ok)}, tauAch=${formatCheckValue(c.internalWeightCheck.tauAch, 6)}, tauPlantar=${formatCheckValue(c.internalWeightCheck.tauPlantar, 6)}`
    );
  }

  if (Array.isArray(c?.messages) && c.messages.length) {
    for (const m of c.messages) lines.push(`message: ${m}`);
  }

  if (!lines.length) {
    lines.push("checks 情報は見つかりませんでした。");
  }

  return {
    title: "監査チェック",
    lines,
  };
}

function buildCautionBlock(r) {
  const lines = [];

  if (r?.global?.warn) {
    lines.push("警告閾値を超えていますが、これは傷害発生の予測ではなく、個人内での急激な負荷上昇状態を示す指標です。");
  } else {
    lines.push("本日の結果は負荷状態の可視化結果であり、臨床的診断や傷害確率そのものを表すものではありません。");
  }

  lines.push("単日の値だけでなく、数日連続の推移、どの部位が継続して高いか、外的負荷と内的負荷の両方をあわせて解釈することが重要です。");
  lines.push("本モデルでは速度・勾配・路面の影響を主として外的負荷分配側で表現しており、内的負荷は収縮系を中心とした補助的統合として解釈する必要があります。");

  return {
    title: "解釈上の注意",
    lines,
  };
}

export function buildSpikeRankText(r, topN = 3) {
  const ranked = sortBySpikeDesc(getPartEntries(r)).slice(0, topN);
  return ranked.map((x, i) => `${i + 1}位 ${x.part} (${fmt(x.S)})`).join(" / ");
}

export function buildDetailedFeedback(results, index) {
  const curr = results?.[index] ?? null;
  const prev = index > 0 ? results?.[index - 1] ?? null : null;
  if (!curr) return null;

  return {
    summary: buildSummary(curr),
    headline: buildHeadline(curr),
    spikeRankText: buildSpikeRankText(curr),
    overall: buildOverallBlock(curr),
    trend: buildTrendBlock(curr, prev),
    external: buildExternalBlock(curr, prev),
    internal: buildInternalBlock(curr, prev),
    internalDistribution: buildInternalDistributionBlock(curr),
    standardization: buildStandardizationBlock(curr),
    ewma: buildEwmaBlock(curr),
    parts: buildPartsBlock(curr),
    checks: buildChecksBlock(curr),
    cautions: buildCautionBlock(curr),
  };
}

export function flattenFeedbackToLines(feedback) {
  if (!feedback) return [];

  const lines = [];
  if (feedback.headline) lines.push(feedback.headline);

  const pushBlock = (block) => {
    if (!block) return;
    if (block.title && block.body) {
      lines.push(`${block.title}: ${block.body}`);
      return;
    }
    if (block.title && Array.isArray(block.lines)) {
      lines.push(`${block.title}:`);
      for (const line of block.lines) {
        lines.push(`- ${line}`);
      }
    }
  };

  pushBlock(feedback.overall);
  pushBlock(feedback.trend);
  pushBlock(feedback.external);
  pushBlock(feedback.internal);
  pushBlock(feedback.internalDistribution);
  pushBlock(feedback.standardization);
  pushBlock(feedback.ewma);
  pushBlock(feedback.parts);
  pushBlock(feedback.checks);
  pushBlock(feedback.cautions);

  return lines;
}

export function feedbackToPlainText(feedback) {
  return flattenFeedbackToLines(feedback).join("\n");
}