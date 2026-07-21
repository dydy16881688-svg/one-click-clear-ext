// 强制所有网站正文字型为「微软正黑体」
// 技巧：用 *:not(图标选择器)，不去碰图标元素，保住 Font Awesome / Material Icons 等图标字型

const STYLE_ID = "__force_jhenghei_style__";

// 正文强制正黑体；排除常见「图标字型」的元素，让它们保留原字型
const CSS = `
*:not(.fa):not(.fas):not(.far):not(.fab):not(.fal):not(.fad)
 :not([class^="fa-"]):not([class*=" fa-"])
 :not(.material-icons):not(.material-icons-outlined):not(.material-icons-round):not(.material-icons-sharp)
 :not([class*="material-symbols"])
 :not(.glyphicon):not([class^="glyphicon-"])
 :not([class*="icon"]):not([class*="Icon"])
 :not(.iconfont):not(mat-icon):not(i) {
  font-family: "Microsoft JhengHei", "微軟正黑體", "Microsoft JhengHei UI", "PingFang TC", sans-serif !important;
}
`;

function apply(on) {
  const existing = document.getElementById(STYLE_ID);
  if (on) {
    if (!existing) {
      const el = document.createElement("style");
      el.id = STYLE_ID;
      el.textContent = CSS;
      (document.head || document.documentElement).appendChild(el);
    }
  } else if (existing) {
    existing.remove();
  }
}

// 先乐观注入（默认开），减少字型闪烁
apply(true);

// 再读设置校正（默认 = 开；只有明确存 false 才关）
chrome.storage.sync.get("forceFont", ({ forceFont }) => {
  apply(forceFont !== false);
});

// 开关变动时实时生效
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "sync" && changes.forceFont) {
    apply(changes.forceFont.newValue !== false);
  }
});
