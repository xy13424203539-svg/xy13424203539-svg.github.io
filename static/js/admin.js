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

  var STATUS_TEXT = { pending: "待审核", approved: "已批准", ordered: "已采购", rejected: "不批准", done: "已完成" };

  function fmtSize(n) {
    n = Number(n) || 0;
    if (n < 1024) return n + " B";
    if (n < 1048576) return (n / 1024).toFixed(0) + " KB";
    return (n / 1048576).toFixed(1) + " MB";
  }

  function cleanMembers(s) {
    return String(s || "").split(/[、,，;；\s]+/).filter(function (x) { return !!x; }).join("、");
  }

  function fileLink(r) {
    if (!r.file_url) return '<span class="adm-dim">无附件</span>';
    return '<a class="adm-link" href="' + esc(r.file_url) + '" target="_blank" rel="noopener">' +
      esc(r.file_name || "附件") + (r.file_size ? "（" + fmtSize(r.file_size) + "）" : "") + "</a>";
  }

  function state() {
    try { return JSON.parse(localStorage.getItem("chenlab_member") || "null"); } catch (e) { return null; }
  }

  function askLogin(msg) {
    root.innerHTML = '<div class="adm-note">' +
      (msg ? esc(msg) + '<br>' : '') +
      '<button type="button" class="mp-btn mp-btn-main" id="adm-login">登录</button></div>';
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
    var wide = heads.length >= 4 ? " adm-table-wide" : "";
    return '<div class="adm-scroll"><table class="adm-table' + wide + '"><thead><tr>' +
      heads.map(function (h) { return "<th>" + h + "</th>"; }).join("") +
      '</tr></thead><tbody>' + rows + '</tbody></table></div>';
  }

  /* 顶部四个数字 */
  /* 事项完成度 KPI 屏：待办 / 已完成 / 在办 / 整体完成率，口径与下方列表同源 */
  function subheadBlock() {
    return '<div class="adm-subhead"><p>按提交时间倒序统计；上方计数与下方各列表同源，不重复计算。</p></div>';
  }

  function kpiBlock() {
    var reps = CACHE.reports || [];
    var purs = CACHE.purchases || [];
    var pending = purs.filter(function (p) { return p.status === "pending"; }).length;
    var doing = purs.filter(function (p) { return p.status === "approved" || p.status === "ordered"; }).length;
    var done = reps.length + purs.filter(function (p) { return p.status === "done"; }).length;
    var active = purs.filter(function (p) { return ["pending", "approved", "ordered", "done"].indexOf(p.status) >= 0; }).length;
    var total = reps.length + active;
    var rate = total ? Math.round(done / total * 1000) / 10 : 0;
    var bar = Math.max(0, Math.min(100, rate));
    return '<div class="adm-kpis">' +
      '<div class="adm-kpi adm-kpi-pending adm-clickable" data-kpi="pending" title="查看待审核采购">' +
        '<span class="adm-kpi-label">待办事项</span><b>' + pending + '</b><span class="adm-kpi-sub">待审核采购</span></div>' +
      '<div class="adm-kpi adm-kpi-done adm-clickable" data-kpi="done" title="查看已完成事项">' +
        '<span class="adm-kpi-label">已完成</span><b>' + done + '</b><span class="adm-kpi-sub">汇报 / 竞赛 / 完成采购</span></div>' +
      '<div class="adm-kpi adm-kpi-doing adm-clickable" data-kpi="doing" title="查看在办采购">' +
        '<span class="adm-kpi-label">在办事项</span><b>' + doing + '</b><span class="adm-kpi-sub">已批准 / 已采购</span></div>' +
      '<div class="adm-kpi adm-kpi-rate"><span class="adm-kpi-label">整体完成率</span><b>' + rate + '%</b><div class="adm-kpi-bar"><i style="width:' + bar + '%"></i></div></div>' +
      '</div>';
  }

  function statsBlock(members, usage, material) {
    var assigned = members.filter(function (m) { return m.project; }).length;
    var devN = usage.reduce(function (a, u) { return a + num(u.n); }, 0);
    var devH = usage.reduce(function (a, u) { return a + num(u.hours); }, 0);
    var matG = (material || []).reduce(function (a, m) { return a + num(m.amount); }, 0);
    return '<div class="adm-stats">' +
      '<div class="adm-stat adm-clickable" data-stat="members"><b>' + members.length + '</b><span>在册成员</span></div>' +
      '<div class="adm-stat adm-clickable" data-stat="projects"><b>' + assigned + '</b><span>已挂课题</span></div>' +
      '<div class="adm-stat adm-clickable" data-stat="usage"><b>' + devN + '</b><span>设备登记次数</span></div>' +
      '<div class="adm-stat adm-clickable" data-stat="usage"><b>' + (Math.round(devH * 10) / 10) + '</b><span>设备累计机时</span></div>' +
      '<div class="adm-stat adm-clickable" data-stat="material"><b>' + (Math.round(matG * 10) / 10) + '</b><span>3D 打印耗材（克）</span></div>' +
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
      var key = p.name ? esc(p.name) : "__none__";
      var label = p.name ? esc(p.name) : '<span class="adm-dim">未指定课题</span>';
      return '<tr class="adm-proj-row" data-adm-project="' + key + '">' +
        '<td><button type="button" class="adm-proj-link">' + label + '</button></td>' +
        '<td><button type="button" class="adm-proj-link">' + p.n + ' 人</button></td>' +
        '<td>' + (p.stage ? esc(p.stage) : '<span class="adm-dim">—</span>') + '</td>' +
        '<td><div class="adm-prog"><i style="width:' + pct + '%"></i></div><span class="adm-pct">' + pct + '%</span></td>' +
        '<td>' + (p.note ? esc(p.note) : '<span class="adm-dim">—</span>') + '</td>' +
        '</tr>';
    }).join("");
    return '<div class="adm-block adm-project-block"><h3>课题进度汇总<span class="adm-count">点击课题查看成员</span></h3>' +
      table(["课题", "参与人数", "当前阶段", "进度", "进度说明"], rows) + '</div>';
  }

  function membersBlock(list) {
    var rows = list.map(function (m) {
      var pct = Math.max(0, Math.min(100, parseInt(m.percent, 10) || 0));
      return '<tr>' +
        '<td><button type="button" class="adm-member-link" data-adm-member="' + esc(m.name) + '">' + esc(m.name) + '</button></td>' +
        '<td>' + (m.role === "admin" ? "管理员" : "成员") + '</td>' +
        '<td>' + (m.project ? esc(m.project) : '<span class="adm-dim">未指定</span>') + '</td>' +
        '<td>' + (m.stage ? esc(m.stage) : '<span class="adm-dim">—</span>') + '</td>' +
        '<td><div class="adm-prog"><i style="width:' + pct + '%"></i></div><span class="adm-pct">' + pct + '%</span></td>' +
        '<td>' + (m.has_profile ? '<span class="adm-ok">已填</span>' : '<span class="adm-dim">未填</span>') + '</td>' +
        '<td>' + (m.updated_at ? esc(String(m.updated_at).slice(0, 10)) : '<span class="adm-dim">—</span>') + '</td>' +
        '</tr>';
    }).join("");
    return '<div class="adm-block adm-member-block"><h3>成员与课题<span class="adm-count">点击姓名查看该成员详情</span></h3>' +
      table(["姓名", "身份", "所属课题", "阶段", "进度", "资料", "更新"], rows) + '</div>';
  }

  function usageBlock(list) {
    if (!list.length) return '<div class="adm-block adm-usage-block"><h3>设备使用汇总</h3><p class="adm-dim">还没有登记记录。</p></div>';
    var rows = list.map(function (u) {
      return '<tr><td>' + esc(u.device) + '</td><td>' + esc(u.n) + ' 次</td><td>' + esc(u.hours) + ' 小时</td></tr>';
    }).join("");
    return '<div class="adm-block adm-usage-block"><h3>设备使用汇总</h3>' +
      table(["设备", "次数", "合计时长"], rows) + '</div>';
  }

  function materialBlock(list) {
    if (!list || !list.length) {
      return '<div class="adm-block adm-material-block"><h3>3D 打印耗材</h3><p class="adm-dim">还没有人填写耗材用量。</p></div>';
    }
    var rows = list.map(function (m) {
      return '<tr><td>' + esc(m.material) + '</td><td>' + esc(m.amount) + ' 克</td></tr>';
    }).join("");
    return '<div class="adm-block adm-material-block"><h3>3D 打印耗材</h3>' +
      table(["耗材", "累计用量"], rows) + '</div>';
  }

  function recentBlock(list) {
    if (!list || !list.length) return "";
    var rows = list.map(function (r) {
      var mat = r.material ? '（' + esc(r.material) + (r.material_amount ? ' ' + esc(r.material_amount) + ' 克' : '') + '）' : '';
      return '<tr><td>' + esc(r.used_on) + '</td><td>' + esc(r.device) + '</td><td>' + esc(r.user_name) + '</td>' +
        '<td>' + esc(r.hours) + ' 小时</td><td class="adm-wrap">' + esc(r.purpose || "") + mat + '</td></tr>';
    }).join("");
    return '<div class="adm-block"><h3>最近登记</h3>' +
      table(["日期", "设备", "使用人", "时长", "用途"], rows) + '</div>';
  }

  function repToolbar() {
    return '<div class="adm-toolbar"><input class="adm-search" data-filt="repQ" maxlength="30" placeholder="搜标题 / 提交人 / 类型 / 课题" value="' + esc(FILT.repQ) + '"></div>';
  }

  /* 成员提交：组会 / 阶段汇报（不含竞赛） */
  function reportsRows(list) {
    return list.map(function (r) {
      var body = r.summary ? '<div class="adm-sub">' + esc(r.summary) + '</div>' : "";
      var kind = r.kind ? '<div class="adm-sub">' + esc(r.kind) + '</div>' : "";
      return '<tr>' +
        '<td>' + esc(r.created_at) + '</td>' +
        '<td>' + esc(r.name) + '</td>' +
        '<td>' + (r.project ? esc(r.project) : '<span class="adm-dim">—</span>') + '</td>' +
        '<td class="adm-wrap"><b>' + esc(r.title) + '</b>' + kind + body + '</td>' +
        '<td>' + fileLink(r) + '</td>' +
        '</tr>';
    }).join("");
  }

  function reportsAdminBlock(list, withFilter) {
    var heads = ["日期", "提交人", "课题", "标题 / 说明", "附件"];
    var rows = list.length ? reportsRows(list) : emptyRow(heads.length);
    return '<div class="adm-block adm-rep-block"><h3>组会 / 阶段汇报<span class="adm-count">' + list.length + '</span></h3>' +
      (withFilter ? repToolbar() : "") +
      table(heads, rows) + '</div>';
  }

  /* 成员提交：竞赛成果 */
  function contestRows(list) {
    return list.map(function (c) {
      var mem = cleanMembers(c.members) || c.name;
      return '<tr>' +
        '<td>' + esc(c.created_at) + '</td>' +
        '<td class="adm-wrap"><b>' + esc(c.title) + '</b>' + (c.summary ? '<div class="adm-sub">' + esc(c.summary) + '</div>' : '') + '</td>' +
        '<td>' + esc(mem) + '</td>' +
        '<td>' + (c.project ? esc(c.project) : '<span class="adm-dim">—</span>') + '</td>' +
        '<td>' + fileLink(c) + '</td>' +
        '</tr>';
    }).join("");
  }

  function contestAdminBlock(list) {
    var heads = ["日期", "奖项 / 说明", "参赛成员", "课题", "证书"];
    var rows = list.length ? contestRows(list) : emptyRow(heads.length);
    return '<div class="adm-block adm-ct-block"><h3>竞赛成果<span class="adm-count">' + list.length + '</span></h3>' +
      table(heads, rows) + '</div>';
  }

  function emptyRow(ncol) {
    return '<tr><td colspan="' + ncol + '" class="adm-dim">没有匹配的记录。</td></tr>';
  }

  var PUR_STATUS_OPTS = [["", "全部"], ["pending", "待审核"], ["doing", "在办"], ["approved", "已批准"], ["ordered", "已采购"], ["done", "已完成"], ["rejected", "不批准"]];

  function purToolbar() {
    return '<div class="adm-toolbar">' +
      '<input class="adm-search" data-filt="purQ" maxlength="30" placeholder="搜物品 / 申请人 / 课题 / 用途" value="' + esc(FILT.purQ) + '">' +
      '<div class="adm-seg">' + PUR_STATUS_OPTS.map(function (s) {
        return '<button type="button" class="adm-seg-btn' + (FILT.purStatus === s[0] ? " on" : "") + '" data-pur-status="' + s[0] + '">' + s[1] + '</button>';
      }).join("") + '</div></div>';
  }

  /* 成员提交：耗材申请全量（管理员可直接改状态、写备注） */
  function purchaseRows(list) {
    var STATUS_KEYS = ["pending", "approved", "ordered", "done", "rejected"];
    return list.map(function (p) {
      var qty = num(p.qty) + " " + (p.unit || "件");
      var budget = num(p.budget) ? "约 " + num(p.budget) + " 元" : "—";
      var sel = p.id
        ? '<select class="adm-sel" data-id="' + esc(p.id) + '">' +
          STATUS_KEYS.map(function (s) {
            return '<option value="' + s + '"' + (p.status === s ? " selected" : "") + '>' + STATUS_TEXT[s] + '</option>';
          }).join("") + "</select>"
        : '<span class="adm-badge adm-badge-' + esc(p.status) + '">' + esc(STATUS_TEXT[p.status] || p.status) + '</span>';
      var note = p.id
        ? '<input class="adm-note-in" data-id="' + esc(p.id) + '" maxlength="40" placeholder="审批备注" value="' + esc(p.admin_note || "") + '">' +
          ' <button type="button" class="adm-mini-btn" data-adm-save-pur="' + esc(p.id) + '">保存</button>'
        : (p.admin_note ? esc(p.admin_note) : '<span class="adm-dim">—</span>');
      return '<tr>' +
        '<td>' + esc(p.created_at) + '</td>' +
        '<td>' + esc(p.name) + '</td>' +
        '<td>' + (p.project ? esc(p.project) : '<span class="adm-dim">—</span>') + '</td>' +
        '<td class="adm-wrap"><b>' + esc(p.item) + '</b>' + (p.spec ? '<div class="adm-sub">' + esc(p.spec) + '</div>' : '') + '</td>' +
        '<td>' + esc(qty) + '</td>' +
        '<td>' + budget + '</td>' +
        '<td>' + sel + '</td>' +
        '<td class="adm-note-cell">' + note + '</td>' +
        '</tr>';
    }).join("");
  }

  function purchaseAdminBlock(list, withFilter) {
    var heads = ["日期", "申请人", "课题", "物品 / 规格", "数量", "预算", "状态", "备注 / 操作"];
    var rows = list.length ? purchaseRows(list) : emptyRow(heads.length);
    return '<div class="adm-block adm-pur-block"><h3>耗材申请<span class="adm-count">' + list.length + '</span></h3>' +
      (withFilter ? purToolbar() : "") +
      table(heads, rows) + '</div>';
  }

  function savePurchase(id, btn) {
    var sel = root.querySelector('.adm-sel[data-id="' + id + '"]');
    var note = root.querySelector('.adm-note-in[data-id="' + id + '"]');
    if (!sel || !ME) return;
    btn.textContent = "保存中…";
    btn.disabled = true;
    rpc("set_purchase_status", {
      p_name: ME.name, p_sid: ME.sid, p_id: Number(id),
      p_status: sel.value, p_note: (note ? note.value : "")
    }).then(function (ok) {
      if (!ok) throw new Error("没有权限");
      var rec = (CACHE.purchases || []).find(function (x) { return String(x.id) === String(id); });
      if (rec) { rec.status = sel.value; rec.admin_note = note ? note.value : ""; }
      rerender();
    }).catch(function (e) {
      btn.textContent = "重试";
      btn.disabled = false;
      var cell = btn.closest(".adm-note-cell");
      if (cell) {
        var msg = cell.querySelector(".adm-save-msg");
        if (!msg) { msg = document.createElement("div"); msg.className = "adm-save-msg"; cell.appendChild(msg); }
        msg.textContent = e.message;
      }
    });
  }

  var CACHE = null;
  var ME = null;
  var VIEW = { mode: "list", name: "" };
  var FILT = { purQ: "", purStatus: "", repQ: "" };

  function matchQ(hay, q) {
    return !q || String(hay || "").toLowerCase().indexOf(q.trim().toLowerCase()) >= 0;
  }

  function filterPur(list) {
    var q = FILT.purQ.trim();
    return (list || []).filter(function (p) {
      if (FILT.purStatus === "doing") {
        if (p.status !== "approved" && p.status !== "ordered") return false;
      } else if (FILT.purStatus && p.status !== FILT.purStatus) return false;
      return matchQ([p.name, p.project, p.item, p.spec, p.reason].join(" "), q);
    });
  }

  function filterRep(list) {
    var q = FILT.repQ.trim();
    if (!q) return list || [];
    return (list || []).filter(function (r) {
      return matchQ([r.name, r.title, r.summary, r.kind, r.project].join(" "), q);
    });
  }

  function rerender() {
    if (VIEW.mode === "member" && VIEW.name) showMember(VIEW.name);
    else if (VIEW.mode === "project" && VIEW.name) showProject(VIEW.name);
    else renderList();
  }

  function scrollTo(sel) {
    var el = root.querySelector(sel);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function renderList() {
    VIEW.mode = "list"; VIEW.name = "";
    var d = CACHE;
    var members = d.members || [];
    var usage = d.usage || [];
    var allReports = d.reports || [];
    var purchases = d.purchases || [];
    var normal = allReports.filter(function (r) { return r.kind !== "竞赛成果"; });
    var contest = allReports.filter(function (r) { return r.kind === "竞赛成果"; });
    root.querySelector(".adm-body").innerHTML = subheadBlock() + kpiBlock() +
      statsBlock(members, usage, d.material || []) +
      projectBlock(members) +
      membersBlock(members) +
      reportsAdminBlock(filterRep(normal), true) +
      contestAdminBlock(filterRep(contest)) +
      purchaseAdminBlock(filterPur(purchases), true) +
      usageBlock(usage) +
      materialBlock(d.material || []) +
      recentBlock(d.recent || []);
  }

  function memberDetailBlock(m) {
    var pct = Math.max(0, Math.min(100, parseInt(m.percent, 10) || 0));
    var rows =
      '<tr><td>身份</td><td>' + (m.role === "admin" ? "管理员" : "成员") + '</td></tr>' +
      '<tr><td>所属课题</td><td>' + (m.project ? esc(m.project) : '<span class="adm-dim">未指定</span>') + '</td></tr>' +
      '<tr><td>当前阶段</td><td>' + (m.stage ? esc(m.stage) : '<span class="adm-dim">—</span>') + '</td></tr>' +
      '<tr><td>进度</td><td><div class="adm-prog"><i style="width:' + pct + '%"></i></div><span class="adm-pct">' + pct + '%</span></td></tr>' +
      '<tr><td>资料</td><td>' + (m.has_profile ? '<span class="adm-ok">已填</span>' : '<span class="adm-dim">未填</span>') + '</td></tr>' +
      '<tr><td>更新</td><td>' + (m.updated_at ? esc(String(m.updated_at).slice(0, 10)) : '<span class="adm-dim">—</span>') + '</td></tr>';
    return '<div class="adm-block"><h3>基本信息</h3>' + table(["项目", "内容"], rows) + '</div>';
  }

  function showMember(name) {
    VIEW.mode = "member"; VIEW.name = name;
    var d = CACHE;
    var m = (d.members || []).find(function (x) { return x.name === name; }) || { name: name };
    var reps = (d.reports || []).filter(function (r) {
      if (r.name === name) return true;
      var mem = cleanMembers(r.members);
      return mem.split("、").indexOf(name) >= 0;
    });
    var normal = reps.filter(function (r) { return r.kind !== "竞赛成果"; });
    var contest = reps.filter(function (r) { return r.kind === "竞赛成果"; });
    var pur = (d.purchases || []).filter(function (p) { return p.name === name; });
    var rec = (d.recent || []).filter(function (r) { return r.user_name === name; });
    root.querySelector(".adm-body").innerHTML =
      '<button type="button" class="adm-back" data-adm-back>← 返回成员列表</button>' +
      '<div class="adm-block"><h3>成员详情：' + esc(name) + '</h3></div>' +
      memberDetailBlock(m) +
      reportsAdminBlock(normal, false) +
      contestAdminBlock(contest) +
      purchaseAdminBlock(pur, false) +
      (rec.length ? recentBlock(rec) : '<div class="adm-block"><h3>设备登记记录</h3><p class="adm-dim">暂无设备登记记录。</p></div>');
  }

  function projectMembers(key) {
    var none = key === "__none__";
    return (CACHE.members || []).filter(function (m) { return none ? !m.project : m.project === key; });
  }

  function projectReports(key) {
    var none = key === "__none__";
    var names = projectMembers(key).map(function (m) { return m.name; });
    return (CACHE.reports || []).filter(function (r) {
      if (none) return !r.project;
      if (r.project === key) return true;
      var mem = cleanMembers(r.members).split("、");
      return names.some(function (n) { return mem.indexOf(n) >= 0; });
    });
  }

  function projectPurchases(key) {
    var none = key === "__none__";
    return (CACHE.purchases || []).filter(function (p) { return none ? !p.project : p.project === key; });
  }

  function showProject(key) {
    VIEW.mode = "project"; VIEW.name = key;
    var none = key === "__none__";
    var title = none ? "未指定课题" : key;
    var mems = projectMembers(key);
    var reps = projectReports(key);
    var normal = reps.filter(function (r) { return r.kind !== "竞赛成果"; });
    var contest = reps.filter(function (r) { return r.kind === "竞赛成果"; });
    var pur = projectPurchases(key);
    root.querySelector(".adm-body").innerHTML =
      '<button type="button" class="adm-back" data-adm-back>← 返回汇总列表</button>' +
      '<div class="adm-block"><h3>课题：' + esc(title) + '<span class="adm-count">' + mems.length + ' 人</span></h3></div>' +
      membersBlock(mems) +
      reportsAdminBlock(normal, false) +
      contestAdminBlock(contest) +
      purchaseAdminBlock(pur, false);
  }

  function refreshPurBody() {
    var box = root.querySelector(".adm-pur-block");
    if (!box) return;
    var list = filterPur(CACHE.purchases || []);
    var tbody = box.querySelector("tbody");
    if (tbody) tbody.innerHTML = list.length ? purchaseRows(list) : emptyRow(8);
    var cnt = box.querySelector(".adm-count");
    if (cnt) cnt.textContent = list.length;
  }

  function refreshRepBody() {
    var all = CACHE.reports || [];
    var normal = filterRep(all.filter(function (r) { return r.kind !== "竞赛成果"; }));
    var contest = filterRep(all.filter(function (r) { return r.kind === "竞赛成果"; }));
    var nb = root.querySelector(".adm-rep-block tbody");
    if (nb) nb.innerHTML = normal.length ? reportsRows(normal) : emptyRow(5);
    var cb = root.querySelector(".adm-ct-block tbody");
    if (cb) cb.innerHTML = contest.length ? contestRows(contest) : emptyRow(5);
    var nc = root.querySelector(".adm-rep-block .adm-count");
    if (nc) nc.textContent = normal.length;
    var cc = root.querySelector(".adm-ct-block .adm-count");
    if (cc) cc.textContent = contest.length;
  }

  root.addEventListener("click", function (ev) {
    var link = ev.target.closest("[data-adm-member]");
    if (link) { showMember(link.getAttribute("data-adm-member")); return; }
    if (ev.target.closest("[data-adm-back]")) { renderList(); return; }
    var prj = ev.target.closest("[data-adm-project]");
    if (prj) { showProject(prj.getAttribute("data-adm-project")); return; }
    var kpi = ev.target.closest("[data-kpi]");
    if (kpi) {
      var k = kpi.getAttribute("data-kpi");
      if (k === "pending") FILT.purStatus = "pending";
      else if (k === "doing") FILT.purStatus = "doing";
      else if (k === "done") FILT.purStatus = "done";
      renderList();
      scrollTo(k === "done" ? ".adm-rep-block" : ".adm-pur-block");
      return;
    }
    var st = ev.target.closest("[data-stat]");
    if (st) {
      var smap = { members: ".adm-member-block", projects: ".adm-project-block", usage: ".adm-usage-block", material: ".adm-material-block" };
      renderList();
      scrollTo(smap[st.getAttribute("data-stat")]);
      return;
    }
    var seg = ev.target.closest("[data-pur-status]");
    if (seg) { FILT.purStatus = seg.getAttribute("data-pur-status"); renderList(); return; }
    var sv = ev.target.closest("[data-adm-save-pur]");
    if (sv) { savePurchase(sv.getAttribute("data-adm-save-pur"), sv); }
  });

  root.addEventListener("input", function (ev) {
    var s = ev.target.closest(".adm-search");
    if (!s) return;
    var key = s.getAttribute("data-filt");
    FILT[key] = s.value;
    if (key === "purQ") refreshPurBody();
    else if (key === "repQ") refreshRepBody();
  });

  function render(s) {
    ME = s;
    root.innerHTML = '<div class="adm-note">已以管理员身份进入：' + esc(s.name) + '</div><div class="adm-body">读取中…</div>';
    Promise.all([
      rpc("admin_overview", { p_name: s.name, p_sid: s.sid }),
      rpc("archive_overview", { p_name: s.name, p_sid: s.sid }).catch(function () { return null; })
    ]).then(function (res) {
      var data = res[0];
      var arch = res[1] || {};
      var body = root.querySelector(".adm-body");
      if (!data) {
        body.innerHTML = '<p class="adm-dim">没有权限读取，请重新登录。</p>';
        return;
      }
      CACHE = {
        members: data.members || [],
        usage: data.usage || [],
        material: data.material || [],
        recent: data.recent || [],
        reports: arch.reports || [],
        purchases: arch.purchases || []
      };
      renderList();
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
      askLogin("");
      return;
    }
    if (!rendered) { rendered = true; render(s); }
  }

  check();
  setInterval(check, 5000);
})();
