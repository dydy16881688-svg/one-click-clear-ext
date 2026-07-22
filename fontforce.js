// 强制所有网站正文字型（可选 微软正黑体 / Comic Sans MS）
// 技巧：用 *:not(图标选择器)，不去碰图标元素，保住 Font Awesome / Material Icons 等图标字型

const STYLE_ID = "__force_font_style__";

// emoji / 符號字體：用 @font-face + unicode-range，只把「emoji/符號碼位」交給 emoji 字體，
// 且排在字體堆疊「最前面」。因為 unicode-range 限定範圍，正文的中英文/數字不在這些碼位，
// 照樣走正黑體 / Comic Sans；只有 emoji/符號碼位才優先用 emoji 字體。
// 關鍵：放最前面 → 即使正黑體對某些 emoji 帶「空白字形」，也擋不住 fallback（比放後面保險）。
const EMOJI_FAMILY = "__ForceEmoji__";
const EMOJI_FACE = `
@font-face {
  font-family: "${EMOJI_FAMILY}";
  src: local("Segoe UI Emoji"), local("Segoe UI Symbol"), local("Apple Color Emoji"), local("Noto Color Emoji"), local("Noto Emoji"), local("Twemoji Mozilla");
  unicode-range:
    U+203C, U+2049, U+2122, U+2139, U+2194-2199, U+21A9-21AA,
    U+231A-231B, U+2328, U+23CF, U+23E9-23F3, U+23F8-23FA, U+24C2,
    U+25AA-25AB, U+25B6, U+25C0, U+25FB-25FE, U+2600-26FF, U+2700-27BF,
    U+2934-2935, U+2B00-2BFF, U+3030, U+303D, U+3297, U+3299,
    U+FE00-FE0F, U+20E3, U+1F000-1FAFF;
}
`;

const FONT_STACKS = {
  jhenghei: `"Microsoft JhengHei", "微軟正黑體", "Microsoft JhengHei UI", "PingFang TC", sans-serif`,
  comic: `"Comic Sans MS", "Comic Sans", "Chalkboard SE", cursive`,
};

function buildCSS(fontKey) {
  const stack = FONT_STACKS[fontKey] || FONT_STACKS.jhenghei;
  return EMOJI_FACE + `
*:not(.fa):not(.fas):not(.far):not(.fab):not(.fal):not(.fad)
 :not([class^="fa-"]):not([class*=" fa-"])
 :not(.material-icons):not(.material-icons-outlined):not(.material-icons-round):not(.material-icons-sharp)
 :not([class*="material-symbols"])
 :not(.glyphicon):not([class^="glyphicon-"])
 :not([class*="icon"]):not([class*="Icon"])
 :not(.iconfont):not(mat-icon):not(i) {
  font-family: "${EMOJI_FAMILY}", ${stack} !important;
}
`;
}

function apply(on, fontKey) {
  const existing = document.getElementById(STYLE_ID);
  if (on) {
    const css = buildCSS(fontKey);
    if (existing) {
      existing.textContent = css;
    } else {
      const el = document.createElement("style");
      el.id = STYLE_ID;
      el.textContent = css;
      (document.head || document.documentElement).appendChild(el);
    }
  } else if (existing) {
    existing.remove();
  }
}

// 先乐观注入（默认开、正黑体），减少字型闪烁
apply(true, "jhenghei");

// 再读设置校正
chrome.storage.sync.get(["forceFont", "fontFamily"], ({ forceFont, fontFamily }) => {
  apply(forceFont !== false, fontFamily || "jhenghei");
});

// 开关或字体变动时实时生效
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "sync") return;
  if (changes.forceFont || changes.fontFamily) {
    chrome.storage.sync.get(["forceFont", "fontFamily"], ({ forceFont, fontFamily }) => {
      apply(forceFont !== false, fontFamily || "jhenghei");
    });
  }
});
