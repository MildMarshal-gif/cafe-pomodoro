export const MINUTE = 60_000;
export const MODES = ["focus", "short", "long"];
export const DEFAULTS = {
  focus: 25,
  short: 5,
  long: 15,
  rounds: 3,
  auto: true,
  chime: true,
  volume: 35,
};
export const SCENES = [
  {
    id: "female-rain",
    name: "雨窓の喫茶室",
    person: "女性",
    caption: "雨の午後 / 窓際の席",
    description: "古いランプと雨の窓。参考書を開く、静かな午後。",
    threshold: 0,
  },
  {
    id: "male-rain",
    name: "雨窓の喫茶室",
    person: "男性",
    caption: "休日の午後 / 窓際の席",
    description: "コーヒーを傍らに、休日の学びを少しずつ。",
    threshold: 0,
  },
  {
    id: "female-modern",
    name: "雨の建築喫茶",
    person: "女性",
    caption: "雨の午後 / ガラスの向こう",
    description: "コンクリートの壁と大きな窓。いつもと違う景色で。",
    threshold: 180 * MINUTE,
  },
  {
    id: "male-modern",
    name: "雨の建築喫茶",
    person: "男性",
    caption: "休日の午後 / ガラスの向こう",
    description: "柔らかな灯りの下、新しい一章に取りかかる。",
    threshold: 360 * MINUTE,
  },
];
const clamp = (v, min, max, fallback) =>
  Number.isFinite(v) ? Math.min(max, Math.max(min, Math.round(v))) : fallback;
