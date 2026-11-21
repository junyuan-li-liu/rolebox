/*
 * 角色设定插件（role-inject）
 * 给 chat-demo 增加「多角色」能力：
 *   1. 设置里管理多个角色（名字 + 设定正文），存在浏览器本地
 *   2. 每次请求自动把当前角色插入为 system 消息
 *   3. 右下角浮动按钮打开面板，随时切换
 * 不改动原应用代码，只做外挂拦截，原项目升级时删掉本文件和 index.html 里的 script 即可。
 */
(function () {
  'use strict';

  var LS_ROLES = 'dsh_roles_v1';
  var LS_ACTIVE = 'dsh_active_role_v1';

  function loadRoles() {
    try {
      var raw = localStorage.getItem(LS_ROLES);
      var arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch (e) { return []; }
  }
  function saveRoles(list) {
    try { localStorage.setItem(LS_ROLES, JSON.stringify(list)); } catch (e) {}
  }
  function getActiveId() {
    try { return localStorage.getItem(LS_ACTIVE) || ''; } catch (e) { return ''; }
  }
  function setActiveId(id) {
    try { localStorage.setItem(LS_ACTIVE, id || ''); } catch (e) {}
  }
  function getActiveRole() {
    var id = getActiveId();
    if (!id) return null;
    var list = loadRoles();
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }
  function uid() {
    return 'r' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }

  // ---------- 记住最近的对话（供「整理设定」用） ----------
  // 只记纯文本的 user / assistant 消息，不记 system，最多 80 条（约 40 轮）
  function rememberRecent(messages) {
    try {
      var plain = [];
      for (var i = 0; i < messages.length; i++) {
        var m = messages[i];
        if (!m || m.role === 'system') continue;
        if (typeof m.content !== 'string' || !m.content) continue;
        plain.push({ role: m.role, content: m.content });
      }
      window.__dshRecent = plain.slice(-80);
      try { localStorage.setItem('dsh_recent_msgs_v1', JSON.stringify(plain.slice(-60))); } catch (e2) {}
    } catch (e) {}
  }

  // ---------- 请求拦截：把当前角色注入为 system ----------
  function applyRoleToMessages(messages) {
    var role = getActiveRole();
    if (!role || !role.content) return null;
    var first = messages[0];
    if (first && first.role === 'system' && first._dshRole === role.id) return null; // 已注入
    var sys = { role: 'system', content: role.content, _dshRole: role.id };
    return [sys].concat(messages);
  }

  // 支持 body 是 JSON 字符串，也支持直接是对象
  function injectIntoBody(rawBody) {
    if (rawBody == null) return rawBody;
    if (typeof rawBody === 'string') {
      if (rawBody.length < 2) return rawBody;
      var body;
      try { body = JSON.parse(rawBody); } catch (e) { return rawBody; }
      if (!body || !Array.isArray(body.messages)) return rawBody;
      rememberRecent(body.messages);
      var next = applyRoleToMessages(body.messages);
      if (!next) return rawBody;
      body.messages = next;
      if (window.__dshRoleFlash) window.__dshRoleFlash();
      return JSON.stringify(body);
    }
    if (typeof rawBody === 'object' &&
        !(rawBody instanceof FormData) &&
        !(rawBody instanceof Blob) &&
        Array.isArray(rawBody.messages)) {
      rememberRecent(rawBody.messages);
      var next2 = applyRoleToMessages(rawBody.messages);
      if (next2) {
        rawBody.messages = next2;
        if (window.__dshRoleFlash) window.__dshRoleFlash();
      }
    }
    return rawBody;
  }

  var origFetch = window.fetch;
  // 留一份原生 fetch，给「整理设定」用；否则整理请求也会被下面的注入逻辑改掉
  try { window.__dshOrigFetch = origFetch; } catch (e) {}
  if (typeof origFetch === 'function') {
    window.fetch = function (input, init) {
      try {
        if (init && typeof init.body === 'string') {
          var nb = injectIntoBody(init.body);
          if (nb !== init.body) {
            init = Object.assign({}, init, { body: nb });
          }
        }
      } catch (e) {}
      return origFetch.call(this, input, init);
    };
  }

  // XHR 兜底
  var origSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.send = function (body) {
    try {
      if (typeof body === 'string') body = injectIntoBody(body);
    } catch (e) {}
    return origSend.call(this, body);
  };

  // ---------- 界面 ----------
  if (window.__dshRoleUiLoaded) return;
  window.__dshRoleUiLoaded = true;

  function el(tag, style, text) {
    var n = document.createElement(tag);
    if (style) n.setAttribute('style', style);
    if (text != null) n.textContent = text;
    return n;
  }

  var btnStyle = [
    'position:fixed', 'right:14px', 'top:50%', 'transform:translateY(-50%)',
    'width:44px', 'height:44px', 'border-radius:22px', 'border:none',
    'background:#4d6bfe', 'color:#fff', 'font-size:13px', 'cursor:pointer',
    'z-index:2147483000', 'box-shadow:0 4px 14px rgba(0,0,0,.18)',
    'display:flex', 'align-items:center', 'justify-content:center',
    'font-family:inherit', 'opacity:.92'
  ].join(';');

  var btn = el('button', btnStyle, '角');
  btn.title = '角色设定';
  document.body.appendChild(btn);

  // ---------- PWA 安装入口 ----------
  // 浏览器支持安装时会触发 beforeinstallprompt；把它存下来，
  // 用我们自己的按钮触发安装，避免用户去菜单里翻「添加到桌面」。
  var installBtn = null;
  var deferredPrompt = null;

  function removeInstallBtn() {
    if (installBtn && installBtn.parentNode) installBtn.parentNode.removeChild(installBtn);
    installBtn = null;
  }

  function ensureInstallBtn() {
    if (installBtn) return;
    installBtn = el('button', [
      'position:fixed', 'right:14px', 'top:calc(50% + 52px)',
      'width:44px', 'height:44px', 'border-radius:22px',
      'border:2px solid #4d6bfe', 'background:#fff', 'color:#4d6bfe',
      'font-size:17px', 'line-height:1', 'cursor:pointer',
      'z-index:2147483000', 'box-shadow:0 4px 14px rgba(0,0,0,.12)',
      'display:flex', 'align-items:center', 'justify-content:center',
      'font-family:inherit'
    ].join(';'), '\u2B07');
    installBtn.title = '安装到桌面（像 App 一样打开）';
    installBtn.onclick = function () {
      if (!deferredPrompt) {
        alert('这个浏览器没有提供安装入口。\n\n可以试试：\n· 手机：用 Chrome 或小米/红米自带浏览器打开本页\n· 电脑：Edge 菜单「更多工具 → 应用 → 安装此站点」\n\n如果之前装过又删了，请先去系统「应用管理」里卸载「角色匣」，再回来打开本页。');
        return;
      }
      deferredPrompt.prompt();
      deferredPrompt.userChoice.then(function (r) {
        if (r && r.outcome === 'accepted') removeInstallBtn();
        deferredPrompt = null;
      }).catch(function () { deferredPrompt = null; });
    };
    document.body.appendChild(installBtn);
  }

  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();
    deferredPrompt = e;
    ensureInstallBtn();
  });

  window.addEventListener('appinstalled', function () {
    deferredPrompt = null;
    removeInstallBtn();
  });

  // 只在浏览器真的给了安装入口时才显示按钮（v20：常驻版会被误当成"有按钮就能装"）

  var mask = el('div', [
    'position:fixed', 'inset:0', 'background:rgba(0,0,0,.35)',
    'z-index:2147483001', 'display:none'
  ].join(';'));

  var panel = el('div', [
    'position:fixed', 'left:50%', 'top:50%', 'transform:translate(-50%,-50%)',
    'width:min(720px,92vw)', 'max-height:86vh', 'overflow:auto',
    'background:#fff', 'border-radius:14px', 'box-shadow:0 12px 48px rgba(0,0,0,.25)',
    'z-index:2147483002', 'display:none', 'padding:20px',
    'font-family:system-ui,-apple-system,"Segoe UI",sans-serif', 'color:#1b1b1b'
  ].join(';'));

  var titleBar = el('div', 'display:flex;align-items:center;justify-content:space-between;margin-bottom:6px');
  var h = el('div', 'font-size:17px;font-weight:600', '角色设定');
  var closeBtn = el('button', 'border:none;background:transparent;font-size:20px;cursor:pointer;color:#888;line-height:1', '×');
  titleBar.appendChild(h); titleBar.appendChild(closeBtn);

  var tip = el('div', 'font-size:12px;color:#888;margin-bottom:14px;line-height:1.6',
    '这里设置的角色会自动附加到你发出的每一次对话前面（system 提示），不用再手动粘贴。数据只存在本浏览器。');

  // 版本号：从自己的 script src 的 ?v=N 读，用来判断浏览器有没有拿到新代码
  var MODULE_VERSION = (function () {
    try {
      var s = (document.currentScript && document.currentScript.src) || '';
      var m = s.match(/[?&]v=(\d+)/);
      return m ? m[1] : '';
    } catch (e) { return ''; }
  })();

  var verTip = el('div', 'font-size:11px;color:#bbb;margin:-8px 0 12px',
    MODULE_VERSION ? ('注入模块 v' + MODULE_VERSION) : '注入模块');

  var listWrap = el('div', 'display:flex;flex-wrap:wrap;gap:8px;margin-bottom:14px');

  var editor = el('div', 'border-top:1px solid #eee;padding-top:14px');
  var nameInput = el('input', [
    'width:100%', 'box-sizing:border-box', 'padding:8px 10px', 'font-size:14px',
    'border:1px solid #ddd', 'border-radius:8px', 'margin-bottom:10px', 'outline:none'
  ].join(';'));
  nameInput.placeholder = '角色名字，例如：观澜';

  var contentArea = el('textarea', [
    'width:100%', 'box-sizing:border-box', 'padding:10px', 'font-size:13px',
    'border:1px solid #ddd', 'border-radius:8px', 'min-height:220px',
    'resize:vertical', 'line-height:1.7', 'outline:none',
    'font-family:inherit'
  ].join(';'));
  contentArea.placeholder = '把角色设定 / 档案正文贴在这里。建议写：你是谁、说话风格、立场、底线、称呼习惯等。';

  var btnRow = el('div', 'display:flex;gap:8px;margin-top:12px;flex-wrap:wrap');
  function mkBtn(label, primary) {
    var b = el('button', [
      'padding:8px 16px', 'border-radius:8px', 'font-size:13px', 'cursor:pointer',
      'border:1px solid ' + (primary ? '#4d6bfe' : '#ddd'),
      'background:' + (primary ? '#4d6bfe' : '#fff'),
      'color:' + (primary ? '#fff' : '#333'),
      'font-family:inherit'
    ].join(';'), label);
    return b;
  }
  var saveBtn = mkBtn('保存', true);
  var newBtn = mkBtn('新建', false);
  var delBtn = mkBtn('删除', false);
  var applyBtn = mkBtn('设为当前', false);
  var expBtn = mkBtn('导出', false);
  var impBtn = mkBtn('导入', false);
  var sumBtn = mkBtn('整理设定', false);
  var histBtn = mkBtn('历史', false);
  btnRow.appendChild(saveBtn); btnRow.appendChild(applyBtn);
  btnRow.appendChild(newBtn); btnRow.appendChild(delBtn);
  btnRow.appendChild(sumBtn); btnRow.appendChild(histBtn);
  btnRow.appendChild(expBtn); btnRow.appendChild(impBtn);

  var status = el('div', 'font-size:12px;color:#4d6bfe;margin-top:10px;min-height:16px');

  editor.appendChild(nameInput);
  editor.appendChild(contentArea);
  editor.appendChild(btnRow);
  editor.appendChild(status);

  panel.appendChild(titleBar);
  panel.appendChild(tip);
  panel.appendChild(verTip);
  panel.appendChild(listWrap);
  panel.appendChild(editor);
  document.body.appendChild(mask);
  document.body.appendChild(panel);

  var editingId = '';

  function renderList() {
    listWrap.textContent = '';
    var list = loadRoles();
    var activeId = getActiveId();
    if (!list.length) {
      listWrap.appendChild(el('div', 'font-size:13px;color:#999', '还没有角色，点下面「新建」创建一个。'));
      return;
    }
    list.forEach(function (r) {
      var isActive = r.id === activeId;
      var chip = el('button', [
        'padding:6px 14px', 'border-radius:16px', 'font-size:13px', 'cursor:pointer',
        'border:1px solid ' + (isActive ? '#4d6bfe' : '#ddd'),
        'background:' + (isActive ? '#eef2ff' : '#fff'),
        'color:' + (isActive ? '#4d6bfe' : '#444'),
        'font-family:inherit'
      ].join(';'), r.name + (isActive ? ' ✓' : ''));
      chip.onclick = function () {
        setActiveId(r.id);
        editingId = r.id;
        fillEditor(r);
        renderList();
        status.textContent = '当前角色已切换为：' + r.name;
      };
      listWrap.appendChild(chip);
    });
  }

  function fillEditor(r) {
    nameInput.value = r ? r.name : '';
    contentArea.value = r ? r.content : '';
    editingId = r ? r.id : '';
  }

  function show() {
    mask.style.display = 'block';
    panel.style.display = 'block';
    var list = loadRoles();
    var act = getActiveRole();
    if (act) fillEditor(act);
    else if (list.length) fillEditor(list[0]);
    else { fillEditor(null); }
    renderList();
    status.textContent = '';
  }
  function hide() { mask.style.display = 'none'; panel.style.display = 'none'; }

  btn.onclick = show;
  window.__dshRoleFlash = function () {
    try {
      btn.style.background = '#16a34a';
      btn.textContent = '✓';
      clearTimeout(window.__dshRoleFlashT);
      window.__dshRoleFlashT = setTimeout(function () {
        btn.style.background = '#4d6bfe';
        btn.textContent = '角';
      }, 2500);
    } catch (e) {}
  };
  closeBtn.onclick = hide;
  mask.onclick = hide;

  function doSave(silent) {
    var name = (nameInput.value || '').trim();
    var content = contentArea.value || '';
    if (!name) { if (!silent) status.textContent = '先给角色起个名字'; return false; }
    if (!content.trim()) { if (!silent) status.textContent = '设定正文不能为空'; return false; }
    var list = loadRoles();
    if (editingId) {
      var hit = false;
      for (var i = 0; i < list.length; i++) {
        if (list[i].id === editingId) { list[i].name = name; list[i].content = content; hit = true; }
      }
      if (!hit) { list.push({ id: editingId, name: name, content: content }); }
    } else {
      editingId = uid();
      list.push({ id: editingId, name: name, content: content });
      setActiveId(editingId);
    }
    saveRoles(list);
    renderList();
    if (!silent) status.textContent = '已保存（' + name + '，' + content.length + ' 字）';
    return true;
  }
  saveBtn.onclick = function () { doSave(false); };

  // 编辑框一有改动就提醒，避免"改了但没保存，导出的还是旧的"
  function markDirty() {
    if (status.textContent.indexOf('未保存') < 0) {
      status.textContent = '有改动没保存 —— 要点「保存」才生效（导出/导入都会用已保存的内容）';
    }
  }
  nameInput.addEventListener('input', markDirty);
  contentArea.addEventListener('input', markDirty);

  newBtn.onclick = function () { fillEditor(null); renderList(); status.textContent = '新建模式：填名字和正文，点保存'; };

  delBtn.onclick = function () {
    if (!editingId) { status.textContent = '没有选中角色'; return; }
    if (!confirm('确定删除这个角色？')) return;
    var list = loadRoles().filter(function (r) { return r.id !== editingId; });
    saveRoles(list);
    if (getActiveId() === editingId) setActiveId(list.length ? list[0].id : '');
    fillEditor(list.length ? list[0] : null);
    renderList();
    status.textContent = '已删除';
  };

  applyBtn.onclick = function () {
    if (!editingId) { status.textContent = '先保存，再设为当前'; return; }
    setActiveId(editingId);
    renderList();
    status.textContent = '已设为当前角色';
  };

  // 导出成 Markdown：记事本直接能看懂（换行是真换行，没有 \n 转义），也能再导回来
  function toRolesMarkdown(list, activeId) {
    var out = [];
    out.push('# 角色匣 · 角色备份');
    out.push('');
    out.push('- 导出时间：' + new Date().toLocaleString('zh-CN'));
    out.push('- 角色数量：' + list.length);
    out.push('');
    out.push('> 每个角色以「## 角色名」开头，下面的正文就是设定原文（换行是真实换行）。');
    out.push('> 想恢复：点面板里的「导入」，选这个 .md 文件即可。');
    out.push('');
    list.forEach(function (r) {
      out.push('## ' + r.name);
      out.push('');
      out.push('> id: ' + r.id + (r.id === activeId ? ' (当前使用)' : ''));
      out.push('');
      out.push(r.content);
      out.push('');
      out.push('---');
      out.push('');
    });
    return out.join('\n');
  }

  expBtn.onclick = function () {
    // 先把编辑框里的改动落盘，否则导出的是上次保存的旧内容
    doSave(true);
    var list = loadRoles();
    if (!list.length) { status.textContent = '没有角色可导出'; return; }
    var md = toRolesMarkdown(list, getActiveId());
    // 前面加 BOM：Windows 记事本靠这三个字节才认得出是 UTF-8，否则中文全乱码
    var blob = new Blob(['\uFEFF' + md], { type: 'text/markdown;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'rolebox-' + new Date().toISOString().slice(0, 10) + '.md';
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 1000);
    status.textContent = '已导出 ' + list.length + ' 个角色（Markdown，记事本可直接看）';
    try { localStorage.setItem('dsh_last_export_v1', new Date().toISOString()); } catch (e) {}
  };

  // ---------- 统一导入：按扩展名自动分流 ----------
  // .json / .md → 角色备份；.md 不像备份就退化成正文；.txt / .docx → 正文

  function importRolesData(data) {
    var incoming = (data && Array.isArray(data.roles)) ? data.roles : null;
    if (!incoming) { status.textContent = '文件格式不对：缺少 roles 数组'; return; }
    var list = loadRoles();
    var added = 0, skipped = 0;
    incoming.forEach(function (r) {
      if (!r || !r.name || !r.content) { skipped++; return; }
      var dup = list.some(function (x) { return x.name === r.name && x.content === r.content; });
      if (dup) { skipped++; return; }
      var id = r.id && !list.some(function (x) { return x.id === r.id; }) ? r.id : uid();
      list.push({ id: id, name: r.name, content: r.content });
      added++;
    });
    saveRoles(list);
    if (data.activeId && list.some(function (x) { return x.id === data.activeId; })) {
      setActiveId(data.activeId);
    }
    renderList();
    status.textContent = added
      ? ('导入完成：新增 ' + added + ' 个' + (skipped ? '，跳过 ' + skipped + ' 个（已存在）' : ''))
      : ('没有新增：这 ' + skipped + ' 个角色你都已有了');
  }

  function importRolesJson(text) {
    var data;
    var rawText = String(text).replace(/^\uFEFF/, '');
    try { data = JSON.parse(rawText); } catch (e) {
      status.textContent = '解析失败：不是合法的 JSON'; return;
    }
    importRolesData(data);
  }

  function parseRolesMarkdown(text) {
    var clean = String(text).replace(/^\uFEFF/, '');
    if (clean.indexOf('# 角色匣') < 0) return null;   // 不是我们导出的备份，当普通文档处理
    var chunks = clean.split(/\n##\s+/).slice(1);
    var roles = [], activeId = '';
    chunks.forEach(function (chunk) {
      var nl = chunk.indexOf('\n');
      if (nl < 0) return;
      var name = chunk.slice(0, nl).trim();
      var body = chunk.slice(nl + 1);
      var idM = body.match(/^>\s*id:\s*(\S+)([^\n]*)$/m);
      var id = idM ? idM[1] : '';
      if (idM && idM[2] && idM[2].indexOf('当前使用') >= 0) activeId = id;
      body = body.replace(/^>\s*id:[^\n]*\n?/m, '');
      body = body.replace(/\n---\s*$/, '').replace(/^\n+/, '').trim();
      if (name && body) roles.push({ id: id, name: name, content: body });
    });
    return { roles: roles, activeId: activeId };
  }

  impBtn.onclick = function () {
    var input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,.md,.txt,.docx';
    input.onchange = function () {
      var file = input.files && input.files[0];
      if (!file) return;
      var fname = (file.name || '').toLowerCase();
      status.textContent = '正在读取 ' + file.name + ' …';
      if (fname.slice(-5) === '.json') {
        file.text().then(importRolesJson)
          .catch(function (e) { status.textContent = '读取失败：' + e.message; });
      } else if (fname.slice(-5) === '.docx') {
        readDocx(file).then(function (t) { applyImportedText(t, file.name); })
          .catch(function (e) { status.textContent = '读取失败：' + e.message; });
      } else if (fname.slice(-4) === '.txt' || fname.slice(-3) === '.md') {
        file.text().then(function (t) {
          if (fname.slice(-3) === '.md') {
            var parsed = parseRolesMarkdown(t);
            if (parsed && parsed.roles.length) { importRolesData(parsed); return; }
          }
          applyImportedText(t, file.name);
        }).catch(function (e) { status.textContent = '读取失败：' + e.message; });
      } else {
        status.textContent = '支持 .json / .md（角色备份）、.txt / .docx（正文）。PDF 请先另存为文本。';
      }
    };
    input.click();
  };

  // ---------- 从文档导入正文（txt / md / docx） ----------
  // 只读本地文件，不发请求。docx 用浏览器原生 DecompressionStream 解压，零依赖。

  function readZipEntry(buf, targetName) {
    var view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
    var eocd = -1;
    var minPos = Math.max(0, buf.length - 65558);
    for (var i = buf.length - 22; i >= minPos; i--) {
      if (view.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    }
    if (eocd < 0) throw new Error('不是有效的 zip/docx 文件');
    var count = view.getUint16(eocd + 10, true);
    var p = view.getUint32(eocd + 16, true);
    for (var k = 0; k < count; k++) {
      if (view.getUint32(p, true) !== 0x02014b50) break;
      var method = view.getUint16(p + 10, true);
      var compSize = view.getUint32(p + 20, true);
      var nameLen = view.getUint16(p + 28, true);
      var extraLen = view.getUint16(p + 30, true);
      var commentLen = view.getUint16(p + 32, true);
      var localOffset = view.getUint32(p + 42, true);
      var name = new TextDecoder('utf-8').decode(buf.subarray(p + 46, p + 46 + nameLen));
      if (name === targetName) {
        var lNameLen = view.getUint16(localOffset + 26, true);
        var lExtraLen = view.getUint16(localOffset + 28, true);
        var dataStart = localOffset + 30 + lNameLen + lExtraLen;
        var raw = buf.subarray(dataStart, dataStart + compSize);
        if (method === 0) return Promise.resolve(new TextDecoder('utf-8').decode(raw));
        if (method === 8) {
          var ds = new DecompressionStream('deflate-raw');
          return new Response(new Blob([raw]).stream().pipeThrough(ds))
            .text();
        }
        throw new Error('不支持的压缩方式（' + method + '）');
      }
      p += 46 + nameLen + extraLen + commentLen;
    }
    throw new Error('文件里没找到 ' + targetName);
  }

  function readDocx(file) {
    return file.arrayBuffer().then(function (ab) {
      var buf = new Uint8Array(ab);
      return readZipEntry(buf, 'word/document.xml');
    }).then(function (xml) {
      var NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
      var doc = new DOMParser().parseFromString(xml, 'application/xml');
      var err = doc.getElementsByTagName('parsererror');
      if (err && err.length) throw new Error('docx 内容解析失败');
      var paras = doc.getElementsByTagNameNS(NS, 'p');
      var lines = [];
      for (var i = 0; i < paras.length; i++) {
        var ts = paras[i].getElementsByTagNameNS(NS, 't');
        var s = '';
        for (var j = 0; j < ts.length; j++) s += (ts[j].textContent || '');
        lines.push(s);
      }
      return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
    });
  }

  var MAX_CHARS = 15000;   // 硬上限：约 1 万 token
  var WARN_CHARS = 8000;   // 警戒线：约 5~7 千 token

  function applyImportedText(text, fileName) {
    var count = text.replace(/\s/g, '').length;
    if (!count) { status.textContent = '这个文件里没读到文字（可能是空文档或纯图片）'; return; }
    if (count > MAX_CHARS) {
      status.textContent = '太长：' + count + ' 字，超过上限 ' + MAX_CHARS +
        ' 字。设定正文每轮都会完整重发，太长会挤占上下文又费钱，请先精简。';
      return;
    }
    contentArea.value = text;
    if (!nameInput.value.trim() && fileName) {
      nameInput.value = fileName.replace(/\.[^.]+$/, '');
    }
    if (count > WARN_CHARS) {
      status.textContent = '已导入 ' + count + ' 字（偏长：每轮都会有这么多 token 重新计费，建议精简后再保存）';
    } else {
      status.textContent = '已导入 ' + count + ' 字，确认无误后点「保存」';
    }
  }

  // 正文类文件（.txt / .docx）走上面的统一导入，这里不再单独挂按钮

  // ---------- 设定整理（提议 + 确认） ----------
  // 手动触发：拿最近 N 轮对话问一次模型「有没有值得长期记住的新信息」，
  // 有就以「追加」方式补进正文，全程要用户点「采纳」，并留历史版本可回滚。

  var LS_SETTINGS = 'dsh_role_settings_v1';
  var LS_HISTORY = 'dsh_role_history_v1';
  var LS_RECENT = 'dsh_recent_msgs_v1';

  function loadSettings() {
    try {
      var o = JSON.parse(localStorage.getItem(LS_SETTINGS) || '{}') || {};
      return { enabled: o.enabled !== false, rounds: parseInt(o.rounds, 10) || 20 };
    } catch (e) { return { enabled: true, rounds: 20 }; }
  }
  function saveSettings(s) {
    try { localStorage.setItem(LS_SETTINGS, JSON.stringify(s)); } catch (e) {}
  }
  function loadHistory() {
    try {
      var a = JSON.parse(localStorage.getItem(LS_HISTORY) || '[]');
      return Array.isArray(a) ? a : [];
    } catch (e) { return []; }
  }
  function saveHistory(list) {
    try { localStorage.setItem(LS_HISTORY, JSON.stringify(list)); } catch (e) {}
  }
  function pushHistory(roleId, content, reason) {
    if (!roleId) return;
    var all = loadHistory();
    all.unshift({ roleId: roleId, content: content, savedAt: new Date().toISOString(), reason: reason || '' });
    var cnt = {}, out = [];
    for (var i = 0; i < all.length; i++) {
      var rid = all[i].roleId;
      cnt[rid] = (cnt[rid] || 0) + 1;
      if (cnt[rid] <= 10) out.push(all[i]);   // 每个角色保留 10 份
    }
    saveHistory(out.slice(0, 60));
  }
  function getRecent() {
    if (Array.isArray(window.__dshRecent) && window.__dshRecent.length) return window.__dshRecent;
    try {
      var a = JSON.parse(localStorage.getItem(LS_RECENT) || '[]');
      return Array.isArray(a) ? a : [];
    } catch (e) { return []; }
  }
  // 从 localStorage 里捞 DeepSeek API Key（原应用把配置存在本地）
  function findApiKey() {
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        var v = localStorage.getItem(k);
        if (!v) continue;
        if (/^sk-[A-Za-z0-9_\-]{16,}$/.test(v.trim())) return v.trim();
        if (v.length < 400 && v.indexOf('sk-') > -1) {
          var m = v.match(/sk-[A-Za-z0-9_\-]{16,}/);
          if (m) return m[0];
        }
      }
    } catch (e) {}
    return '';
  }

  var sumMask = el('div', [
    'position:fixed', 'inset:0', 'background:rgba(0,0,0,.45)',
    'z-index:2147483003', 'display:none'
  ].join(';'));

  var sumPanel = el('div', [
    'position:fixed', 'left:50%', 'top:50%', 'transform:translate(-50%,-50%)',
    'width:min(680px,92vw)', 'max-height:86vh', 'overflow:auto',
    'background:#fff', 'border-radius:14px', 'box-shadow:0 12px 48px rgba(0,0,0,.28)',
    'z-index:2147483004', 'display:none', 'padding:20px',
    'font-family:system-ui,-apple-system,"Segoe UI",sans-serif', 'color:#1b1b1b'
  ].join(';'));

  var sumTitle = el('div', 'display:flex;align-items:center;justify-content:space-between;margin-bottom:8px');
  sumTitle.appendChild(el('div', 'font-size:17px;font-weight:600', '整理设定'));
  var sumClose = el('button', 'border:none;background:transparent;font-size:20px;cursor:pointer;color:#888;line-height:1', '×');
  sumTitle.appendChild(sumClose);

  var sumTip = el('div', 'font-size:12px;color:#888;line-height:1.7;margin-bottom:14px',
    '把最近的对话翻一遍，看有没有值得长期记进设定的新信息。只会「追加」到正文末尾，不会改你原来写的东西，而且改之前会存历史版本。');

  var sumCtl = el('div', 'display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:12px');
  sumCtl.appendChild(el('span', 'font-size:13px;color:#555', '取最近'));
  var roundsInput = el('input', [
    'width:70px', 'padding:6px 8px', 'font-size:13px', 'border:1px solid #ddd',
    'border-radius:6px', 'outline:none', 'text-align:center'
  ].join(';'));
  roundsInput.type = 'number';
  roundsInput.min = '2';
  roundsInput.max = '100';
  sumCtl.appendChild(roundsInput);
  sumCtl.appendChild(el('span', 'font-size:13px;color:#555', '轮对话'));
  var sumGo = mkBtn('开始整理', true);
  sumCtl.appendChild(sumGo);

  var sumOut = el('div', 'font-size:13px;line-height:1.8;min-height:40px;border-top:1px solid #eee;padding-top:12px');

  var sumFoot = el('div', 'display:flex;align-items:center;justify-content:space-between;margin-top:16px;padding-top:12px;border-top:1px solid #eee');
  var sumEnabled = el('input');
  sumEnabled.type = 'checkbox';
  var sumEnabledLabel = el('label', 'font-size:12px;color:#666;cursor:pointer;display:flex;align-items:center;gap:6px');
  sumEnabledLabel.appendChild(sumEnabled);
  sumEnabledLabel.appendChild(document.createTextNode('启用这个功能'));
  sumFoot.appendChild(sumEnabledLabel);
  sumFoot.appendChild(el('div', 'font-size:11px;color:#aaa', '关闭后按钮会变灰，随时可重新打开'));

  sumPanel.appendChild(sumTitle);
  sumPanel.appendChild(sumTip);
  sumPanel.appendChild(sumCtl);
  sumPanel.appendChild(sumOut);
  sumPanel.appendChild(sumFoot);
  document.body.appendChild(sumMask);
  document.body.appendChild(sumPanel);

  function openSum() {
    var s = loadSettings();
    roundsInput.value = s.rounds;
    sumEnabled.checked = s.enabled;
    sumOut.textContent = '';
    sumMask.style.display = 'block';
    sumPanel.style.display = 'block';
  }
  function closeSum() { sumMask.style.display = 'none'; sumPanel.style.display = 'none'; }
  sumClose.onclick = closeSum;
  sumMask.onclick = closeSum;
  // 关闭时**不隐藏按钮**——隐藏了就没有入口再打开，容易把人卡死
  function applyEnabledState(enabled) {
    sumBtn.textContent = enabled ? '整理设定' : '整理设定（已关）';
    sumBtn.style.opacity = enabled ? '1' : '.5';
    sumBtn.title = enabled ? '' : '这个功能已关闭，点开面板可以重新启用';
  }
  sumEnabled.onchange = function () {
    var s = loadSettings();
    s.enabled = sumEnabled.checked;
    saveSettings(s);
    applyEnabledState(s.enabled);
  };
  roundsInput.onchange = function () {
    var s = loadSettings();
    var n = parseInt(roundsInput.value, 10) || 20;
    if (n < 2) n = 2;
    if (n > 100) n = 100;
    roundsInput.value = n;
    s.rounds = n;
    saveSettings(s);
  };

  var SUMMARIZE_PROMPT = [
    '你是设定整理助手。下面是角色的当前设定，以及最近若干轮对话。',
    '',
    '任务：判断对话里是否出现了「值得长期记住」的新信息；如果有，写成可以直接追加到设定里的文字。',
    '',
    '只提取这些：',
    '- 用户明确陈述的、长期有效的事实（身份、处境、偏好、关系、底线、忌讳）',
    '- 用户明确纠正过的、对你的称呼或态度',
    '',
    '不要提取这些：',
    '- 一次性的情绪、临时任务、当天的安排',
    '- 你自己推测或总结出来的东西',
    '- 用户没说、但你觉得「应该」有的信息',
    '',
    '输出严格 JSON，不要任何多余文字：',
    '{"change": true, "additions": ["..."], "reason": "一句话说明依据"}',
    '或',
    '{"change": false, "additions": [], "reason": "..."}'
  ].join('\n');

  function doSummarize() {
    var cfg = loadSettings();
    if (!cfg.enabled) {
      sumOut.textContent = '这个功能当前是关闭状态。勾上下面「启用这个功能」再点开始。';
      return;
    }
    var role = getActiveRole();
    if (!role) { sumOut.textContent = '先选中并保存一个角色再说。'; return; }
    var key = findApiKey();
    if (!key) {
      sumOut.textContent = '没找到 API Key。请先在左下「设置 → 数据管理」里填好 DeepSeek 的 API Key。';
      return;
    }
    var rounds = parseInt(roundsInput.value, 10) || 20;
    var recent = getRecent();
    var msgs = recent.slice(-rounds * 2);
    if (msgs.length < 2) {
      sumOut.textContent = '当前还没有可整理的对话。先聊几轮再回来。';
      return;
    }
    var dialog = msgs.map(function (m) {
      return (m.role === 'user' ? '用户：' : '助手：') + m.content;
    }).join('\n\n');

    sumGo.disabled = true;
    sumGo.textContent = '整理中…';
    sumOut.textContent = '正在分析最近 ' + Math.ceil(msgs.length / 2) + ' 轮对话…';

    var payload = {
      model: 'deepseek-chat',
      temperature: 0.2,
      messages: [
        { role: 'system', content: SUMMARIZE_PROMPT },
        { role: 'user', content: '【当前设定】\n' + role.content + '\n\n【最近对话】\n' + dialog }
      ]
    };
    // 用原生的 fetch，避免被自己的拦截器再插一层 system
    var rawFetch = window.__dshOrigFetch || window.fetch;

    rawFetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key },
      body: JSON.stringify(payload)
    }).then(function (r) {
      return r.json().then(function (j) {
        if (!r.ok) throw new Error((j && j.error && j.error.message) || ('HTTP ' + r.status));
        return j;
      });
    }).then(function (j) {
      var text = j && j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content;
      if (!text) throw new Error('模型没有返回内容');
      var clean = text.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
      var obj;
      try { obj = JSON.parse(clean); } catch (e) { throw new Error('模型返回的不是合法 JSON'); }
      renderSuggestion(obj, role);
    }).catch(function (e) {
      sumOut.textContent = '整理失败：' + e.message + '（没有改动任何东西）';
    }).then(function () {
      sumGo.disabled = false;
      sumGo.textContent = '开始整理';
    });
  }

  function renderSuggestion(obj, role) {
    sumOut.textContent = '';
    var additions = (obj && Array.isArray(obj.additions)) ? obj.additions.filter(function (x) {
      return typeof x === 'string' && x.trim();
    }) : [];
    if (!obj || !obj.change || !additions.length) {
      sumOut.appendChild(el('div', 'color:#666', '这次聊下来，没有发现值得长期记进设定的新信息。'));
      if (obj && obj.reason) {
        sumOut.appendChild(el('div', 'font-size:12px;color:#999;margin-top:6px', '依据：' + obj.reason));
      }
      return;
    }
    sumOut.appendChild(el('div', 'font-weight:600;margin-bottom:8px', '建议补充到「' + role.name + '」的设定里：'));
    var box = el('textarea', [
      'width:100%', 'box-sizing:border-box', 'background:#f7f8fa', 'border:1px solid #e8eaf0',
      'border-radius:8px', 'padding:10px 12px', 'margin-bottom:8px', 'font-size:13px',
      'line-height:1.7', 'font-family:inherit', 'resize:vertical', 'min-height:70px', 'outline:none'
    ].join(';'));
    box.value = additions.join('\n');
    sumOut.appendChild(box);
    sumOut.appendChild(el('div', 'font-size:12px;color:#999;margin-bottom:8px',
      '可以直接在上面改（一行一条），改完点「采纳」就按改后的写进去。'));
    if (obj.reason) {
      sumOut.appendChild(el('div', 'font-size:12px;color:#888;margin-bottom:10px', '依据：' + obj.reason));
    }
    var actRow = el('div', 'display:flex;gap:8px');
    var okBtn = mkBtn('采纳', true);
    var noBtn = mkBtn('忽略', false);
    actRow.appendChild(okBtn);
    actRow.appendChild(noBtn);
    sumOut.appendChild(actRow);

    noBtn.onclick = function () {
      sumOut.textContent = '已忽略，设定没有改动。';
    };
    okBtn.onclick = function () {
      var lines = (box.value || '').split('\n').map(function (s) { return s.trim(); })
        .filter(function (s) { return s; });
      if (!lines.length) { sumOut.textContent = '内容是空的，没有东西可写。'; return; }
      var list = loadRoles();
      var cur = null;
      for (var i = 0; i < list.length; i++) if (list[i].id === role.id) cur = list[i];
      if (!cur) { sumOut.textContent = '角色已被删除，无法写入。'; return; }
      pushHistory(cur.id, cur.content, obj.reason || '');
      var stamp = new Date().toISOString().slice(0, 10);
      var block = '\n\n<!-- 以下为后续补充（' + stamp + '） -->\n' +
        lines.map(function (a) { return '- ' + a; }).join('\n');
      cur.content = cur.content + block;
      saveRoles(list);
      if (editingId === cur.id) contentArea.value = cur.content;
      sumOut.textContent = '已追加到设定末尾，并存了一份历史版本（可在「历史」里回滚）。';
    };
  }

  sumGo.onclick = doSummarize;

  // 按钮：整理设定
  sumBtn.onclick = openSum;

  // 按钮：历史版本
  histBtn.onclick = function () {
    var role = getActiveRole() || (editingId ? { id: editingId } : null);
    if (!role || !role.id) { status.textContent = '先选中一个角色'; return; }
    var all = loadHistory().filter(function (x) { return x.roleId === role.id; });
    if (!all.length) { status.textContent = '这个角色还没有历史版本（第一次被自动整理时会存）'; return; }
    var pick = prompt(
      '历史版本（最近的在前，最多 10 份）：\n\n' +
      all.map(function (x, i) {
        return (i + 1) + '. ' + new Date(x.savedAt).toLocaleString() +
          '  ' + (x.content || '').length + ' 字' + (x.reason ? '  — ' + x.reason : '');
      }).join('\n') +
      '\n\n输入编号可回滚到那个版本，直接取消则不动。',
      '1'
    );
    if (!pick) return;
    var idx = parseInt(pick, 10) - 1;
    if (!(idx >= 0 && idx < all.length)) { status.textContent = '编号不对，没有改动'; return; }
    var target = all[idx];
    var list = loadRoles();
    var cur = null;
    for (var i = 0; i < list.length; i++) if (list[i].id === role.id) cur = list[i];
    if (!cur) { status.textContent = '角色不存在'; return; }
    pushHistory(cur.id, cur.content, '回滚前自动备份');
    cur.content = target.content;
    saveRoles(list);
    contentArea.value = cur.content;
    status.textContent = '已回滚到 ' + new Date(target.savedAt).toLocaleString() + ' 的版本';
  };

  // 初始化：按设置还原开关状态（按钮始终留在面板里，避免关掉后再也找不到）
  (function () {
    var s = loadSettings();
    applyEnabledState(s.enabled);
    // 记住原生 fetch 给整理功能用（避免被自己的注入逻辑再包一层）
    window.__dshOrigFetch = window.__dshOrigFetch || window.fetch;
  })();

  // ---------- 备份提醒 ----------
  // 数据只在 localStorage，清缓存/换设备就没了。改不了这个事实，
  // 但可以在"快要丢"的时候提一句：超过 7 天没导出，就在右下角轻轻提示一次。
  (function backupReminder() {
    var LS_LAST = 'dsh_last_export_v1';
    var LS_SNOOZE = 'dsh_backup_snooze_v1';
    var DAY = 86400000;

    function rd(k) { try { return localStorage.getItem(k) || ''; } catch (e) { return ''; } }
    function wr(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
    function daysSince(iso) {
      if (!iso) return Infinity;
      var t = Date.parse(iso);
      if (isNaN(t)) return Infinity;
      return (Date.now() - t) / DAY;
    }

    function showToast(text) {
      var box = el('div', [
        'position:fixed', 'right:18px', 'bottom:18px', 'width:min(340px,86vw)',
        'background:#fff', 'border-radius:12px', 'padding:14px 16px',
        'box-shadow:0 10px 34px rgba(0,0,0,.18)', 'border:1px solid #e8eaf0',
        'z-index:2147483005', 'font-family:system-ui,-apple-system,"Segoe UI",sans-serif',
        'color:#1b1b1b', 'font-size:13px', 'line-height:1.7'
      ].join(';'));
      box.appendChild(el('div', 'font-weight:600;margin-bottom:4px', '数据该备份了'));
      box.appendChild(el('div', 'color:#555;margin-bottom:12px', text));
      var row = el('div', 'display:flex;gap:8px;justify-content:flex-end');
      var later = mkBtn('过几天再说', false);
      var go = mkBtn('去导出', true);
      row.appendChild(later);
      row.appendChild(go);
      box.appendChild(row);
      document.body.appendChild(box);
      later.onclick = function () { wr(LS_SNOOZE, new Date().toISOString()); box.remove(); };
      go.onclick = function () {
        box.remove();
        // 直接走角色面板的导出逻辑
        try { if (typeof expBtn !== 'undefined' && expBtn) expBtn.click(); } catch (e) {}
        wr(LS_SNOOZE, new Date().toISOString());
      };
    }

    setTimeout(function () {
      try {
        if (!loadRoles().length) return;                       // 没有角色，不打扰
        if (daysSince(rd(LS_SNOOZE)) < 3) return;              // 刚提示过
        var d = daysSince(rd(LS_LAST));
        if (d < 7) return;                                     // 最近导出过
        showToast(d === Infinity
          ? '你的角色设定只存在这个浏览器里，清缓存或换设备就没了。现在导出一份吧。'
          : '上次导出已经是 ' + Math.floor(d) + ' 天前了。清缓存或换设备会丢数据，导一份备份吧。');
      } catch (e) {}
    }, 4000);
  })();

  // 暴露给控制台调试
  window.__dshRoles = { load: loadRoles, active: getActiveRole };
})();

