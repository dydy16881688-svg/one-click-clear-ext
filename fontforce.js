// 强制所有网站正文字型（可选 微软正黑体 / Comic Sans MS）
// 技巧：用 *:not(图标选择器)，不去碰图标元素，保住 Font Awesome / Material Icons 等图标字型

const STYLE_ID = "__force_font_style__";

const FONT_STACKS = {
  jhenghei: `"Microsoft JhengHei", "微軟正黑體", "Microsoft JhengHei UI", "PingFang TC", sans-serif`,
  comic: `"Comic Sans MS", "Comic Sans", "Chalkboard SE", cursive`,
};

function buildCSS(fontKey) {
  const stack = FONT_STACKS[fontKey] || FONT_STACKS.jhenghei;
  return `
*:not(.fa):not(.fas):not(.far):not(.fab):not(.fal):not(.fad)
 :not([class^="fa-"]):not([class*=" fa-"])
 :not(.material-icons):not(.material-icons-outlined):not(.material-icons-round):not(.material-icons-sharp)
 :not([class*="material-symbols"])
 :not(.glyphicon):not([class^="glyphicon-"])
 :not([class*="icon"]):not([class*="Icon"])
 :not(.iconfont):not(mat-icon):not(i) {
  font-family: ${stack} !important;
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