export function validSettings(input = {}) {
  return {
    focus: clamp(input.focus, 1, 180, 25),
    short: clamp(input.short, 1, 60, 5),
    long: clamp(input.long, 1, 90, 15),
    rounds: clamp(input.rounds, 2, 6, 3),
    auto: typeof input.auto === "boolean" ? input.auto : true,
    chime: typeof input.chime === "boolean" ? input.chime : true,
    volume: clamp(input.volume, 0, 100, 35),
  };
}
export function freshTimer(settings, mode = "focus") {
  return {
    mode,
    status: "idle",
    durationMs: settings[mode] * MINUTE,
    remainingMs: settings[mode] * MINUTE,
    checkedAt: null,
  };
}
export function createState() {
  return {
    version: 1,
    settings: { ...DEFAULTS },
    timer: freshTimer(DEFAULTS),
    daily: {},
    completedFocus: 0,
    selectedScene: "female-rain",
  };
}
export function dayKey(timestamp) {
  const d = new Date(timestamp);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
export function totalTime(state) {
  return Object.values(state.daily).reduce((a, b) => a + b, 0);
}
export function unlockedScenes(state) {
  return SCENES.filter((s) => totalTime(state) >= s.threshold);
}
export function hydrate(input) {
  if (
    !input ||
    input.version !== 1 ||
    !input.settings ||
    !input.timer ||
    !input.daily ||
    Array.isArray(input.daily)
  )
    throw new Error("保存データの形式を読み取れません。");
  const s = createState();
  s.settings = validSettings(input.settings);
  for (const [day, value] of Object.entries(input.daily)) {
    if (
      /^\d{4}-\d{2}-\d{2}$/.test(day) &&
      Number.isFinite(value) &&
      value >= 0 &&
      value <= 90_000_000
    )
      s.daily[day] = Math.round(value);
  }
  s.completedFocus = clamp(input.completedFocus, 0, 1_000_000, 0);
  const t = input.timer;
  if (
    MODES.includes(t.mode) &&
    ["idle", "running", "paused"].includes(t.status) &&
    Number.isFinite(t.durationMs) &&
    t.durationMs > 0 &&
    t.durationMs <= 180 * MINUTE &&
    Number.isFinite(t.remainingMs) &&
    t.remainingMs >= 0 &&
    t.remainingMs <= t.durationMs
  ) {
    s.timer = {
      mode: t.mode,
      status: t.status,
      durationMs: t.durationMs,
      remainingMs: t.remainingMs,
      checkedAt: Number.isFinite(t.checkedAt) ? t.checkedAt : null,
    };
    if (s.timer.status === "running" && s.timer.checkedAt === null)
      s.timer.status = "paused";
  }
  if (unlockedScenes(s).some((scene) => scene.id === input.selectedScene))
    s.selectedScene = input.selectedScene;
  return s;
}
function credit(s, from, to) {
  while (from < to) {
    const d = new Date(from);
    const next = new Date(
      d.getFullYear(),
      d.getMonth(),
      d.getDate() + 1,
    ).getTime();
    const end = Math.min(next, to);
    const key = dayKey(from);
    s.daily[key] = (s.daily[key] || 0) + (end - from);
    from = end;
  }
}
export function nextMode(s) {
  return s.timer.mode === "focus"
    ? (s.completedFocus + 1) % s.settings.rounds === 0
      ? "long"
      : "short"
    : "focus";
}
// Recover the current interval after throttling; never mint unattended sessions.
export function advance(s, now = Date.now()) {
  const events = [];
  const t = s.timer;
  if (t.status !== "running" || !Number.isFinite(now) || now <= t.checkedAt)
    return events;
  const elapsed = now - t.checkedAt;
  const used = Math.min(elapsed, t.remainingMs);
  if (t.mode === "focus") credit(s, t.checkedAt, t.checkedAt + used);
  t.remainingMs -= used;
  const boundary = t.checkedAt + used;
  t.checkedAt = now;
  if (t.remainingMs > 0) return events;
  const endedMode = t.mode;
  const mode = nextMode(s);
  if (endedMode === "focus") s.completedFocus++;
  const suspended = now - boundary > 5000;
  s.timer = freshTimer(s.settings, mode);
  s.timer.status = s.settings.auto && !suspended ? "running" : "paused";
  s.timer.checkedAt = s.timer.status === "running" ? boundary : null;
  events.push({ type: "phase-ended", mode: endedMode, next: mode, suspended });
  if (s.timer.status === "running" && now > boundary)
    events.push(...advance(s, now));
  return events;
}
export function start(s, now = Date.now()) {
  if (s.timer.status !== "running") {
    s.timer.status = "running";
    s.timer.checkedAt = now;
  }
  return s;
}
export function pause(s, now = Date.now()) {
  const events = advance(s, now);
  s.timer.status = "paused";
  s.timer.checkedAt = null;
  return events;
}
export function finish(s, now = Date.now()) {
  const events = advance(s, now);
  s.timer = freshTimer(s.settings);
  return events;
}
export function changeMode(s, mode, now = Date.now()) {
  if (!MODES.includes(mode)) throw new Error("タイマーの種類が不正です。");
  const events = advance(s, now);
  s.timer = freshTimer(s.settings, mode);
  return events;
}
export function configure(s, settings, now = Date.now()) {
  const events = advance(s, now);
  const oldDuration = s.settings[s.timer.mode];
  s.settings = validSettings({ ...s.settings, ...settings });
  if (s.timer.status !== "running" && oldDuration !== s.settings[s.timer.mode])
    s.timer = freshTimer(s.settings, s.timer.mode);
  return events;
}
export function selectScene(s, id) {
  if (!unlockedScenes(s).some((scene) => scene.id === id))
    throw new Error("この場面はまだ解放されていません。");
  s.selectedScene = id;
}
export function streaks(s, now = Date.now()) {
  const active = Object.keys(s.daily)
    .filter((k) => s.daily[k] >= MINUTE)
    .sort();
  let best = 0,
    run = 0,
    previous = null;
  for (const key of active) {
    const d = new Date(key + "T12:00:00");
    const prev = new Date(d);
    prev.setDate(d.getDate() - 1);
    run = previous === dayKey(prev) ? run + 1 : 1;
    best = Math.max(best, run);
    previous = key;
  }
  let current = 0;
  const d = new Date(now);
  if (!(s.daily[dayKey(d)] >= MINUTE)) d.setDate(d.getDate() - 1);
  while (s.daily[dayKey(d)] >= MINUTE) {
    current++;
    d.setDate(d.getDate() - 1);
  }
  return { current, best };
}
