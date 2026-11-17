# 角色匣 · RoleBox

> 给 DeepSeek 官方 [chat-demo](https://github.com/deepseek-ai/chat-demo) 加上「多角色设定」的开源增强版。

**在线试用**：<https://junyuan-li-liu.github.io/rolebox/>

> ⚠️ **非官方项目**：本项目是个人学习作品，基于 DeepSeek 开源的 [chat-demo](https://github.com/deepseek-ai/chat-demo) 二次开发，**与 DeepSeek 官方无关，未获官方授权或背书**。使用本项目产生的 API 费用由使用者自行承担，生成内容的责任亦由使用者承担。

![主界面](docs/screenshot-main.png)

---

## 这是什么

官方 chat-demo 是一个纯前端的 DeepSeek 聊天界面，浏览器直连 API，不经过任何后端。

它有个小遗憾：**没有「角色 / 人设」的概念**。如果你希望 AI 以某个固定身份和你对话（比如一个了解你背景的顾问、一个只说英语的陪练、一个改代码的老师），那就只能在每段对话开头手动粘贴一大段设定——聊新话题时还得再贴一遍。

这个项目在原版基础上加了一层轻量的**角色系统**：

- 设定存一次，之后每次对话自动带上
- 想换身份，切一下就完事
- 数据只在你自己的浏览器里，不上传

## 功能

| 功能 | 说明 |
| --- | --- |
| 多角色管理 | 每个角色 = 名字 + 设定正文，可新建、编辑、删除 |
| 一键切换 | 屏幕右侧「角」按钮打开面板，点一下换成当前角色 |
| 自动注入 | 每次请求自动把当前角色作为 `system` 消息插入，无需手动粘贴 |
| 导入导出 | 角色可导出为 JSON 备份，换设备时导入恢复 |
| 本地存储 | 角色存在浏览器 `localStorage`，不经过服务器 |
| 非侵入 | 只新增一个 `role-inject.js`，原版代码一行没改，随时可摘 |

![角色面板](docs/screenshot-roles.png)

## 快速开始

1. 打开 <https://junyuan-li-liu.github.io/rolebox/>
2. 点左下 **设置 → 数据管理**，填入你的 [DeepSeek API Key](https://platform.deepseek.com/api_keys)
3. 点屏幕右侧的 **「角」** 按钮 → **新建** → 填角色名字和设定正文 → **保存**
4. 关掉面板，直接开始聊天，设定已经自动带上了

> **手机上用**：浏览器打开同一个网址，菜单里选「添加到主屏幕」，用起来和 App 差不多。

## 关于 API Key 与费用

- 这是**前端直连**：你的 Key 只保存在你自己浏览器的 `localStorage` 里，不会发给任何第三方
- 聊天按 **token 计费**，直接从你的 DeepSeek 账户扣，和官方 App 一样
- 换设备、换浏览器、清缓存，都需要重新填一次 Key（角色设定同理）

## 自己部署一份

1. Fork 这个仓库
2. 仓库 **Settings → Pages** → Source 选 `Deploy from a branch`，分支 `main`，目录 `/ (root)`
3. 等一两分钟，访问 `https://<你的用户名>.github.io/rolebox/`

也可以用 Vercel、Cloudflare Pages 等任意静态托管，把仓库文件直接传上去即可（无需构建）。

## 已知限制

说清楚，免得你用了才发现：

- **角色是「全局切换」，不是「每个对话单独绑定」**。你在「角」面板里换成谁，之后所有对话都用这个角色。想同时开三路（一个顾问、一个陪练、一个老师）目前做不到，得来回切。
- **角色数据存在浏览器里**，清缓存/换设备就没了。请用面板里的「导出」存一份 JSON。
- 只测过 Edge / Chrome 内核浏览器，Safari 未验证。

## 技术实现

整个增强只有两个文件：

- **`role-inject.js`**（约 11 KB，零依赖）
  - 包装 `window.fetch` 与 `XMLHttpRequest.prototype.send`
  - 检测请求体里是否有 `messages` 数组；有的话，把当前角色以 `{role: 'system', content: ...}` 插到最前面
  - 带 `_dshRole` 标记，避免重复注入
  - 不依赖具体接口地址，因此原版换端点也不会失效
- **`index.html`** 里只多了一行 `<script defer src="role-inject.js"></script>`

角色数据：

```js
localStorage['dsh_roles_v1']       // [{ id, name, content }]
localStorage['dsh_active_role_v1'] // 当前角色 id
```

## 已踩过的坑

- **改了脚本但界面没变化** → 浏览器缓存，`Ctrl + Shift + R` 强制刷新
- **角色不生效** → 确认「角」面板里那个角色后面有 ✓（表示是当前角色）
- **数据丢了** → 浏览器清过缓存；角色是本地数据，不会自动备份

## 致谢与许可

- 前端来自 [deepseek-ai/chat-demo](https://github.com/deepseek-ai/chat-demo)，本仓库在其 v0.1.1 基础上二次开发
- 原项目为 MIT 协议，`LICENSE` 文件保留原样（Copyright © 2026 DeepSeek）
- 本项目新增部分（`role-inject.js`、`guide.js`、文档）同样以 MIT 协议提供，可自由使用与修改

## 免责声明

本项目是个人学习与自用性质的开源项目，与深度求索（DeepSeek）官方无关。使用产生的 API 费用由使用者自行承担。
