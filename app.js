const API_BASE = "https://sjnsxrsqitceunvkljoj.supabase.co/functions/v1/admin-api";
const GITHUB_ACTIONS_URL = "https://github.com/tatsuya7869/daily-stock-information/actions";

const loginScreen = document.getElementById("loginScreen");
const loginForm = document.getElementById("loginForm");
const passwordInput = document.getElementById("passwordInput");
const loginError = document.getElementById("loginError");
const appRoot = document.getElementById("appRoot");

const runBtns = document.querySelectorAll(".run-btn[data-action]");
const refreshBtns = document.querySelectorAll(".refresh-btn[data-target]");
const runStatus = document.getElementById("runStatus");
const ghActionsLink = document.getElementById("ghActionsLink");
ghActionsLink.href = GITHUB_ACTIONS_URL;

const articlesTableBody = document.querySelector("#articlesTable tbody");
const scriptsTableBody = document.querySelector("#scriptsTable tbody");
const episodesTableBody = document.querySelector("#episodesTable tbody");

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function formatDateTime(iso) {
  return new Date(iso).toLocaleString("ja-JP");
}

function setButtonsDisabled(disabled) {
  runBtns.forEach((btn) => {
    btn.disabled = disabled;
  });
}

async function loadArticles() {
  const res = await fetch(`${API_BASE}/articles`, { credentials: "include" });
  const items = await res.json();
  articlesTableBody.innerHTML = "";
  for (const item of items) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${formatDateTime(item.createdAt)}</td>
      <td>${item.articleCount ?? "-"}</td>
      <td>${formatBytes(item.sizeBytes)}</td>
      <td class="path-cell">${item.articlesFile}</td>
    `;
    articlesTableBody.appendChild(tr);
  }
}

async function loadScripts() {
  const res = await fetch(`${API_BASE}/scripts`, { credentials: "include" });
  const items = await res.json();
  scriptsTableBody.innerHTML = "";
  for (const item of items) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${formatDateTime(item.createdAt)}</td>
      <td>${item.mode ?? "-"}</td>
      <td>${item.articleCount ?? "-"}</td>
      <td>${item.lineCount ?? "-"}</td>
      <td>${formatBytes(item.sizeBytes)}</td>
      <td class="path-cell">${item.scriptFile}</td>
    `;
    scriptsTableBody.appendChild(tr);
  }
}

async function loadEpisodes() {
  const res = await fetch(`${API_BASE}/episodes`, { credentials: "include" });
  const items = await res.json();
  episodesTableBody.innerHTML = "";
  for (const item of items) {
    const tr = document.createElement("tr");
    const player = item.audioUrl
      ? `<audio controls src="${item.audioUrl}"></audio>`
      : "再生URLの発行に失敗しました";
    tr.innerHTML = `
      <td>${formatDateTime(item.createdAt)}</td>
      <td>${formatBytes(item.sizeBytes)}</td>
      <td>${player}</td>
      <td class="path-cell">${item.audioFile}</td>
    `;
    episodesTableBody.appendChild(tr);
  }
}

function loadAllLists() {
  loadArticles();
  loadScripts();
  loadEpisodes();
}

runBtns.forEach((btn) => {
  btn.addEventListener("click", async () => {
    const action = btn.dataset.action;
    setButtonsDisabled(true);
    runStatus.textContent = "依頼中...";

    let res;
    try {
      res = await fetch(`${API_BASE}/${action}`, { method: "POST", credentials: "include" });
    } catch (err) {
      runStatus.textContent = `接続できませんでした（${err.message}）`;
      setButtonsDisabled(false);
      return;
    }

    setButtonsDisabled(false);

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      runStatus.textContent = `実行依頼に失敗しました: ${body.error ?? res.status}`;
      return;
    }

    const body = await res.json();
    runStatus.textContent = body.message ?? "実行を依頼しました。";
  });
});

refreshBtns.forEach((btn) => {
  btn.addEventListener("click", () => {
    const target = btn.dataset.target;
    if (target === "articles") loadArticles();
    if (target === "scripts") loadScripts();
    if (target === "episodes") loadEpisodes();
  });
});

// --- ログイン ---

function showApp() {
  loginScreen.hidden = true;
  appRoot.hidden = false;
  loadAllLists();
}

function showLogin() {
  appRoot.hidden = true;
  loginScreen.hidden = false;
  passwordInput.focus();
}

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  loginError.hidden = true;

  let res;
  try {
    res = await fetch(`${API_BASE}/login`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: passwordInput.value }),
    });
  } catch (err) {
    loginError.textContent = `サーバーに接続できません（${err.message}）`;
    loginError.hidden = false;
    return;
  }

  if (!res.ok) {
    loginError.textContent = "パスワードが違います";
    loginError.hidden = false;
    passwordInput.value = "";
    return;
  }

  showApp();
});

(async function checkSession() {
  try {
    const res = await fetch(`${API_BASE}/session`, { credentials: "include" });
    if (res.ok) {
      showApp();
      return;
    }
  } catch {
    // 未接続時はログイン画面のまま
  }
  showLogin();
})();
