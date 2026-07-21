// 主密码加密保险库：PBKDF2 派生金钥 + AES-GCM 加密 {creds, totp}
// 加密后的资料存 chrome.storage.sync 的 "vault"；解锁金钥暂存 chrome.storage.session（关浏览器即清）

function b64e(bytes) {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}
function b64d(str) {
  const s = atob(str);
  const a = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) a[i] = s.charCodeAt(i);
  return a;
}

async function deriveKey(password, saltBytes) {
  const base = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveKey"]
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: saltBytes, iterations: 200000, hash: "SHA-256" },
    base,
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"]
  );
}

async function encryptObj(key, obj) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv }, key, new TextEncoder().encode(JSON.stringify(obj))
  );
  return { iv: b64e(iv), ct: b64e(new Uint8Array(ct)) };
}
async function decryptObj(key, iv, ct) {
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: b64d(iv) }, key, b64d(ct));
  return JSON.parse(new TextDecoder().decode(pt));
}

async function exportKeyB64(key) {
  return b64e(new Uint8Array(await crypto.subtle.exportKey("raw", key)));
}
async function importKeyB64(b64) {
  return crypto.subtle.importKey("raw", b64d(b64), { name: "AES-GCM" }, true, ["encrypt", "decrypt"]);
}

// ===== session 金钥缓存（解锁后暂存记忆体，关浏览器自动清）=====
async function getSessionKey() {
  const { vaultKey } = await chrome.storage.session.get("vaultKey");
  return vaultKey ? importKeyB64(vaultKey) : null;
}
async function setSessionKey(key) {
  await chrome.storage.session.set({ vaultKey: await exportKeyB64(key) });
}
async function clearSessionKey() {
  await chrome.storage.session.remove("vaultKey");
}

// ===== 高层 API =====
async function hasVault() {
  const { vault } = await chrome.storage.sync.get("vault");
  return !!vault;
}

// 用主密码解锁，返回 {key, data:{creds,totp}}；密码错会 throw
async function unlockVault(password) {
  const { vault } = await chrome.storage.sync.get("vault");
  if (!vault) throw new Error("尚未设置主密码");
  const key = await deriveKey(password, b64d(vault.salt));
  const data = await decryptObj(key, vault.iv, vault.ct); // 密码错 → GCM 校验失败 throw
  await setSessionKey(key);
  return { key, data };
}

// 首次设置主密码：把现有明文 {creds,totp} 加密进 vault，并删掉明文
async function createVault(password, data) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await deriveKey(password, salt);
  const enc = await encryptObj(key, data);
  await chrome.storage.sync.set({ vault: { salt: b64e(salt), iv: enc.iv, ct: enc.ct } });
  await chrome.storage.sync.remove(["creds", "totp"]); // 移除明文
  await setSessionKey(key);
  return key;
}

// 已解锁状态下重新加密保存 {creds,totp}
async function saveVault(data) {
  const key = await getSessionKey();
  if (!key) throw new Error("未解锁");
  const { vault } = await chrome.storage.sync.get("vault");
  const enc = await encryptObj(key, data);
  await chrome.storage.sync.set({ vault: { salt: vault.salt, iv: enc.iv, ct: enc.ct } });
}

// 修改主密码（需已解锁）：用旧金钥解出资料，再用新密码重建
async function changeMasterPassword(newPassword) {
  const key = await getSessionKey();
  if (!key) throw new Error("请先解锁");
  const { vault } = await chrome.storage.sync.get("vault");
  const data = await decryptObj(key, vault.iv, vault.ct);
  return createVault(newPassword, data);
}

// 忘记主密码：清空保险库（帐密/验证器会一起没）
async function resetVault() {
  await chrome.storage.sync.remove(["vault", "creds", "totp"]);
  await clearSessionKey();
}
