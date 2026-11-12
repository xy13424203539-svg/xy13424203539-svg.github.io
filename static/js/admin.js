/* 后台管理页：仅 /admin/ 生效，只有 admin 角色能看到数据。
   数据全部来自 admin_overview 函数（服务端校验身份，前端隐藏不算权限）。 */
(function () {
  if (window.__chenlabAdminLoaded) return;
  window.__chenlabAdminLoaded = true;

  var cfg = window.LAB_SB || {};
  if (!cfg.url || !cfg.key) return;

  var root = document.getElementById("adm-root");
  if (!root) return; // 只在 /admin/ 页面工作

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function num(v) {
    var n = parseFloat(v);
    return isNaN(n) ? 0 : n;
  }

  function state() {
    try { return JSON.parse(localStorage.getItem("chenlab_member") || "null"); } catch (e) { return null; }
  }

  function askLogin(msg) {
    root.innerHTML = '<div class="adm-note">' + (msg || "这个页面只有管理员登录后才能看到。") +
      '<br><button type="button" class="mp-btn mp-btn-main" id="adm-login">用管理员账号登录</button></div>';
    var b = root.querySelector("#adm-login");
    if (b) {
      b.addEventListener("click", function () {
        if (window.__chenlabOpenLogin) window.__chenlabOpenLogin();
      });
    }
  }

  function rpc(fn, payload) {
    return fetch(cfg.url + "/rest/v1/rpc/" + fn, {
      method: "POST",
      headers: { apikey: cfg.key, Authorization: "Bearer " + cfg.key, "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    }).then(function (r) {
      if (!r.ok) return r.text().then(function (t) { throw new Error("HTTP " + r.status + " " + t.slice(0, 80)); });
      return r.json();
    });
  }

  function table(heads, rows) {
    return '<div class="adm-scroll"><table class="adm-table"><thead><tr>' +
      heads.map(function (h) { return "<th>" + h + "</th>"; }).join("") +
      '</tr></thead><tbody>' + rows + '</tbody></table></div>';
  }

  /* 顶部四个数字 */
  function statsBlock(members, usage, material) {
    var assigned = members.filter(function (m) { return m.project; }).length;
    var devN = usage.reduce(function (a, u) { return a + num(u.n); }, 0);
    var devH = usage.reduce(function (a, u) { return a + num(u.hours); }, 0);
    var matG = (material || []).reduce(function (a, m) { return a + num(m.amount); }, 0);
    return '<div class="adm-stats">' +
      '<div class="adm-stat"><b>' + members.length + '</b><span>在册成员</span></div>' +
      '<div class="adm-stat"><b>' + assigned + '</b><span>已挂课题</span></div>' +
      '<div class="adm-stat"><b>' + devN + '</b><span>设备登记次数</span></div>' +
      '<div class="adm-stat"><b>' + (Math.round(devH * 10) / 10) + '</b><span>设备累计机时</span></div>' +
      '<div class="adm-stat"><b>' + (Math.round(matG * 10) / 10) + '</b><span>3D 打印耗材（克）</span></div>' +
      '</div>';
  }

  /* 按课题聚合：同课题的人共用一条进度 */
  function projectBlock(members) {
    var order = [];
    var map = {};
    members.forEach(function (m) {
      var k = m.project || "";
      if (!map[k]) { map[k] = { name: k, n: 0, stage: "", percent: 0, note: "" }; order.push(k); }
      map[k].n += 1;
      if (!map[k].stage && m.stage) map[k].stage = m.stage;
      if (num(map[k].percent) === 0 && num(m.percent) > 0) map[k].percent = num(m.percent);
      if (!map[k].note && m.note) map[k].note = m.note;
    });
    var list = order.map(function (k) { return map[k]; });
    list.sort(function (a, b) {
      if (a.name === "") return 1;
      if (b.name === "") return -1;
      return num(b.percent) - num(a.percent);
    });
    var rows = list.map(function (p) {
      var pct = Math.max(0, Math.min(100, Math.round(num(p.percent))));
      return '<tr>' +
        '<td>' + (p.name ? esc(p.name) : '<span class="adm-dim">未指定课题</span>') + '</td>' +
        '<td>' + p.n + ' 人</td>' +
        '<td>' + (p.stage ? esc(p.stage) : '<span class="adm-dim">—</span>') + '</td>' +
        '<td><div class="adm-prog"><i style="width:' + pct + '%"></i></div><span class="adm-pct">' + pct + '%</span></td>' +
        '<td>' + (p.note ? esc(p.note) : '<span class="adm-dim">—</span>') + '</td>' +
        '</tr>';
    }).join("");
    return '<div class="adm-block"><h3>课题进度汇总</h3>' +
      table(["课题", "参与人数", "当前阶段", "进度", "进度说明"], rows) + '</div>';
  }

  function membersBlock(list) {
    var rows = list.map(function (m) {
      var pct = Math.max(0, Math.min(100, parseInt(m.percent, 10) || 0));
      return '<tr>' +
        '<td>' + esc(m.name) + '</td>' +
        '<td>' + (m.role === "admin" ? "管理员" : "成员") + '</td>' +
        '<td>' + (m.project ? esc(m.project) : '<span class="adm-dim">未指定</span>') + '</td>' +
        '<td>' + (m.stage ? esc(m.stage) : '<span class="adm-dim">—</span>') + '</td>' +
        '<td><div class="adm-prog"><i style="width:' + pct + '%"></i></div><span class="adm-pct">' + pct + '%</span></td>' +
        '<td>' + (m.has_profile ? '<span class="adm-ok">已填</span>' : '<span class="adm-dim">未填</span>') + '</td>' +
        '<td>' + (m.updated_at ? esc(String(m.updated_at).slice(0, 10)) : '<span class="adm-dim">—</span>') + '</td>' +
        '</tr>';
    }).join("");
    return '<div class="adm-block"><h3>成员与课题</h3>' +
      table(["姓名", "身份", "所属课题", "阶段", "进度", "资料", "更新"], rows) + '</div>';
  }

  function usageBlock(list) {
    if (!list.length) return '<div class="adm-block"><h3>设备使用汇总</h3><p class="adm-dim">还没有登记记录。</p></div>';
    var rows = list.map(function (u) {
      return '<tr><td>' + esc(u.device) + '</td><td>' + esc(u.n) + ' 次</td><td>' + esc(u.hours) + ' 小时</td></tr>';
    }).join("");
    return '<div class="adm-block"><h3>设备使用汇总</h3>' +
      table(["设备", "次数", "合计时长"], rows) + '</div>';
  }

  function materialBlock(list) {
    if (!list || !list.length) {
      return '<div class="adm-block"><h3>3D 打印耗材</h3><p class="adm-dim">还没有人填写耗材用量。</p></div>';
    }
    var rows = list.map(function (m) {
      return '<tr><td>' + esc(m.material) + '</td><td>' + esc(m.amount) + ' 克</td></tr>';
    }).join("");
    return '<div class="adm-block"><h3>3D 打印耗材</h3>' +
      table(["耗材", "累计用量"], rows) + '</div>';
  }

  function recentBlock(list) {
    if (!list || !list.length) return "";
    var rows = list.map(function (r) {
      var mat = r.material ? '（' + esc(r.material) + (r.material_amount ? ' ' + esc(r.material_amount) + ' 克' : '') + '）' : '';
      return '<tr><td>' + esc(r.used_on) + '</td><td>' + esc(r.device) + '</td><td>' + esc(r.user_name) + '</td>' +
        '<td>' + esc(r.hours) + ' 小时</td><td>' + esc(r.purpose || "") + mat + '</td></tr>';
    }).join("");
    return '<div class="adm-block"><h3>最近登记</h3>' +
      table(["日期", "设备", "使用人", "时长", "用途"], rows) + '</div>';
  }

  function render(s) {
    root.innerHTML = '<div class="adm-note">已以管理员身份进入：' + esc(s.name) + '</div><div class="adm-body">读取中…</div>';
    rpc("admin_overview", { p_name: s.name, p_sid: s.sid })
      .then(function (data) {
        var body = root.querySelector(".adm-body");
        if (!data) {
          body.innerHTML = '<p class="adm-dim">没有权限读取，请重新登录管理员账号。</p>';
          return;
        }
        var members = data.members || [];
        var usage = data.usage || [];
        body.innerHTML = statsBlock(members, usage, data.material || []) +
          projectBlock(members) +
          membersBlock(members) +
          usageBlock(usage) +
          materialBlock(data.material || []) +
          recentBlock(data.recent || []);
      })
      .catch(function (e) {
        var body = root.querySelector(".adm-body");
        if (body) body.innerHTML = '<p class="adm-dim">读取失败（' + esc(e.message) + '）。</p>';
      });
  }

  var rendered = false;
  var asked = false;
  var lastNotice = "";

  function check() {
    var s = state();
    if (!s) {
      if (!asked) { asked = true; askLogin(); }
      return;
    }
    if (s.role !== "admin") {
      var msg = "当前登录的是 " + esc(s.name) + "，只有管理员能看这个页面。";
      if (lastNotice !== msg) { lastNotice = msg; askLogin(msg); }
      return;
    }
    if (!rendered) { rendered = true; render(s); }
  }

  check();
  setInterval(check, 900);
})();
