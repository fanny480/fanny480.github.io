# Mooncakes Community Pulse

一个可以放进 GitHub 主页或 GitHub Pages 的静态网页，用来观察 Mooncakes 社区的每周新增贡献者、首次贡献包的用户，以及由社区维护的用户画像。

## 使用方式

把这个目录里的文件复制到你的 GitHub Pages 仓库，例如：

- 个人主页仓库：`<your-name>.github.io`
- 任意仓库的 `docs/` 目录
- 任意静态站点部署服务

打开 `index.html` 即可。页面会在浏览器里读取：

```text
https://mooncakes.io/api/v0/modules/statistics?raw=true
```

## 统计口径

- 包记录：从 Mooncakes 公开统计接口解析。
- 贡献者：按包记录里的 owner / username / user 等字段去重。
- 首次贡献包：某个用户最早的一次包上传时间。
- 每周首次贡献：首次贡献包时间落在对应 ISO 周的用户数。
- 每周活跃上传：对应 ISO 周里至少上传过包的用户数。
- 实时动态：页面每 60 秒重新读取一次站内 CSV；GitHub Actions 每 5 分钟尝试从 Mooncakes API 更新一次 CSV。

如果 Mooncakes API 将来提供真实“用户注册时间”，可以在 `app.js` 中把注册时间字段加入 `pickDate` 的字段列表，并在图表里单独展示。

## 关于职业、公开位置与语言信号等画像

`profiles.json` 是人工维护的画像层。建议只合并以下信息：

1. 用户本人提交的 PR。
2. 用户在公开主页、GitHub profile、个人网站中明确写出的信息。
3. 有来源链接、且不涉及隐私推断的信息。

不要根据名字、头像、语言、时区等猜测国籍或职业。可以记录“语言信号”或“公开位置”，但不要把它包装成确定国籍。

示例：

```json
{
  "alice": {
    "occupation": "Compiler engineer",
    "public_location": "Singapore",
    "language_signal": "English / Chinese",
    "inferred_region": "Singapore",
    "confidence": "medium",
    "links": ["https://github.com/alice"],
    "note": "Location is self-described on public GitHub profile; language signal is only a weak clue."
  }
}
```

## 如果浏览器无法读取 API

如果遇到跨域限制或网络错误，可以把 API 数据保存成本地 JSON，然后在 `app.js` 中把：

```js
statistics: "https://mooncakes.io/api/v0/modules/statistics?raw=true"
```

改成：

```js
statistics: "./statistics.json"
```

再把下载好的数据放在同目录的 `statistics.json`。

## 文件结构

```text
.
├── index.html
├── styles.css
├── app.js
├── profiles.json
└── README.md
```
