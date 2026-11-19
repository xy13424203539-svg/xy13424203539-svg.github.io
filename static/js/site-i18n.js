/* 全站模板文案中文化 + 去除 Hugo Blox 品牌残留。
   主题模块文案硬编码在编译产物里，这里在运行时把可见英文替换为中文，
   并移除页脚的品牌链接行。不改动业务逻辑。 */
(function () {
  if (window.__chenlabI18n) return;
  window.__chenlabI18n = true;

  var MAP = {
    "Open Menu": "打开菜单",
    "Close Menu": "关闭菜单",
    "All Results": "全部结果",
    "Searching...": "搜索中…",
    "No results found": "未找到相关内容",
    "Clear search": "清空搜索",
    "Navigate": "上下移动",
    "Select": "打开",
    "Questions": "问答",
    "FAQ": "常见问题",
    "Documentation": "文档",
    "Untitled": "未命名",
    "Powered by Hugo Blox": "",
    "Search term 1": "",
    "Search term 2": ""
  };

  function translateText(node) {
    var t = node.nodeValue;
    if (t == null) return;
    var v = t.trim();
    if (!v) return;
    if (MAP[v] !== undefined) {
      node.nodeValue = t.replace(v, MAP[v]);
      return;
    }
    var m;
    if ((m = v.match(/^Finding results for "(.*)"$/))) {
      node.nodeValue = "正在查找 “" + m[1] + "”";
    } else if ((m = v.match(/^No results for "(.*)"$/))) {
      node.nodeValue = "未找到 “" + m[1] + "” 相关内容";
    } else if ((m = v.match(/^(\d+)\s+filters$/))) {
      node.nodeValue = m[1] + " 个筛选";
    }
  }

  function walk(root) {
    if (!root || !root.querySelectorAll) return;
    var els = root.querySelectorAll("*");
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      ["title", "aria-label"].forEach(function (a) {
        var v = el.getAttribute(a);
        if (v && MAP[v.trim()] !== undefined) el.setAttribute(a, MAP[v.trim()]);
      });
      if (el.placeholder === "Search for answers...") el.placeholder = "搜索文档…";
      var kids = el.childNodes;
      for (var j = 0; j < kids.length; j++) {
        if (kids[j].nodeType === 3) translateText(kids[j]);
      }
    }
  }

  function removeBrand() {
    document.querySelectorAll("[data-hbx=poweredby_brand],[data-hbx=poweredby_cta]").forEach(function (a) {
      var p = a.closest("p.powered-by");
      if (p) p.remove(); else a.remove();
    });
    document.querySelectorAll('a[href*="hugoblox.com"]').forEach(function (a) {
      var p = a.closest("p.powered-by");
      if (p) p.remove(); else a.remove();
    });
  }

  function run() {
    walk(document.body);
    removeBrand();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", run);
  } else {
    run();
  }

  var mo = new MutationObserver(function (ms) {
    ms.forEach(function (m) {
      if (m.type === "characterData") {
        translateText(m.target);
      } else {
        m.addedNodes.forEach(function (n) {
          if (n.nodeType === 1) walk(n);
        });
      }
    });
  });
  mo.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
})();
