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

// ===== 启动：打开网址 + 自动填帐密 =====
let ALL_ITEMS = []; // [{url, category, username, password}]

async function loadLaunch() {
  const { urls = [], creds = [] } = await chrome.storage.local.get(["urls", "creds"]);
  const credMap = Object.fromEntries(creds.map((c) => [c.id, c]));

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

  // 按分类分组，渲染每类一个「打开」按钮
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
loadLaunch();

function openItems(items) {
  if (!items || !items.length) {
    chrome.runtime.openOptionsPage();
    return;
  }
  chrome.runtime.sendMessage({ type: "OPEN_URLS", items });
}

document.getElementById("openAll").addEventListener("click", () => openItems(ALL_ITEMS));

// ===== 强制字型开关 =====
const forceFontEl = document.getElementById("forceFont");
chrome.storage.local.get("forceFont", ({ forceFont }) => {
  forceFontEl.checked = forceFont !== false; // 默认开
});
forceFontEl.addEventListener("change", () => {
  chrome.storage.local.set({ forceFont: forceFontEl.checked });
});

// ===== 验证器：显示动态码 + 复制 =====
let otpTimer = null;

async function renderOTP() {
  const { totp = [] } = await chrome.storage.local.get("totp");
  const list = document.getElementById("otpList");

  if (!totp.length) {
    list.innerHTML = '<div class="empty">还没加验证器<br>点下面「管理验证器」添加</div>';
    return;
  }

  const left = totpSecondsLeft();
  const rows = await Promise.all(
    totp.map(async (item) => {
      let code = "------";
      try {
        code = await generateTOTP(item.secret);
        code = code.slice(0, 3) + " " + code.slice(3); // 分组好读
      } catch (e) {
        code = "密钥错误";
      }
      return { label: item.label, code };
    })
  );

  list.innerHTML = rows
    .map(
      (r, i) => `
      <div class="otp-item">
        <div class="otp-left">
          <span class="otp-label">${escapeHtml(r.label)}</span>
          <span class="otp-code">${r.code}</span>
        </div>
        <div class="otp-right">
          <span class="ring">${left}s</span>
          <button class="copy" data-i="${i}">复制</button>
        </div>
      </div>`
    )
    .join("");

  list.querySelectorAll(".copy").forEach((btn) => {
    btn.addEventListener("click", () => {
      const raw = rows[btn.dataset.i].code.replace(/\s/g, "");
      navigator.clipboard.writeText(raw).then(() => {
        btn.textContent = "已复制✓";
        setTimeout(() => (btn.textContent = "复制"), 1200);
      });
    });
  });
}

// 进入验证器分页时启动每秒刷新
document.querySelector('[data-tab="otp"]').addEventListener("click", () => {
  renderOTP();
  if (!otpTimer) otpTimer = setInterval(renderOTP, 1000);
});

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// ===== 清理 =====
const statusEl = document.getElementById("status");
document.getElementById("run").addEventListener("click", () => {
  const dataToRemove = {
    cookies: document.getElementById("cookies").checked,
    history: document.getElementById("history").checked,
    cache: document.getElementById("cache").checked,
    downloads: document.getElementById("downloads").checked,
  };
  if (!Object.values(dataToRemove).some(Boolean)) {
    statusEl.style.color = "#d33";
    statusEl.textContent = "请至少勾选一项";
    return;
  }
  statusEl.style.color = "#666";
  statusEl.textContent = "执行中…";
  chrome.runtime.sendMessage({ type: "CLEAR", dataToRemove }, (resp) => {
    if (chrome.runtime.lastError) {
      statusEl.style.color = "#d33";
      statusEl.textContent = "出错：" + chrome.runtime.lastError.message;
      return;
    }
    statusEl.style.color = "#2e7d32";
    statusEl.textContent = resp && resp.ok ? "✅ 完成" : "❌ 失败";
  });
});
