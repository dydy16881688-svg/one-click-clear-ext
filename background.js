// 后台：清痕迹 + 打开网址并自动填入帐密

// 记录「哪个新分页要填哪组帐密」
const pendingFills = {}; // tabId -> { username, password }

// ===== 动态工具栏图标：宝宝蓝底 + 自定义符号 =====
const DEFAULT_ICON_SYMBOL = "📖";

async function updateActionIcon(symbol) {
  const sym = (symbol && symbol.trim()) || DEFAULT_ICON_SYMBOL;
  const sizes = [16, 32, 48, 128];
  const imageData = {};
  for (const s of sizes) {
    const canvas = new OffscreenCanvas(s, s);
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, s, s);
    const r = Math.round(s * 0.24);
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(0, 0, s, s, r);
    else ctx.rect(0, 0, s, s);
    ctx.fillStyle = "#7fb9df"; // 纯宝宝蓝
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `${Math.round(s * 0.62)}px "Segoe UI Emoji","Segoe UI",sans-serif`;
    ctx.fillText(sym, s / 2, s / 2 + Math.round(s * 0.06));
    imageData[s] = ctx.getImageData(0, 0, s, s);
  }
  try { await chrome.action.setIcon({ imageData }); } catch (e) {}
}

// 启动时套用；符号变更时即时更新
chrome.storage.local.get("iconSymbol", ({ iconSymbol }) => updateActionIcon(iconSymbol));
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.iconSymbol) updateActionIcon(changes.iconSymbol.newValue);
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  // ===== 清痕迹 =====
  if (msg.type === "CLEAR") {
    const dataToRemove = {};
    for (const [key, on] of Object.entries(msg.dataToRemove)) {
      if (on) dataToRemove[key] = true;
    }

    const doClear = () => {
      chrome.browsingData.remove({ since: 0 }, dataToRemove, () => {
        if (chrome.runtime.lastError) {
          sendResponse({ ok: false, error: chrome.runtime.lastError.message });
        } else {
          sendResponse({ ok: true });
        }
      });
    };

    // 要登出 Google 且会清 cookie：先打开官方登出网址（趁 cookie 还在，服务器端也登出），再清
    if (msg.logoutGoogle && dataToRemove.cookies) {
      try {
        chrome.tabs.create({ url: "https://accounts.google.com/Logout", active: false });
      } catch (e) {}
      setTimeout(doClear, 1800);
    } else {
      doClear();
    }
    return true; // 异步
  }

  // ===== 打开网址（可带帐密）=====
  if (msg.type === "OPEN_URLS") {
    openUrls(msg.items || []);
    sendResponse({ ok: true });
    return true;
  }
});

async function openUrls(items) {
  // items: [{ url, username, password }]
  for (const it of items) {
    if (!it.url) continue;
    try {
      const tab = await chrome.tabs.create({ url: it.url });
      if (it.username || it.password) {
        pendingFills[tab.id] = { username: it.username || "", password: it.password || "" };
      }
    } catch (e) {
      // 单个网址失败不影响其他
    }
  }
}

// 分页加载完成 → 注入填写脚本
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status !== "complete") return;
  const cred = pendingFills[tabId];
  if (!cred) return;
  delete pendingFills[tabId]; // 只填一次

  chrome.scripting
    .executeScript({
      target: { tabId },
      func: fillCredentials,
      args: [cred.username, cred.password],
    })
    .catch(() => {});
});

// 注入到目标页面执行：找到帐号/密码框并填入
// 会轮询几秒，兼容动态渲染的登录框
function fillCredentials(username, password) {
  let tries = 0;
  const timer = setInterval(() => {
    tries++;

    const setVal = (el, v) => {
      if (!el || !v) return false;
      // 用原生 setter + 派发事件，兼容 React/Vue 等框架
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
      setter.call(el, v);
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
      return true;
    };

    const pw = document.querySelector('input[type="password"]');
    const user = document.querySelector(
      'input[type="email"], input[autocomplete="username"], input[name*="user" i], input[name*="email" i], input[name*="account" i], input[id*="user" i], input[id*="email" i], input[type="text"]:not([type="hidden"])'
    );

    if (user) setVal(user, username);
    if (pw) setVal(pw, password);

    // 密码框出现了，或试了 ~6 秒，就停
    if (pw || tries >= 20) clearInterval(timer);
  }, 300);
}