/* ===== GitHub 星标入口（2026-11-18 加） =====
   目的：站点本身是应用页面，访客看不到仓库，这里给一个不打断操作的入口。
   放右上角，避开右下角的「角」按钮和备份提醒卡片。 */
(function () {
  try {
    if (document.getElementById('dsh-gh-badge')) return;
    var a = document.createElement('a');
    a.id = 'dsh-gh-badge';
    a.href = 'https://github.com/junyuan-li-liu/rolebox';
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.title = '角色匣是开源项目，觉得有用可以点个 Star';
    a.setAttribute('aria-label', '在 GitHub 上查看并 Star 这个项目');
    a.innerHTML =
      '<svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">' +
      '<path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z"/>' +
      '</svg><span>Star</span>';
    a.style.cssText = [
      'position:fixed', 'top:10px', 'right:12px', 'z-index:9998',
      'display:inline-flex', 'align-items:center', 'gap:4px',
      'padding:4px 9px', 'border-radius:999px',
      'background:rgba(255,255,255,.9)', 'backdrop-filter:blur(6px)',
      'border:1px solid rgba(0,0,0,.08)', 'color:#57606a',
      'font-size:12px', 'line-height:1', 'text-decoration:none',
      'box-shadow:0 1px 4px rgba(0,0,0,.06)', 'font-family:inherit'
    ].join(';');
    a.onmouseenter = function () { a.style.color = '#1f2328'; a.style.borderColor = 'rgba(0,0,0,.18)'; };
    a.onmouseleave = function () { a.style.color = '#57606a'; a.style.borderColor = 'rgba(0,0,0,.08)'; };
    // 手机上稍微小一点，不挡标题
    if (window.innerWidth < 520) { a.style.fontSize = '11px'; a.style.padding = '3px 7px'; a.style.top = '8px'; a.style.right = '8px'; }
    (document.body || document.documentElement).appendChild(a);
  } catch (e) { /* 加不上也不影响主功能 */ }
})();
/* ===== 手机键盘适配（2026-11-21，v21） =====
   问题：装成 App（standalone）后，安卓虚拟键盘弹出会盖住输入框，对话框看不见。
   原因：原版用 window.visualViewport 同步 CSS 变量 --app-viewport-height / --app-viewport-top，
        但前置条件是 visualViewport.scale === 1；部分机型/浏览器该值不是精确 1，整段逻辑被跳过。
   做法：自己再同步一份同一对变量（写到 documentElement，靠 CSS 变量继承生效），
        去掉 scale 判断；聚焦输入框时再补一次 scrollIntoView 兜底。 */
