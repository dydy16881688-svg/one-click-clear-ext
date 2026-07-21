// TOTP (RFC 6238) 生成器 —— 跟 Google Authenticator 算出一样的 6 位动态码
// 用法：const code = await generateTOTP("BASE32SECRET");

function base32ToBytes(base32) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const clean = base32.replace(/=+$/, "").replace(/\s/g, "").toUpperCase();
  let bits = "";
  for (const c of clean) {
    const val = alphabet.indexOf(c);
    if (val === -1) continue; // 忽略非法字符
    bits += val.toString(2).padStart(5, "0");
  }
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(parseInt(bits.substr(i, 8), 2));
  }
  return new Uint8Array(bytes);
}

// 返回当前 30 秒窗口的动态码
async function generateTOTP(secret, digits = 6, period = 30) {
  const keyBytes = base32ToBytes(secret);
  if (keyBytes.length === 0) throw new Error("secret 无效");

  const epoch = Math.floor(Date.now() / 1000);
  const counter = Math.floor(epoch / period);

  // counter 写成 8 字节 big-endian
  const buf = new ArrayBuffer(8);
  const view = new DataView(buf);
  view.setUint32(0, Math.floor(counter / 0x100000000));
  view.setUint32(4, counter >>> 0);

  const cryptoKey = await crypto.subtle.importKey(
    "raw", keyBytes, { name: "HMAC", hash: "SHA-1" }, false, ["sign"]
  );
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", cryptoKey, buf));

  // 动态截断
  const offset = sig[sig.length - 1] & 0x0f;
  const code =
    ((sig[offset] & 0x7f) << 24) |
    ((sig[offset + 1] & 0xff) << 16) |
    ((sig[offset + 2] & 0xff) << 8) |
    (sig[offset + 3] & 0xff);

  return (code % 10 ** digits).toString().padStart(digits, "0");
}

// 当前窗口还剩几秒
function totpSecondsLeft(period = 30) {
  return period - (Math.floor(Date.now() / 1000) % period);
}
