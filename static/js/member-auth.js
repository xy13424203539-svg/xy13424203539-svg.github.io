/* 成员登录与个人资料编辑：站内自建登录，不走 Supabase 自带登录页。
   未登录只读；登录后可编自己的资料；admin 可编任何人。 */
(function () {
  if (window.__chenlabMemberLoaded) return;
  window.__chenlabMemberLoaded = true;

  var cfg = window.LAB_SB || {};
  if (!cfg.url || !cfg.key) return;

  var STORE = "chenlab_member";
  var state = null;
  var currentName = "";

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

  /* ---------- 登录浮层 ---------- */

  function buildLogin() {
    var wrap = document.createElement("div");
    wrap.className = "mp-mask";
    wrap.id = "mp-login-mask";
    wrap.innerHTML =
      '<div class="mp-login">' +
        '<h3>实验室成员登录</h3>' +
        '<p class="mp-login-sub">输入姓名和学号，可以填写或修改自己的个人资料；不登录也能查看全部内容。</p>' +
        '<div class="mp-row"><label>姓名<input id="mp-in-name" type="text" maxlength="10" placeholder="例如 肖扬"></label></div>' +
        '<div class="mp-row"><label>学号<input id="mp-in-sid" type="text" maxlength="20" placeholder="例如 202516984145"></label></div>' +
        '<div id="mp-login-msg" class="mp-msg"></div>' +
        '<div class="mp-btns">' +
          '<button type="button" class="mp-btn mp-btn-main" id="mp-do-login">登录</button>' +
          '<button type="button" class="mp-btn" id="mp-close-login">只看不登录</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(wrap);

    var msg = wrap.querySelector("#mp-login-msg");
    wrap.querySelector("#mp-close-login").addEventListener("click", function () {
      wrap.remove();
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
          msg.className = "mp-msg mp-msg-ok";
          msg.textContent = "已登录：" + state.name + (state.role === "admin" ? "（管理员）" : "");
          setTimeout(function () { wrap.remove(); renderProfile(); }, 700);
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

  function renderProfile() {
    if (!currentName) return;
    var host = document.getElementById("mp-profile");
    if (!host) {
      host = document.createElement("div");
      host.id = "mp-profile";
      host.className = "mp-profile";
      var art = document.querySelector("article");
      if (!art) return;
      art.insertBefore(host, art.firstChild);
    }

    profileRows(currentName).then(function (rows) {
      var p = rows && rows.length ? rows[0] : null;
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
    });
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

    wrap.innerHTML =
      '<div class="mp-edit">' +
        '<h3>编辑 ' + esc(currentName) + ' 的资料</h3>' +
        '<div class="mp-form">' + rows + '</div>' +
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
          setTimeout(function () { wrap.remove(); renderProfile(); }, 600);
        })
        .catch(function (e) {
          msg.className = "mp-msg mp-msg-err";
          msg.textContent = "保存失败（" + e.message + "）。";
        });
    });
  }

  /* ---------- 启动 ---------- */

  load();
  currentName = detectName();
  if (currentName) renderProfile();

  if (!state) {
    setTimeout(function () { buildLogin(); }, 400);
  } else {
    var chip = document.createElement("div");
    chip.className = "mp-chip";
    chip.innerHTML = '<span>' + esc(state.name) + (state.role === "admin" ? " · 管理员" : "") + '</span>' +
      '<button type="button" class="mp-chip-out">退出</button>';
    document.body.appendChild(chip);
    chip.querySelector(".mp-chip-out").addEventListener("click", function () {
      state = null; persist(); chip.remove(); location.reload();
    });
  }
})();
