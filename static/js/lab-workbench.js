/* 实验室工作台：汇报材料 / 耗材申请 / 交流安排 / 学生档案。
   写入全部走 security definer 函数，无权限的人前端改了也提交不上去。 */
(function () {
  if (window.__chenlabWorkbenchLoaded) return;
  window.__chenlabWorkbenchLoaded = true;

  var cfg = window.LAB_SB || {};
  var root = document.getElementById("wbn-root");
  if (!root || !cfg.url || !cfg.key) return;

  /* 独立栏目页通过 data-wbn-mod 指定只渲染哪一个模块；工作台首页无该属性，走卡片导航 */
  var PAGE_MOD = (root.getAttribute("data-wbn-mod") || "home").trim();
  var isHome = PAGE_MOD === "home";

  /* 工作台首页保留自己的内部分组侧栏；独立栏目页交还整站左侧导航 */
  if (isHome) {
    document.body.classList.add("wbn-page");
    (function markWide(el) {
      for (var i = 0; i < 3 && el; i++) { el.classList.add("wbn-wide"); el = el.parentElement; }
    })(root.parentElement);
  }

  var STORE = "chenlab_member";
  var MAX_MB = 50; /* Supabase 免费额度单文件上限 50 MB */
  var TAB = PAGE_MOD;
  var PROJECTS = [];
  var CLIST = {};
  var RLIST = {};
  var PLIST = {};
  var ARCH_STU = [];
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

  function projectOpts(cur) {
    return PROJECTS.map(function (p) {
      var sel = (cur && cur === p.name) ? " selected" : "";
      return '<option' + sel + '>' + esc(p.name) + '</option>';
    }).join("");
  }

  function fileZone(label) {
    return '<div class="wbn-drop">' +
      '<input type="file" name="file" hidden>' +
      '<div class="wbn-drop-row">' +
        '<button type="button" class="wbn-plus" title="从文件夹选择文件">+</button>' +
        '<span class="wbn-drop-t">' + esc(label || "添加文件") + '</span>' +
        '<button type="button" class="wbn-drop-clear" hidden>移除</button>' +
      '</div>' +
      '<div class="wbn-drop-hint">点 + 打开文件夹选择；也可以 Ctrl+V 粘贴截图或文件，或直接把文件拖进来</div>' +
      '<div class="wbn-drop-file"></div>' +
    '</div>';
  }

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

  var MODULES = [
    { k: "reports", url: "/reports/", group: "成果产出", t: "汇报成果", icon: "📝", desc: "周报、阶段汇报、论文与结题材料" },
    { k: "contest", url: "/contest/", group: "成果产出", t: "竞赛成果", icon: "🏆", desc: "比赛奖项、证书与参赛成员" },
    { k: "meetings", url: "/meetings/", group: "协作事务", t: "交流安排", icon: "🗓", desc: "组会、进度对齐与讨论时间" },
    { k: "purchases", url: "/purchases/", group: "协作事务", t: "耗材申请", icon: "🧾", desc: "耗材采购需求，提交后老师审核" },
    { k: "archive", url: "/archive/", group: "成员档案", t: "学生档案", icon: "👥", desc: "成员课题、进度与成果汇总", admin: true }
  ];
  var GROUPS = ["成果产出", "协作事务", "成员档案"];

  function visibleModules() {
    return MODULES.filter(function (m) { return !(m.admin && !isAdmin()); });
  }

  function sideNav() {
    var items = visibleModules();
    var groups = GROUPS.map(function (g) {
      var rows = items.filter(function (m) { return m.group === g; });
      if (!rows.length) return "";
      return '<div class="wbn-side-group"><div class="wbn-side-t">' + esc(g) + '</div>' +
        rows.map(function (m) {
          return '<a class="wbn-side-item" href="' + esc(m.url) + '">' +
            '<span class="wbn-side-ic">' + m.icon + '</span><span class="wbn-side-n">' + esc(m.t) + '</span>' +
            '<span class="wbn-side-badge" data-badge="' + m.k + '"></span></a>';
        }).join("") + '</div>';
    }).join("");
    return '<aside class="wbn-side">' + groups + '</aside>';
  }

  function shell(inner) {
    var side = isHome ? sideNav() : "";
    root.innerHTML = '<div class="wbn-shell' + (isHome ? "" : " wbn-shell-solo") + '">' + side +
      '<main class="wbn-main"><div class="wbn-top">' + headBox() + '</div>' +
      '<div class="wbn-panel" id="wbn-panel">' + inner + '</div></main></div>';
    var lb = root.querySelector("#wbn-login");
    if (lb) lb.addEventListener("click", function () { if (window.__chenlabOpenLogin) window.__chenlabOpenLogin(); });
    Array.prototype.forEach.call(root.querySelectorAll("[data-mod]"), function (b) {
      b.addEventListener("click", function () { TAB = b.getAttribute("data-mod"); go(); });
    });
  }

  function go(msg) {
    var panel;
    if (TAB === "home") panel = homeView();
    else if (TAB === "reports") panel = renderReports();
    else if (TAB === "contest") panel = renderContest();
    else if (TAB === "purchases") panel = renderPurchases();
    else if (TAB === "meetings") panel = renderMeetings();
    else panel = renderArchive();
    Promise.resolve(panel).then(function (html) {
      shell((msg ? '<div class="wbn-tip">' + msg + '</div>' : "") + html);
    });
  }

  /* 档案页交互统一在根节点委托，面板重渲染后监听不丢 */
  root.addEventListener("click", function (ev) {
    var back = ev.target.closest("[data-wbn-arch-back]");
    if (back) { go(); return; }
    var mem = ev.target.closest("[data-wbn-member]");
    if (mem) { ev.stopPropagation(); showArchMember(mem.getAttribute("data-wbn-member")); return; }
    var ct = ev.target.closest("[data-wbn-ct]");
    if (ct) { toggleArchiveSingle(ct, "data-wbn-ct", archiveCtRow); return; }
    var rpt = ev.target.closest("[data-wbn-rpt]");
    if (rpt) { toggleArchiveSingle(rpt, "data-wbn-rpt", archiveRptRow); return; }
    var pur = ev.target.closest("[data-wbn-pur]");
    if (pur) { toggleArchiveSingle(pur, "data-wbn-pur", archivePurRow); return; }
    var card = ev.target.closest("[data-wbn-card]");
    if (card) {
      if (ev.target.closest("button,a,select,input,textarea,label,.wbn-ct-box")) return;
      toggleCardSummary(card);
    }
  });

  /* ---------- 工作台首页（模块卡片） ---------- */

  function homeView() {
    var items = visibleModules();
    var blocks = GROUPS.map(function (g) {
      var rows = items.filter(function (m) { return m.group === g; });
      if (!rows.length) return "";
      return '<div class="wbn-home-group"><div class="wbn-home-gt">' + esc(g) + '</div>' +
        '<div class="wbn-home-grid">' + rows.map(function (m) {
          return '<a class="wbn-tile" href="' + esc(m.url) + '">' +
            '<span class="wbn-tile-ic">' + m.icon + '</span>' +
            '<span class="wbn-tile-main"><span class="wbn-tile-t">' + esc(m.t) + '</span>' +
            '<span class="wbn-tile-d">' + esc(m.desc) + '</span></span>' +
            '<span class="wbn-tile-badge" data-badge="' + m.k + '"></span>' +
            '<span class="wbn-tile-arrow">›</span></a>';
        }).join("") + '</div></div>';
    }).join("");
    setTimeout(fillCounts, 0);
    return '<div class="wbn-home">' + blocks + '</div>';
  }

  function setBadge(k, txt) {
    Array.prototype.forEach.call(root.querySelectorAll('[data-badge="' + k + '"]'), function (el) {
      el.textContent = txt ? String(txt) : "";
    });
  }

  function fillCounts() {
    Promise.all([
      rest("reports?select=id,kind&limit=400"),
      rest("purchases?select=status&limit=200"),
      rest("meetings?select=id&limit=100")
    ]).then(function (res) {
      var reports = res[0] || [], purchases = res[1] || [], meetings = res[2] || [];
      var rptN = reports.filter(function (r) { return r.kind !== "竞赛成果"; }).length;
      var ctN = reports.filter(function (r) { return r.kind === "竞赛成果"; }).length;
      var pendN = purchases.filter(function (p) { return p.status === "pending"; }).length;
      setBadge("reports", rptN);
      setBadge("contest", ctN);
      setBadge("purchases", pendN ? pendN + " 待审" : purchases.length);
      setBadge("meetings", meetings.length);
    });
  }

  /* ---------- 汇报材料 ---------- */

  function formReports() {
    if (!me) return "";
    return '<form class="wbn-form" id="wbn-rpt-form">' +
      '<div class="wbn-grid2">' +
        '<label class="wbn-field"><span>标题</span><input name="title" maxlength="60" placeholder="例如 第三周结构装配进度 / 样机装配完成"></label>' +
        '<label class="wbn-field"><span>类型</span><select name="kind"><option>周报</option><option>阶段汇报</option><option>阶段成果</option><option>结题材料</option><option>论文</option><option>竞赛材料</option><option>其他</option></select></label>' +
        '<label class="wbn-field"><span>所属课题</span><select name="project"><option value="">请选择课题</option>' + projectOpts(me.project) + '</select></label>' +
      '</div>' +
      '<div class="wbn-field"><span>证明材料（图片、压缩包、PDF、PPT、Word 等，单份最大 50 MB，可不传）</span>' + fileZone("添加证明材料") + '</div>' +
      '<label class="wbn-field"><span>说明</span><textarea name="summary" rows="2" maxlength="200" placeholder="一句话说清这次汇报的要点，或这个成果做到什么程度、关键数据是多少"></textarea></label>' +
      '<div class="wbn-actions"><button type="submit" class="wbn-btn wbn-btn-main">提交</button><span class="wbn-msg" id="wbn-rpt-msg"></span></div>' +
      '</form>';
  }

  function linkify(txt) {
    return esc(txt).replace(/(https?:\/\/[^\s<）)]+)/g, function (u) {
      return '<a href="' + u + '" target="_blank" rel="noopener">' + u + "</a>";
    });
  }

  function attachHtml(c) {
    if (!c.file_url) return "";
    var n = String(c.file_name || c.file_url).toLowerCase();
    if (/\.(png|jpg|jpeg|gif|webp|bmp)$/.test(n)) {
      return '<a class="wbn-cmt-imgwrap" href="' + esc(c.file_url) + '" target="_blank" rel="noopener">' +
        '<img class="wbn-cmt-img" src="' + esc(c.file_url) + '" loading="lazy" alt="附件图片"></a>';
    }
    if (/\.(webm|mp3|m4a|ogg|wav|aac|mp4)$/.test(n)) {
      return '<audio class="wbn-cmt-audio" controls preload="metadata" src="' + esc(c.file_url) + '"></audio>';
    }
    return '<a class="wbn-file" href="' + esc(c.file_url) + '" target="_blank" rel="noopener">' +
      esc(c.file_name || "附件") + "</a>";
  }

  function countBy(rows) {
    var g = {};
    (rows || []).forEach(function (c) { var k = String(c.report_id); g[k] = (g[k] || 0) + 1; });
    return g;
  }

  function threadBlock(id, n) {
    var form = me
      ? '<form class="wbn-cmt-form" data-report="' + id + '">' +
          '<div class="wbn-cmt-row">' +
            '<input name="body" maxlength="300" placeholder="回复这条：可以直接贴链接、Ctrl+V 粘贴截图或文件">' +
            '<button type="button" class="wbn-cmt-plus" title="添加图片或文件">+</button>' +
            '<button type="button" class="wbn-cmt-rec">录音</button>' +
            '<button type="submit" class="wbn-cmt-send">发送</button>' +
            '<input type="file" name="file" hidden accept="image/*,.pdf,.zip,.doc,.docx,.ppt,.pptx,.xlsx,.txt,.mp4">' +
          '</div>' +
          '<div class="wbn-cmt-picked"></div>' +
        '</form>'
      : '<p class="wbn-cmt-hint">登录后可以回复。</p>';
    return '<details class="wbn-thread" data-report="' + id + '"><summary>讨论 ' + (n || 0) + '</summary>' +
      '<div class="wbn-cmt-list"><p class="wbn-cmt-hint">展开后加载留言。</p></div>' + form + '</details>';
  }

  function cmtHtml(c) {
    var t = String(c.created_at || "").slice(0, 16).replace("T", " ");
    return '<div class="wbn-cmt"><div class="wbn-cmt-h"><b>' + esc(c.name) + '</b><span class="wbn-cmt-t">' + esc(t) + '</span></div>' +
      (c.body ? '<div class="wbn-cmt-b">' + linkify(c.body) + '</div>' : '') +
      (c.file_url ? '<div class="wbn-cmt-attach">' + attachHtml(c) + '</div>' : '') +
      '</div>';
  }

  function bindThreads() {
    Array.prototype.forEach.call(root.querySelectorAll(".wbn-thread"), function (d) {
      d.addEventListener("toggle", function () {
        if (!d.open || d.getAttribute("data-loaded")) return;
        d.setAttribute("data-loaded", "1");
        var list = d.querySelector(".wbn-cmt-list");
        var id = d.getAttribute("data-report");
        rest("report_comments?select=*&report_id=eq." + encodeURIComponent(id) + "&order=id.asc&limit=200")
          .then(function (rows) {
            list.innerHTML = rows.length ? rows.map(cmtHtml).join("") : '<p class="wbn-cmt-hint">还没有留言。</p>';
            var s = d.querySelector("summary");
            if (s) s.textContent = "讨论 " + rows.length;
          })
          .catch(function () { list.innerHTML = '<p class="wbn-cmt-hint">留言没加载出来，刷新试试。</p>'; });
      });
    });

    Array.prototype.forEach.call(root.querySelectorAll(".wbn-cmt-form"), function (f) {
      var picked = f.querySelector(".wbn-cmt-picked");
      var fileIn = f.querySelector('input[name="file"]');
      var plusBtn = f.querySelector(".wbn-cmt-plus");
      var recBtn = f.querySelector(".wbn-cmt-rec");
      var rec = { mr: null, chunks: [], stream: null };

      function showPicked(files) {
        var arr = [];
        if (files) Array.prototype.forEach.call(files, function (x) { arr.push(x.name + "（" + fmtSize(x.size) + "）"); });
        if (f._voice) arr.push("语音 " + Math.round((f._voice.size || 0) / 1024) + " KB");
        picked.textContent = arr.length ? "已选择：" + arr.join("、") : "";
      }

      if (plusBtn) plusBtn.addEventListener("click", function () { fileIn.click(); });

      fileIn.addEventListener("change", function () {
        f._voice = null;
        showPicked(fileIn.files);
      });

      pasteInto(f, fileIn, function () {
        f._voice = null;
        showPicked(fileIn.files);
      });

      recBtn.addEventListener("click", function () {
        if (rec.mr && rec.mr.state === "recording") {
          rec.mr.stop();
          return;
        }
        if (!navigator.mediaDevices || !window.MediaRecorder) {
          picked.textContent = "这台设备的浏览器不支持录音，可以直接发文字或链接。";
          return;
        }
        navigator.mediaDevices.getUserMedia({ audio: true }).then(function (stream) {
          var type = (window.MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported("audio/webm"))
            ? "audio/webm"
            : (MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported("audio/mp4")) ? "audio/mp4" : "";
          var mr = type ? new MediaRecorder(stream, { mimeType: type }) : new MediaRecorder(stream);
          rec.mr = mr;
          rec.stream = stream;
          rec.chunks = [];
          mr.ondataavailable = function (e) { if (e.data && e.data.size) rec.chunks.push(e.data); };
          mr.onstop = function () {
            stream.getTracks().forEach(function (t) { t.stop(); });
            var mt = (mr.mimeType || "audio/webm");
            var ext = mt.indexOf("mp4") >= 0 ? "m4a" : (mt.indexOf("ogg") >= 0 ? "ogg" : "webm");
            var blob = new Blob(rec.chunks, { type: mt });
            f._voice = new File([blob], "voice_" + Date.now() + "." + ext, { type: mt });
            fileIn.value = "";
            showPicked(null);
          };
          mr.start();
          recBtn.textContent = "停止";
          recBtn.classList.add("is-rec");
        }).catch(function () {
          picked.textContent = "没有麦克风权限，浏览器里允许一下麦克风再试。";
        });
      });

      f.addEventListener("submit", function (ev) {
        ev.preventDefault();
        if (!me) return;
        var body = (f.body.value || "").trim();
        var file = f._voice || (fileIn.files && fileIn.files[0]) || null;
        if (!body && !file) { picked.textContent = "先写点内容，或发个图片、文件、语音。"; return; }
        if (file && file.size > MAX_MB * 1048576) {
          picked.textContent = "单个文件最大 " + MAX_MB + " MB，这个有点大，压缩一下或贴网盘链接。";
          return;
        }
        var btn = f.querySelector(".wbn-cmt-send");
        btn.disabled = true;
        btn.textContent = file ? "上传中…" : "发送中…";
        var up = file ? uploadFile(file, "comments") : Promise.resolve({ url: "", name: "", size: 0 });
        up.then(function (u) {
          return rpc("add_comment", {
            p_name: me.name, p_sid: me.sid,
            p_report_id: Number(f.getAttribute("data-report")),
            p_body: body, p_file_url: u.url, p_file_name: u.name
          });
        }).then(function (id) {
          if (!id) throw new Error("留言被拒绝，请重新登录后再试");
          go();
        }).catch(function (e) {
          btn.disabled = false;
          btn.textContent = "发送";
          picked.textContent = e.message;
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
    setTimeout(function () {
      bindReportForm();
      fillReports();
    }, 0);
    return '<h3 class="wbn-h">提交</h3>' + formReports() +
      '<h3 class="wbn-h">已提交<span class="wbn-count" id="wbn-rpt-cnt"></span></h3>' +
      '<div id="wbn-rpt-slot"><p class="wbn-dim">加载中…</p></div>';
  }

  function fillReports() {
    var slot = root.querySelector("#wbn-rpt-slot");
    if (!slot) return;
    Promise.all([
      rest("reports?select=*&order=created_at.desc&limit=40"),
      rest("report_comments?select=report_id&limit=1200")
    ]).then(function (res) {
      var rows = res[0] || [];
      slot.innerHTML = reportsList(rows, countBy(res[1]));
      var c = root.querySelector("#wbn-rpt-cnt");
      if (c) c.textContent = rows.length;
      bindThreads();
    }).catch(function (e) {
      slot.innerHTML = '<p class="wbn-empty">列表没加载出来：' + esc(e.message) + '</p>';
    });
  }

  function bindReportForm() {
    var f = root.querySelector("#wbn-rpt-form");
    if (!f) return;
    bindFileZone(f);
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

  /* 支持在表单里 Ctrl+V 粘贴截图/文件，或直接把文件拖进来 */
  function pasteInto(form, input, onPicked) {
    if (!form || !input || form.__wbnPaste) return;
    form.__wbnPaste = 1;

    function hand(file) {
      if (!file) return false;
      var f = file;
      if (!file.name || file.name.indexOf(".") < 0) {
        var ext = (file.type && file.type.indexOf("image/") === 0) ? (file.type.split("/")[1] || "png") : "file";
        try { f = new File([file], "粘贴_" + Date.now() + "." + ext, { type: file.type }); } catch (e) { f = file; }
      }
      try {
        var dt = new DataTransfer();
        dt.items.add(f);
        input.files = dt.files;
        input.dispatchEvent(new Event("change", { bubbles: true }));
        if (onPicked) onPicked(f);
        return true;
      } catch (e) {
        return false;
      }
    }

    form.addEventListener("paste", function (ev) {
      var cd = ev.clipboardData || window.clipboardData;
      if (!cd) return;
      if (cd.files && cd.files.length) {
        if (hand(cd.files[0])) ev.preventDefault();
        return;
      }
      var items = cd.items || [];
      for (var i = 0; i < items.length; i++) {
        if (items[i].kind === "file") {
          var f = items[i].getAsFile();
          if (hand(f)) { ev.preventDefault(); return; }
        }
      }
    });

    form.addEventListener("dragover", function (ev) {
      if (ev.dataTransfer && ev.dataTransfer.files && ev.dataTransfer.files.length) {
        ev.preventDefault();
      }
    });
    form.addEventListener("drop", function (ev) {
      if (ev.dataTransfer && ev.dataTransfer.files && ev.dataTransfer.files.length) {
        ev.preventDefault();
        hand(ev.dataTransfer.files[0]);
      }
    });
  }

  /* 上传框：+ 号打开文件夹、Ctrl+V 粘贴、拖入，显示已选文件并可移除 */
  function bindFileZone(form, onPicked) {
    Array.prototype.forEach.call(form.querySelectorAll(".wbn-drop"), function (zone) {
      var input = zone.querySelector('input[type="file"]');
      if (!input) return;
      var plus = zone.querySelector(".wbn-plus");
      var clear = zone.querySelector(".wbn-drop-clear");
      var box = zone.querySelector(".wbn-drop-file");

      function refresh() {
        var f = input.files && input.files[0];
        if (!f) {
          box.textContent = "";
          if (clear) clear.hidden = true;
          return;
        }
        box.textContent = f.name + "（" + fmtSize(f.size) + "）";
        if (clear) clear.hidden = false;
      }

      if (plus) plus.addEventListener("click", function () { input.click(); });
      if (clear) clear.addEventListener("click", function () {
        try { input.value = ""; } catch (e) {}
        form._voice = null;
        refresh();
        if (onPicked) onPicked(null);
      });
      input.addEventListener("change", function () { refresh(); if (onPicked) onPicked(input.files[0] || null); });
      pasteInto(form, input, function (f) { refresh(); if (onPicked) onPicked(f); });
      refresh();
    });
  }

  function uploadFile(file, folder) {
    var safe = file.name.replace(/[^\w.\-]+/g, "_").slice(-60) || "file";
    var path = (folder || "reports") + "/" + Date.now() + "_" + safe;
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
    var lv = LEVELS.map(function (x) { return "<option>" + x + "</option>"; }).join("");
    var rk = RANKS.map(function (x) { return "<option>" + x + "</option>"; }).join("");
    return '<form class="wbn-form" id="wbn-ct-form">' +
      '<div class="wbn-grid2">' +
        '<label class="wbn-field"><span>竞赛名称</span><input name="contest" maxlength="70" placeholder="例如 中国机械工程创新创业大赛"></label>' +
        '<label class="wbn-field"><span>获奖级别</span><select name="level">' + lv + '</select></label>' +
        '<label class="wbn-field"><span>奖项等次</span><select name="rank">' + rk + '</select></label>' +
        '<label class="wbn-field"><span>获奖时间</span><input name="date" type="date"></label>' +
        '<label class="wbn-field"><span>参赛成员（顿号分隔）</span><input name="members" maxlength="80" placeholder="例如 肖扬、李伟锐"></label>' +
        '<label class="wbn-field"><span>所属课题</span><select name="project"><option value="">请选择课题</option>' + projectOpts(me.project) + '</select></label>' +
        '<label class="wbn-field" style="grid-column:1/-1"><span>证书或现场照片（图片 / PDF，单份最大 50 MB）</span>' + fileZone("添加证书或照片") + '</label>' +
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
    setTimeout(function () {
      bindContestForm();
      fillContest();
    }, 0);
    return '<h3 class="wbn-h">提交</h3>' + formContest() +
      '<h3 class="wbn-h">已提交<span class="wbn-count" id="wbn-ct-cnt"></span></h3>' +
      '<div id="wbn-ct-slot"><p class="wbn-dim">加载中…</p></div>';
  }

  function fillContest() {
    var slot = root.querySelector("#wbn-ct-slot");
    if (!slot) return;
    var q = "reports?select=*&kind=eq." + encodeURIComponent("竞赛成果") + "&order=created_at.desc&limit=40";
    Promise.all([
      rest(q),
      rest("report_comments?select=report_id&limit=1200")
    ]).then(function (res) {
      var rows = res[0] || [];
      slot.innerHTML = contestList(rows, countBy(res[1]));
      var c = root.querySelector("#wbn-ct-cnt");
      if (c) c.textContent = rows.length;
      bindThreads();
    }).catch(function (e) {
      slot.innerHTML = '<p class="wbn-empty">列表没加载出来：' + esc(e.message) + '</p>';
    });
  }

  function bindContestForm() {
    var f = root.querySelector("#wbn-ct-form");
    if (!f) return;
    bindFileZone(f);
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
    return '<form class="wbn-form" id="wbn-pur-form">' +
      '<div class="wbn-grid2">' +
        '<label class="wbn-field"><span>物品</span><input name="item" maxlength="40" placeholder="例如 PETG 线材、砂纸、密封胶"></label>' +
        '<label class="wbn-field"><span>规格型号</span><input name="spec" maxlength="40" placeholder="例如 1.75mm 1kg / 400 目"></label>' +
        '<label class="wbn-field"><span>数量</span><input name="qty" type="number" step="1" min="1" value="1" inputmode="numeric" placeholder="1"></label>' +
        '<label class="wbn-field"><span>单位</span><input name="unit" maxlength="8" value="件" placeholder="卷 / 瓶 / 包"></label>' +
        '<label class="wbn-field"><span>预估金额（元）</span><input name="budget" type="number" step="0.01" min="0" placeholder="不知道可以不填"></label>' +
        '<label class="wbn-field"><span>希望到手日期</span><input name="need_by" type="date"></label>' +
        '<label class="wbn-field"><span>所属课题</span><select name="project"><option value="">请选择课题</option>' + projectOpts(me.project) + '</select></label>' +
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
          if (!f.title.value.trim()) { msg.className = "wbn-msg wbn-msg-err"; msg.textContent = "主题要填。"; return; }
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

  function archiveRptRow(r) {
    var f = r.file_url
      ? '<a class="wbn-file" href="' + esc(r.file_url) + '" target="_blank" rel="noopener">' + esc(r.file_name || "附件") + '（' + fmtSize(r.file_size) + '）</a>'
      : '<span class="wbn-dim">无附件</span>';
    return '<div class="wbn-ct-row">' +
      '<div class="wbn-ct-t">' + esc(r.title) + (r.kind ? ' <span class="wbn-kind">' + esc(r.kind) + '</span>' : '') + '</div>' +
      '<div class="wbn-ct-s">' + [r.project, fmtDate(r.created_at)].filter(function (x) { return x; }).join(" · ") + '</div>' +
      (r.summary ? '<div class="wbn-ct-s">' + esc(r.summary) + '</div>' : '') +
      '<div class="wbn-ct-s">' + f + '</div></div>';
  }

  function archivePurRow(p) {
    var qty = (Number(p.qty) || 0) + " " + (p.unit || "件");
    var budget = Number(p.budget) ? "约 " + p.budget + " 元" : "";
    var STATUS_KEYS = ["pending", "approved", "ordered", "done", "rejected"];
    var adminRow = p.id
      ? '<div class="wbn-admin-row">' +
          '<select class="wbn-status-sel" data-id="' + p.id + '">' +
            STATUS_KEYS.map(function (s) {
              return '<option value="' + s + '"' + (p.status === s ? " selected" : "") + '>' + STATUS_TEXT[s] + '</option>';
            }).join("") +
          '</select>' +
          '<input class="wbn-note-in" data-id="' + p.id + '" maxlength="40" placeholder="审批备注" value="' + esc(p.admin_note || "") + '">' +
          '<button type="button" class="wbn-btn wbn-mini wbn-save-status" data-id="' + p.id + '">保存</button>' +
        '</div>'
      : "";
    return '<div class="wbn-ct-row">' +
      '<div class="wbn-ct-t">' + esc(p.item) + ' ' + statusBadge(p.status) + '</div>' +
      '<div class="wbn-ct-s">' + [p.spec, qty, budget, fmtDate(p.created_at)].filter(function (x) { return x && String(x).trim(); }).join(" · ") + '</div>' +
      (p.id ? "" : (p.admin_note ? '<div class="wbn-ct-s">老师备注：' + esc(p.admin_note) + '</div>' : "")) +
      adminRow +
      '</div>';
  }

  function archiveCtRow(c) {
    return '<div class="wbn-ct-row">' +
      '<div class="wbn-ct-t">' + esc(c.title) + '</div>' +
      '<div class="wbn-ct-s">' + esc(c.summary || "") + ' · 提交人 ' + esc(c.by || "") + ' · ' + esc(c.created_at || "") + '</div>' +
      (c.file_url ? '<a class="wbn-file" href="' + esc(c.file_url) + '" target="_blank" rel="noopener">证书</a>' : '') +
      '</div>';
  }

  function bindPurSave(scope) {
    Array.prototype.forEach.call(scope.querySelectorAll(".wbn-save-status"), function (b) {
      b.addEventListener("click", function () {
        var id = b.getAttribute("data-id");
        var sel = scope.querySelector('.wbn-status-sel[data-id="' + id + '"]');
        var note = scope.querySelector('.wbn-note-in[data-id="' + id + '"]');
        b.textContent = "保存中…";
        rpc("set_purchase_status", {
          p_name: me.name, p_sid: me.sid, p_id: Number(id),
          p_status: sel.value, p_note: (note ? note.value : "")
        }).then(function (ok) {
          if (!ok) throw new Error("没有权限");
          go("已更新状态。");
        }).catch(function (e) { b.textContent = e.message; });
      });
    });
  }

  function renderArchive() {
    if (!isAdmin()) return Promise.resolve('<p class="wbn-empty">暂无内容。</p>');
    return Promise.all([
      rpc("archive_overview", { p_name: me.name, p_sid: me.sid }),
      rest("reports?select=*&limit=400"),
      rest("purchases?select=*&limit=200")
    ]).then(function (res) {
      var d = res[0] || {};
      var allRep = res[1] || [];
      var allPur = res[2] || [];
      if (!d) return '<p class="wbn-empty">读取失败，请重新登录。</p>';
      var list = d.students || [];
      ARCH_STU = list;
      CLIST = {};
      RLIST = {};
      PLIST = {};
      list.forEach(function (s) {
        RLIST[s.name] = allRep.filter(function (r) {
          if (r.kind === "竞赛成果") return false;
          return r.name === s.name || String(r.members || "").indexOf(s.name) >= 0;
        });
        PLIST[s.name] = allPur.filter(function (p) { return p.name === s.name; });
        var cl = s.contest_list || [];
        if (cl.length) CLIST[s.name] = cl;
      });
      var cards = list.map(function (s) {
        var pct = Math.max(0, Math.min(100, Math.round(Number(s.percent) || 0)));
        var ct = s.contests || 0;
        var cl = CLIST[s.name] || [];
        var rn = (RLIST[s.name] || []).length;
        var pn = (PLIST[s.name] || []).length;
        var open = '<button type="button" class="wbn-link"';
        var ctBtn = cl.length
          ? open + ' data-wbn-ct="' + esc(s.name) + '" data-label="竞赛成果 ' + ct + ' 项 ▾">竞赛成果 ' + ct + ' 项 ▾</button>'
          : '<span class="wbn-dim">竞赛成果 0</span>';
        var rptBtn = rn
          ? open + ' data-wbn-rpt="' + esc(s.name) + '" data-label="材料 ' + rn + ' ▾">材料 ' + rn + ' ▾</button>'
          : '<span class="wbn-dim">材料 0</span>';
        var purBtn = pn
          ? open + ' data-wbn-pur="' + esc(s.name) + '" data-label="采购 ' + pn + '（在办 ' + (s.purchases_open || 0) + '）▾">采购 ' + pn + '（在办 ' + (s.purchases_open || 0) + '）▾</button>'
          : '<span class="wbn-dim">采购 ' + (s.purchases || 0) + '（在办 ' + (s.purchases_open || 0) + '）</span>';
        var last = s.latest_report
          ? '<button type="button" class="wbn-card-last" data-wbn-rpt="' + esc(s.name) + '">最近：' + esc(s.latest_report) + '<br><span class="wbn-dim">' + esc(s.latest_report_at) + '</span></button>'
          : '<div class="wbn-card-last wbn-dim">还没提交材料</div>';
        return '<div class="wbn-card" data-wbn-card="' + esc(s.name) + '">' +
          '<div class="wbn-card-top"><button type="button" class="wbn-member-name" data-wbn-member="' + esc(s.name) + '">' + esc(s.name) + '</button>' + (s.role === "admin" ? '<span class="wbn-kind">管理员</span>' : "") + '</div>' +
          '<div class="wbn-card-proj">' + (s.project ? esc(s.project) : '<span class="wbn-dim">未认领课题</span>') + '</div>' +
          '<div class="wbn-bar"><i style="width:' + pct + '%"></i></div>' +
          '<div class="wbn-card-meta">' + (s.stage ? esc(s.stage) : "未开始") + ' · ' + pct + '%</div>' +
          '<div class="wbn-card-stats">' + rptBtn + purBtn + '</div>' +
          '<div class="wbn-card-ct">' + ctBtn + '</div>' +
          last +
          '</div>';
      }).join("");
      var html = '<h3 class="wbn-h">学生档案<span class="wbn-count">' + list.length + ' 人</span></h3>' +
        '<div class="wbn-cards">' + cards + '</div>';
      return html;
    });
  }

  function archiveRowsOf(attr) {
    if (attr === "data-wbn-ct") return CLIST;
    if (attr === "data-wbn-pur") return PLIST;
    return RLIST;
  }

  function toggleArchiveSingle(btn, attr, fn) {
    var card = btn.closest(".wbn-card");
    var box = card.querySelector(".wbn-ct-box");
    if (box) { box.remove(); btn.textContent = btn.getAttribute("data-label") || btn.textContent; return; }
    var nm = btn.getAttribute(attr);
    var rows = (archiveRowsOf(attr))[nm] || [];
    var inner = rows.map(fn).join("");
    var d2 = document.createElement("div");
    d2.className = "wbn-ct-box";
    d2.innerHTML = inner || '<p class="wbn-empty">没有记录。</p>';
    card.appendChild(d2);
    bindPurSave(d2);
    btn.textContent = "收起 ▴";
  }

  function toggleCardSummary(card) {
    var nm = card.getAttribute("data-wbn-card");
    var box = card.querySelector(".wbn-ct-box");
    if (box) { box.remove(); return; }
    var s = ARCH_STU.find(function (x) { return x.name === nm; }) || {};
    var rpts = RLIST[nm] || [], cts = CLIST[nm] || [], purs = PLIST[nm] || [];
    function seg(title, rows, fn) {
      if (!rows.length) return '<div class="wbn-ct-s wbn-dim">' + title + "：暂无</div>";
      return '<div class="wbn-ct-seg">' + title + "</div>" + rows.map(fn).join("");
    }
    var pct2 = Math.max(0, Math.min(100, Math.round(Number(s.percent) || 0)));
    var inner =
      '<div class="wbn-ct-s">课题：' + (s.project ? esc(s.project) : "未认领课题") + " · " +
      (s.stage ? esc(s.stage) : "未开始") + " · " + pct2 + "%</div>" +
      seg("材料", rpts, archiveRptRow) +
      seg("竞赛成果", cts, archiveCtRow) +
      seg("采购", purs, archivePurRow);
    var d2 = document.createElement("div");
    d2.className = "wbn-ct-box";
    d2.innerHTML = inner;
    card.appendChild(d2);
    bindPurSave(d2);
  }

  function showArchMember(name) {
    var s = ARCH_STU.find(function (x) { return x.name === name; }) || { name: name };
    var rpts = RLIST[name] || [], cts = CLIST[name] || [], purs = PLIST[name] || [];
    var pct = Math.max(0, Math.min(100, Math.round(Number(s.percent) || 0)));
    function block(title, n, rows, fn) {
      var body = rows.length ? rows.map(fn).join("") : '<p class="wbn-empty">暂无记录。</p>';
      return '<h3 class="wbn-h">' + esc(title) + '<span class="wbn-count">' + n + '</span></h3><div>' + body + '</div>';
    }
    var head = '<div class="wbn-card wbn-member-head">' +
      '<div class="wbn-card-top"><b>' + esc(name) + '</b>' + (s.role === "admin" ? '<span class="wbn-kind">管理员</span>' : "") + '</div>' +
      '<div class="wbn-card-proj">' + (s.project ? esc(s.project) : '<span class="wbn-dim">未认领课题</span>') + '</div>' +
      '<div class="wbn-bar"><i style="width:' + pct + '%"></i></div>' +
      '<div class="wbn-card-meta">' + (s.stage ? esc(s.stage) : "未开始") + " · " + pct + '%</div></div>';
    var html = '<button type="button" class="wbn-btn wbn-arch-back" data-wbn-arch-back>← 返回学生档案</button>' + head +
      block("材料", rpts.length, rpts, archiveRptRow) +
      block("竞赛成果", cts.length, cts, archiveCtRow) +
      block("采购", purs.length, purs, archivePurRow);
    shell(html);
    bindPurSave(root.querySelector("#wbn-panel"));
  }

  /* ---------- 启动 ---------- */
  // 先用上一次缓存的课题把界面画出来，不等网络；随后再拉最新课题刷新下拉
  try { PROJECTS = JSON.parse(localStorage.getItem("chenlab_projects") || "[]") || []; } catch (e) { PROJECTS = []; }
  go();

  rest("projects?select=name&order=name").then(function (rows) {
    if (!rows || !rows.length) return;
    PROJECTS = rows;
    try { localStorage.setItem("chenlab_projects", JSON.stringify(rows)); } catch (e) {}
    Array.prototype.forEach.call(root.querySelectorAll('select[name="project"]'), function (sel) {
      var want = sel.value || (me && me.project) || "";
      sel.innerHTML = '<option value="">请选择课题</option>' + projectOpts(want);
      sel.value = want || "";
    });
  });

  // 登录状态变化后重画（登录浮层关掉时 member-auth 会改 localStorage）
  setInterval(function () {
    var now = state();
    var same = (now && me && now.name === me.name && now.sid === me.sid) || (!now && !me);
    if (!same) { me = now; go(); }
  }, 5000);

  window.__chenlabWorkbench = { reload: go };
})();
