# 四级学习工作台

纯前端离线学习工作台：背词（认词 / 拼写 / 发音）、刷题（专项 / 模考）、错题本、学习统计、导出导入，数据保存在本机 IndexedDB。

## 桌面使用

双击 `index.html` 即可打开，无需安装、无需联网、无需启动服务器。

## 手机使用（iOS / Android）

手机浏览器不允许从本地文件"安装"应用，因此首次需要通过 https 访问一次（可部署到 GitHub Pages、EdgeOne Pages 等静态托管），之后完全离线。

- **iPhone**：Safari 打开链接 → 底部「分享」→「添加到主屏幕」。
- **Android**：Chrome 打开链接 → 右上角菜单 →「安装应用」或「添加到主屏幕」。

安装后从桌面图标启动，全屏无地址栏，断网也能背词和刷题。

### 离线能力的真实边界

- 背词进度、答题记录存在 IndexedDB，添加到主屏幕后不会被"7 天未打开"清理。
- 但 iOS 可能在大约 24 小时不活动后回收 Service Worker 的离线缓存。**建议每隔一两天打开一次**；如果放置一周以上，外壳缓存可能失效，需要联网打开一次恢复。
- 重要进度请定期在「我的」页导出备份；iPhone 上会调起系统分享面板，可直接保存到「文件」App。

## 内置内容

| 来源 | 许可 | 内容 |
| --- | --- | --- |
| [Box611/wordrush](https://github.com/Box611/wordrush) | MIT | 四级大纲 4540 词（含音标）、466 精选词（用于高频标签） |
| [zyronon/TypeWords](https://github.com/zyronon/TypeWords) | GPL-3.0 | 四级例句补充 2604 条，独有词条 348 个；仅取事实性字段 |
| [cypher-yht/dsh-plugins-exam-practice](https://github.com/cypher-yht/dsh-plugins-exam-practice) | MIT | 16 套试卷（10 套模拟 + 6 套真题风格），共 352 道 cloze / matching / reading 客观题 |

另有内置写作 / 翻译资料：16 篇写作题目与参考范文、16 篇翻译题目与参考译文，在「我的」页展开查看。写作模板与自查清单为原创整理。听力音频、词组搭配、作文自动批改不内置。

内置数据由 `tools/build-content.js` 一次性转换生成，网页运行时不联网、不请求任何接口。

## 目录

```
index.html               入口
manifest.webmanifest     PWA 配置
sw.js                    离线缓存
css/style.css            样式
js/                      数据层、FSRS 调度、背词、刷题、错题本、统计、发音、我的、PWA
data/                    内置词库、题库与写作翻译资料
icons/                   安装图标
tools/build-content.js   内容转换脚本（开发期使用）
```

## 数据备份

「我的」页 → 导出：桌面下载 JSON；iOS 调起分享；无法分享时可复制文本。
导入：选择备份 JSON，确认后覆盖写入本机数据。
