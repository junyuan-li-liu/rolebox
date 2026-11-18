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
      var next2 = applyRoleToMessages(rawBody.messages);
      if (next2) {
        rawBody.messages = next2;
        if (window.__dshRoleFlash) window.__dshRoleFlash();
      }
    }
    return rawBody;
  }

  var origFetch = window.fetch;
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
  var docBtn = mkBtn('导入文档', false);
  btnRow.appendChild(saveBtn); btnRow.appendChild(applyBtn);
  btnRow.appendChild(newBtn); btnRow.appendChild(delBtn);
  btnRow.appendChild(expBtn); btnRow.appendChild(impBtn);
  btnRow.appendChild(docBtn);

  var status = el('div', 'font-size:12px;color:#4d6bfe;margin-top:10px;min-height:16px');

  editor.appendChild(nameInput);
  editor.appendChild(contentArea);
  editor.appendChild(btnRow);
  editor.appendChild(status);

  panel.appendChild(titleBar);
  panel.appendChild(tip);
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

  saveBtn.onclick = function () {
    var name = (nameInput.value || '').trim();
    var content = contentArea.value || '';
    if (!name) { status.textContent = '先给角色起个名字'; return; }
    if (!content.trim()) { status.textContent = '设定正文不能为空'; return; }
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
    status.textContent = '已保存（' + name + '，' + content.length + ' 字）';
  };

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

  // 导出全部角色为 JSON 文件
  expBtn.onclick = function () {
    var list = loadRoles();
    if (!list.length) { status.textContent = '没有角色可导出'; return; }
    var payload = {
      app: 'chat-demo-role',
      version: 1,
      exportedAt: new Date().toISOString(),
      activeId: getActiveId(),
      roles: list
    };
    var blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'chat-demo-roles-' + new Date().toISOString().slice(0, 10) + '.json';
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 1000);
    status.textContent = '已导出 ' + list.length + ' 个角色';
  };

  // 导入 JSON（合并，同名同内容跳过）
  impBtn.onclick = function () {
    var input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.onchange = function () {
      var file = input.files && input.files[0];
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function () {
        var data;
        try { data = JSON.parse(String(reader.result)); } catch (e) {
          status.textContent = '解析失败：不是合法的 JSON'; return;
        }
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
        status.textContent = '导入完成：新增 ' + added + ' 个，跳过 ' + skipped + ' 个';
      };
      reader.readAsText(file, 'utf-8');
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

  docBtn.onclick = function () {
    var input = document.createElement('input');
    input.type = 'file';
    input.accept = '.txt,.md,.docx';
    input.onchange = function () {
      var file = input.files && input.files[0];
      if (!file) return;
      var name = (file.name || '').toLowerCase();
      status.textContent = '正在读取 ' + file.name + ' …';
      if (name.slice(-4) === '.txt' || name.slice(-3) === '.md') {
        file.text().then(function (t) { applyImportedText(t, file.name); })
          .catch(function (e) { status.textContent = '读取失败：' + e.message; });
      } else if (name.slice(-5) === '.docx') {
        readDocx(file).then(function (t) { applyImportedText(t, file.name); })
          .catch(function (e) { status.textContent = '读取失败：' + e.message; });
      } else {
        status.textContent = '只支持 .txt / .md / .docx。PDF 请先另存为文本再导入。';
      }
    };
    input.click();
  };

  // 暴露给控制台调试
  window.__dshRoles = { load: loadRoles, active: getActiveRole };
})();
