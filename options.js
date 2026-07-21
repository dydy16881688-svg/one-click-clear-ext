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

// 密码输入框（带 👁 显示/隐藏）
function pwField(id, ph, width) {
  return `<span class="pw-wrap" style="width:${width}px;">
    <input type="password" id="${id}" placeholder="${ph}" style="width:100%; padding-right:34px;" />
    <button type="button" class="eye" tabindex="-1" title="显示/隐藏密码">👁</button>
  </span>`;
}

// 眼睛按钮：显示/隐藏密码（事件委派，涵盖动态生成的栏位）
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

// ===== 帐密组 =====
function addCredRow(id = uuid(), label = "", username = "", password = "") {
  const row = document.createElement("div");
  row.className = "row cred-row";
  row.dataset.id = id;
  row.innerHTML = `
    <input class="clabel" placeholder="如 默认帐密" value="${escapeAttr(label)}" />
    <input class="cuser" placeholder="帐号" value="${escapeAttr(username)}" />
    <span class="pw-wrap" style="flex:1;">
      <input class="cpass" type="password" placeholder="密码" value="${escapeAttr(password)}" style="width:100%; padding-right:34px;" />
      <button type="button" class="eye" tabindex="-1" title="显示/隐藏密码">👁</button>
    </span>
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

// ===== 渲染各区 =====
function renderCreds(creds) {
  credRowsEl.innerHTML = "";
  if (!creds || creds.length === 0) addCredRow(uuid(), "默认帐密", "", "");
  else creds.forEach((c) => addCredRow(c.id, c.label, c.username, c.password));
}
function renderUrls(urls) {
  urlRowsEl.innerHTML = "";
  const def = defaultCredId();
  const normalized = (urls || []).map((u) =>
    typeof u === "string" ? { name: "", url: u, category: "", credId: def } : u
  );
  if (normalized.length === 0) addUrlRow("", "", "", def);
  else normalized.forEach((u) => addUrlRow(u.name || "", u.category || "", u.url || "", u.credId || ""));
}
function renderOtpList(totp) {
  otpRowsEl.innerHTML = "";
  if (!totp || totp.length === 0) addOtpRow("", "");
  else totp.forEach((t) => addOtpRow(t.label, t.secret));
}

// ===== 收集表单资料 =====
function collectSecrets() {
  const creds = [...credRowsEl.querySelectorAll(".cred-row")]
    .map((r) => ({
      id: r.dataset.id,
      label: r.querySelector(".clabel").value.trim(),
      username: r.querySelector(".cuser").value,
      password: r.querySelector(".cpass").value,
    }))
    .filter((c) => c.label || c.username || c.password);
  const totp = [];
  otpRowsEl.querySelectorAll(".otp-row").forEach((row) => {
    const label = row.querySelector(".lbl").value.trim();
    const secret = row.querySelector(".sec").value.trim().replace(/\s/g, "");
    if (label && secret) totp.push({ label, secret });
  });
  return { creds, totp };
}
function collectUrls() {
  return [...urlRowsEl.querySelectorAll(".url-row")]
    .map((r) => ({
      name: r.querySelector(".uname").value.trim(),
      category: r.querySelector(".ucat").value.trim(),
      url: r.querySelector(".uurl").value.trim(),
      credId: r.querySelector(".ucred").value,
    }))
    .filter((u) => u.url);
}
async function saveNonSecret() {
  const iconSymbol = document.getElementById("iconSymbol").value.trim() || "📖";
  await chrome.storage.sync.set({ urls: collectUrls(), iconSymbol });
}

// ===== 主密码面板 =====
let LOCKED = false;
function mpMsg(t, color) {
  const m = document.getElementById("mpMsg");
  if (m) { m.textContent = t; m.style.color = color || "#666"; }
}
function renderMaster(state) {
  const box = document.getElementById("masterBody");
  if (state === "novault") {
    box.innerHTML = `
      <div class="row" style="flex-wrap:wrap;">
        ${pwField("mpNew", "新主密码(至少4位)", 170)}
        ${pwField("mpNew2", "再输一次", 150)}
        <button id="mpSet" class="ghost">设置主密码</button>
      </div>
      <div id="mpMsg" style="font-size:12px;margin-top:8px;"></div>`;
    document.getElementById("mpSet").addEventListener("click", onSetMaster);
  } else if (state === "locked") {
    box.innerHTML = `
      <div class="row" style="flex-wrap:wrap;">
        ${pwField("mpUnlock", "输入主密码解锁", 200)}
        <button id="mpUnlockBtn" class="ghost">解锁</button>
        <button id="mpReset" class="del" style="border-radius:999px;">忘记 · 重设</button>
      </div>
      <div id="mpMsg" style="font-size:12px;margin-top:8px;"></div>`;
    document.getElementById("mpUnlockBtn").addEventListener("click", onUnlock);
    document.getElementById("mpReset").addEventListener("click", onReset);
  } else {
    box.innerHTML = `
      <div style="font-size:13px;color:#3bb98f;font-weight:700;margin-bottom:8px;">✅ 已解锁（可编辑下方帐密/验证器）</div>
      <div class="row" style="flex-wrap:wrap;">
        ${pwField("mpChg", "修改主密码：新密码", 170)}
        ${pwField("mpChg2", "再输一次", 150)}
        <button id="mpChange" class="ghost">修改主密码</button>
      </div>
      <div id="mpMsg" style="font-size:12px;margin-top:8px;"></div>`;
    document.getElementById("mpChange").addEventListener("click", onChangeMaster);
  }
}

async function onSetMaster() {
  const a = document.getElementById("mpNew").value, b = document.getElementById("mpNew2").value;
  if (a.length < 4) return mpMsg("主密码至少 4 位", "#d33");
  if (a !== b) return mpMsg("两次输入不一致", "#d33");
  const { creds, totp } = collectSecrets();
  await createVault(a, { creds, totp });
  await saveNonSecret();
  mpMsg("✅ 已设置主密码，帐密与验证器已加密", "#2e7d32");
  await load();
}
async function onUnlock() {
  const pw = document.getElementById("mpUnlock").value;
  if (!pw) return mpMsg("请输入主密码", "#d33");
  try { await unlockVault(pw); await load(); }
  catch (e) { mpMsg("主密码错误", "#d33"); }
}
async function onReset() {
  if (!confirm("确定重设主密码？这会清空已存的帐号密码和验证器，无法找回！")) return;
  await resetVault();
  await load();
}
async function onChangeMaster() {
  const a = document.getElementById("mpChg").value, b = document.getElementById("mpChg2").value;
  if (a.length < 4) return mpMsg("新主密码至少 4 位", "#d33");
  if (a !== b) return mpMsg("两次输入不一致", "#d33");
  try { await changeMasterPassword(a); mpMsg("✅ 主密码已修改", "#2e7d32"); }
  catch (e) { mpMsg("修改失败：" + e.message, "#d33"); }
}

// ===== 载入 =====
async function load() {
  const store = await chrome.storage.sync.get(["urls", "iconSymbol", "vault", "creds", "totp"]);
  document.getElementById("iconSymbol").value = store.iconSymbol || "📖";
  buildIconPicks();

  if (store.vault) {
    const key = await getSessionKey();
    if (key) {
      const data = await decryptObj(key, store.vault.iv, store.vault.ct);
      renderCreds(data.creds);
      renderOtpList(data.totp);
      LOCKED = false;
      renderMaster("unlocked");
    } else {
      credRowsEl.innerHTML = '<p class="desc">🔒 已加密，解锁后显示。</p>';
      otpRowsEl.innerHTML = '<p class="desc">🔒 已加密，解锁后显示。</p>';
      LOCKED = true;
      renderMaster("locked");
    }
  } else {
    renderCreds(store.creds);
    renderOtpList(store.totp);
    LOCKED = false;
    renderMaster("novault");
  }

  renderUrls(store.urls); // 放最后，确保帐密下拉已有选项
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
  const saved = document.getElementById("saved");
  const vault = await hasVault();

  if (vault && LOCKED) {
    saved.style.color = "#d33";
    saved.textContent = "请先在上方「主密码」解锁再保存";
    setTimeout(() => (saved.textContent = ""), 3000);
    return;
  }

  const { creds, totp } = collectSecrets();
  await saveNonSecret();

  if (vault) {
    await saveVault({ creds, totp }); // 加密保存
  } else {
    await chrome.storage.sync.set({ creds, totp }); // 明文（尚未设主密码）
  }

  saved.style.color = "#4a9bc4";
  saved.textContent = `✅ 已保存（${creds.length} 组帐密 / ${collectUrls().length} 网址 / ${totp.length} 验证器）`;
  setTimeout(() => (saved.textContent = ""), 3000);
});

load();
