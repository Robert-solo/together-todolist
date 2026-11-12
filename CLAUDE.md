# Together Todolist · 开发规范

## 设计体系（强制）

所有 UI 的颜色、排版、控件、交互遵循 Apple Human Interface Guidelines：
https://developer.apple.com/cn/design/human-interface-guidelines/color

- **只用语义色 token**（`src/styles/globals.css`），不在组件里写死 `oklch()` / `#hex` / `white`：
  背景用 `--c-bg / --c-surface / --c-raised`，文字用 `--c-heading / --c-body / --c-muted`，
  分隔线 `--c-border / --c-border-soft`，强调色 `--c-accent-*`，危险色 `--c-danger*`。
- 颜色基于 Apple system colors（systemTeal、systemRed 等），亮色与深色模式各一套，对比度须达标（正文 ≥ 4.5:1）。
- 不只靠颜色传达信息；强调色不作为大面积底色上的小号文字色。
- 分类色取自 system colors（`--cat-*`），新增颜色先加 token。
- 触控目标 ≥ 44pt；按压态用透明度/缩放反馈，且遮罩必须跟随元素圆角（`border-radius` + `overflow:hidden` 或 `inherit`）。
- 控件和文字默认 `user-select: none`，只有输入框、需要复制的内容才允许选中。
- 数字用 `font-variant-numeric: tabular-nums`，不手动补空格对齐。
- 间距、圆角使用 token（`--radius-*`），移动端遵守 safe area。

## 工程约定

- 提交信息结尾带 `Co-Authored-By` 署名行。
- 不提交 `data/`、`*.db`、密钥、`release/`；推送走本机代理（见 README / 记忆）。
- 用户数据永远按 `userId` 隔离，`userId` 只从 session 取。
