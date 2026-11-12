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

  function state() {
    try { return JSON.parse(localStorage.getItem("chenlab_member") || "null"); } catch (e) { return null; }
  }

  function notice(html) {
    root.innerHTML = '<div class="adm-note">' + html + '</div>';
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

  function membersBlock(list) {
    var rows = list.map(function (m) {
      var pct = Math.max(0, Math.min(100, parseInt(m.percent, 10) || 0));
      return '<tr>' +
        '<td>' + esc(m.name) + '</td>' +
        '<td>' + (m.role === "admin" ? "管理员" : "成员") + '</td>' +
        '<td>' + (m.project ? esc(m.project) : '<span class="adm-dim">未指定</span>') + '</td>' +
        '<td>' + (m.stage ? esc(m.stage) : '<span class="adm-dim">—</span>') + '</td>' +
        '<td><div class="adm-prog"><i style="width:' + pct + '%"></i></div><span class="adm-pct">' + pct + '%</span></td>' +
        '<td>' + (m.updated_at ? esc(String(m.updated_at).slice(0, 10)) : '<span class="adm-dim">—</span>') + '</td>' +
        '</tr>';
    }).join("");
    return '<div class="adm-block"><h3>成员与课题</h3>' +
      '<table class="adm-table"><thead><tr><th>姓名</th><th>身份</th><th>所属课题</th>' +
      '<th>阶段</th><th>进度</th><th>资料更新</th></tr></thead><tbody>' + rows + '</tbody></table></div>';
  }

  function usageBlock(list) {
    if (!list.length) return '<div class="adm-block"><h3>设备使用汇总</h3><p class="adm-dim">还没有登记记录。</p></div>';
    var rows = list.map(function (u) {
      return '<tr><td>' + esc(u.device) + '</td><td>' + esc(u.n) + ' 次</td><td>' + esc(u.hours) + ' 小时</td></tr>';
    }).join("");
    return '<div class="adm-block"><h3>设备使用汇总</h3>' +
      '<table class="adm-table"><thead><tr><th>设备</th><th>次数</th><th>合计时长</th></tr></thead><tbody>' +
      rows + '</tbody></table></div>';
  }

  function materialBlock(list) {
    if (!list || !list.length) {
      return '<div class="adm-block"><h3>3D 打印耗材</h3><p class="adm-dim">还没有人填写耗材用量。</p></div>';
    }
    var rows = list.map(function (m) {
      return '<tr><td>' + esc(m.material) + '</td><td>' + esc(m.amount) + ' 克</td></tr>';
    }).join("");
    return '<div class="adm-block"><h3>3D 打印耗材</h3>' +
      '<table class="adm-table"><thead><tr><th>耗材</th><th>累计用量</th></tr></thead><tbody>' +
      rows + '</tbody></table></div>';
  }

  function recentBlock(list) {
    if (!list || !list.length) return "";
    var rows = list.map(function (r) {
      var mat = r.material ? '（' + esc(r.material) + (r.material_amount ? ' ' + esc(r.material_amount) + ' 克' : '') + '）' : '';
      return '<tr><td>' + esc(r.used_on) + '</td><td>' + esc(r.device) + '</td><td>' + esc(r.user_name) + '</td>' +
        '<td>' + esc(r.hours) + ' 小时</td><td>' + esc(r.purpose || "") + mat + '</td></tr>';
    }).join("");
    return '<div class="adm-block"><h3>最近登记</h3>' +
      '<table class="adm-table"><thead><tr><th>日期</th><th>设备</th><th>使用人</th><th>时长</th><th>用途</th></tr></thead><tbody>' +
      rows + '</tbody></table></div>';
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
        body.innerHTML = membersBlock(data.members || []) +
          usageBlock(data.usage || []) +
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
