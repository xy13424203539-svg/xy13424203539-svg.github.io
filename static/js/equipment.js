/* 设备使用登记：读取 / 提交 记录。未配置后端时给出明确状态，不静默失败。 */
(function () {
  var cfg = window.LAB_SB || {};
  var ready = !!(cfg.url && cfg.key);

  var form = document.getElementById("eq-form");
  var statusEl = document.getElementById("eq-status");
  var listEl = document.getElementById("eq-list");
  var dateEl = document.getElementById("eq-date");
  var selectEl = document.getElementById("eq-device");
  var submitEl = document.getElementById("eq-submit");

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function setStatus(msg, kind) {
    if (!statusEl) return;
    statusEl.textContent = msg || "";
    statusEl.className = "eq-status" + (kind ? " eq-status--" + kind : "");
  }

  function today() {
    var d = new Date();
    var m = String(d.getMonth() + 1).padStart(2, "0");
    var day = String(d.getDate()).padStart(2, "0");
    return d.getFullYear() + "-" + m + "-" + day;
  }

  if (dateEl) dateEl.value = today();

  var matField = document.getElementById("eq-material-field");
  var amtField = document.getElementById("eq-amount-field");
  var matEl = document.getElementById("eq-material");

  function toggleConsumable() {
    var isPrinter = selectEl && selectEl.value === "3D 打印机";
    if (matField) matField.hidden = !isPrinter;
    if (amtField) amtField.hidden = !isPrinter;
  }
  if (selectEl) {
    selectEl.addEventListener("change", toggleConsumable);
    toggleConsumable();
  }

  // 设备卡片点击后选中并带入表单
  document.querySelectorAll(".eq-device").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var name = btn.getAttribute("data-device") || "";
      if (selectEl && name) {
        for (var i = 0; i < selectEl.options.length; i++) {
          if (selectEl.options[i].value === name) selectEl.selectedIndex = i;
        }
        toggleConsumable();
      }
      document.querySelectorAll(".eq-device").forEach(function (b) {
        b.classList.remove("is-on");
      });
      btn.classList.add("is-on");
      var field = document.getElementById("eq-form");
      if (field) field.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  });

  if (!ready) {
    setStatus("登记功能待接入：管理员配置后端后即可提交。", "warn");
    if (submitEl) submitEl.disabled = true;
    if (listEl) listEl.innerHTML = '<div class="eq-empty">暂无记录接口。</div>';
    return;
  }

  function headers(extra) {
    var h = { apikey: cfg.key, Authorization: "Bearer " + cfg.key };
    if (extra) for (var k in extra) h[k] = extra[k];
    return h;
  }

  function load() {
    if (!listEl) return;
    listEl.innerHTML = '<div class="eq-empty">读取中…</div>';
    fetch(cfg.url + "/rest/v1/" + cfg.table +
          "?select=device,user_name,used_on,hours,purpose,material,material_amount,created_at" +
          "&order=used_on.desc,created_at.desc&limit=40",
          { headers: headers() })
      .then(function (r) {
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.json();
      })
      .then(function (rows) {
        if (!rows.length) {
          listEl.innerHTML = '<div class="eq-empty">还没有登记记录。</div>';
          return;
        }
        listEl.innerHTML = rows.map(function (r) {
          var mat = r.material
            ? '<div class="eq-mat">耗材 ' + esc(r.material) +
              (r.material_amount ? ' · ' + esc(r.material_amount) + ' 克' : '') + '</div>'
            : '';
          return '<div class="eq-card">' +
            '<div class="eq-card-top"><b>' + esc(r.device) + '</b>' +
            '<span class="eq-hours">' + esc(r.hours) + ' 小时</span></div>' +
            '<div class="eq-meta">' + esc(r.user_name) + ' · ' + esc(r.used_on) + '</div>' +
            mat +
            (r.purpose ? '<div class="eq-purpose">' + esc(r.purpose) + '</div>' : '') +
            '</div>';
        }).join("");
      })
      .catch(function (e) {
        listEl.innerHTML = '<div class="eq-empty">记录读取失败（' + esc(e.message) + '）。</div>';
      });
  }

  if (form) {
    form.addEventListener("submit", function (ev) {
      ev.preventDefault();
      var data = {
        device: form.device.value,
        user_name: form.user_name.value.trim(),
        used_on: form.used_on.value,
        hours: parseFloat(form.hours.value),
        purpose: form.purpose.value.trim()
      };
      if (data.device === "3D 打印机") {
        data.material = (form.material && form.material.value) || "";
        var amt = parseFloat(form.material_amount && form.material_amount.value);
        data.material_amount = amt > 0 ? amt : null;
        if (!data.material) { setStatus("用了 3D 打印机，请选择耗材类型。", "warn"); return; }
      } else {
        data.material = null;
        data.material_amount = null;
      }
      if (!data.user_name) { setStatus("请填写使用人。", "warn"); return; }
      if (!data.used_on) { setStatus("请选择日期。", "warn"); return; }
      if (!(data.hours > 0)) { setStatus("使用时长要大于 0。", "warn"); return; }
      if (!data.purpose) { setStatus("请写一下这次用设备做了什么。", "warn"); return; }

      if (submitEl) { submitEl.disabled = true; submitEl.textContent = "提交中…"; }
      fetch(cfg.url + "/rest/v1/" + cfg.table, {
        method: "POST",
        headers: headers({ "Content-Type": "application/json", Prefer: "return=minimal" }),
        body: JSON.stringify(data)
      })
        .then(function (r) {
          if (!r.ok) return r.text().then(function (t) { throw new Error("HTTP " + r.status + " " + t.slice(0, 80)); });
          setStatus("已登记。", "ok");
          form.reset();
          if (dateEl) dateEl.value = today();
          toggleConsumable();
          document.querySelectorAll(".eq-device").forEach(function (b) { b.classList.remove("is-on"); });
          load();
        })
        .catch(function (e) {
          setStatus("提交失败（" + e.message + "），请稍后重试或告知负责人。", "err");
        })
        .then(function () {
          if (submitEl) { submitEl.disabled = false; submitEl.textContent = "提交登记"; }
        });
    });
  }

  load();
})();
