/* 整站分组侧边导航：桌面左侧分组目录，手机端隐藏（走顶部汉堡菜单）。
   分组只归并现有页面；后台管理仅管理员可见。 */
(function () {
  if (window.__chenlabSiteNavLoaded) return;
  window.__chenlabSiteNavLoaded = true;

  var STORE = "chenlab_member";

  var GROUPS = [
    {
      t: "实验室概览",
      items: [
        { ic: "🏠", label: "实验室介绍", url: "/lab/" },
        { ic: "👨‍🏫", label: "指导教师", url: "/teacher/" },
        { ic: "👥", label: "团队成员", url: "/team/" }
      ]
    },
    {
      t: "科研与成果",
      items: [
        { ic: "🧪", label: "科研项目", url: "/projects/" },
        { ic: "🏆", label: "成果荣誉", url: "/awards/" },
        { ic: "📝", label: "汇报成果", url: "/reports/" },
        { ic: "🥇", label: "竞赛成果", url: "/contest/" }
      ]
    },
    {
      t: "协作事务",
      items: [
        { ic: "🗓", label: "交流安排", url: "/meetings/" },
        { ic: "🧾", label: "耗材申请", url: "/purchases/" },
        { ic: "🔧", label: "设备登记", url: "/equipment/" }
      ]
    },
    {
      t: "规范与资源",
      items: [
        { ic: "📋", label: "实验室制度", url: "/rules/" },
        { ic: "🎁", label: "奖励机制", url: "/reward/" }
      ]
    },
    {
      t: "管理",
      items: [
        { ic: "👥", label: "学生档案", url: "/archive/", admin: true },
        { ic: "⚙️", label: "后台管理", url: "/admin/", admin: true }
      ]
    }
  ];

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function member() {
    try { return JSON.parse(localStorage.getItem(STORE) || "null"); } catch (e) { return null; }
  }

  function currentPath() {
    return location.pathname || "/";
  }

  function isActive(url) {
    var p = currentPath();
    if (url === "/") return p === "/";
    return p === url || p.indexOf(url) === 0;
  }

  function build() {
    var m = member();
    var isAdmin = m && m.role === "admin";
    var html = "";
    GROUPS.forEach(function (g) {
      var items = g.items.filter(function (it) { return !it.admin || isAdmin; });
      if (!items.length) return;
      html += '<div class="sn-group"><div class="sn-gt">' + esc(g.t) + "</div>";
      items.forEach(function (it) {
        var cls = "sn-item" + (isActive(it.url) ? " active" : "");
        html += '<a class="' + cls + '" href="' + esc(it.url) + '">' +
          '<span class="sn-ic">' + it.ic + "</span><span class='sn-label'>" + esc(it.label) + "</span></a>";
      });
      html += "</div>";
    });
    return html;
  }

  function mount() {
    var aside = document.querySelector(".sn-side");
    if (!aside) {
      aside = document.createElement("aside");
      aside.className = "sn-side";
      aside.setAttribute("aria-label", "站点导航");
      document.body.insertBefore(aside, document.body.firstChild);
    }
    aside.innerHTML = '<nav class="sn-nav">' + build() + "</nav>";
    document.body.classList.add("sn-on");
  }

  // 登录 / 退出后身份可能变化（退出会刷新；登录不刷新），轮询本地身份并按需重建。
  var last = localStorage.getItem(STORE) || "";
  function watch() {
    var now = localStorage.getItem(STORE) || "";
    if (now !== last) { last = now; mount(); }
  }
  setInterval(watch, 1200);
  window.addEventListener("storage", watch);

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mount);
  } else {
    mount();
  }
})();