(function () {
  var vv = window.visualViewport;
  if (!vv) return;
  var raf = 0;
  var FIELD = 'textarea, input:not([type="file"])';
  function isField(el) { return !!(el && el.matches && el.matches(FIELD)); }
  function apply() {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(function () {
      var root = document.documentElement;
      if (!isField(document.activeElement)) {
        root.style.removeProperty('--app-viewport-height');
        root.style.removeProperty('--app-viewport-top');
        return;
      }
      root.style.setProperty('--app-viewport-height', vv.height + 'px');
      root.style.setProperty('--app-viewport-top', (vv.offsetTop || 0) + 'px');
    });
  }
  vv.addEventListener('resize', apply);
  vv.addEventListener('scroll', apply);
  window.addEventListener('orientationchange', apply);
  document.addEventListener('focusin', function (e) {
    if (!isField(e.target)) return;
    apply();
    setTimeout(function () {
      try { e.target.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch (err) {}
    }, 260);
  });
  document.addEventListener('focusout', apply);
  apply();
})();
/* ===== 新版本提示（2026-11-21，v22） =====
   背景：GitHub Pages 给 HTML 的缓存是 10 分钟，改完代码后用户重开 App 仍可能拿到旧页，
   于是误以为"必须清缓存"。这里主动查一次线上 index.html，比对 role-inject.js?v=N，
   发现更高就在底部弹一条「有新版本」提示，点一下即刷新（service worker 是网络优先，刷新就能拿新资源）。 */
(function () {
  var self = document.currentScript && document.currentScript.src;
  var MY = 0;
  if (self) { var mm = self.match(/[?&]v=(\d+)/); if (mm) MY = parseInt(mm[1], 10); }
  if (!MY) return;
  var shown = false;
  function check() {
    if (shown) return;
    var base = location.pathname.replace(/[^/]*$/, '');
    fetch(base + 'index.html?_=' + Date.now(), { cache: 'no-store', credentials: 'same-origin' })
      .then(function (r) { return r.ok ? r.text() : ''; })
      .then(function (html) {
        var m = html && html.match(/role-inject\.js\?v=(\d+)/);
        if (!m) return;
        var remote = parseInt(m[1], 10);
        if (remote > MY) { shown = true; show(remote); }
      })
      .catch(function () {});
  }
  function show(v) {
    if (document.getElementById('dsh-upd')) return;
    var d = document.createElement('div');
    d.id = 'dsh-upd';
    d.style.cssText = 'position:fixed;left:50%;transform:translateX(-50%);bottom:18px;z-index:10000;' +
      'display:flex;align-items:center;gap:10px;padding:9px 14px;border-radius:999px;' +
      'background:#1f2328;color:#fff;font-size:13px;line-height:1;font-family:inherit;' +
      'box-shadow:0 4px 16px rgba(0,0,0,.25)';
    var txt = document.createElement('span');
    txt.textContent = '有新版本（v' + v + '）';
    var btn = document.createElement('a');
    btn.textContent = '刷新';
    btn.href = 'javascript:void(0)';
    btn.style.cssText = 'color:#8ab4ff;text-decoration:none;font-weight:600';
    btn.onclick = function () { location.reload(); };
    var x = document.createElement('span');
    x.textContent = '×';
    x.style.cssText = 'opacity:.5;cursor:pointer;padding-left:2px';
    x.onclick = function () { d.remove(); };
    d.appendChild(txt); d.appendChild(btn); d.appendChild(x);
    (document.body || document.documentElement).appendChild(d);
  }
  setTimeout(check, 2500);
  setInterval(check, 5 * 60 * 1000);
})();