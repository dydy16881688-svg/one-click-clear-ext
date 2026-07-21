// 解析 Google Authenticator「导出账户」QR
// QR 内容有两种：
//   1) otpauth-migration://offline?data=<base64 protobuf>   —— 批量（多账户）
//   2) otpauth://totp/<label>?secret=...&issuer=...          —— 单个账户
// 输出统一为 [{ label, secret(base32), totp: true/false }]

// ---- base32 编码（把原始密钥字节转成 totp.js 需要的 base32）----
function bytesToBase32(bytes) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "", out = "";
  for (const b of bytes) bits += b.toString(2).padStart(8, "0");
  for (let i = 0; i + 5 <= bits.length; i += 5) out += alphabet[parseInt(bits.substr(i, 5), 2)];
  const rem = bits.length % 5;
  if (rem) out += alphabet[parseInt(bits.substr(bits.length - rem).padEnd(5, "0"), 2)];
  return out;
}

// ---- 极简 protobuf 解析 ----
function readVarint(bytes, pos) {
  let result = 0n, shift = 0n;
  while (true) {
    const b = bytes[pos.i++];
    result |= BigInt(b & 0x7f) << shift;
    if ((b & 0x80) === 0) break;
    shift += 7n;
  }
  return result;
}

function parseFields(bytes, start, end) {
  const fields = {}; // fieldNumber -> [values]
  const pos = { i: start };
  while (pos.i < end) {
    const tag = Number(readVarint(bytes, pos));
    const fieldNum = tag >> 3;
    const wireType = tag & 7;
    let value;
    if (wireType === 0) {
      value = readVarint(bytes, pos); // BigInt
    } else if (wireType === 2) {
      const len = Number(readVarint(bytes, pos));
      value = bytes.slice(pos.i, pos.i + len);
      pos.i += len;
    } else if (wireType === 5) {
      value = bytes.slice(pos.i, pos.i + 4); pos.i += 4;
    } else if (wireType === 1) {
      value = bytes.slice(pos.i, pos.i + 8); pos.i += 8;
    } else {
      throw new Error("不支持的 protobuf wire type: " + wireType);
    }
    (fields[fieldNum] = fields[fieldNum] || []).push(value);
  }
  return fields;
}

// otpauth-migration:// → 多账户
function parseMigrationUri(uri) {
  const u = new URL(uri);
  const dataParam = u.searchParams.get("data"); // URLSearchParams 已解百分号
  if (!dataParam) throw new Error("QR 里没有 data 字段");
  const binary = atob(dataParam);
  const dataBytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));

  const root = parseFields(dataBytes, 0, dataBytes.length);
  const otps = root[1] || []; // field 1 = otp_parameters（repeated）
  return otps.map((buf) => {
    const f = parseFields(buf, 0, buf.length);
    const secretBytes = f[1] ? f[1][0] : new Uint8Array();
    const name = f[2] ? new TextDecoder().decode(f[2][0]) : "";
    const issuer = f[3] ? new TextDecoder().decode(f[3][0]) : "";
    const type = f[6] ? Number(f[6][0]) : 2; // 2 = TOTP
    return {
      label: issuer ? `${issuer} (${name})` : name || "未命名",
      secret: bytesToBase32(secretBytes),
      totp: type === 2,
    };
  });
}

// otpauth://totp/... → 单账户
function parseSingleUri(uri) {
  const u = new URL(uri);
  const secret = (u.searchParams.get("secret") || "").replace(/\s/g, "");
  const label = decodeURIComponent(u.pathname.replace(/^\/+/, "")) || "未命名";
  const issuer = u.searchParams.get("issuer");
  return [{
    label: issuer ? `${issuer} (${label})` : label,
    secret,
    totp: u.host.toLowerCase() === "totp",
  }];
}

// 统一入口：给任意 QR 原文，返回账户数组
function parseOtpUri(raw) {
  const s = raw.trim();
  if (s.startsWith("otpauth-migration://")) return parseMigrationUri(s);
  if (s.startsWith("otpauth://")) return parseSingleUri(s);
  throw new Error("不是 Google Authenticator 的 QR（应以 otpauth:// 开头）");
}

// 把 bitmap 以指定宽度画到 canvas 取像素
function bitmapToImageData(bitmap, targetWidth) {
  const scale = targetWidth / bitmap.width;
  const cw = Math.max(1, Math.round(bitmap.width * scale));
  const ch = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = cw;
  canvas.height = ch;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(bitmap, 0, 0, cw, ch);
  return ctx.getImageData(0, 0, cw, ch);
}

// 从图片（文件或粘贴的 Blob）解码出 QR 原文（jsQR，纯 JS，不依赖浏览器支持）
// 多尺寸重试：原图 + 放大/缩小若干档，提高对压缩、尺寸的容忍
async function decodeQrFromFile(blob) {
  const bitmap = await createImageBitmap(blob);
  const W = bitmap.width;

  const widths = [...new Set([W, 2400, 2000, 1600, 1280, 1024, 800, 640])]
    .filter((w) => w >= 300 && w <= 3000);

  for (const w of widths) {
    const img = bitmapToImageData(bitmap, w);
    const result = jsQR(img.data, img.width, img.height, {
      inversionAttempts: "attemptBoth",
    });
    if (result && result.data) return [result.data];
  }

  throw new Error(
    "图片里没找到 QR 码。多半是传输时被压缩了——请用「传文件 / 原图」方式把截图传到电脑，别用微信/Telegram 的图片(压缩)发送"
  );
}
