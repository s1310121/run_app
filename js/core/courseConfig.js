export const COURSE_CONFIG = Object.freeze({
  flat: Object.freeze({
    up_pct: 5,
    down_pct: 5,
    up_grade_pct: 2,
    down_grade_pct: 2,
    surface_paved_pct: 90,
    surface_trail_pct: 0,
    surface_treadmill_pct: 0,
    surface_track_pct: 10,
  }),

  hill: Object.freeze({
    up_pct: 30,
    down_pct: 30,
    up_grade_pct: 6,
    down_grade_pct: 6,
    surface_paved_pct: 100,
    surface_trail_pct: 0,
    surface_treadmill_pct: 0,
    surface_track_pct: 0,
  }),

  trail: Object.freeze({
    up_pct: 25,
    down_pct: 25,
    up_grade_pct: 8,
    down_grade_pct: 8,
    surface_paved_pct: 0,
    surface_trail_pct: 100,
    surface_treadmill_pct: 0,
    surface_track_pct: 0,
  }),

  river: Object.freeze({
    up_pct: 10,
    down_pct: 10,
    up_grade_pct: 3,
    down_grade_pct: 3,
    surface_paved_pct: 70,
    surface_trail_pct: 30,
    surface_treadmill_pct: 0,
    surface_track_pct: 0,
  }),
});