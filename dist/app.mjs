import {
  MINUTE,
  SCENES,
  createState,
  hydrate,
  dayKey,
  totalTime,
  unlockedScenes,
  advance,
  start,
  pause,
  finish,
  changeMode,
  configure,
  selectScene,
  streaks,
  nextMode,
} from "./engine.mjs";
import { Soundscape } from "./sound.mjs";
const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const KEY = "cafe-pomodoro.v1";
const LOCK = "cafe-pomodoro-state";
const labels = { focus: "集中", short: "休憩", long: "長休憩" };
const sound = new Soundscape();
let state = createState(),
  memoryOnly = false,
  readOnly = false,
  view = "cafe",
  toastTimeout,
  recordStamp = "",
  sceneStamp = "",
  loadedImage = "";
function announce(message) {
  const box = $("#toast");
  box.textContent = message;
  box.hidden = false;
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => (box.hidden = true), 6500);
}
function load() {
  if (memoryOnly || readOnly) return state;
  let raw;
  try {
    raw = localStorage.getItem(KEY);
  } catch {
    memoryOnly = true;
    announce(
      "このブラウザでは保存できません。記録はページを閉じるまで有効です。",
    );
    return state;
  }
  if (!raw) return createState();
  try {
    return hydrate(JSON.parse(raw));
  } catch {
    readOnly = true;
    announce(
      "保存データを読み取れません。上書きを止めました。設定からバックアップを保存できます。",
    );
    return state;
  }
}
function persist() {
  if (memoryOnly || readOnly) return;
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    memoryOnly = true;
    announce(
      "記録を保存できませんでした。設定からバックアップを保存してください。",
    );
  }
}
function handleEvents(events) {
  for (const event of events) {
    if (event.type !== "phase-ended") continue;
    const message = event.suspended
      ? "おかえりなさい。前の区切りを記録しました。続きは開始ボタンからどうぞ。"
      : `${labels[event.mode]}が終わりました。${labels[event.next]}の時間です。`;
    announce(message);
    if (state.settings.chime) sound.chime().catch(() => {});
    if ("Notification" in window && Notification.permission === "granted")
      try {
        new Notification("Cafe Pomodoro", { body: message, tag: "cafe-phase" });
      } catch {}
  }
}
async function transact(action) {
  if (readOnly)
    throw new Error(
      "保存データを保護するため操作を止めています。バックアップを保存してください。",
    );
  const run = () => {
    state = load();
    if (readOnly) {
      render();
      throw new Error("保存データを読み取れません。");
    }
    const before = unlockedScenes(state).length;
    const events = advance(state, Date.now());
    if (action) action(state);
    persist();
    render();
    handleEvents(events);
    if (unlockedScenes(state).length > before)
      announce("新しい席がひらきました。場面帖で選べます。");
  };
  if (navigator.locks?.request) await navigator.locks.request(LOCK, run);
  else {
    readOnly = true;
    render();
    throw new Error(
      "このブラウザでは記録の重複を防げません。最新版のChrome・Edge・Safariで開いてください。",
    );
  }
}
function act(action) {
  return transact(action).catch((error) => {
    announce(error.message);
    return false;
  });
}
function prettyMinutes(ms) {
  return Math.floor(ms / MINUTE).toLocaleString("ja-JP");
}
function go(name) {
  if (!["cafe", "collection", "records"].includes(name)) return;
  view = name;
  for (const v of ["cafe", "collection", "records"])
    $("#" + v + "-view").hidden = v !== name;
  $$(".nav-button[data-view]").forEach((button) => {
    button.classList.toggle("active", button.dataset.view === name);
    if (button.dataset.view === name)
      button.setAttribute("aria-current", "page");
    else button.removeAttribute("aria-current");
  });
  recordStamp = "";
  render();
  $("#main").focus({ preventScroll: true });
}
function showSettings() {
  const form = $("#settings-form");
  for (const key of ["focus", "short", "long", "rounds"])
    form.elements[key].value = state.settings[key];
  for (const key of ["auto", "chime"])
    form.elements[key].checked = state.settings[key];
  notificationStatus();
  $("#settings-dialog").showModal();
}
function notificationStatus() {
  const supported = "Notification" in window;
  const permission = supported ? Notification.permission : "unsupported";
  $("#notification-status").textContent = {
    granted: "有効です",
    default: "必要な場合だけ許可してください",
    denied: "ブラウザの設定で通知がブロックされています",
    unsupported: "このブラウザでは使えません",
  }[permission];
  $("#notification-button").disabled = permission !== "default";
  $("#notification-button").textContent =
    permission === "granted" ? "有効" : "有効にする";
}
function render() {
  const t = state.timer;
  const seconds = Math.max(0, Math.ceil(t.remainingMs / 1000));
  const mm = String(Math.floor(seconds / 60)).padStart(2, "0"),
    ss = String(seconds % 60).padStart(2, "0");
  $("#timer-digits").innerHTML = `${mm}<span>:</span>${ss}`;
  $("#timer-digits").setAttribute(
    "aria-label",
    `残り${Number(mm)}分${Number(ss)}秒`,
  );
  $("#phase-label").textContent =
    t.mode === "focus" ? "集中する時間" : "ひと息つく時間";
  $("#timer-note").textContent =
    t.status === "running"
      ? t.mode === "focus"
        ? "今は、目の前のひとつだけ。"
        : "肩の力を抜いて、ひと休み。"
      : t.status === "paused"
        ? "ひと息ついたら、またここから。"
        : "準備ができたら、はじめよう";
  $("#toggle-timer").innerHTML =
    t.status === "running"
      ? '<span aria-hidden="true">Ⅱ</span> 一時停止'
      : `<span aria-hidden="true">▶</span> ${t.status === "paused" ? "再開する" : labels[t.mode] + "をはじめる"}`;
  $("#toggle-timer").disabled = readOnly;
  $("#finish-timer").disabled = readOnly || t.status === "idle";
  $$("[data-mode]").forEach((b) =>
    b.setAttribute("aria-pressed", String(b.dataset.mode === t.mode)),
  );
  const done = state.completedFocus % state.settings.rounds;
  $("#rounds").innerHTML =
    Array.from(
      { length: state.settings.rounds },
      (_, i) =>
        `<span class="round ${i < done ? "done" : i === done ? "current" : ""}"></span>`,
    ).join("") + `<small>${state.settings.rounds}回の集中で長休憩</small>`;
  $("#rounds").setAttribute(
    "aria-label",
    `長休憩まであと${state.settings.rounds - done}回`,
  );
  const next = nextMode(state);
  $("#next-break").innerHTML =
    `次は ${state.settings[next]}分の${labels[next]} <span>${state.settings.auto ? "自動で切り替わります" : "開始ボタンで始めます"}</span>`;
  $("#today-date").textContent = new Intl.DateTimeFormat("ja-JP", {
    month: "long",
    day: "numeric",
    weekday: "short",
  }).format(new Date());
  const today = state.daily[dayKey(Date.now())] || 0;
  $("#today-total").innerHTML = `${prettyMinutes(today)}<small>分</small>`;
  document.title = `${t.status === "running" ? `${mm}:${ss} ${labels[t.mode]} | ` : ""}Cafe Pomodoro — 喫茶室`;
  const scene = SCENES.find((s) => s.id === state.selectedScene) || SCENES[0];
  if (loadedImage !== scene.id) {
    loadedImage = scene.id;
    const img = $("#scene-image");
    img.hidden = true;
    $("#image-fallback").hidden = false;
    img.src = `assets/${scene.id}.png`;
    img.alt = `${scene.name}で${scene.person === "女性" ? "クマのパジャマを着たボブの女性" : "だる着の男性"}が参考書とノートに向かって勉強する静止画`;
  }
  $("#scene-name").textContent = scene.name;
  $("#scene-caption").textContent = scene.caption;
  $("#scene-detail").textContent =
    t.mode === "focus"
      ? "参考書を開いて、ゆっくり始めよう。"
      : "休憩の時間。静止画を眺めて、ひと息。";
  const total = totalTime(state);
  const nextScene = SCENES.find((s) => s.threshold > total);
  $("#unlock-heading").textContent = nextScene
    ? `次は、${nextScene.name}へ。`
    : "4つの席が、あなたのいつもの席に。";
  $("#unlock-copy").textContent = nextScene
    ? `あと${Math.ceil((nextScene.threshold - total) / MINUTE)}分の集中で、新しい場面がひらきます。`
    : "その日の気分で、好きな席を選んでください。";
  $("#unlock-count").textContent = nextScene
    ? `${prettyMinutes(total)} / ${nextScene.threshold / MINUTE} 分`
    : "すべての場面を解放しました";
  $("#unlock-progress").max = nextScene?.threshold || 1;
  $("#unlock-progress").value = nextScene ? total : 1;
  const stamp = state.selectedScene + unlockedScenes(state).length;
  if (stamp !== sceneStamp) {
    sceneStamp = stamp;
    renderCollection();
  }
  if (view === "records") {
    const stamp = JSON.stringify(state.daily) + dayKey(Date.now());
    if (stamp !== recordStamp) {
      recordStamp = stamp;
      renderRecords();
    }
  }
  if (memoryOnly || readOnly) {
    $("footer>span:nth-child(2)").textContent = readOnly
      ? "保存データの保護のため操作を停止中"
      : "一時利用中 · このページを閉じると記録が消えます";
  }
}
function renderCollection() {
  const available = unlockedScenes(state);
  $("#collection-count").textContent = `${available.length} / 4 席`;
  $("#scene-grid").innerHTML = SCENES.map((scene) => {
    const open = available.includes(scene),
      selected = scene.id === state.selectedScene;
    return `<article class="scene-card ${open ? "" : "locked"}"><div class="scene-card-image"><img src="assets/${scene.id}.png" alt="${scene.person}が勉強する${scene.name}" loading="lazy"><span class="card-status">${selected ? "いまの席" : open ? "いつでもどうぞ" : `累計${scene.threshold / MINUTE / 60}時間で解放`}</span></div><div class="scene-card-body"><span class="eyebrow">${scene.person}と過ごす時間</span><h2>${scene.name}</h2><p>${scene.description}</p><div class="card-actions"><button class="text-button" data-preview="${scene.id}">画像を見る ↗</button><button class="secondary-button" data-scene="${scene.id}" ${!open || selected ? "disabled" : ""}>${selected ? "選択中" : open ? "この席へ" : "まだ準備中"}</button></div></div></article>`;
  }).join("");
}
function renderRecords() {
  const streak = streaks(state);
  $("#record-summary").innerHTML = [
    ["今日の集中", prettyMinutes(state.daily[dayKey(Date.now())] || 0), "分"],
    ["これまでの集中", prettyMinutes(totalTime(state)), "分"],
    ["続けて来た日", streak.current, "日"],
  ]
    .map(
      ([title, value, unit]) =>
        `<article><h2>${title}</h2><strong>${value}<small>${unit}</small></strong></article>`,
    )
    .join("");
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - 6 + i);
    return { date: d, value: state.daily[dayKey(d)] || 0 };
  });
  const max = Math.max(25 * MINUTE, ...days.map((d) => d.value));
  $("#bar-chart").innerHTML = days
    .map(
      ({ date, value }) =>
        `<div class="chart-day" aria-label="${dayKey(date)} ${prettyMinutes(value)}分"><span class="chart-value">${prettyMinutes(value)}分</span><div class="chart-track"><div class="chart-bar" style="height:${(value / max) * 100}%"></div></div><span class="chart-label">${date.getMonth() + 1}/${date.getDate()}</span></div>`,
    )
    .join("");
  const end = new Date();
  end.setHours(12, 0, 0, 0);
  end.setDate(end.getDate() + ((7 - end.getDay()) % 7));
  $("#heatmap").innerHTML = Array.from({ length: 84 }, (_, i) => {
    const d = new Date(end);
    d.setDate(d.getDate() - 83 + i);
    const key = dayKey(d),
      value = state.daily[key] || 0;
    const future = key > dayKey(Date.now());
    const level =
      value >= 120 * MINUTE
        ? 4
        : value >= 60 * MINUTE
          ? 3
          : value >= 25 * MINUTE
            ? 2
            : value > 0
              ? 1
              : 0;
    return `<div class="heat-cell" data-level="${level}" ${future ? 'style="opacity:.3"' : ""} title="${key}: ${prettyMinutes(value)}分" aria-label="${key}: ${prettyMinutes(value)}分" role="img"></div>`;
  }).join("");
  $("#streak-copy").textContent =
    `1日1分以上の集中で、来店日として数えます。最長 ${streak.best}日。間が空いても、手に入れた場面は残ります。`;
  $("#badges").innerHTML = [
    [1, "はじめの一杯"],
    [3, "いつもの席"],
    [7, "一週間の常連"],
    [14, "雨の日も晴れの日も"],
  ]
    .map(
      ([n, name]) =>
        `<span class="badge ${streak.best >= n ? "earned" : ""}">${streak.best >= n ? "✓ " : ""}${name} · ${n}日</span>`,
    )
    .join("");
}
function download(name, content, type) {
  const a = document.createElement("a"),
    url = URL.createObjectURL(new Blob([content], { type }));
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
$("#scene-image").addEventListener("load", () => {
  $("#image-fallback").hidden = true;
  $("#scene-image").hidden = false;
});
$("#scene-image").addEventListener("error", () => {
  $("#image-fallback").hidden = false;
  $("#image-fallback small").textContent =
    "画像を読み込めませんでした。タイマーはそのまま使えます。";
  $("#scene-image").hidden = true;
});
document.addEventListener("click", (event) => {
  const b = event.target.closest("button");
  if (!b) return;
  if (b.dataset.view) go(b.dataset.view);
  if (b.dataset.close) $("#" + b.dataset.close).close();
  if (b.dataset.mode)
    act((s) => {
      if (s.timer.mode === b.dataset.mode) return;
      changeMode(s, b.dataset.mode);
      announce("ここまでの集中時間は記録に残っています。");
    });
  if (b.dataset.scene)
    act((s) => {
      selectScene(s, b.dataset.scene);
      go("cafe");
    });
  if (b.dataset.preview) preview(b.dataset.preview);
});
$("#toggle-timer").addEventListener("click", () => {
  sound.unlock().catch(() => {});
  act((s) => (s.timer.status === "running" ? pause(s) : start(s)));
});
$("#finish-timer").addEventListener("click", () =>
  act((s) => {
    finish(s);
    announce("ここまでの集中を記録しました。おつかれさまでした。");
  }),
);
$("#settings-open").addEventListener("click", showSettings);
$("#timer-settings").addEventListener("click", showSettings);
$("#settings-form").addEventListener("submit", (event) => {
  event.preventDefault();
  if (!event.target.reportValidity()) return;
  const form = event.target;
  const config = {};
  for (const key of ["focus", "short", "long", "rounds"])
    config[key] = Number(form.elements[key].value);
  for (const key of ["auto", "chime"]) config[key] = form.elements[key].checked;
  act((s) => configure(s, config)).then((result) => {
    if (result === false) return;
    $("#settings-dialog").close();
    announce(
      memoryOnly
        ? "このページ内で設定を変更しました。記録の保存は利用できません。"
        : "設定を保存しました。",
    );
  });
});
$("#notification-button").addEventListener("click", async () => {
  try {
    await Notification.requestPermission();
    notificationStatus();
  } catch {
    announce(
      "通知の許可を取得できませんでした。ブラウザの設定をご確認ください。",
    );
  }
});
$("#fullscreen").addEventListener("click", async () => {
  const el = $("#scene-viewport");
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else if (el.requestFullscreen) await el.requestFullscreen();
    else preview(state.selectedScene);
  } catch {
    preview(state.selectedScene);
  }
});
function preview(id) {
  const scene = SCENES.find((s) => s.id === id);
  if (!scene) return;
  let dialog = $("#preview-dialog");
  if (!dialog) {
    dialog = document.createElement("dialog");
    dialog.id = "preview-dialog";
    dialog.className = "image-dialog";
    dialog.innerHTML =
      '<div class="dialog-heading"><h2></h2><button class="icon-button" data-close="preview-dialog" aria-label="画像を閉じる">×</button></div><img><p>静止画プレビュー</p>';
    document.body.append(dialog);
  }
  dialog.querySelector("h2").textContent = scene.name + " / " + scene.person;
  const img = dialog.querySelector("img");
  img.src = `assets/${id}.png`;
  img.alt = scene.description;
  dialog.showModal();
}
$("#export-data").addEventListener("click", async () => {
  if (!readOnly) await act();
  let content = JSON.stringify(state, null, 2);
  if (readOnly)
    try {
      content = localStorage.getItem(KEY) || content;
    } catch {}
  download(
    `cafe-pomodoro-${dayKey(Date.now())}.json`,
    content,
    "application/json",
  );
  announce("記録のバックアップを保存しました。");
});
$("#feedback-open").addEventListener("click", () =>
  $("#feedback-dialog").showModal(),
);
$("#save-feedback").addEventListener("click", () => {
  const content = $("#feedback-text").value.trim();
  if (!content) {
    announce("メモを入力してください。");
    return;
  }
  download(
    `cafe-feedback-${dayKey(Date.now())}.txt`,
    `Cafe Pomodoro 試作版\n${new Date().toLocaleString("ja-JP")}\n\n${content}`,
    "text/plain;charset=utf-8",
  );
  $("#feedback-dialog").close();
  announce("メモを保存しました。制作者に渡してください。");
});
async function toggleSound(kind) {
  try {
    const enabled = await sound.toggle(kind);
    const b = $("#" + kind + "-toggle");
    b.setAttribute("aria-pressed", String(enabled));
    b.querySelector("small").textContent = enabled ? "ON" : "OFF";
  } catch {
    announce("音を再生できませんでした。もう一度お試しください。");
  }
}
$("#rain-toggle").addEventListener("click", () => toggleSound("rain"));
$("#music-toggle").addEventListener("click", () => toggleSound("music"));
$("#volume").addEventListener("input", (e) =>
  sound.volume(Number(e.target.value)),
);
$("#volume").addEventListener("change", (e) =>
  act((s) => (s.settings.volume = Number(e.target.value))),
);
window.addEventListener("storage", (e) => {
  if (e.key === KEY) {
    state = load();
    sound.volume(state.settings.volume);
    $("#volume").value = state.settings.volume;
    render();
  }
});
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) act();
});
state = load();
sound.volume(state.settings.volume);
$("#volume").value = state.settings.volume;
render();
setInterval(() => {
  if (!readOnly) act();
}, 1000);
act();
// Optional imperative WebMCP interface; unsupported browsers need no polyfill.
const context = document.modelContext;
if (context?.registerTool) {
  const lifecycle = new AbortController();
  window.addEventListener("pagehide", () => lifecycle.abort(), { once: true });
  for (const tool of [
    {
      name: "read_focus_state",
      title: "集中タイマーの状態",
      description: "現在のタイマー、累計集中時間、解放済み場面を読み取る。",
      inputSchema: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
      annotations: { readOnlyHint: true },
      execute: () => ({
        mode: state.timer.mode,
        status: state.timer.status,
        remainingSeconds: Math.ceil(state.timer.remainingMs / 1000),
        totalMinutes: Math.floor(totalTime(state) / MINUTE),
        scenes: unlockedScenes(state).map((s) => s.id),
      }),
    },
    {
      name: "set_focus_timer_state",
      title: "タイマーを操作",
      description:
        "表示中のタイマーを開始、一時停止、またはここまでを記録して終了する。",
      inputSchema: {
        type: "object",
        properties: {
          action: { type: "string", enum: ["start", "pause", "finish"] },
        },
        required: ["action"],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false },
      execute: async (input) => {
        if (
          !input ||
          Object.keys(input).some((k) => k !== "action") ||
          !["start", "pause", "finish"].includes(input.action)
        )
          throw new Error("action must be start, pause, or finish");
        await transact((s) => ({ start, pause, finish })[input.action](s));
        return { status: state.timer.status, mode: state.timer.mode };
      },
    },
  ]) {
    try {
      Promise.resolve(
        context.registerTool(tool, { signal: lifecycle.signal }),
      ).catch(() => {});
    } catch {}
  }
}
