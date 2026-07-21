// ===== 分页切换 =====
document.querySelectorAll(".tab").forEach((t) => {
  t.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((x) => x.classList.remove("active"));
    document.querySelectorAll(".panel").forEach((x) => x.classList.remove("active"));
    t.classList.add("active");
    document.getElementById("panel-" + t.dataset.tab).classList.add("active");
  });
});

document.getElementById("toOptions1").addEventListener("click", () => chrome.runtime.openOptionsPage());
document.getElementById("toOptions2").addEventListener("click", () => chrome.runtime.openOptionsPage());

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// 眼睛按钮：显示/隐藏密码
document.addEventListener("click", (e) => {
  const btn = e.target.closest && e.target.closest(".eye");
  if (!btn) return;
  const wrap = btn.closest(".pw-wrap");
  const input = wrap && wrap.querySelector("input");
  if (!input) return;
  const show = input.type === "password";
  input.type = show ? "text" : "password";
  btn.textContent = show ? "🙈" : "👁";
});

// ===== 解锁 / 主密码 =====
let SECRETS = { creds: [], totp: [] }; // 解密后的帐密与验证器

async function loadSecrets() {
  if (await hasVault()) {
    const key = await getSessionKey();
    if (!key) return false; // 上锁中
    const { vault } = await chrome.storage.sync.get("vault");
    SECRETS = await decryptObj(key, vault.iv, vault.ct);
    return true;
  }
  const { creds = [], totp = [] } = await chrome.storage.sync.get(["creds", "totp"]);
  SECRETS = { creds, totp };
  return true;
}

function showLock() {
  document.getElementById("lockScreen").style.display = "block";
  document.getElementById("appWrap").style.display = "none";
  setTimeout(() => document.getElementById("unlockPw").focus(), 50);
}

async function showApp() {
  document.getElementById("lockScreen").style.display = "none";
  document.getElementById("appWrap").style.display = "block";
  document.getElementById("lockNow").style.display = (await hasVault()) ? "inline" : "none";
  await loadLaunch();
}

async function init() {
  if (await hasVault()) {
    const key = await getSessionKey();
    if (key) { await loadSecrets(); await showApp(); }
    else showLock();
  } else {
    await loadSecrets(); // 明文模式
    await showApp();
  }
}

document.getElementById("unlockBtn").addEventListener("click", doUnlock);
document.getElementById("unlockPw").addEventListener("keydown", (e) => { if (e.key === "Enter") doUnlock(); });

async function doUnlock() {
  const pw = document.getElementById("unlockPw").value;
  const msg = document.getElementById("unlockMsg");
  if (!pw) { msg.textContent = "请输入主密码"; return; }
  msg.textContent = "解锁中…";
  msg.style.color = "#666";
  try {
    const { data } = await unlockVault(pw);
    SECRETS = data;
    document.getElementById("unlockPw").value = "";
    msg.textContent = "";
    msg.style.color = "#d33";
    await showApp();
  } catch (e) {
    msg.style.color = "#d33";
    msg.textContent = "主密码错误";
  }
}

document.getElementById("lockNow").addEventListener("click", async () => {
  await clearSessionKey();
  SECRETS = { creds: [], totp: [] };
  if (otpTimer) { clearInterval(otpTimer); otpTimer = null; }
  showLock();
});

// ===== 强制字型开关 =====
const forceFontEl = document.getElementById("forceFont");
chrome.storage.sync.get("forceFont", ({ forceFont }) => {
  forceFontEl.checked = forceFont !== false; // 默认开
});
forceFontEl.addEventListener("change", () => {
  chrome.storage.sync.set({ forceFont: forceFontEl.checked });
});

// ===== 启动：打开网址 + 自动填帐密 =====
let ALL_ITEMS = []; // [{url, category, username, password}]

async function loadLaunch() {
  const { urls = [] } = await chrome.storage.sync.get("urls");
  const credMap = Object.fromEntries((SECRETS.creds || []).map((c) => [c.id, c]));

  ALL_ITEMS = urls
    .map((u) => (typeof u === "string" ? { url: u, category: "", credId: "" } : u))
    .filter((u) => u.url)
    .map((u) => {
      const c = credMap[u.credId];
      return {
        url: u.url,
        category: u.category || "未分类",
        username: c ? c.username || "" : "",
        password: c ? c.password || "" : "",
      };
    });

  document.getElementById("urlCount").textContent = ALL_ITEMS.length
    ? `共 ${ALL_ITEMS.length} 个网址`
    : "还没设网址，点下面「设置网址 / 帐密」";

  const cats = {};
  ALL_ITEMS.forEach((it) => (cats[it.category] = cats[it.category] || []).push(it));
  const catsEl = document.getElementById("cats");
  const names = Object.keys(cats);
  catsEl.innerHTML =
    names.length > 1
      ? names
          .map(
            (name, i) => `
      <div class="cat-row">
        <span><span class="cat-name">${escapeHtml(name)}</span>
        <span class="cat-count">(${cats[name].length})</span></span>
        <button class="sec" data-cat="${i}">打开本类</button>
      </div>`
          )
          .join("")
      : "";

  catsEl.querySelectorAll(".sec").forEach((btn) => {
    const name = names[btn.dataset.cat];
    btn.addEventListener("click", () => openItems(cats[name]));
  });
}

