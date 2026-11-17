# 方案：从短文档导入角色正文

> 状态：**未实现，等有整块时间再动手**
> 记录时间：2026-11-18
> 目标读者：未来的自己 / 接手的人

## 一、要解决什么

现在建角色，设定正文只能**手动粘贴**。如果手里已经有一份写好的档案（docx / txt / md），得先打开它、全选、复制，再切回来粘——多一步，而且手机上报麻烦。

要做的就是：角色面板里加一个「导入文档」，选文件 → 自动读出文字 → 填进正文框。

## 二、范围（重要）

**做**：
- 只支持 `.txt`、`.md`、`.docx` 三种
- 导入后把文本填进正文框，**用户仍可编辑**，不是黑盒
- 字数超阈值时给提示

**不做**（明确放弃）：
- **PDF**：中文 PDF 经常是扫描件/图片，抽不出文字；要真支持得引 pdf.js（几 MB）且效果不可靠。让用户自己转成文本。
- **长文档**：不要做 RAG / 分块检索。原因见下。

## 三、为什么不做长文档（决策依据）

角色正文是作为 `system` 消息**每轮请求都完整重发**的。

- 1 万字中文约等于 7000 token
- 用户每问一句，这 7000 token 都要重新计费一次
- 同时占掉上下文窗口的一大块，留给对话的空间被压缩

所以正文一旦过万，代价就超过收益。真要做长文档，得改成「切块 + 本地索引 + 每次只捞相关片段」的 RAG 方案，那是另一个量级的工程（新依赖、向量化、调试成本），**当前阶段不值得**。

## 四、技术实现

### 1. 入口

角色面板底部，现有「导出 / 导入」旁边加一个：

```html
<input type="file" id="dsh-file" accept=".txt,.md,.docx" hidden>
<button id="dsh-import-doc">导入文档</button>
```

点按钮触发 hidden input 的 `click()`。

### 2. 按扩展名分派

```js
const name = file.name.toLowerCase();
if (name.endsWith('.txt') || name.endsWith('.md')) {
  text = await file.text();               // 最简单
} else if (name.endsWith('.docx')) {
  text = await readDocx(file);            // 见下
} else {
  alert('只支持 txt / md / docx。PDF 请先转成文本。');
}
```

### 3. 读 docx（不引外部依赖）

`.docx` 本质是一个 zip，正文在 `word/document.xml`。浏览器现在能原生解压：

```js
async function readDocx(file) {
  const buf = new Uint8Array(await file.arrayBuffer());
  const xml = await unzipEntry(buf, 'word/document.xml');
  // <w:p> 是段落，<w:t> 是文字片段
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  return [...doc.getElementsByTagName('w:p')]
    .map(p => [...p.getElementsByTagName('w:t')].map(t => t.textContent).join(''))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
```

`unzipEntry` 用 `DecompressionStream('deflate-raw')` 解（Chrome 103+、Edge 103+、Safari 16.4+ 都支持）。需要自己解析 zip 的中央目录找条目——约 60 行代码，值得，避免引入 JSZip/mammoth 几百 KB。

**备选**：如果手写解析踩坑，退回 `mammoth.browser.min.js`（约 200 KB，从 CDN 引）。但会破坏"零依赖"这个卖点。

### 4. 字数与阈值

```js
const count = text.replace(/\s/g, '').length;
if (count > 15000) { 拒绝，提示"太长" }
else if (count > 8000) { 提示"偏长，每轮都会全量重发，建议精简" }
```

- 8000 字：约 5000~7000 token，还能接受
- 15000 字：约 1 万 token，明显吃亏

提示语要讲清代价，不要只说"太长"。

### 5. 填入与保存

导入的文字直接写进正文 textarea 的 value，然后**不自动保存**——让用户看一眼、改一改，再点「保存」。避免"手滑导入直接就存了"。

## 五、工作量估计

| 部分 | 估计 |
| --- | --- |
| UI（按钮 + input） | 20 分钟 |
| txt / md 读取 | 5 分钟 |
| docx 解压 + XML 解析 | 1.5 小时（手写 zip 解析是主要成本） |
| 字数阈值与提示 | 20 分钟 |
| 测试（造几份 docx 试） | 40 分钟 |
| 合计 | **约 3 小时** |

## 六、做完要补的

- README「功能」表格加一行「导入文档」
- README「已知限制」加一行：PDF 不支持
- 事件记录追加实现说明与踩坑
