function pushGradeWarningsAndErrors(values, errors, warnings) {
  const upGrade = values.up_grade_pct;
  const downGrade = values.down_grade_pct;

  if (Number.isFinite(upGrade)) {
    if (upGrade > 30) {
      errors.push("up_grade_pct は 0〜30 の範囲で入力してください");
    } else if (upGrade > 20) {
      warnings.push(
        "up_grade_pct は 20 を超えています。急坂条件としては許容しますが、通常のランニング条件としては大きめの値です"
      );
    }
  }

  if (Number.isFinite(downGrade)) {
    if (downGrade > 30) {
      errors.push("down_grade_pct は 0〜30 の範囲で入力してください");
    } else if (downGrade > 20) {
      warnings.push(
        "down_grade_pct は 20 を超えています。急坂条件としては許容しますが、通常のランニング条件としては大きめの値です"
      );
    }
  }
}

function pushSpeedWarningsAndErrors(values, errors, warnings) {
  const dist_km = values.dist_km;
  const time_min = values.time_min;

  if (
    Number.isFinite(dist_km) &&
    Number.isFinite(time_min) &&
    dist_km > 0 &&
    time_min > 0
  ) {
    const speedKmh = dist_km / (time_min / 60);

    if (speedKmh > 30) {
      errors.push(`速度が不自然です（${speedKmh.toFixed(1)} km/h）`);
    } else if (speedKmh < 3) {
      warnings.push(
        `速度が非常に遅い値です（${speedKmh.toFixed(1)} km/h）。距離または時間の入力値を確認してください`
      );
    } else if (speedKmh > 20) {
      warnings.push(
        `速度が非常に速い値です（${speedKmh.toFixed(1)} km/h）。距離または時間の入力値を確認してください`
      );
    }
  }
}

export function validateDayInput(day) {
  const errors = [];
  const warnings = [];

  const numFields = [
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

  const values = {};
  for (const f of numFields) {
    const v = Number(day[f]);
    values[f] = v;

    if (!Number.isFinite(v)) {
      errors.push(`${f} が数値ではありません`);
      continue;
    }
    if (v < 0) {
      errors.push(`${f} は0以上で入力してください`);
    }
  }

  const steps = values.steps;
  const dist_km = values.dist_km;
  const time_min = values.time_min;
  const rpe = values.RPE;
  const up_pct = values.up_pct;
  const down_pct = values.down_pct;

  /* ---------- RPE 範囲チェック（研究仕様: 0〜10） ---------- */
  if (Number.isFinite(rpe) && (rpe < 0 || rpe > 10)) {
    errors.push("RPE は 0〜10 の範囲で入力してください");
  }

  /* ---------- 勾配強度の推奨範囲チェック ---------- */
  pushGradeWarningsAndErrors(values, errors, warnings);

  /* ---------- 路面割合 ---------- */
  const surfaceSum =
    values.surface_paved_pct +
    values.surface_trail_pct +
    values.surface_treadmill_pct +
    values.surface_track_pct;

  // 走行日（steps>0）のみ 100% を必須とする
  if (Number.isFinite(steps) && steps > 0) {
    if (Math.abs(surfaceSum - 100) > 1e-9) {
      errors.push(`路面割合の合計が100%ではありません（現在: ${surfaceSum}%）`);
    }
  }

  /* ---------- 日付 ---------- */
  if (!day.date || !/^\d{4}-\d{2}-\d{2}$/.test(String(day.date))) {
    errors.push("date は YYYY-MM-DD 形式で入力してください");
  }

  /* ---------- 整合性チェック ---------- */

  // steps=0 なのに距離・時間がある
  if (
    Number.isFinite(steps) &&
    Number.isFinite(dist_km) &&
    Number.isFinite(time_min) &&
    steps === 0 &&
    (dist_km > 0 || time_min > 0)
  ) {
    errors.push("steps=0 の日に dist_km または time_min が正です");
  }

  // 距離があるのに時間が0
  if (
    Number.isFinite(dist_km) &&
    Number.isFinite(time_min) &&
    dist_km > 0 &&
    time_min === 0
  ) {
    errors.push("dist_km > 0 なのに time_min = 0 です");
  }

  // 時間があるのに距離が0
  if (
    Number.isFinite(dist_km) &&
    Number.isFinite(time_min) &&
    time_min > 0 &&
    dist_km === 0
  ) {
    warnings.push("time_min > 0 ですが dist_km = 0 です");
  }

  // up/down の合計は参考値として返す
  const slopePortionSum =
    (Number.isFinite(up_pct) ? up_pct : 0) +
    (Number.isFinite(down_pct) ? down_pct : 0);

  // 合計100%超は明らかに不自然
  if (
    Number.isFinite(up_pct) &&
    Number.isFinite(down_pct) &&
    slopePortionSum > 100 + 1e-9
  ) {
    errors.push(`up_pct + down_pct が 100% を超えています（現在: ${slopePortionSum}%）`);
  }

  // 走行日なのに up/down とも 0 は平地として許容
  if (
    Number.isFinite(steps) &&
    steps > 0 &&
    Number.isFinite(slopePortionSum) &&
    slopePortionSum < 0
  ) {
    errors.push("up_pct + down_pct が不正です");
  }

  /* ---------- 速度チェック ---------- */
  pushSpeedWarningsAndErrors(values, errors, warnings);

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    surfaceSum,
    slopePortionSum,
  };
}

export function validateDays(days) {
  const allErrors = [];
  const allWarnings = [];

  days.forEach((d, i) => {
    const v = validateDayInput(d);

    if (!v.ok) {
      v.errors.forEach((e) => allErrors.push(`行${i + 1}: ${e}`));
    }
    if (Array.isArray(v.warnings) && v.warnings.length) {
      v.warnings.forEach((w) => allWarnings.push(`行${i + 1}: ${w}`));
    }
  });

  return {
    ok: allErrors.length === 0,
    errors: allErrors,
    warnings: allWarnings,
  };
}