function openItems(items) {
  if (!items || !items.length) {
    chrome.runtime.openOptionsPage();
    return;
  }
  chrome.runtime.sendMessage({ type: "OPEN_URLS", items });
}

document.getElementById("openAll").addEventListener("click", () => openItems(ALL_ITEMS));

// ===== 验证器：白卡片 + 圆环倒数，点卡片复制 =====
let otpTimer = null;
let lastLeft = 0;

const WARN_AT = 5;
function codeColor(left) {
  return left <= WARN_AT ? "#eb4d4d" : "#2f7cf6";
}
function ringStyle(left) {
  const deg = (left / 30) * 360;
  return `background:conic-gradient(${codeColor(left)} ${deg}deg, #ececec 0)`;
}

async function paintCodes() {
  const list = document.getElementById("otpList");
  const totp = SECRETS.totp || [];
  if (!totp.length) {
    list.innerHTML = '<div class="empty">还没加验证器<br>点下面「管理验证器」添加</div>';
    return;
  }
  const left = totpSecondsLeft();
  const rows = await Promise.all(
    totp.map(async (item) => {
      let raw = "", code = "------";
      try {
        raw = await generateTOTP(item.secret);
        code = raw.slice(0, 3) + " " + raw.slice(3);
      } catch (e) {
        code = "密钥错误";
      }
      return { label: item.label, code, raw };
    })
  );

  list.innerHTML = rows
    .map(
      (r, i) => `
      <div class="otp-item" data-i="${i}">
        <div class="otp-left">
          <span class="otp-label">${escapeHtml(r.label)}</span>
          <span class="otp-code" style="color:${codeColor(left)}">${r.code}</span>
        </div>
        <div class="otp-ring" style="${ringStyle(left)}">
          <span class="otp-ring-inner">${left}</span>
        </div>
      </div>`
    )
    .join("");

  list.querySelectorAll(".otp-item").forEach((el) => {
    el.addEventListener("click", () => {
      const raw = rows[el.dataset.i].raw;
      if (!raw) return;
      navigator.clipboard.writeText(raw).then(() => {
        const codeEl = el.querySelector(".otp-code");
        const old = codeEl.textContent;
        codeEl.dataset.copied = "1";
        codeEl.textContent = "已复制 ✓";
        codeEl.style.color = "#2e7d32";
        setTimeout(() => {
          delete codeEl.dataset.copied;
          codeEl.textContent = old;
          codeEl.style.color = codeColor(totpSecondsLeft());
        }, 900);
      });
    });
  });
}

function tickOTP() {
  const left = totpSecondsLeft();
  const col = codeColor(left);
  document.querySelectorAll(".otp-item").forEach((el) => {
    const ring = el.querySelector(".otp-ring");
    if (ring) {
      ring.style.cssText = ringStyle(left);
      const inner = ring.querySelector(".otp-ring-inner");
      if (inner) inner.textContent = left;
    }
    const codeEl = el.querySelector(".otp-code");
    if (codeEl && !codeEl.dataset.copied) codeEl.style.color = col;
  });
  if (left > lastLeft) paintCodes();
  lastLeft = left;
}

document.querySelector('[data-tab="otp"]').addEventListener("click", () => {
  paintCodes();
  lastLeft = totpSecondsLeft();
  if (!otpTimer) otpTimer = setInterval(tickOTP, 1000);
});

// ===== 清理 =====
const statusEl = document.getElementById("status");
document.getElementById("run").addEventListener("click", () => {
  const dataToRemove = {
    cookies: document.getElementById("cookies").checked,
    history: document.getElementById("history").checked,
    cache: document.getElementById("cache").checked,
    downloads: document.getElementById("downloads").checked,
  };
  if (document.getElementById("wipeProfile").checked) {
    Object.assign(dataToRemove, {
      cookies: true, history: true, cache: true, downloads: true,
      passwords: true, formData: true, localStorage: true, indexedDB: true,
      serviceWorkers: true, cacheStorage: true, fileSystems: true, webSQL: true,
    });
  }
  if (!Object.values(dataToRemove).some(Boolean)) {
    statusEl.style.color = "#d33";
    statusEl.textContent = "请至少勾选一项";
    return;
  }
  const logoutGoogle = document.getElementById("logoutGoogle").checked;

  statusEl.style.color = "#666";
  statusEl.textContent = "执行中…";
  chrome.runtime.sendMessage({ type: "CLEAR", dataToRemove, logoutGoogle }, (resp) => {
    if (chrome.runtime.lastError) {
      statusEl.style.color = "#d33";
      statusEl.textContent = "出错：" + chrome.runtime.lastError.message;
      return;
    }
    statusEl.style.color = "#2e7d32";
    statusEl.textContent = resp && resp.ok ? "✅ 完成" : "❌ 失败";
  });
});

// 启动
init();
