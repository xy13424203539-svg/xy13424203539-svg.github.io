/* 成员登录与个人资料编辑：站内自建登录，不走 Supabase 自带登录页。
   未登录只读；登录后可编自己的资料；admin 可编任何人。 */
(function () {
  if (window.__chenlabMemberLoaded) return;
  window.__chenlabMemberLoaded = true;

  var cfg = window.LAB_SB || {};
  if (!cfg.url || !cfg.key) return;

  var STORE = "chenlab_member";
  var GUEST = "chenlab_guest";
  var state = null;
  var currentName = "";

  function markGuest() { try { localStorage.setItem(GUEST, "1"); } catch (e) {} }
  function clearGuest() { try { localStorage.removeItem(GUEST); } catch (e) {} }
  function isGuest() { try { return localStorage.getItem(GUEST) === "1"; } catch (e) { return false; } }

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function load() {
    try { state = JSON.parse(localStorage.getItem(STORE) || "null"); } catch (e) { state = null; }
  }
  function persist() {
    if (state) localStorage.setItem(STORE, JSON.stringify(state));
    else localStorage.removeItem(STORE);
  }

  function rpc(fn, payload) {
    return fetch(cfg.url + "/rest/v1/rpc/" + fn, {
      method: "POST",
      headers: {
        apikey: cfg.key,
        Authorization: "Bearer " + cfg.key,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    }).then(function (r) {
      if (!r.ok) return r.text().then(function (t) { throw new Error("HTTP " + r.status + " " + t.slice(0, 100)); });
      return r.json();
    });
  }

  function profileRows(name) {
    return fetch(cfg.url + "/rest/v1/member_profiles?name=eq." + encodeURIComponent(name) + "&select=*",
                 { headers: { apikey: cfg.key, Authorization: "Bearer " + cfg.key } })
      .then(function (r) { return r.ok ? r.json() : []; });
  }

  var PROJECTS = [];
  var STAGES = ["方案设计", "结构与建模", "样机加工", "装配联调", "试验验证", "结题材料"];

  function loadProjects() {
    return fetch(cfg.url + "/rest/v1/projects?select=*&order=name",
                 { headers: { apikey: cfg.key, Authorization: "Bearer " + cfg.key } })
      .then(function (r) { return r.ok ? r.json() : []; })
      .then(function (rows) { PROJECTS = rows || []; return PROJECTS; })
      .catch(function () { PROJECTS = []; return PROJECTS; });
  }

  function findProject(name) {
    for (var i = 0; i < PROJECTS.length; i++) {
      if (PROJECTS[i].name === name) return PROJECTS[i];
    }
    return null;
  }

  /* ---------- 登录浮层 ---------- */

  function buildLogin() {
    var wrap = document.createElement("div");
    wrap.className = "mp-mask";
    wrap.id = "mp-login-mask";
    wrap.innerHTML =
      '<div class="mp-login">' +
        '<h3>实验室成员登录</h3>' +
        '<p class="mp-login-sub">输入姓名和学号，可以填写或修改自己的个人资料；不登录也能查看全部内容。</p>' +
        '<div class="mp-row"><label>姓名<input id="mp-in-name" type="text" maxlength="10" placeholder="例如 张三"></label></div>' +
        '<div class="mp-row"><label>学号 / 教师登录码<input id="mp-in-sid" type="text" maxlength="20" placeholder="学生填 12 位学号；教师填实验室给的登录码"></label></div>' +
        '<div id="mp-login-msg" class="mp-msg"></div>' +
        '<div class="mp-btns">' +
          '<button type="button" class="mp-btn mp-btn-main" id="mp-do-login">登录</button>' +
          '<button type="button" class="mp-btn" id="mp-close-login">只看不登录</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(wrap);

    var msg = wrap.querySelector("#mp-login-msg");
    wrap.querySelector("#mp-close-login").addEventListener("click", function () {
      markGuest();
      wrap.remove();
      ensureLoginPill();
    });
    wrap.querySelector("#mp-do-login").addEventListener("click", function () {
      var n = (wrap.querySelector("#mp-in-name").value || "").trim();
      var s = (wrap.querySelector("#mp-in-sid").value || "").trim();
      if (!n || !s) { msg.className = "mp-msg mp-msg-warn"; msg.textContent = "姓名和学号都要填。"; return; }
      msg.className = "mp-msg"; msg.textContent = "验证中…";
      rpc("member_login", { p_name: n, p_sid: s })
        .then(function (rows) {
          if (!rows || !rows.length) {
            msg.className = "mp-msg mp-msg-err";
            msg.textContent = "姓名或学号不在实验室名单里，你只有查看权限。";
            return;
          }
          state = { name: rows[0].name, sid: s, role: rows[0].role };
          persist();
          clearGuest();
          var pill = document.querySelector(".mp-pill");
          if (pill) pill.remove();
          msg.className = "mp-msg mp-msg-ok";
          msg.textContent = "已登录：" + state.name + (state.role === "admin" ? "（管理员）" : "");
          setTimeout(function () {
            wrap.remove();
            renderProfile();
            if (window.__chenlabEnsureChip) window.__chenlabEnsureChip();
          }, 700);
        })
        .catch(function (e) {
          msg.className = "mp-msg mp-msg-err";
          msg.textContent = "登录失败（" + e.message + "）。";
        });
    });

    return wrap;
  }

  /* ---------- 个人页资料 ---------- */

  var FIELDS = [
    ["grade", "年级"],
    ["major", "专业"],
    ["team_group", "所在组"],
    ["direction", "研究方向"],
    ["projects", "参与课题"],
    ["awards", "成果荣誉"],
    ["bio", "自我介绍"],
    ["contact", "联系方式"]
  ];

  function detectName() {
    var m = location.pathname.match(/^\/team\/([^/]+)\/?(?:index\.html)?$/);
    if (!m) return "";
    var h1 = document.querySelector("article h1");
    if (!h1) return "";
    var t = (h1.textContent || "").trim();
    return t.length > 0 && t.length <= 6 ? t : "";
  }

  function canEdit() {
    return state && (state.role === "admin" || state.name === currentName);
  }

  function syncStatic(p) {
    if (!p) return;
    var map = { "年级": "grade", "专业": "major" };
    var rows = document.querySelectorAll("article main table tr");
    Array.prototype.forEach.call(rows, function (tr) {
      if (!tr.cells || tr.cells.length < 2) return;
      var key = (tr.cells[0].textContent || "").trim();
      var field = map[key];
      if (field && (p[field] || "").trim()) {
        if ((tr.cells[1].textContent || "").trim() === "待补充" || (tr.cells[1].textContent || "").trim() === "—") {
          tr.cells[1].textContent = (p[field] || "").trim();
        }
      }
    });
  }

  function renderProfile() {
    if (!currentName) return;
    var host = document.getElementById("mp-profile");
    if (!host) {
      host = document.createElement("div");
      host.id = "mp-profile";
      host.className = "mp-profile";
      var main = document.querySelector("article main") || document.querySelector("main");
      if (!main) return;
      var h1 = main.querySelector("h1");
      if (h1 && h1.parentNode === main) main.insertBefore(host, h1.nextSibling);
      else main.insertBefore(host, main.firstChild);
    }

    profileRows(currentName).then(function (rows) {
      var p = rows && rows.length ? rows[0] : null;
      syncStatic(p);
      var html = '<div class="mp-head"><b>' + esc(currentName) + ' · 个人资料</b>';
      if (canEdit()) html += '<button type="button" class="mp-btn mp-btn-edit" id="mp-open-edit">' +
        (p ? "修改我的资料" : "填写我的资料") + '</button>';
      html += '</div>';

      if (p) {
        var any = false;
        var dl = '<dl class="mp-dl">';
        FIELDS.forEach(function (f) {
          var v = (p[f[0]] || "").trim();
          if (!v) return;
          any = true;
          dl += '<dt>' + f[1] + '</dt><dd>' + esc(v).replace(/\n/g, "<br>") + '</dd>';
        });
        dl += '</dl>';
        html += any ? dl : '<p class="mp-empty">还没有填写资料。</p>';
        html += projectBlock(p);
        if (p.updated_at) {
          html += '<p class="mp-time">更新于 ' + esc(String(p.updated_at).slice(0, 10)) + '</p>';
        }
      } else {
        html += '<p class="mp-empty">还没有填写资料。' +
          (canEdit() ? '登录状态下可以点上面的按钮填写。' : '登录后可填写。') + '</p>';
      }

      host.innerHTML = html;
      var btn = host.querySelector("#mp-open-edit");
      if (btn) btn.addEventListener("click", function () { openEdit(p || {}); });
      var pbtn = host.querySelector("#mp-open-prog");
      if (pbtn) pbtn.addEventListener("click", function () { openProgress(p.project); });
    });
  }

  function projectBlock(p) {
    if (!p || !p.project) return "";
    var pr = findProject(p.project);
    if (!pr) return "";
    var pct = Math.max(0, Math.min(100, parseInt(pr.percent, 10) || 0));
    var html = '<div class="mp-proj">' +
      '<div class="mp-proj-head"><b>课题进度 · ' + esc(pr.name) + '</b>' +
      (canEdit() ? '<button type="button" class="mp-btn mp-btn-edit" id="mp-open-prog">更新进度</button>' : '') +
      '</div>' +
      '<div class="mp-bar"><span style="width:' + pct + '%"></span></div>' +
      '<div class="mp-proj-meta">' + esc(pr.stage || "尚未填写阶段") + ' · ' + pct + '%' +
      (pr.updated_by ? ' · 最近由 ' + esc(pr.updated_by) + ' 更新于 ' + esc(String(pr.updated_at || "").slice(0, 10)) : '') +
      '</div>' +
      (pr.note ? '<div class="mp-proj-note">' + esc(pr.note).replace(/\n/g, "<br>") + '</div>' : '') +
      '</div>';
    return html;
  }

  /* ---------- 编辑面板 ---------- */

  function openEdit(p) {
    var wrap = document.createElement("div");
    wrap.className = "mp-mask";
    var rows = FIELDS.map(function (f) {
      var v = esc(p[f[0]] || "");
      if (f[0] === "bio" || f[0] === "projects" || f[0] === "awards") {
        return '<label class="mp-field mp-field-wide"><span>' + f[1] + '</span>' +
          '<textarea name="' + f[0] + '" rows="3" maxlength="600">' + v + '</textarea></label>';
      }
      return '<label class="mp-field"><span>' + f[1] + '</span>' +
        '<input name="' + f[0] + '" type="text" maxlength="120" value="' + v + '"></label>';
    }).join("");

    var projRow = '<label class="mp-field mp-field-wide"><span>所属课题（进度按课题共享）</span><select name="project">' +
      '<option value="">暂不指定</option>' +
      PROJECTS.map(function (pr) {
        return '<option value="' + esc(pr.name) + '"' +
          (pr.name === (p.project || "") ? " selected" : "") + '>' + esc(pr.name) + '</option>';
      }).join("") + '</select></label>';

    wrap.innerHTML =
      '<div class="mp-edit">' +
        '<h3>编辑 ' + esc(currentName) + ' 的资料</h3>' +
        '<div class="mp-form">' + projRow + rows + '</div>' +
        '<div id="mp-edit-msg" class="mp-msg"></div>' +
        '<div class="mp-btns"><button type="button" class="mp-btn mp-btn-main" id="mp-save">保存</button>' +
        '<button type="button" class="mp-btn" id="mp-cancel">取消</button></div>' +
      '</div>';
    document.body.appendChild(wrap);

    wrap.querySelector("#mp-cancel").addEventListener("click", function () { wrap.remove(); });
    wrap.querySelector("#mp-save").addEventListener("click", function () {
      var data = {};
      FIELDS.forEach(function (f) {
        var el = wrap.querySelector('[name="' + f[0] + '"]');
        data[f[0]] = (el && el.value || "").trim();
      });
      var projEl = wrap.querySelector('[name="project"]');
      data.project = projEl ? projEl.value : "";
      var msg = wrap.querySelector("#mp-edit-msg");
      msg.className = "mp-msg"; msg.textContent = "保存中…";
      rpc("member_save", { p_name: state.name, p_sid: state.sid, p_target: currentName, p_data: data })
        .then(function (ok) {
          if (!ok) {
            msg.className = "mp-msg mp-msg-err";
            msg.textContent = "没有权限保存这份资料。";
            return;
          }
          msg.className = "mp-msg mp-msg-ok";
          msg.textContent = "已保存。";
          setTimeout(function () {
            wrap.remove();
            loadProjects().then(renderProfile);
          }, 600);
        })
        .catch(function (e) {
          msg.className = "mp-msg mp-msg-err";
          msg.textContent = "保存失败（" + e.message + "）。";
        });
    });
  }

  /* ---------- 课题进度（同课题共享）---------- */

  function openProgress(projectName) {
    if (!projectName) return;
    var pr = findProject(projectName) || { name: projectName, stage: "", percent: 0, note: "" };
    var pct = Math.max(0, Math.min(100, parseInt(pr.percent, 10) || 0));
    var stageOpts = STAGES.map(function (s) {
      return '<option' + (s === pr.stage ? " selected" : "") + '>' + esc(s) + '</option>';
    }).join("");
    if (pr.stage && STAGES.indexOf(pr.stage) < 0) {
      stageOpts = '<option selected>' + esc(pr.stage) + '</option>' + stageOpts;
    }

    var wrap = document.createElement("div");
    wrap.className = "mp-mask";
    wrap.innerHTML =
      '<div class="mp-edit">' +
        '<h3>更新课题进度</h3>' +
        '<p class="mp-login-sub">' + esc(projectName) + ' —— 同一课题的所有成员看到的是同一条进度。</p>' +
        '<div class="mp-form">' +
          '<label class="mp-field mp-field-wide"><span>当前阶段</span><select name="stage">' + stageOpts + '</select></label>' +
          '<label class="mp-field mp-field-wide"><span>完成度 <b id="mp-pct-out">' + pct + '%</b></span>' +
            '<input type="range" name="percent" min="0" max="100" step="5" value="' + pct + '"></label>' +
          '<label class="mp-field mp-field-wide"><span>进度说明</span>' +
            '<textarea name="note" rows="3" maxlength="400" placeholder="例如：尾鳍结构已完成建模，正在打样">' +
            esc(pr.note || "") + '</textarea></label>' +
        '</div>' +
        '<div id="mp-prog-msg" class="mp-msg"></div>' +
        '<div class="mp-btns"><button type="button" class="mp-btn mp-btn-main" id="mp-prog-save">保存进度</button>' +
        '<button type="button" class="mp-btn" id="mp-prog-cancel">取消</button></div>' +
      '</div>';
    document.body.appendChild(wrap);

    var range = wrap.querySelector('[name="percent"]');
    var out = wrap.querySelector("#mp-pct-out");
    range.addEventListener("input", function () { out.textContent = range.value + "%"; });

    wrap.querySelector("#mp-prog-cancel").addEventListener("click", function () { wrap.remove(); });
    wrap.querySelector("#mp-prog-save").addEventListener("click", function () {
      var msg = wrap.querySelector("#mp-prog-msg");
      msg.className = "mp-msg"; msg.textContent = "保存中…";
      rpc("member_set_progress", {
        p_name: state.name, p_sid: state.sid, p_project: projectName,
        p_stage: wrap.querySelector('[name="stage"]').value,
        p_percent: parseInt(range.value, 10),
        p_note: (wrap.querySelector('[name="note"]').value || "").trim()
      }).then(function (ok) {
        if (!ok) {
          msg.className = "mp-msg mp-msg-err";
          msg.textContent = "只有这个课题的成员或管理员能更新进度。";
          return;
        }
        msg.className = "mp-msg mp-msg-ok";
        msg.textContent = "已更新，同课题成员会同步看到。";
        setTimeout(function () {
          wrap.remove();
          loadProjects().then(renderProfile);
        }, 600);
      }).catch(function (e) {
        msg.className = "mp-msg mp-msg-err";
        msg.textContent = "保存失败（" + e.message + "）。";
      });
    });
  }

  /* ---------- 启动 ---------- */

  load();
  currentName = detectName();
  if (currentName) loadProjects().then(renderProfile);

  function ensureChip() {
    if (!state || document.querySelector(".mp-chip")) return;
    var chip = document.createElement("div");
    chip.className = "mp-chip";
    chip.innerHTML = '<span>' + esc(state.name) + (state.role === "admin" ? " · 管理员" : "") + '</span>' +
      '<button type="button" class="mp-chip-out">退出</button>';
    document.body.appendChild(chip);
    chip.querySelector(".mp-chip-out").addEventListener("click", function () {
      state = null; persist(); markGuest(); chip.remove(); location.reload();
    });
  }

  function ensureLoginPill() {
    if (state || document.querySelector(".mp-pill")) return;
    var pill = document.createElement("button");
    pill.type = "button";
    pill.className = "mp-pill";
    pill.textContent = "成员登录";
    pill.addEventListener("click", function () {
      pill.remove();
      buildLogin();
    });
    document.body.appendChild(pill);
  }

  if (!state) {
    if (isGuest()) setTimeout(ensureLoginPill, 200);
    else setTimeout(function () { buildLogin(); }, 400);
  } else {
    ensureChip();
  }

  window.__chenlabEnsureChip = ensureChip;
  window.__chenlabEnsureLoginPill = ensureLoginPill;
  window.__chenlabOpenLogin = function () { if (!state) buildLogin(); };
})();
