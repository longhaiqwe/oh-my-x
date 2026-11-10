# 第三方来源

「回看」的可见阈值、原文提取和本地 OCR 流程参考并改写自 [yetone/rewind-for-x](https://github.com/yetone/rewind-for-x/tree/4122793d28bd7da0768553d1350bd5dcf38c978c)，Copyright (c) 2026 yetone，MIT。完整许可随扩展打包为 `licenses/rewind-for-x.txt`。

图片文字识别使用 Tesseract.js 7.0.0 与锁文件固定的 tesseract.js-core（Apache-2.0）。引擎、worker 与 WASM 随扩展打包；构建从 npm 包复制其完整许可到 `ocr/LICENSE-tesseract.md`、`ocr/LICENSE-core`，以及 worker 的依赖许可 `ocr/worker.min.js.LICENSE.txt`。语言数据按 `@tesseract.js-data/{language}/4.0.0_best_int` 获取，仅下载数据，不加载远程脚本。

GIF 导出既有依赖的许可仍位于 `public/licenses/gifenc.txt`。
