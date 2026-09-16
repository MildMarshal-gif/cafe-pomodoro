import test from "node:test";
import assert from "node:assert/strict";
import {
  MINUTE,
  createState,
  start,
  advance,
  pause,
  finish,
  changeMode,
  configure,
  hydrate,
  totalTime,
  dayKey,
  unlockedScenes,
  selectScene,
  streaks,
} from "../dist/engine.mjs";
const base = new Date(2026, 8, 16, 12).getTime();

test("途中で止めた時間だけを記録し、一時停止中には加算しない", () => {
  const s = createState();
  start(s, base);
  pause(s, base + 8 * MINUTE);
  advance(s, base + 30 * MINUTE);
  assert.equal(totalTime(s), 8 * MINUTE);
  assert.equal(s.timer.remainingMs, 17 * MINUTE);
  start(s, base + 30 * MINUTE);
  finish(s, base + 32 * MINUTE);
  assert.equal(totalTime(s), 10 * MINUTE);
  assert.equal(s.timer.status, "idle");
  assert.equal(s.completedFocus, 0);
});
test("再読み込み後も残り時間と既計上分を復元する", () => {
  let s = createState();
  start(s, base);
  advance(s, base + 2 * MINUTE);
  s = hydrate(JSON.parse(JSON.stringify(s)));
  advance(s, base + 10 * MINUTE);
  assert.equal(s.timer.remainingMs, 15 * MINUTE);
  assert.equal(totalTime(s), 10 * MINUTE);
});
test("同じ時刻で再計算しても二重に記録しない", () => {
  let s = createState();
  start(s, base);
  advance(s, base + MINUTE);
  for (let i = 0; i < 10; i++) {
    s = hydrate(JSON.parse(JSON.stringify(s)));
    advance(s, base + MINUTE);
  }
  assert.equal(totalTime(s), MINUTE);
});
test("集中25分から休憩5分へ自動移行し、休憩は実績に含めない", () => {
  const s = createState();
  start(s, base);
  const events = advance(s, base + 25 * MINUTE);
  assert.equal(events[0].next, "short");
  assert.equal(s.timer.status, "running");
  advance(s, base + 30 * MINUTE);
  assert.equal(s.timer.mode, "focus");
  assert.equal(totalTime(s), 25 * MINUTE);
});
test("3回の集中後に長休憩を開始する", () => {
  const s = createState();
  start(s, base);
  let at = base;
  for (let i = 0; i < 3; i++) {
    at += 25 * MINUTE;
    advance(s, at);
    if (i < 2) {
      at += 5 * MINUTE;
      advance(s, at);
    }
  }
  assert.equal(s.timer.mode, "long");
  assert.equal(s.timer.remainingMs, 15 * MINUTE);
  assert.equal(s.completedFocus, 3);
});
test("短いコールバック遅延は次の区間に繰り越す", () => {
  const s = createState();
  start(s, base);
  advance(s, base + 25 * MINUTE + 2000);
  assert.equal(s.timer.remainingMs, 5 * MINUTE - 2000);
  assert.equal(totalTime(s), 25 * MINUTE);
});
test("ブラウザを長時間閉じても不在中の集中を量産しない", () => {
  const s = createState();
  start(s, base);
  const events = advance(s, base + 8 * 60 * MINUTE);
  assert.equal(totalTime(s), 25 * MINUTE);
  assert.equal(s.completedFocus, 1);
  assert.equal(s.timer.mode, "short");
  assert.equal(s.timer.status, "paused");
  assert.equal(events[0].suspended, true);
});
test("日付をまたぐ集中は各日の実時間へ配分する", () => {
  const at = new Date(2026, 8, 16, 23, 55).getTime();
  const s = createState();
  start(s, at);
  pause(s, at + 10 * MINUTE);
  assert.equal(s.daily["2026-09-16"], 5 * MINUTE);
  assert.equal(s.daily["2026-09-17"], 5 * MINUTE);
});
test("手動切替では次の時間を勝手に開始しない", () => {
  const s = createState();
  configure(s, { auto: false }, base);
  start(s, base);
  advance(s, base + 25 * MINUTE);
  assert.equal(s.timer.status, "paused");
  assert.equal(s.timer.mode, "short");
});
test("実行中の設定変更は現在の区間を変えず、次から適用", () => {
  const s = createState();
  start(s, base);
  configure(s, { focus: 40, short: 10 }, base + MINUTE);
  assert.equal(s.timer.remainingMs, 24 * MINUTE);
  advance(s, base + 25 * MINUTE);
  assert.equal(s.timer.remainingMs, 10 * MINUTE);
});
test("一時停止中に終了音だけを変更しても残り時間を維持する", () => {
  const s = createState();
  start(s, base);
  pause(s, base + 10 * MINUTE);
  configure(s, { chime: false }, base + 11 * MINUTE);
  assert.equal(s.timer.remainingMs, 15 * MINUTE);
  assert.equal(s.timer.status, "paused");
  assert.equal(s.settings.chime, false);
});
test("途中のモード変更は実績を保存し、新しいモードは停止して開始待ち", () => {
  const s = createState();
  start(s, base);
  changeMode(s, "short", base + 2 * MINUTE);
  assert.equal(totalTime(s), 2 * MINUTE);
  assert.equal(s.timer.status, "idle");
  assert.equal(s.timer.mode, "short");
});
test("3時間・6時間の境界で1場面ずつ解放する", () => {
  const s = createState();
  assert.equal(unlockedScenes(s).length, 2);
  assert.throws(() => selectScene(s, "female-modern"));
  s.daily[dayKey(base)] = 180 * MINUTE - 1;
  assert.equal(unlockedScenes(s).length, 2);
  s.daily[dayKey(base)]++;
  assert.equal(unlockedScenes(s).length, 3);
  selectScene(s, "female-modern");
  s.daily[dayKey(base)] = 360 * MINUTE;
  assert.equal(unlockedScenes(s).length, 4);
});
test("時計が戻ったときは時間を重複して加算しない", () => {
  const s = createState();
  start(s, base);
  advance(s, base + MINUTE);
  advance(s, base);
  advance(s, base + 2 * MINUTE);
  assert.equal(totalTime(s), 2 * MINUTE);
});
test("不正な設定を範囲内に補正する", () => {
  const s = createState();
  configure(
    s,
    { focus: -10, short: 999, long: NaN, rounds: 0, volume: Infinity },
    base,
  );
  assert.deepEqual(s.settings, {
    focus: 1,
    short: 60,
    long: 15,
    rounds: 2,
    auto: true,
    chime: true,
    volume: 35,
  });
});
test("不明な形式の保存データは拒否する", () => {
  assert.throws(() => hydrate({ version: 99 }));
  assert.throws(() => hydrate(null));
});
test("保存データ由来の不正な数値と場面を取り込まない", () => {
  const s = createState();
  s.daily = { x: 1, "2026-09-16": -10 };
  s.selectedScene = "male-modern";
  s.timer.remainingMs = Infinity;
  const clean = hydrate(s);
  assert.equal(totalTime(clean), 0);
  assert.equal(clean.selectedScene, "female-rain");
  assert.equal(clean.timer.remainingMs, 25 * MINUTE);
});
test("連続利用が途切れても最長記録を残し、今日未利用なら昨日から数える", () => {
  const s = createState();
  for (const day of [10, 11, 12, 15]) s.daily[`2026-09-${day}`] = MINUTE;
  assert.deepEqual(streaks(s, base), { current: 1, best: 3 });
  s.daily["2026-09-16"] = MINUTE;
  assert.deepEqual(streaks(s, base), { current: 2, best: 3 });
  assert.deepEqual(streaks(s, new Date(2026, 8, 18)), { current: 0, best: 3 });
});
