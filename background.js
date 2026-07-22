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

// 一次性搬迁：旧版设定存在本机(local)，改用 Google 同步(sync)后把旧资料搬过去
async function migrateLocalToSync() {
  const keys = ["creds", "urls", "totp", "iconSymbol", "forceFont"];
  const sync = await chrome.storage.sync.get(keys);
  if (keys.some((k) => sync[k] !== undefined)) return; // sync 已有资料，不搬
  const local = await chrome.storage.local.get(keys);
  const hasLocal = keys.some((k) => local[k] !== undefined);
  if (hasLocal) {
    try { await chrome.storage.sync.set(local); } catch (e) {}
  }
}

// 启动时：先搬迁，再套用图标；符号变更时即时更新
(async () => {
  await migrateLocalToSync();
  const { iconSymbol } = await chrome.storage.sync.get("iconSymbol");
  updateActionIcon(iconSymbol);
})();
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "sync" && changes.iconSymbol) updateActionIcon(changes.iconSymbol.newValue);
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
          return;
        }
        sendResponse({ ok: true }); // 先回应，再处理分页/视窗（关视窗会连 popup 一起关）
        if (msg.afterClear && msg.afterClear.indexOf("close") === 0) closeToSingle();
        else if (msg.afterClear === "reload") reloadAllTabs();
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

const GROUP_COLORS = ["blue", "cyan", "green", "yellow", "orange", "pink", "purple", "red", "grey"];

// 重载当前设定档「所有视窗」的 http(s) 分页，让各窗立即反映登出状态
function reloadAllTabs() {
  chrome.tabs.query({}, (tabs) => {
    for (const t of tabs) {
      if (t.url && /^https?:/i.test(t.url)) {
        try { chrome.tabs.reload(t.id); } catch (e) {}
      }
    }
  });
}

// 只留一个空白视窗，关掉其他所有视窗（留一页让你手动登出设定档）
function closeToSingle() {
  chrome.windows.getAll({}, (wins) => {
    chrome.windows.create({ url: "chrome://newtab" }, () => {
      for (const w of wins) {
        try { chrome.windows.remove(w.id); } catch (e) {}
      }
    });
  });
}

async function openUrls(items) {
  // items: [{ url, category, username, password }]
  // 依分类分组，每类的分页建立一个 Chrome 分页群组
  const byCat = {};
  const order = [];
  for (const it of items) {
    if (!it.url) continue;
    const cat = it.category || "未分类";
    if (!byCat[cat]) { byCat[cat] = []; order.push(cat); }
    byCat[cat].push(it);
  }

  let ci = 0;
  for (const cat of order) {
    const tabIds = [];
    for (const it of byCat[cat]) {
      try {
        const tab = await chrome.tabs.create({ url: it.url });
        if (it.username || it.password) {
          pendingFills[tab.id] = { username: it.username || "", password: it.password || "" };
        }
        tabIds.push(tab.id);
      } catch (e) {
        // 单个网址失败不影响其他
      }
    }
    // 建立分页群组并命名/上色
    if (tabIds.length) {
      try {
        const groupId = await chrome.tabs.group({ tabIds });
        await chrome.tabGroups.update(groupId, {
          title: cat,
          color: GROUP_COLORS[ci % GROUP_COLORS.length],
        });
      } catch (e) {
        // 不支持分页群组时忽略，分页照样开
      }
    }
    ci++;
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
