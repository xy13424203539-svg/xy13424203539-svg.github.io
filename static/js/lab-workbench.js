/* 实验室工作台：汇报材料 / 耗材申请 / 交流安排 / 学生档案。
   写入全部走 security definer 函数，无权限的人前端改了也提交不上去。 */
(function () {
  if (window.__chenlabWorkbenchLoaded) return;
  window.__chenlabWorkbenchLoaded = true;

  var cfg = window.LAB_SB || {};
  var root = document.getElementById("wbn-root");
  if (!root || !cfg.url || !cfg.key) return;

  var STORE = "chenlab_member";
  var MAX_MB = 15;
  var TAB = "reports";
  var PROJECTS = [];

  function state() {
    try { return JSON.parse(localStorage.getItem(STORE) || "null"); } catch (e) { return null; }
  }
  var me = state();
  function isAdmin() { return !!me && me.role === "admin"; }

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
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

  function rest(path) {
    return fetch(cfg.url + "/rest/v1/" + path, { headers: { apikey: cfg.key, Authorization: "Bearer " + cfg.key } })
      .then(function (r) { return r.ok ? r.json() : []; })
      .catch(function () { return []; });
  }

  function fmtSize(n) {
    n = Number(n) || 0;
    if (n < 1024) return n + " B";
    if (n < 1048576) return (n / 1024).toFixed(0) + " KB";
    return (n / 1048576).toFixed(1) + " MB";
  }

  function fmtDate(s) {
    if (!s) return "";
    return String(s).slice(0, 10);
  }

  var STATUS_TEXT = { pending: "待审核", approved: "已批准", ordered: "已采购", rejected: "不批准", done: "已完成" };

  function statusBadge(s) {
    return '<span class="wbn-badge wbn-badge-' + esc(s) + '">' + esc(STATUS_TEXT[s] || s) + "</span>";
  }

  /* ---------- 外壳 ---------- */

  function headBox() {
    var who = me
      ? '<b>' + esc(me.name) + '</b>（' + (me.role === "admin" ? "管理员" : "成员") + '）'
      : '还没有登录，现在只能查看';
    var btn = me ? "" : '<button type="button" class="wbn-btn wbn-btn-main" id="wbn-login">登录后提交</button>';
    return '<div class="wbn-head"><div class="wbn-who">当前身份：' + who + '</div>' + btn + '</div>';
  }

  var TABS = [
    { k: "reports", t: "汇报材料" },
    { k: "milestones", t: "阶段成果" },
    { k: "purchases", t: "耗材申请" },
    { k: "meetings", t: "交流安排" },
    { k: "archive", t: "学生档案" }
  ];

  function shell(inner) {
    var tabs = TABS.filter(function (x) { return !(x.k === "archive" && !isAdmin()); }).map(function (x) {
      return '<button type="button" class="wbn-tab' + (x.k === TAB ? " is-on" : "") + '" data-tab="' + x.k + '">' + x.t + '</button>';
    }).join("");
    root.innerHTML = headBox() + '<div class="wbn-tabs">' + tabs + '</div><div class="wbn-panel" id="wbn-panel">' + inner + '</div>';
    var lb = root.querySelector("#wbn-login");
    if (lb) lb.addEventListener("click", function () { if (window.__chenlabOpenLogin) window.__chenlabOpenLogin(); });
    Array.prototype.forEach.call(root.querySelectorAll(".wbn-tab"), function (b) {
      b.addEventListener("click", function () { TAB = b.getAttribute("data-tab"); go(); });
    });
  }

  function go(msg) {
    var panel;
    if (TAB === "reports") panel = renderReports();
    else if (TAB === "milestones") panel = renderMilestones();
    else if (TAB === "purchases") panel = renderPurchases();
    else if (TAB === "meetings") panel = renderMeetings();
    else panel = renderArchive();
    Promise.resolve(panel).then(function (html) {
      shell((msg ? '<div class="wbn-tip">' + msg + '</div>' : "") + html);
    });
  }

  /* ---------- 汇报材料 ---------- */

  function formReports() {
    if (!me) return "";
    var opts = PROJECTS.map(function (p) {
      var sel = (me.project && me.project === p.name) ? " selected" : "";
      return '<option' + sel + '>' + esc(p.name) + '</option>';
    }).join("");
    return '<form class="wbn-form" id="wbn-rpt-form">' +
      '<div class="wbn-grid2">' +
        '<label class="wbn-field"><span>标题</span><input name="title" maxlength="60" placeholder="例如 第三周结构装配进度"></label>' +
        '<label class="wbn-field"><span>类型</span><select name="kind"><option>周报</option><option>阶段汇报</option><option>结题材料</option><option>论文</option><option>竞赛材料</option><option>其他</option></select></label>' +
        '<label class="wbn-field"><span>所属课题</span><select name="project"><option value="">不填</option>' + opts + '</select></label>' +
        '<label class="wbn-field"><span>文件（PDF / PPT / Word，单份不超过 15 MB，可不传）</span><input type="file" name="file"></label>' +
      '</div>' +
      '<label class="wbn-field"><span>内容摘要</span><textarea name="summary" rows="2" maxlength="200" placeholder="一句话说明这次汇报的要点"></textarea></label>' +
      '<div class="wbn-actions"><button type="submit" class="wbn-btn wbn-btn-main">提交汇报</button><span class="wbn-msg" id="wbn-rpt-msg"></span></div>' +
      '</form>';
  }

  function reportsList(rows) {
    if (!rows.length) return '<p class="wbn-empty">还没有人提交材料。</p>';
    var items = rows.map(function (r) {
      var f = r.file_url
        ? '<a class="wbn-file" href="' + esc(r.file_url) + '" target="_blank" rel="noopener">' + esc(r.file_name || "附件") + '（' + fmtSize(r.file_size) + '）</a>'
        : '<span class="wbn-dim">无附件</span>';
      return '<div class="wbn-item">' +
        '<div class="wbn-item-top"><b>' + esc(r.title) + '</b>' + statusNone(r.kind) + '</div>' +
        '<div class="wbn-item-sub">' + esc(r.name) + (r.project ? ' · ' + esc(r.project) : '') + ' · ' + esc(fmtDate(r.created_at)) + '</div>' +
        (r.summary ? '<div class="wbn-item-body">' + esc(r.summary) + '</div>' : '') +
        '<div class="wbn-item-foot">' + f + '</div>' +
        '</div>';
    }).join("");
    return '<div class="wbn-list">' + items + '</div>';
  }

  function statusNone(kind) {
    return kind ? '<span class="wbn-kind">' + esc(kind) + '</span>' : "";
  }

  function renderReports() {
    return rest("reports?select=*&order=created_at.desc&limit=60").then(function (rows) {
      var html = '<h3 class="wbn-h">提交材料</h3>' + formReports() +
        '<h3 class="wbn-h">全部材料<span class="wbn-count">' + rows.length + '</span></h3>' + reportsList(rows);
      setTimeout(bindReportForm, 0);
      return html;
    });
  }

  function bindReportForm() {
    var f = root.querySelector("#wbn-rpt-form");
    if (!f) return;
    f.addEventListener("submit", function (ev) {
      ev.preventDefault();
      var msg = root.querySelector("#wbn-rpt-msg");
      var title = (f.title.value || "").trim();
      if (!title) { msg.className = "wbn-msg wbn-msg-err"; msg.textContent = "标题要填。"; return; }
      var file = f.file.files && f.file.files[0];
      if (file && file.size > MAX_MB * 1048576) {
        msg.className = "wbn-msg wbn-msg-err"; msg.textContent = "文件超过 " + MAX_MB + " MB，先压缩或放进网盘贴链接。"; return;
      }
      msg.className = "wbn-msg"; msg.textContent = file ? "上传中…" : "提交中…";
      var doUpload = file ? uploadFile(file) : Promise.resolve({ url: "", name: "", size: 0 });
      doUpload.then(function (up) {
        return rpc("submit_report", {
          p_name: me.name, p_sid: me.sid, p_project: f.project.value || "",
          p_title: title, p_kind: f.kind.value, p_summary: (f.summary.value || "").trim(),
          p_file_name: up.name, p_file_url: up.url, p_file_size: up.size
        });
      }).then(function (id) {
        if (!id) throw new Error("提交被拒绝，请确认登录状态");
        go("已提交：" + esc(title));
      }).catch(function (e) {
        msg.className = "wbn-msg wbn-msg-err"; msg.textContent = e.message;
      });
    });
  }

  function uploadFile(file) {
    var safe = file.name.replace(/[^\w.\-]+/g, "_").slice(-60) || "file";
    var path = "reports/" + Date.now() + "_" + safe;
    return fetch(cfg.url + "/storage/v1/object/lab-files/" + encodeURI(path), {
      method: "POST",
      headers: {
        apikey: cfg.key, Authorization: "Bearer " + cfg.key,
        "Content-Type": file.type || "application/octet-stream", "x-upsert": "true"
      },
      body: file
    }).then(function (r) {
      if (!r.ok) return r.text().then(function (t) { throw new Error("上传失败 " + r.status + " " + t.slice(0, 60)); });
      return { url: cfg.url + "/storage/v1/object/public/lab-files/" + encodeURI(path), name: file.name, size: file.size };
    });
  }

  /* ---------- 阶段成果 ---------- */

  function formMilestone() {
    if (!me) return "";
    var opts = PROJECTS.map(function (p) {
      var sel = (me.project && me.project === p.name) ? " selected" : "";
      return '<option' + sel + '>' + esc(p.name) + '</option>';
    }).join("");
    var tip = me.role === "admin" ? "" : '<p class="wbn-tip">先在自己的个人资料里选定课题，才能登记这个课题的成果。</p>';
    return tip + '<form class="wbn-form" id="wbn-ms-form">' +
      '<div class="wbn-grid2">' +
        '<label class="wbn-field"><span>成果</span><input name="title" maxlength="50" placeholder="例如 样机装配完成、专利申请受理"></label>' +
        '<label class="wbn-field"><span>达成日期</span><input name="date" type="date"></label>' +
        '<label class="wbn-field"><span>所属课题</span><select name="project"><option value="">不填</option>' + opts + '</select></label>' +
        '<label class="wbn-field"><span>佐证链接（照片或文件地址，可不填）</span><input name="evidence" maxlength="200" placeholder="https://"></label>' +
      '</div>' +
      '<label class="wbn-field"><span>说明</span><textarea name="detail" rows="2" maxlength="120" placeholder="做到什么程度，关键数据是多少"></textarea></label>' +
      '<div class="wbn-actions"><button type="submit" class="wbn-btn wbn-btn-main">登记成果</button><span class="wbn-msg" id="wbn-ms-msg"></span></div>' +
      '</form>';
  }

  function milestoneList(rows) {
    if (!rows.length) return '<p class="wbn-empty">还没有登记成果。</p>';
    var items = rows.map(function (m) {
      return '<div class="wbn-item">' +
        '<div class="wbn-item-top"><b>' + esc(m.title) + '</b><span class="wbn-kind">' + esc(fmtDate(m.achieved_on)) + '</span></div>' +
        '<div class="wbn-item-sub">' + esc(m.project || "未指定课题") + ' · ' + esc(m.created_by || "") + '</div>' +
        (m.detail ? '<div class="wbn-item-body">' + esc(m.detail) + '</div>' : '') +
        (m.evidence_url ? '<div class="wbn-item-foot"><a class="wbn-file" href="' + esc(m.evidence_url) + '" target="_blank" rel="noopener">查看佐证</a></div>' : '') +
        '</div>';
    }).join("");
    return '<div class="wbn-list">' + items + '</div>';
  }

  function renderMilestones() {
    return rest("milestones?select=*&order=achieved_on.desc&limit=40").then(function (rows) {
      var html = '<h3 class="wbn-h">登记</h3>' + formMilestone() +
        '<h3 class="wbn-h">已登记<span class="wbn-count">' + rows.length + '</span></h3>' + milestoneList(rows);
      setTimeout(function () {
        var f = root.querySelector("#wbn-ms-form");
        if (!f) return;
        f.addEventListener("submit", function (ev) {
          ev.preventDefault();
          var msg = root.querySelector("#wbn-ms-msg");
          var title = (f.title.value || "").trim();
          if (!title) { msg.className = "wbn-msg wbn-msg-err"; msg.textContent = "成果名称要填。"; return; }
          msg.className = "wbn-msg"; msg.textContent = "保存中…";
          rpc("add_milestone", {
            p_name: me.name, p_sid: me.sid, p_project: f.project.value || "",
            p_title: title, p_date: f.date.value || null,
            p_detail: (f.detail.value || "").trim(), p_evidence: (f.evidence.value || "").trim()
          }).then(function (id) {
            if (!id) throw new Error("登记被拒绝，先确认个人资料里的课题和这里一致");
            go("已登记：" + esc(title));
          }).catch(function (e) { msg.className = "wbn-msg wbn-msg-err"; msg.textContent = e.message; });
        });
      }, 0);
      return html;
    });
  }

  /* ---------- 耗材申请 ---------- */
  function formPurchase() {
    if (!me) return "";
    var opts = PROJECTS.map(function (p) {
      var sel = (me.project && me.project === p.name) ? " selected" : "";
      return '<option' + sel + '>' + esc(p.name) + '</option>';
    }).join("");
    return '<form class="wbn-form" id="wbn-pur-form">' +
      '<div class="wbn-grid2">' +
        '<label class="wbn-field"><span>物品</span><input name="item" maxlength="40" placeholder="例如 PETG 线材、砂纸、密封胶"></label>' +
        '<label class="wbn-field"><span>规格型号</span><input name="spec" maxlength="40" placeholder="例如 1.75mm 1kg / 400 目"></label>' +
        '<label class="wbn-field"><span>数量</span><input name="qty" type="number" step="0.1" min="0.1" value="1"></label>' +
        '<label class="wbn-field"><span>单位</span><input name="unit" maxlength="8" value="件" placeholder="卷 / 瓶 / 包"></label>' +
        '<label class="wbn-field"><span>预估金额（元）</span><input name="budget" type="number" step="0.01" min="0" placeholder="不知道可以不填"></label>' +
        '<label class="wbn-field"><span>希望到手日期</span><input name="need_by" type="date"></label>' +
        '<label class="wbn-field"><span>所属课题</span><select name="project"><option value="">不填</option>' + opts + '</select></label>' +
      '</div>' +
      '<label class="wbn-field"><span>用途</span><textarea name="reason" rows="2" maxlength="120" placeholder="买来做什么，用在哪台设备或哪个样机上"></textarea></label>' +
      '<div class="wbn-actions"><button type="submit" class="wbn-btn wbn-btn-main">提交申请</button><span class="wbn-msg" id="wbn-pur-msg"></span></div>' +
      '</form>';
  }

  function purchaseList(rows) {
    if (!rows.length) return '<p class="wbn-empty">还没有采购申请。</p>';
    var items = rows.map(function (p) {
      var admin = isAdmin()
        ? '<div class="wbn-admin-row">' +
            '<select class="wbn-status-sel" data-id="' + p.id + '">' +
              ["pending", "approved", "ordered", "done", "rejected"].map(function (s) {
                return '<option value="' + s + '"' + (p.status === s ? " selected" : "") + '>' + STATUS_TEXT[s] + '</option>';
              }).join("") +
            '</select>' +
            '<input class="wbn-note-in" data-id="' + p.id + '" maxlength="40" placeholder="审批备注" value="' + esc(p.admin_note || "") + '">' +
            '<button type="button" class="wbn-btn wbn-mini wbn-save-status" data-id="' + p.id + '">保存</button>' +
          '</div>'
        : (p.admin_note ? '<div class="wbn-item-foot wbn-dim">老师备注：' + esc(p.admin_note) + '</div>' : "");
      return '<div class="wbn-item">' +
        '<div class="wbn-item-top"><b>' + esc(p.item) + '</b>' + statusBadge(p.status) + '</div>' +
        '<div class="wbn-item-sub">' + esc(p.name) + (p.project ? ' · ' + esc(p.project) : '') + ' · ' + esc(fmtDate(p.created_at)) + '</div>' +
        '<div class="wbn-item-body">' + esc([p.spec, (p.qty + " " + p.unit), (p.budget ? ("约 " + p.budget + " 元") : ""), (p.need_by ? ("希望 " + p.need_by + " 前到手") : "")]
          .filter(function (x) { return x && String(x).trim(); }).join(" · ")) + '</div>' +
        (p.reason ? '<div class="wbn-item-body wbn-quiet">' + esc(p.reason) + '</div>' : '') +
        admin + '</div>';
    }).join("");
    return '<div class="wbn-list">' + items + '</div>';
  }

  function renderPurchases() {
    return rest("purchases?select=*&order=created_at.desc&limit=60").then(function (rows) {
      var html = '<h3 class="wbn-h">提申请</h3>' + formPurchase() +
        '<h3 class="wbn-h">申请记录<span class="wbn-count">' + rows.length + '</span></h3>' + purchaseList(rows);
      setTimeout(bindPurchase, 0);
      return html;
    });
  }

  function bindPurchase() {
    var f = root.querySelector("#wbn-pur-form");
    if (f) {
      f.addEventListener("submit", function (ev) {
        ev.preventDefault();
        var msg = root.querySelector("#wbn-pur-msg");
        var item = (f.item.value || "").trim();
        if (!item) { msg.className = "wbn-msg wbn-msg-err"; msg.textContent = "物品要填。"; return; }
        msg.className = "wbn-msg"; msg.textContent = "提交中…";
        rpc("submit_purchase", {
          p_name: me.name, p_sid: me.sid, p_project: f.project.value || "",
          p_item: item, p_spec: (f.spec.value || "").trim(),
          p_qty: Number(f.qty.value) || 1, p_unit: (f.unit.value || "件").trim(),
          p_budget: Number(f.budget.value) || 0, p_reason: (f.reason.value || "").trim(),
          p_need_by: f.need_by.value || null
        }).then(function (id) {
          if (!id) throw new Error("提交被拒绝，请确认登录状态");
          go("已提交：<b>" + esc(item) + '</b>，等老师审核。');
        }).catch(function (e) { msg.className = "wbn-msg wbn-msg-err"; msg.textContent = e.message; });
      });
    }
    Array.prototype.forEach.call(root.querySelectorAll(".wbn-save-status"), function (b) {
      b.addEventListener("click", function () {
        var id = b.getAttribute("data-id");
        var sel = root.querySelector('.wbn-status-sel[data-id="' + id + '"]');
        var note = root.querySelector('.wbn-note-in[data-id="' + id + '"]');
        b.textContent = "保存中…";
        rpc("set_purchase_status", {
          p_name: me.name, p_sid: me.sid, p_id: Number(id),
          p_status: sel.value, p_note: (note.value || "")
        }).then(function (ok) {
          if (!ok) throw new Error("没有权限");
          go("已更新状态。");
        }).catch(function (e) { b.textContent = e.message; });
      });
    });
  }

  /* ---------- 交流安排 ---------- */

  function formMeeting() {
    if (!isAdmin()) return "";
    return '<form class="wbn-form" id="wbn-meet-form">' +
      '<div class="wbn-grid2">' +
        '<label class="wbn-field"><span>主题</span><input name="title" maxlength="40" placeholder="例如 本周课题交流"></label>' +
        '<label class="wbn-field"><span>日期</span><input name="date" type="date"></label>' +
        '<label class="wbn-field"><span>时间段</span><input name="slot" maxlength="20" placeholder="19:30-21:00"></label>' +
        '<label class="wbn-field"><span>地点</span><input name="place" maxlength="30" placeholder="实验室 302"></label>' +
      '</div>' +
      '<label class="wbn-field"><span>议题</span><textarea name="agenda" rows="2" maxlength="120" placeholder="要谁讲什么，需要带什么"></textarea></label>' +
      '<div class="wbn-actions"><button type="submit" class="wbn-btn wbn-btn-main">安排一次</button><span class="wbn-msg" id="wbn-meet-msg"></span></div>' +
      '</form>';
  }

  function meetingList(rows) {
    if (!rows.length) return '<p class="wbn-empty">还没有安排交流。</p>';
    var items = rows.map(function (m) {
      return '<div class="wbn-item">' +
        '<div class="wbn-item-top"><b>' + esc(m.title) + '</b><span class="wbn-kind">' + esc(m.meet_on) + '</span></div>' +
        '<div class="wbn-item-sub">' + esc([m.slot, m.place, m.project].filter(function (x) { return x; }).join(" · ")) + '</div>' +
        (m.agenda ? '<div class="wbn-item-body">议题：' + esc(m.agenda) + '</div>' : '') +
        (m.minutes ? '<div class="wbn-item-body wbn-quiet">纪要：' + esc(m.minutes) + '</div>' : '') +
        '<div class="wbn-item-foot wbn-dim">' + esc(m.created_by || "") + '</div>' +
        '</div>';
    }).join("");
    return '<div class="wbn-list">' + items + '</div>';
  }

  function renderMeetings() {
    return rest("meetings?select=*&order=meet_on.desc&limit=30").then(function (rows) {
      var html = (isAdmin() ? '<h3 class="wbn-h">安排交流</h3>' + formMeeting() : '') +
        '<h3 class="wbn-h">交流记录<span class="wbn-count">' + rows.length + '</span></h3>' + meetingList(rows);
      setTimeout(function () {
        var f = root.querySelector("#wbn-meet-form");
        if (!f) return;
        f.addEventListener("submit", function (ev) {
          ev.preventDefault();
          var msg = root.querySelector("#wbn-meet-msg");
          if (!f.date.value) { msg.className = "wbn-msg wbn-msg-err"; msg.textContent = "日期要选。"; return; }
          msg.className = "wbn-msg"; msg.textContent = "保存中…";
          rpc("add_meeting", {
            p_name: me.name, p_sid: me.sid, p_title: (f.title.value || "").trim(),
            p_date: f.date.value, p_slot: (f.slot.value || "").trim(),
            p_place: (f.place.value || "").trim(), p_project: "",
            p_agenda: (f.agenda.value || "").trim()
          }).then(function (id) {
            if (!id) throw new Error("保存失败");
            go("已安排。");
          }).catch(function (e) { msg.className = "wbn-msg wbn-msg-err"; msg.textContent = e.message; });
        });
      }, 0);
      return html;
    });
  }

  /* ---------- 学生档案 ---------- */

  function renderArchive() {
    if (!isAdmin()) return Promise.resolve('<p class="wbn-empty">学生档案只有管理员能看。</p>');
    return rpc("archive_overview", { p_name: me.name, p_sid: me.sid }).then(function (d) {
      if (!d) return '<p class="wbn-empty">读取失败，请重新登录。</p>';
      var list = d.students || [];
      var cards = list.map(function (s) {
        var pct = Math.max(0, Math.min(100, Math.round(Number(s.percent) || 0)));
        return '<div class="wbn-card">' +
          '<div class="wbn-card-top"><b>' + esc(s.name) + '</b>' + (s.role === "admin" ? '<span class="wbn-kind">管理员</span>' : "") + '</div>' +
          '<div class="wbn-card-proj">' + (s.project ? esc(s.project) : '<span class="wbn-dim">未认领课题</span>') + '</div>' +
          '<div class="wbn-bar"><i style="width:' + pct + '%"></i></div>' +
          '<div class="wbn-card-meta">' + (s.stage ? esc(s.stage) : "未开始") + ' · ' + pct + '%</div>' +
          '<div class="wbn-card-stats">' +
            '<span>材料 ' + (s.reports || 0) + '</span>' +
            '<span>成果 ' + (s.milestones || 0) + '</span>' +
            '<span>采购 ' + (s.purchases || 0) + '（在办 ' + (s.purchases_open || 0) + '）</span>' +
          '</div>' +
          (s.latest_report ? '<div class="wbn-card-last">最近：' + esc(s.latest_report) + '<br><span class="wbn-dim">' + esc(s.latest_report_at) + '</span></div>' : '<div class="wbn-card-last wbn-dim">还没提交材料</div>') +
          '</div>';
      }).join("");
      var ms = (d.milestones || []).map(function (m) {
        return '<div class="wbn-item"><div class="wbn-item-top"><b>' + esc(m.title) + '</b><span class="wbn-kind">' + esc(m.achieved_on || "") + '</span></div>' +
          '<div class="wbn-item-sub">' + esc(m.project || "未指定课题") + ' · ' + esc(m.created_by || "") + '</div>' +
          (m.detail ? '<div class="wbn-item-body">' + esc(m.detail) + '</div>' : "") +
          (m.evidence_url ? '<div class="wbn-item-foot"><a class="wbn-file" href="' + esc(m.evidence_url) + '" target="_blank" rel="noopener">查看佐证</a></div>' : "") +
          '</div>';
      }).join("");
      return '<h3 class="wbn-h">学生档案<span class="wbn-count">' + list.length + ' 人</span></h3>' +
        '<div class="wbn-cards">' + cards + '</div>' +
        '<h3 class="wbn-h">阶段性成果<span class="wbn-count">' + (d.milestones || []).length + '</span></h3>' +
        ((d.milestones || []).length ? '<div class="wbn-list">' + ms + '</div>' : '<p class="wbn-empty">还没有登记成果。</p>');
    });
  }

  /* ---------- 启动 ---------- */

  rest("projects?select=name&order=id").then(function (rows) { PROJECTS = rows || []; go(); });

  // 登录状态变化后重画（登录浮层关掉时 member-auth 会改 localStorage）
  setInterval(function () {
    var now = state();
    var same = (now && me && now.name === me.name && now.sid === me.sid) || (!now && !me);
    if (!same) { me = now; go(); }
  }, 1200);

  window.__chenlabWorkbench = { reload: go };
})();
