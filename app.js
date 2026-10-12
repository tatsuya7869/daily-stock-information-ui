const API_BASE = "https://sjnsxrsqitceunvkljoj.supabase.co/functions/v1/admin-api";
const GITHUB_ACTIONS_URL = "https://github.com/tatsuya7869/daily-stock-information/actions";
const TOKEN_STORAGE_KEY = "adminToken";

// 認証はCookieではなく Authorization: Bearer ヘッダー + localStorage のトークンで行う。
// UI(GitHub Pages)とAPI(Supabase)がドメインの異なる「クロスサイト」構成のため、
// クロスサイトCookieをブラウザ側でブロックされると（一部モバイルブラウザのデフォルト動作）
// Cookie方式では認証が機能しなくなる問題があった。ヘッダー方式はこの制限を受けない。

function getToken() {
  try {
    return localStorage.getItem(TOKEN_STORAGE_KEY);
  } catch {
    return null;
  }
}

function setToken(token) {
  try {
    localStorage.setItem(TOKEN_STORAGE_KEY, token);
  } catch {
    // localStorageが使えない環境ではログイン状態を保持できないが、動作は継続する
  }
}

function clearToken() {
  try {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
  } catch {
    // 何もしない
  }
}

function authHeaders() {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

const loginScreen = document.getElementById("loginScreen");
const loginForm = document.getElementById("loginForm");
const loginBtn = document.getElementById("loginBtn");
const passwordInput = document.getElementById("passwordInput");
const loginError = document.getElementById("loginError");
const appRoot = document.getElementById("appRoot");

const runBtns = document.querySelectorAll(".run-btn[data-action]");
const runStatus = document.getElementById("runStatus");
const runStatusDot = document.getElementById("runStatusDot");
const ghActionsLink = document.getElementById("ghActionsLink");
ghActionsLink.href = GITHUB_ACTIONS_URL;

const speedControl = document.getElementById("speedControl");
const speedBtns = document.querySelectorAll(".speed-btn[data-rate]");
const refreshBtn = document.getElementById("refreshBtn");
const tabBtns = document.querySelectorAll(".tab-btn[data-tab]");
const showMoreBtn = document.getElementById("showMoreBtn");
const listMessage = document.getElementById("listMessage");
const listEls = {
  audio: document.getElementById("list-audio"),
  script: document.getElementById("list-script"),
  article: document.getElementById("list-article"),
};

// ---------- 表示用の整形 ----------

// 一覧が増えるほど画面が煩雑になるため、既定では直近N件だけ表示し、
// 「もっと見る」を押したときだけ全件表示する（古い記録もGitHub Releaseに
// アーカイブ済みなので、普段の操作では直近分だけ見えれば十分という判断）。
const LIST_PREVIEW_COUNT = 10;

// 内部のモード名を、画面上は役回りの組み合わせで表示する
const MODE_LABELS = {
  cautious_optimistic: "慎重派 × 楽観派",
  main_questioner: "解説 × 質問",
};

const WHEN_FORMAT = new Intl.DateTimeFormat("ja-JP", {
  timeZone: "Asia/Tokyo",
  month: "numeric",
  day: "numeric",
  weekday: "short",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

function formatWhen(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "-";
  const p = Object.fromEntries(WHEN_FORMAT.formatToParts(date).map((x) => [x.type, x.value]));
  return `${p.month}/${p.day}（${p.weekday}）${p.hour}:${p.minute}`;
}

function formatBytes(bytes) {
  if (typeof bytes !== "number") return "-";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return "--:--";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

// バックエンド由来の文字列(ファイル名等)をinnerHTMLへ直接埋め込まず、
// textContent経由でDOMに設定する（将来的に外部由来の文字列を表示するようになった場合の
// クロスサイトスクリプティング対策。現状のファイル名は自システムが生成したものだが念のため）。
function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

// ---------- 実行依頼 ----------

function setButtonsDisabled(disabled) {
  runBtns.forEach((btn) => {
    btn.disabled = disabled;
  });
}

function setRunStatus(state, text) {
  runStatus.textContent = text;
  runStatusDot.dataset.state = state;
}

runBtns.forEach((btn) => {
  btn.addEventListener("click", async () => {
    const action = btn.dataset.action;

    // LINE送信は、配信先へ実際にメッセージが届く操作のため、押し間違いに備えて確認を挟む
    if (action === "run/line" && !window.confirm("直近の音声を、配信先に実際にLINEで送信します。よろしいですか？")) {
      return;
    }

    setButtonsDisabled(true);
    setRunStatus("pending", "依頼中...");

    let res;
    try {
      res = await fetch(`${API_BASE}/${action}`, { method: "POST", headers: authHeaders() });
    } catch (err) {
      setRunStatus("error", `接続できませんでした（${err.message}）`);
      setButtonsDisabled(false);
      return;
    }

    setButtonsDisabled(false);

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setRunStatus("error", `実行依頼に失敗しました: ${body.error ?? res.status}`);
      return;
    }

    const body = await res.json();
    setRunStatus("ok", body.message ?? "実行を依頼しました。");
  });
});

// ---------- 音声プレーヤー ----------

const ICON_PLAY = '<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z" fill="#FFFFFF"/></svg>';
const ICON_PAUSE = '<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 5h4v14H7zM13 5h4v14h-4z" fill="#FFFFFF"/></svg>';

const SEEK_STEPS = 1000; // シークバーの分解能（0〜1000）

// 再生速度。画面で1つだけ選び、すべての音声に適用する。選んだ値は端末に記憶する。
const ALLOWED_RATES = [1, 1.25, 1.5, 1.75, 2];
const RATE_STORAGE_KEY = "playbackRate";

function loadRate() {
  try {
    const saved = Number(localStorage.getItem(RATE_STORAGE_KEY));
    return ALLOWED_RATES.includes(saved) ? saved : 1;
  } catch {
    return 1;
  }
}

let playbackRate = loadRate();

function applyRate(audio) {
  // defaultPlaybackRateも設定する。load()し直したとき（長さの再取得時など）に、速度が1倍へ戻るのを防ぐ
  audio.defaultPlaybackRate = playbackRate;
  audio.playbackRate = playbackRate;
  // 速くしても声が高くならないよう、音程を保つ（ブラウザごとの名称の違いに対応）
  audio.preservesPitch = true;
  audio.mozPreservesPitch = true;
  audio.webkitPreservesPitch = true;
}

function updateSpeedUi() {
  speedBtns.forEach((btn) => {
    const selected = Number(btn.dataset.rate) === playbackRate;
    btn.classList.toggle("is-active", selected);
    btn.setAttribute("aria-pressed", String(selected));
  });
}

function setRate(rate) {
  if (!ALLOWED_RATES.includes(rate)) return;
  playbackRate = rate;
  try {
    localStorage.setItem(RATE_STORAGE_KEY, String(rate));
  } catch {
    // 保存できない環境でも、この画面を開いている間は選んだ速度が有効
  }
  audioElements.forEach(applyRate); // 再生中の音声にも、すぐ反映する
  updateSpeedUi();
}

speedBtns.forEach((btn) => btn.addEventListener("click", () => setRate(Number(btn.dataset.rate))));
updateSpeedUi();

let currentAudio = null; // 再生中の音声（同時に1つだけ再生する）
let audioElements = []; // 一覧の再描画時に、読み込み中の音声を解放するための記録

function pauseCurrentAudio() {
  if (currentAudio) {
    currentAudio.pause();
    currentAudio = null;
  }
}

function releaseAudioElements() {
  pauseCurrentAudio();
  for (const audio of audioElements) {
    audio.removeAttribute("src");
    audio.load(); // 読み込み途中のダウンロードを止める
  }
  audioElements = [];
}

function buildAudioCard(item) {
  const li = el("li", "item-card audio-card");
  li.title = item.audioFile ?? "";

  const head = el("div", "item-head");
  const info = el("div", "item-info");
  info.append(el("span", "item-when", formatWhen(item.createdAt)), el("span", "item-size", formatBytes(item.sizeBytes)));
  head.append(info);
  li.append(head);

  if (!item.audioUrl) {
    li.append(el("p", "item-error", "再生用のURLを発行できませんでした。「一覧を更新」を押してください。"));
    return li;
  }

  const audio = new Audio();
  audio.preload = "metadata";
  audio.src = item.audioUrl;
  applyRate(audio);
  audioElements.push(audio);

  const playBtn = el("button", "play-btn");
  playBtn.type = "button";
  playBtn.setAttribute("aria-label", "再生");
  playBtn.innerHTML = ICON_PLAY;
  head.append(playBtn);

  const seek = document.createElement("input");
  seek.type = "range";
  seek.className = "seek";
  seek.min = "0";
  seek.max = String(SEEK_STEPS);
  seek.step = "1";
  seek.value = "0";
  seek.setAttribute("aria-label", "再生位置");
  li.append(seek);

  const currentLabel = el("span", null, "0:00");
  const durationLabel = el("span", null, "--:--");
  const timeRow = el("div", "time-row");
  timeRow.append(currentLabel, durationLabel);
  li.append(timeRow);

  let seeking = false;
  let pendingSeek = null; // 長さ（メタデータ）が未取得のうちに操作された位置（0〜1）

  function hasDuration() {
    return Number.isFinite(audio.duration) && audio.duration > 0;
  }

  function showPosition(fraction) {
    seek.value = String(Math.round(fraction * SEEK_STEPS));
    currentLabel.textContent = formatTime(fraction * audio.duration);
  }

  function setPlayingUi(playing) {
    playBtn.innerHTML = playing ? ICON_PAUSE : ICON_PLAY;
    playBtn.setAttribute("aria-label", playing ? "一時停止" : "再生");
  }

  playBtn.addEventListener("click", () => {
    if (audio.paused) {
      // 再生に失敗（URLの期限切れ等）した場合は、エラーイベント側で案内を出す
      audio.play().catch(() => {});
    } else {
      audio.pause();
    }
  });

  audio.addEventListener("play", () => {
    if (currentAudio && currentAudio !== audio) currentAudio.pause();
    currentAudio = audio;
    setPlayingUi(true);
  });
  audio.addEventListener("pause", () => {
    if (currentAudio === audio) currentAudio = null;
    setPlayingUi(false);
  });
  audio.addEventListener("ended", () => {
    audio.currentTime = 0;
    showPosition(0);
    setPlayingUi(false);
  });
  audio.addEventListener("loadedmetadata", () => {
    durationLabel.textContent = formatTime(audio.duration);
    if (pendingSeek != null && hasDuration()) {
      audio.currentTime = pendingSeek * audio.duration;
      showPosition(pendingSeek);
      pendingSeek = null;
    }
  });
  audio.addEventListener("timeupdate", () => {
    if (!seeking && hasDuration()) showPosition(audio.currentTime / audio.duration);
  });
  audio.addEventListener("error", () => {
    setPlayingUi(false);
    if (!li.querySelector(".item-error")) {
      li.append(el("p", "item-error", "再生できませんでした。URLの有効期限が切れた可能性があります。「一覧を更新」を押してください。"));
    }
  });

  seek.addEventListener("input", () => {
    seeking = true;
    const fraction = Number(seek.value) / SEEK_STEPS;
    if (hasDuration()) {
      currentLabel.textContent = formatTime(fraction * audio.duration);
    } else {
      // 一部のモバイルブラウザは、操作されるまで長さを読み込まない。位置を覚えておき、読み込み後に反映する
      pendingSeek = fraction;
      audio.load();
    }
  });
  seek.addEventListener("change", () => {
    seeking = false;
    if (hasDuration()) audio.currentTime = (Number(seek.value) / SEEK_STEPS) * audio.duration;
  });

  return li;
}

// ---------- 一覧（音声・原稿・記事） ----------

function buildScriptCard(item) {
  const li = el("li", "item-card");
  li.title = item.scriptFile ?? "";
  const head = el("div", "item-head");
  const info = el("div", "item-info");
  info.append(el("span", "item-when", formatWhen(item.createdAt)), el("span", "item-size", formatBytes(item.sizeBytes)));
  head.append(info);

  const chips = el("div", "chips");
  chips.append(el("span", "chip chip-accent", MODE_LABELS[item.mode] ?? item.mode ?? "-"));
  chips.append(el("span", "chip", `記事 ${item.articleCount ?? "-"}件`));
  chips.append(el("span", "chip", `発話 ${item.lineCount ?? "-"}`));
  li.append(head, chips);
  return li;
}

function buildArticleCard(item) {
  const li = el("li", "item-card");
  li.title = item.articlesFile ?? "";
  const head = el("div", "item-head");
  const info = el("div", "item-info");
  info.append(el("span", "item-when", formatWhen(item.createdAt)), el("span", "item-size", formatBytes(item.sizeBytes)));
  head.append(info);

  const chips = el("div", "chips");
  chips.append(el("span", "chip", `記事 ${item.articleCount ?? "-"}件`));
  li.append(head, chips);
  return li;
}

const CARD_BUILDERS = { audio: buildAudioCard, script: buildScriptCard, article: buildArticleCard };
const ENDPOINTS = { audio: "episodes", script: "scripts", article: "articles" };
const EMPTY_MESSAGES = {
  audio: "生成済みの音声はまだありません。",
  script: "生成済みの原稿はまだありません。",
  article: "収集済みの記事はまだありません。",
};

// kind -> { items: 全件, expanded: 全件表示中か, loaded: 取得済みか, error: 取得失敗の内容 }
const listState = {
  audio: { items: [], expanded: false, loaded: false, error: null },
  script: { items: [], expanded: false, loaded: false, error: null },
  article: { items: [], expanded: false, loaded: false, error: null },
};
let activeTab = "audio";

function updateListChrome() {
  const state = listState[activeTab];

  if (state.error) {
    listMessage.textContent = state.error;
    listMessage.classList.add("is-error");
    listMessage.hidden = false;
  } else if (state.loaded && state.items.length === 0) {
    listMessage.textContent = EMPTY_MESSAGES[activeTab];
    listMessage.classList.remove("is-error");
    listMessage.hidden = false;
  } else {
    listMessage.hidden = true;
  }

  if (state.items.length <= LIST_PREVIEW_COUNT) {
    showMoreBtn.hidden = true;
  } else {
    showMoreBtn.hidden = false;
    showMoreBtn.textContent = state.expanded
      ? "表示を減らす"
      : `もっと見る（全${state.items.length}件中${LIST_PREVIEW_COUNT}件を表示中）`;
  }
}

function renderList(kind) {
  const state = listState[kind];
  if (kind === "audio") releaseAudioElements();
  const items = state.expanded ? state.items : state.items.slice(0, LIST_PREVIEW_COUNT);
  listEls[kind].replaceChildren(...items.map((item) => CARD_BUILDERS[kind](item)));
  if (kind === activeTab) updateListChrome();
}

async function loadList(kind) {
  const state = listState[kind];
  try {
    const res = await fetch(`${API_BASE}/${ENDPOINTS[kind]}`, { headers: authHeaders() });
    if (res.status === 401) {
      // トークンの期限切れ・パスワード変更など。再ログインを促す
      clearToken();
      showLogin();
      return;
    }
    const data = await res.json();
    if (!res.ok || !Array.isArray(data)) {
      throw new Error(data?.error ?? `HTTP ${res.status}`);
    }
    state.items = data;
    state.error = null;
  } catch (err) {
    state.error = `一覧を取得できませんでした（${err.message}）`;
  }
  state.loaded = true;
  state.expanded = false;
  renderList(kind);
}

let loadingLists = false;
async function loadAllLists() {
  if (loadingLists) return;
  loadingLists = true;
  refreshBtn.disabled = true;
  try {
    await Promise.all(Object.keys(listState).map((kind) => loadList(kind)));
  } finally {
    loadingLists = false;
    refreshBtn.disabled = false;
  }
}

function selectTab(kind) {
  if (kind === activeTab) return;
  pauseCurrentAudio(); // 別のタブへ移るときは、再生中の音声を止める
  activeTab = kind;
  tabBtns.forEach((btn) => {
    const selected = btn.dataset.tab === kind;
    btn.classList.toggle("is-active", selected);
    btn.setAttribute("aria-pressed", String(selected));
  });
  for (const [k, ul] of Object.entries(listEls)) ul.hidden = k !== kind;
  speedControl.hidden = kind !== "audio";
  updateListChrome();
}

tabBtns.forEach((btn) => btn.addEventListener("click", () => selectTab(btn.dataset.tab)));
refreshBtn.addEventListener("click", loadAllLists);
showMoreBtn.addEventListener("click", () => {
  const state = listState[activeTab];
  state.expanded = !state.expanded;
  renderList(activeTab);
});

// ---------- ログイン ----------

function showApp() {
  loginScreen.hidden = true;
  appRoot.hidden = false;
  loadAllLists();
}

function showLogin() {
  releaseAudioElements();
  appRoot.hidden = true;
  loginScreen.hidden = false;
  passwordInput.focus();
}

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  loginError.hidden = true;
  loginBtn.disabled = true; // 連打による誤ロックを防ぐ

  let res;
  try {
    res = await fetch(`${API_BASE}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: passwordInput.value }),
    });
  } catch (err) {
    loginError.textContent = `サーバーに接続できません（${err.message}）`;
    loginError.hidden = false;
    loginBtn.disabled = false;
    return;
  }
  loginBtn.disabled = false;

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    loginError.textContent = body.error ?? "パスワードが違います";
    loginError.hidden = false;
    passwordInput.value = "";
    return;
  }

  const body = await res.json();
  setToken(body.token);
  passwordInput.value = "";
  showApp();
});

(async function checkSession() {
  if (!getToken()) {
    showLogin();
    return;
  }
  try {
    const res = await fetch(`${API_BASE}/session`, { headers: authHeaders() });
    if (res.ok) {
      showApp();
      return;
    }
  } catch {
    // 未接続時はログイン画面のまま
  }
  showLogin();
})();
