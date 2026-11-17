/* 实验室工作台：汇报材料 / 耗材申请 / 交流安排 / 学生档案。
   写入全部走 security definer 函数，无权限的人前端改了也提交不上去。 */
(function () {
  if (window.__chenlabWorkbenchLoaded) return;
  window.__chenlabWorkbenchLoaded = true;

  var cfg = window.LAB_SB || {};
  var root = document.getElementById("wbn-root");
  if (!root || !cfg.url || !cfg.key) return;

  var STORE = "chenlab_member";
  var MAX_MB = 25;
  var TAB = "reports";
  var PROJECTS = [];
  var CLIST = {};
  /** 把“肖扬、李伟锐”这类输入规范成、姓名、形式，并自动带上提交人自己 */
  function memberTag(raw, owner) {
    var arr = String(raw || "").split(/[、,，;；\s]+/).filter(function (x) { return !!x; });
    var seen = {}, out = [];
    [owner].concat(arr).forEach(function (n) {
      n = String(n || "").trim();
      if (n && !seen[n]) { seen[n] = 1; out.push(n); }
    });
    return "、" + out.join("、") + "、";
  }

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
    { k: "reports", t: "汇报成果" },
    { k: "contest", t: "竞赛成果" },
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
    else if (TAB === "contest") panel = renderContest();
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
        '<label class="wbn-field"><span>标题</span><input name="title" maxlength="60" placeholder="例如 第三周结构装配进度 / 样机装配完成"></label>' +
        '<label class="wbn-field"><span>类型</span><select name="kind"><option>周报</option><option>阶段汇报</option><option>阶段成果</option><option>结题材料</option><option>论文</option><option>竞赛材料</option><option>其他</option></select></label>' +
        '<label class="wbn-field"><span>所属课题</span><select name="project"><option value="">请选择课题</option>' + opts + '</select></label>' +
        '<label class="wbn-field"><span>证明材料（图片、压缩包、PDF、PPT、Word 等，单份不超过 25 MB，可不传）</span><input type="file" name="file"></label>' +
      '</div>' +
      '<label class="wbn-field"><span>说明</span><textarea name="summary" rows="2" maxlength="200" placeholder="一句话说清这次汇报的要点，或这个成果做到什么程度、关键数据是多少"></textarea></label>' +
      '<div class="wbn-actions"><button type="submit" class="wbn-btn wbn-btn-main">提交</button><span class="wbn-msg" id="wbn-rpt-msg"></span></div>' +
      '</form>';
  }

  function commentsByReport(rows) {
    var g = {};
    (rows || []).forEach(function (c) {
      var k = String(c.report_id);
      (g[k] = g[k] || []).push(c);
    });
    return g;
  }

  function threadBlock(id, cs) {
    var list = (cs || []).map(function (c) {
      var t = String(c.created_at || "").slice(0, 16).replace("T", " ");
      return '<div class="wbn-cmt"><div class="wbn-cmt-h"><b>' + esc(c.name) + '</b><span class="wbn-cmt-t">' + esc(t) + '</span></div>' +
        '<div class="wbn-cmt-b">' + esc(c.body) + '</div></div>';
    }).join("");
    var form = me
      ? '<form class="wbn-cmt-form" data-report="' + id + '">' +
          '<input name="body" maxlength="300" placeholder="回复这条，例如“证书收到，等次按省级二等登记”">' +
          '<button type="submit" class="wbn-cmt-send">发送</button></form>'
      : '<p class="wbn-cmt-hint">登录后可以回复。</p>';
    return '<details class="wbn-thread"><summary>讨论 ' + (cs ? cs.length : 0) + '</summary>' +
      '<div class="wbn-cmt-list">' + (list || '<p class="wbn-cmt-hint">还没有留言。</p>') + '</div>' + form + '</details>';
  }

  function bindThreads() {
    Array.prototype.forEach.call(root.querySelectorAll(".wbn-cmt-form"), function (f) {
      f.addEventListener("submit", function (ev) {
        ev.preventDefault();
        if (!me) return;
        var body = (f.body.value || "").trim();
        if (!body) return;
        var btn = f.querySelector(".wbn-cmt-send");
        btn.disabled = true;
        btn.textContent = "发送中…";
        rpc("add_comment", {
          p_name: me.name, p_sid: me.sid,
          p_report_id: Number(f.getAttribute("data-report")), p_body: body
        }).then(function (id) {
          if (!id) throw new Error("留言被拒绝，请重新登录后再试");
          go();
        }).catch(function (e) {
          btn.disabled = false;
          btn.textContent = "发送";
          alert(e.message);
        });
      });
    });
  }

  function reportsList(rows, cm) {
    if (!rows.length) return '<p class="wbn-empty">还没有人提交。</p>';
    var items = rows.map(function (r) {
      var f = r.file_url
        ? '<a class="wbn-file" href="' + esc(r.file_url) + '" target="_blank" rel="noopener">' + esc(r.file_name || "附件") + '（' + fmtSize(r.file_size) + '）</a>'
        : '<span class="wbn-dim">无附件</span>';
      return '<div class="wbn-item">' +
        '<div class="wbn-item-top"><b>' + esc(r.title) + '</b>' + statusNone(r.kind) + '</div>' +
        '<div class="wbn-item-sub">' + esc(r.name) + (r.project ? ' · ' + esc(r.project) : '') + ' · ' + esc(fmtDate(r.created_at)) + '</div>' +
        (r.summary ? '<div class="wbn-item-body">' + esc(r.summary) + '</div>' : '') +
        '<div class="wbn-item-foot">' + f + '</div>' +
        threadBlock(r.id, (cm || {})[String(r.id)]) +
        '</div>';
    }).join("");
    return '<div class="wbn-list">' + items + '</div>';
  }

  function statusNone(kind) {
    return kind ? '<span class="wbn-kind">' + esc(kind) + '</span>' : "";
  }

  function renderReports() {
    return Promise.all([
      rest("reports?select=*&order=created_at.desc&limit=60"),
      rest("report_comments?select=*&order=id.asc&limit=400")
    ]).then(function (res) {
      var rows = res[0] || [];
      var cm = commentsByReport(res[1]);
      var html = '<h3 class="wbn-h">提交</h3>' + formReports() +
        '<h3 class="wbn-h">已提交<span class="wbn-count">' + rows.length + '</span></h3>' + reportsList(rows, cm);
      setTimeout(function () { bindReportForm(); bindThreads(); }, 0);
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
      if (!f.project.value) { msg.className = "wbn-msg wbn-msg-err"; msg.textContent = "先选所属课题。"; return; }
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

  /* ---------- 竞赛成果 ---------- */

  var LEVELS = ["国家级", "省级", "赛区级", "市级", "校级", "国际级"];
  var RANKS = ["一等奖", "二等奖", "三等奖", "优秀奖", "入围奖", "特等奖"];

  function formContest() {
    if (!me) return "";
    var opts = PROJECTS.map(function (p) {
      var sel = (me.project && me.project === p.name) ? " selected" : "";
      return '<option' + sel + '>' + esc(p.name) + '</option>';
    }).join("");
    var lv = LEVELS.map(function (x) { return "<option>" + x + "</option>"; }).join("");
    var rk = RANKS.map(function (x) { return "<option>" + x + "</option>"; }).join("");
    return '<form class="wbn-form" id="wbn-ct-form">' +
      '<div class="wbn-grid2">' +
        '<label class="wbn-field"><span>竞赛名称</span><input name="contest" maxlength="70" placeholder="例如 中国机械工程创新创业大赛"></label>' +
        '<label class="wbn-field"><span>获奖级别</span><select name="level">' + lv + '</select></label>' +
        '<label class="wbn-field"><span>奖项等次</span><select name="rank">' + rk + '</select></label>' +
        '<label class="wbn-field"><span>获奖时间</span><input name="date" type="date"></label>' +
        '<label class="wbn-field"><span>参赛成员（顿号分隔）</span><input name="members" maxlength="80" placeholder="例如 肖扬、李伟锐"></label>' +
        '<label class="wbn-field"><span>所属课题</span><select name="project"><option value="">请选择课题</option>' + opts + '</select></label>' +
        '<label class="wbn-field"><span>证书或现场照片（图片 / PDF，单份不超过 25 MB）</span><input type="file" name="file"></label>' +
      '</div>' +
      '<label class="wbn-field"><span>补充说明</span><textarea name="detail" rows="2" maxlength="140" placeholder="项目名称、赛道、作品名等"></textarea></label>' +
      '<div class="wbn-actions"><button type="submit" class="wbn-btn wbn-btn-main">提交竞赛成果</button><span class="wbn-msg" id="wbn-ct-msg"></span></div>' +
      '</form>';
  }

  function contestTitle(c) {
    return esc(c.title || "竞赛成果");
  }

  function contestList(rows, cm) {
    if (!rows.length) return '<p class="wbn-empty">还没有提交竞赛成果。</p>';
    var items = rows.map(function (c) {
      var f = c.file_url
        ? '<a class="wbn-file" href="' + esc(c.file_url) + '" target="_blank" rel="noopener">' + esc(c.file_name || "证书") + '（' + fmtSize(c.file_size) + '）</a>'
        : '<span class="wbn-dim">无证书文件</span>';
      return '<div class="wbn-item">' +
        '<div class="wbn-item-top"><b>' + contestTitle(c) + '</b><span class="wbn-kind">' + esc(fmtDate(c.created_at)) + '</span></div>' +
        '<div class="wbn-item-sub">' + esc(c.name) + (c.project ? ' · ' + esc(c.project) : '') + '</div>' +
        (c.summary ? '<div class="wbn-item-body">' + esc(c.summary) + '</div>' : '') +
        '<div class="wbn-item-foot">' + f + '</div>' +
        threadBlock(c.id, (cm || {})[String(c.id)]) +
        '</div>';
    }).join("");
    return '<div class="wbn-list">' + items + '</div>';
  }

  function renderContest() {
    var q = "reports?select=*&kind=eq." + encodeURIComponent("竞赛成果") + "&order=created_at.desc&limit=40";
    return Promise.all([
      rest(q),
      rest("report_comments?select=*&order=id.asc&limit=400")
    ]).then(function (res) {
      var rows = res[0] || [];
      var cm = commentsByReport(res[1]);
      var html = '<h3 class="wbn-h">提交</h3>' + formContest() +
        '<h3 class="wbn-h">已提交<span class="wbn-count">' + rows.length + '</span></h3>' + contestList(rows, cm);
      setTimeout(function () { bindContestForm(); bindThreads(); }, 0);
      return html;
    });
  }

  function bindContestForm() {
    var f = root.querySelector("#wbn-ct-form");
    if (!f) return;
    f.addEventListener("submit", function (ev) {
      ev.preventDefault();
      var msg = root.querySelector("#wbn-ct-msg");
      var cname = (f.contest.value || "").trim();
      if (!cname) { msg.className = "wbn-msg wbn-msg-err"; msg.textContent = "竞赛名称要填。"; return; }
      if (!f.project.value) { msg.className = "wbn-msg wbn-msg-err"; msg.textContent = "先选所属课题。"; return; }
      var file = f.file.files && f.file.files[0];
      if (file && file.size > MAX_MB * 1048576) {
        msg.className = "wbn-msg wbn-msg-err"; msg.textContent = "文件超过 " + MAX_MB + " MB，压缩一下再传。"; return;
      }
      msg.className = "wbn-msg"; msg.textContent = file ? "上传中…" : "提交中…";
      var up = file ? uploadFile(file) : Promise.resolve({ url: "", name: "", size: 0 });
      up.then(function (u) {
        var bits = [f.level.value, f.rank.value];
        var mem = (f.members.value || "").trim();
        if (mem) bits.push("成员：" + mem);
        if (f.date.value) bits.push(f.date.value);
        var extra = (f.detail.value || "").trim();
        if (extra) bits.push(extra);
        return rpc("submit_report", {
          p_name: me.name, p_sid: me.sid, p_project: f.project.value,
          p_title: cname, p_kind: "竞赛成果", p_summary: bits.join(" · "),
          p_file_name: u.name, p_file_url: u.url, p_file_size: u.size,
          p_members: memberTag(mem, me.name)
        });
      }).then(function (id) {
        if (!id) throw new Error("提交被拒绝，请确认登录状态");
        go("已提交：" + esc(cname));
      }).catch(function (e) { msg.className = "wbn-msg wbn-msg-err"; msg.textContent = e.message; });
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
        '<label class="wbn-field"><span>数量</span><input name="qty" type="number" step="1" min="1" value="1" inputmode="numeric" placeholder="1"></label>' +
        '<label class="wbn-field"><span>单位</span><input name="unit" maxlength="8" value="件" placeholder="卷 / 瓶 / 包"></label>' +
        '<label class="wbn-field"><span>预估金额（元）</span><input name="budget" type="number" step="0.01" min="0" placeholder="不知道可以不填"></label>' +
        '<label class="wbn-field"><span>希望到手日期</span><input name="need_by" type="date"></label>' +
        '<label class="wbn-field"><span>所属课题</span><select name="project"><option value="">请选择课题</option>' + opts + '</select></label>' +
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
        if (!f.project.value) { msg.className = "wbn-msg wbn-msg-err"; msg.textContent = "先选所属课题。"; return; }
        msg.className = "wbn-msg"; msg.textContent = "提交中…";
        rpc("submit_purchase", {
          p_name: me.name, p_sid: me.sid, p_project: f.project.value || "",
          p_item: item, p_spec: (f.spec.value || "").trim(),
          p_qty: Math.max(1, Math.round(Number(f.qty.value) || 1)), p_unit: (f.unit.value || "件").trim(),
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
      CLIST = {};
      var cards = list.map(function (s) {
        var pct = Math.max(0, Math.min(100, Math.round(Number(s.percent) || 0)));
        var ct = s.contests || 0;
        var cl = s.contest_list || [];
        if (cl.length) CLIST[s.name] = cl;
        var ctBtn = cl.length
          ? '<button type="button" class="wbn-link" data-wbn-ct="' + esc(s.name) + '">竞赛成果 ' + ct + ' 项 ▾</button>'
          : '<span class="wbn-dim">竞赛成果 0</span>';
        return '<div class="wbn-card">' +
          '<div class="wbn-card-top"><b>' + esc(s.name) + '</b>' + (s.role === "admin" ? '<span class="wbn-kind">管理员</span>' : "") + '</div>' +
          '<div class="wbn-card-proj">' + (s.project ? esc(s.project) : '<span class="wbn-dim">未认领课题</span>') + '</div>' +
          '<div class="wbn-bar"><i style="width:' + pct + '%"></i></div>' +
          '<div class="wbn-card-meta">' + (s.stage ? esc(s.stage) : "未开始") + ' · ' + pct + '%</div>' +
          '<div class="wbn-card-stats">' +
            '<span>材料 ' + (s.reports || 0) + '</span>' +
            '<span>采购 ' + (s.purchases || 0) + '（在办 ' + (s.purchases_open || 0) + '）</span>' +
          '</div>' +
          '<div class="wbn-card-ct">' + ctBtn + '</div>' +
          (s.latest_report ? '<div class="wbn-card-last">最近：' + esc(s.latest_report) + '<br><span class="wbn-dim">' + esc(s.latest_report_at) + '</span></div>' : '<div class="wbn-card-last wbn-dim">还没提交材料</div>') +
          '</div>';
      }).join("");
      var html = '<h3 class="wbn-h">学生档案<span class="wbn-count">' + list.length + ' 人</span></h3>' +
        '<div class="wbn-cards">' + cards + '</div>';
      setTimeout(function () {
        Array.prototype.forEach.call(root.querySelectorAll("[data-wbn-ct]"), function (b) {
          b.addEventListener("click", function () {
            var nm = b.getAttribute("data-wbn-ct");
            var card = b.closest(".wbn-card");
            var box = card.querySelector(".wbn-ct-box");
            if (box) { box.remove(); b.textContent = "竞赛成果 " + (CLIST[nm] || []).length + " 项 ▾"; return; }
            var rows = CLIST[nm] || [];
            var inner = rows.map(function (c) {
              return '<div class="wbn-ct-row">' +
                '<div class="wbn-ct-t">' + esc(c.title) + '</div>' +
                '<div class="wbn-ct-s">' + esc(c.summary || "") + ' · 提交人 ' + esc(c.by || "") + ' · ' + esc(c.created_at || "") + '</div>' +
                (c.file_url ? '<a class="wbn-file" href="' + esc(c.file_url) + '" target="_blank" rel="noopener">证书</a>' : '') +
                '</div>';
            }).join("");
            var d2 = document.createElement("div");
            d2.className = "wbn-ct-box";
            d2.innerHTML = inner || '<p class="wbn-empty">没有记录。</p>';
            card.appendChild(d2);
            b.textContent = "收起 ▴";
          });
        });
      }, 0);
      return html;
    });
  }

  /* ---------- 启动 ---------- */

  rest("projects?select=name&order=name").then(function (rows) { PROJECTS = rows || []; go(); });

  // 登录状态变化后重画（登录浮层关掉时 member-auth 会改 localStorage）
  setInterval(function () {
    var now = state();
    var same = (now && me && now.name === me.name && now.sid === me.sid) || (!now && !me);
    if (!same) { me = now; go(); }
  }, 1200);

  window.__chenlabWorkbench = { reload: go };
})();
