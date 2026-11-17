/*
 * 新手引导（guide）
 * 第一次打开时弹一个三步卡片，教用户怎么开始。
 * 也支持从「角」面板或页面里再次调起：window.__dshOpenGuide()
 */
(function () {
  'use strict';

  var KEY = 'dsh_guide_seen_v1';
  var STYLE = [
    'position:fixed', 'inset:0', 'background:rgba(0,0,0,.45)',
    'z-index:2147483600', 'display:flex', 'align-items:center', 'justify-content:center',
    'font-family:system-ui,-apple-system,"Segoe UI",sans-serif'
  ].join(';');

  function seen() {
    try { return localStorage.getItem(KEY) === '1'; } catch (e) { return false; }
  }
  function markSeen() {
    try { localStorage.setItem(KEY, '1'); } catch (e) {}
  }

  function el(tag, style, text) {
    var n = document.createElement(tag);
    if (style) n.setAttribute('style', style);
    if (text != null) n.textContent = text;
    return n;
  }

  function open() {
    if (document.getElementById('dsh-guide-mask')) return;

    var mask = el('div', STYLE);
    mask.id = 'dsh-guide-mask';

    var card = el('div', [
      'width:min(560px,92vw)', 'background:#fff', 'border-radius:16px',
      'padding:26px 26px 20px', 'box-shadow:0 20px 60px rgba(0,0,0,.3)',
      'color:#1b1b1b', 'max-height:86vh', 'overflow:auto'
    ].join(';'));

    var title = el('div', 'font-size:19px;font-weight:700;margin-bottom:4px', '三步开始用');
    var sub = el('div', 'font-size:13px;color:#888;margin-bottom:20px;line-height:1.6',
      '这是一个前端直连 DeepSeek 的聊天页面，没有账号体系，配置一次就能一直用。');

    function step(num, head, body) {
      var row = el('div', 'display:flex;gap:12px;margin-bottom:18px;align-items:flex-start');
      var badge = el('div', [
        'flex:none', 'width:24px', 'height:24px', 'border-radius:12px',
        'background:#4d6bfe', 'color:#fff', 'font-size:13px',
        'display:flex', 'align-items:center', 'justify-content:center', 'margin-top:1px'
      ].join(';'), String(num));
      var textWrap = el('div', 'flex:1');
      textWrap.appendChild(el('div', 'font-size:14px;font-weight:600;margin-bottom:4px', head));
      textWrap.appendChild(el('div', 'font-size:13px;color:#555;line-height:1.7', body));
      row.appendChild(badge);
      row.appendChild(textWrap);
      return row;
    }

    var s1 = step(1, '填 API Key',
      '左下「设置 → 数据管理」里填你的 DeepSeek API Key。没有的话去 platform.deepseek.com 申请，几秒钟就有。Key 只存在你自己浏览器里。');
    var s2 = step(2, '建一个角色',
      '点屏幕右侧的「角」按钮 → 新建 → 填名字和设定正文（可以是一段人设，也可以是一份背景资料）→ 保存。');
    var s3 = step(3, '开始聊天',
      '关掉面板直接发消息就行，设定会自动加到每次对话前面。想换身份，再点「角」切一下。');

    var note = el('div', [
      'font-size:12px', 'color:#999', 'line-height:1.7', 'border-top:1px solid #eee',
      'padding-top:12px', 'margin-top:4px'
    ].join(';'), '提示：聊天按 token 计费，从你的 DeepSeek 账户扣。手机浏览器打开同一网址，「添加到主屏幕」就能当 App 用。');

    var btnRow = el('div', 'display:flex;justify-content:flex-end;gap:10px;margin-top:18px');
    var later = el('button', [
      'padding:9px 16px', 'border-radius:9px', 'border:1px solid #ddd', 'background:#fff',
      'color:#555', 'font-size:13px', 'cursor:pointer', 'font-family:inherit'
    ].join(';'), '稍后再说');
    var go = el('button', [
      'padding:9px 20px', 'border-radius:9px', 'border:none', 'background:#4d6bfe',
      'color:#fff', 'font-size:13px', 'cursor:pointer', 'font-family:inherit'
    ].join(';'), '知道了');

    function close() {
      var m = document.getElementById('dsh-guide-mask');
      if (m) m.remove();
    }
    go.onclick = function () { markSeen(); close(); };
    later.onclick = function () { close(); };
    mask.onclick = function (e) { if (e.target === mask) close(); };

    btnRow.appendChild(later);
    btnRow.appendChild(go);

    card.appendChild(title);
    card.appendChild(sub);
    card.appendChild(s1);
    card.appendChild(s2);
    card.appendChild(s3);
    card.appendChild(note);
    card.appendChild(btnRow);
    mask.appendChild(card);
    document.body.appendChild(mask);
  }

  window.__dshOpenGuide = open;

  function boot() {
    if (seen()) return;
    if (!document.body) { setTimeout(boot, 300); return; }
    setTimeout(open, 600);
  }
  boot();
})();
