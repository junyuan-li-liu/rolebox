# 待办（暂不做，用户说后面有需要再弄）

> 记录于 2026-11-18。项目功能已定稿，以下都是"加分项"，不是"缺功能"。

## 1. PWA 化（约 1 小时）

- 加 `manifest.webmanifest`：name「角色匣」、short_name、theme_color、display: standalone、icons（192/512）
- 加 `sw.js` 做最小 service worker：缓存 `index.html`、`main.*.js`、`role-inject.js`、`guide.js`、css，实现"离线也能打开壳"
- `index.html` 加 `<link rel="manifest">` + `theme-color` meta
- 效果：手机浏览器「添加到主屏幕」后全屏打开、无地址栏、断网也能进界面
- 注意：service worker 会带来缓存更新的坑（改了代码用户端不更新），要配版本号或 `skipWaiting`

## 2. README 顶部加一张动图（约 30 分钟）

- 现在只有三张静态截图，动图能一秒说清"怎么用"
- 录屏内容建议：打开 → 点「角」→ 新建角色 → 粘贴设定 → 保存 → 发消息 → 看到角色生效
- 用 ScreenToGif / ffmpeg 压成 gif，控制在 3 MB 内（GitHub 显示 GIF 不自动播放的话可以转 mp4 但 README 只吃 gif/png）
- 存 `docs/demo.gif`，README 里放首屏下面

## 明确不做

- **每个对话独立绑定角色**：复杂度最高、收益最不确定，用户已决定放弃
- **后端存储**：数据在浏览器 localStorage，清缓存/换设备会丢；要根治必须上后端，用户判断"真没办法，要改得加后端"，同意，不折腾

## 已完成

- ~~**备份提醒**~~（2026-11-18 已实现，见 role-inject.js 的 backupReminder）~~：如果距上次「导出」超过 N 天（比如 7 天），进页面时轻提示一句"上次导出是 X 天前，建议导出备份"。实现只需一个 `localStorage` 时间戳 + 一行提示，不碰后端也能减轻"清缓存就没了"的风险。
