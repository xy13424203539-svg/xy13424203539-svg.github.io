/* 全站模板文案中文化 + 去除 Hugo Blox 品牌残留。
   主题模块文案硬编码在编译产物里，这里在运行时把可见英文替换为中文，
   并移除页脚的品牌链接行。不改动业务逻辑。
   性能：初始静态文案只遍历一次；观察器按帧节流，新增元素只处理其子树，
   文本节点改动只处理被改的节点本身，避免动态重绘时反复全量遍历。 */
(function () {
  if (window.__chenlabI18n) return;
  window.__chenlabI18n = true;

  /* 过渡兼容：未登录先按访客进入，不自动弹登录框，只在右下角留入口按钮 */
  try { if (!localStorage.getItem("chenlab_member")) localStorage.setItem("chenlab_guest", "1"); } catch (e) {}

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
    "Team": "成员",
    "Powered by Hugo Blox": "",
    "Search term 1": "",
    "Search term 2": ""
  };

  var SKIP = { SCRIPT: 1, STYLE: 1, NOSCRIPT: 1, TEXTAREA: 1, INPUT: 1 };

  function translateText(node) {
    var t = node.nodeValue;
    if (t == null) return;
    var v = t.trim();
    if (!v) return;
    var m;
    if (MAP[v] !== undefined) {
      node.nodeValue = t.replace(v, MAP[v]);
      return;
    }
    if ((m = v.match(/^Finding results for "(.*)"$/))) {
      node.nodeValue = "正在查找 “" + m[1] + "”";
    } else if ((m = v.match(/^No results for "(.*)"$/))) {
      node.nodeValue = "未找到 “" + m[1] + "” 相关内容";
    } else if ((m = v.match(/^(\d+)\s+filters$/))) {
      node.nodeValue = m[1] + " 个筛选";
    } else if ((m = v.match(/^Team \((\d+)\)$/))) {
      node.nodeValue = "成员 (" + m[1] + ")";
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
      if (SKIP[el.tagName]) continue;
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

  function markPage() {
    var path = location.pathname || "/";
    if (path.indexOf("/projects/") === 0 || path === "/projects") {
      var art = document.querySelector("article.prose") || document.querySelector("article");
      if (art) art.classList.add("proj-page");
    }
  }

  function run() {
    markPage();
    walk(document.body);
    removeBrand();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", run);
  } else {
    run();
  }

  var pending = [];
  var scheduled = false;
  function flush() {
    scheduled = false;
    var nodes = pending;
    pending = [];
    for (var i = 0; i < nodes.length; i++) walk(nodes[i]);
  }

  var mo = new MutationObserver(function (ms) {
    for (var k = 0; k < ms.length; k++) {
      var m = ms[k];
      if (m.type === "characterData") {
        translateText(m.target);
      } else {
        var added = m.addedNodes;
        for (var j = 0; j < added.length; j++) {
          if (added[j].nodeType === 1) pending.push(added[j]);
          else if (added[j].nodeType === 3) translateText(added[j]);
        }
      }
    }
    if (pending.length && !scheduled) {
      scheduled = true;
      requestAnimationFrame(flush);
    }
  });
  mo.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
})();
