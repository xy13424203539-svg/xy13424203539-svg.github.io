---
title: 设备使用登记
summary: 实验室设备清单与使用登记。
date: 2026-11-11
type: page
---

使用设备前先看清设备旁的纸质使用记录，用完在这里登记一次：用了哪台、哪天、多久、做了什么。

### 设备清单

<div class="eq-devices">
<button type="button" class="eq-device" data-device="3D 打印机"><b>3D 打印机</b><span>结构件快速成型与迭代</span></button>
<button type="button" class="eq-device" data-device="静电纺丝机"><b>静电纺丝机</b><span>纳米纤维制备</span></button>
<button type="button" class="eq-device" data-device="压缩机"><b>压缩机</b><span>气动与耐压试验</span></button>
<button type="button" class="eq-device" data-device="超声波清洗机"><b>超声波清洗机</b><span>样件与器件清洗</span></button>
<button type="button" class="eq-device" data-device="搅拌机"><b>搅拌机</b><span>溶液与浆料配制</span></button>
<button type="button" class="eq-device" data-device="烘干机"><b>烘干机</b><span>样件干燥与后处理</span></button>
</div>

### 登记

<form id="eq-form" class="eq-form" novalidate>
  <label class="eq-field">
    <span>设备</span>
    <select name="device" id="eq-device">
      <option>3D 打印机</option>
      <option>静电纺丝机</option>
      <option>压缩机</option>
      <option>超声波清洗机</option>
      <option>搅拌机</option>
      <option>烘干机</option>
    </select>
  </label>

  <label class="eq-field">
    <span>使用人</span>
    <input type="text" name="user_name" maxlength="20" placeholder="你的名字" autocomplete="name">
  </label>

  <label class="eq-field">
    <span>日期</span>
    <input type="date" name="used_on" id="eq-date">
  </label>

  <label class="eq-field">
    <span>使用时长（小时）</span>
    <input type="number" name="hours" min="0.5" step="0.5" placeholder="例如 1.5">
  </label>

  <label class="eq-field eq-field--full" id="eq-material-field" hidden>
    <span>耗材类型（3D 打印机）</span>
    <select name="material" id="eq-material">
      <option value="">请选择耗材</option>
      <option>PLA</option>
      <option>PETG</option>
      <option>ABS</option>
      <option>TPU</option>
      <option>尼龙（PA）</option>
      <option>光敏树脂</option>
      <option>其他</option>
    </select>
  </label>

  <label class="eq-field" id="eq-amount-field" hidden>
    <span>耗材用量（克）</span>
    <input type="number" name="material_amount" min="1" step="1" placeholder="例如 80">
  </label>

  <label class="eq-field eq-field--full">
    <span>做了什么</span>
    <textarea name="purpose" rows="3" maxlength="200" placeholder="例如：打印仿生鱼尾鳍连接件，两件，PETG"></textarea>
  </label>

  <div class="eq-actions">
    <button type="submit" id="eq-submit" class="eq-submit">提交登记</button>
    <div id="eq-status" class="eq-status"></div>
  </div>
</form>

### 使用记录

<div id="eq-list" class="eq-list"></div>

<script src="/js/equipment-config.js?v=20261112f"></script>
<script src="/js/equipment.js?v=20261112f"></script>

<p class="page-updated">最后更新 2026 年 11 月 11 日</p>
