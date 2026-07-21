const credRowsEl = document.getElementById("credRows");
const urlRowsEl = document.getElementById("urlRows");
const otpRowsEl = document.getElementById("otpRows");
const importMsg = document.getElementById("importMsg");

function uuid() {
  return crypto.randomUUID ? crypto.randomUUID() : "id-" + Date.now() + "-" + performance.now();
}
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function escapeAttr(s) {
  return String(s).replace(/"/g, "&quot;");
}

// ===== 帐密组 =====
function addCredRow(id = uuid(), label = "", username = "", password = "") {
  const row = document.createElement("div");
  row.className = "row cred-row";
  row.dataset.id = id;
  row.innerHTML = `
    <input class="clabel" placeholder="如 默认帐密" value="${escapeAttr(label)}" />
    <input class="cuser" placeholder="帐号" value="${escapeAttr(username)}" />
    <input class="cpass" type="password" placeholder="密码" value="${escapeAttr(password)}" />
    <button class="del" title="删除">🗑️</button>
  `;
  row.querySelector(".del").addEventListener("click", () => {
    row.remove();
    refreshCredSelects();
  });
  row.querySelector(".clabel").addEventListener("input", refreshCredSelects);
  credRowsEl.appendChild(row);
  refreshCredSelects();
}

function currentCreds() {
  return [...credRowsEl.querySelectorAll(".cred-row")].map((r) => ({
    id: r.dataset.id,
    label: r.querySelector(".clabel").value.trim() || "(未命名帐密)",
  }));
}

// 每个网址的「帐密下拉」跟着帐密组变化刷新
function refreshCredSelects() {
  const creds = currentCreds();
  urlRowsEl.querySelectorAll(".ucred").forEach((sel) => {
    const cur = sel.value;
    sel.innerHTML =
      '<option value="">不填账号密码</option>' +
      creds.map((c) => `<option value="${escapeAttr(c.id)}">${escapeHtml(c.label)}</option>`).join("");
    if ([...sel.options].some((o) => o.value === cur)) sel.value = cur;
  });
}

document.getElementById("addCred").addEventListener("click", () => addCredRow());

// ===== 网址 =====
function addUrlRow(name = "", category = "", url = "", credId = "") {
  const row = document.createElement("div");
  row.className = "row url-row";
  row.innerHTML = `
    <input class="uname" placeholder="名称，如 派单后台" value="${escapeAttr(name)}" />
    <input class="ucat" placeholder="分类" value="${escapeAttr(category)}" />
    <input class="uurl" placeholder="https://..." value="${escapeAttr(url)}" />
    <select class="ucred"></select>
    <button class="del" title="删除">🗑️</button>
  `;
  row.querySelector(".del").addEventListener("click", () => row.remove());
  urlRowsEl.appendChild(row);
  refreshCredSelects(); // 建立下拉选项
  // 设定选中值（refreshCredSelects 会保留 cur，但初始需手动设）
  const sel = row.querySelector(".ucred");
  if ([...sel.options].some((o) => o.value === credId)) sel.value = credId;
}

document.getElementById("addUrl").addEventListener("click", () => addUrlRow("", "", "", defaultCredId()));

function defaultCredId() {
  const creds = currentCreds();
  return creds.length ? creds[0].id : "";
}

// ===== 验证器行 =====
function addOtpRow(label = "", secret = "") {
  const row = document.createElement("div");
  row.className = "row otp-row";
  row.innerHTML = `
    <input class="lbl" style="width:180px" placeholder="名字，如 Google" value="${escapeAttr(label)}" />
    <input class="sec" style="flex:1" placeholder="密钥 base32" value="${escapeAttr(secret)}" />
    <button class="del" title="删除">🗑️</button>
  `;
  row.querySelector(".del").addEventListener("click", () => row.remove());
  otpRowsEl.appendChild(row);
  return row;
}
function clearEmptyOtpRows() {
  otpRowsEl.querySelectorAll(".otp-row").forEach((row) => {
    if (!row.querySelector(".lbl").value.trim() && !row.querySelector(".sec").value.trim()) row.remove();
  });
}
document.getElementById("addOtp").addEventListener("click", () => addOtpRow("", ""));

// ===== 载入 =====
const ICON_PICKS = ["📖", "🔑", "🚀", "⚡", "🐤", "🌐", "⭐", "🛡️", "💼", "🔐", "🧹", "🎯"];
function buildIconPicks() {
  const box = document.getElementById("iconPicks");
  box.innerHTML = ICON_PICKS.map(
    (e) =>
      `<button type="button" class="pick" data-e="${e}" style="font-size:18px;padding:4px 9px;margin:3px;background:#fff;border:1.5px solid #ece3c8;border-radius:10px;cursor:pointer">${e}</button>`
  ).join("");
  box.querySelectorAll(".pick").forEach((b) =>
    b.addEventListener("click", () => {
      document.getElementById("iconSymbol").value = b.dataset.e;
    })
  );
}

async function load() {
  const store = await chrome.storage.sync.get(["creds", "urls", "totp", "iconSymbol"]);
  const creds = store.creds || [];
  const urls = store.urls || [];
  const totp = store.totp || [];

  document.getElementById("iconSymbol").value = store.iconSymbol || "📖";
  buildIconPicks();

  // 帐密组
  credRowsEl.innerHTML = "";
  if (creds.length === 0) addCredRow(uuid(), "默认帐密", "", "");
  else creds.forEach((c) => addCredRow(c.id, c.label, c.username, c.password));

  // 网址（兼容旧版：纯字符串数组）
  urlRowsEl.innerHTML = "";
  const def = defaultCredId();
  const normalized = urls.map((u) =>
    typeof u === "string" ? { name: "", url: u, category: "", credId: def } : u
  );
  if (normalized.length === 0) addUrlRow("", "", "", def);
  else normalized.forEach((u) => addUrlRow(u.name || "", u.category || "", u.url || "", u.credId || ""));

  // 验证器
  otpRowsEl.innerHTML = "";
  if (totp.length === 0) addOtpRow("", "");
  else totp.forEach((t) => addOtpRow(t.label, t.secret));
}

// ===== 导入验证器（粘贴图片 / 文件 / 文字）=====
let pastedBlob = null;
const pasteZone = document.getElementById("pasteZone");
const pastePreview = document.getElementById("pastePreview");
pasteZone.addEventListener("click", () => pasteZone.focus());
window.addEventListener("paste", (e) => {
  const items = (e.clipboardData || {}).items || [];
  for (const it of items) {
    if (it.type && it.type.startsWith("image/")) {
      pastedBlob = it.getAsFile();
      pastePreview.innerHTML = `<span style="color:#2e7d32;">✅ 已粘贴图片，点下面「解析并导入」</span>`;
      importMsg.textContent = "";
      e.preventDefault();
      return;
    }
  }
});

async function doImport(rawList) {
  let accounts = [];
  for (const raw of rawList) accounts = accounts.concat(parseOtpUri(raw));
  const totpAccounts = accounts.filter((a) => a.totp && a.secret);
  const skipped = accounts.length - totpAccounts.length;
  if (!totpAccounts.length) throw new Error("没解析到可用的 TOTP 账户");
  clearEmptyOtpRows();
  totpAccounts.forEach((a) => addOtpRow(a.label, a.secret));
  let msg = `✅ 解析到 ${totpAccounts.length} 个账户，已填入下方列表。`;
  if (skipped) msg += `（跳过 ${skipped} 个非 TOTP）`;
  msg += " 记得点最下面「保存全部」。";
  return msg;
}

document.getElementById("importBtn").addEventListener("click", async () => {
  importMsg.style.color = "#666";
  importMsg.textContent = "解析中…";
  try {
    const file = document.getElementById("qrFile").files[0];
    let rawList = [];
    if (file) rawList = await decodeQrFromFile(file);
    else if (pastedBlob) rawList = await decodeQrFromFile(pastedBlob);
    else throw new Error("请先选一张 QR 图片，或用 Ctrl+V 粘贴 QR 图片");

    const msg = await doImport(rawList);
    importMsg.style.color = "#2e7d32";
    importMsg.textContent = msg;
    document.getElementById("qrFile").value = "";
    pastedBlob = null;
    pastePreview.innerHTML = "";
  } catch (e) {
    importMsg.style.color = "#d33";
    importMsg.textContent = "❌ " + e.message;
  }
});

// ===== 保存 =====
document.getElementById("save").addEventListener("click", async () => {
  const creds = [...credRowsEl.querySelectorAll(".cred-row")]
    .map((r) => ({
      id: r.dataset.id,
      label: r.querySelector(".clabel").value.trim(),
      username: r.querySelector(".cuser").value,
      password: r.querySelector(".cpass").value,
    }))
    .filter((c) => c.label || c.username || c.password);

  const urls = [...urlRowsEl.querySelectorAll(".url-row")]
    .map((r) => ({
      name: r.querySelector(".uname").value.trim(),
      category: r.querySelector(".ucat").value.trim(),
      url: r.querySelector(".uurl").value.trim(),
      credId: r.querySelector(".ucred").value,
    }))
    .filter((u) => u.url);

  const totp = [];
  otpRowsEl.querySelectorAll(".otp-row").forEach((row) => {
    const label = row.querySelector(".lbl").value.trim();
    const secret = row.querySelector(".sec").value.trim().replace(/\s/g, "");
    if (label && secret) totp.push({ label, secret });
  });

  const iconSymbol = document.getElementById("iconSymbol").value.trim() || "📖";

  await chrome.storage.sync.set({ creds, urls, totp, iconSymbol });
  const saved = document.getElementById("saved");
  saved.textContent = `✅ 已保存（${creds.length} 组帐密 / ${urls.length} 网址 / ${totp.length} 验证器）`;
  setTimeout(() => (saved.textContent = ""), 3000);
});

load();
