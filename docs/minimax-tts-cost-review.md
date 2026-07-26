# MiniMax TTS 模型与成本决策

更新日期：2026-07-26

## 结论

- 正式音频使用 `speech-2.8-turbo`。
- 同价回退顺序为 `speech-2.6-turbo`、`speech-02-turbo`。
- 男女音色继续使用 `presenter_female` 和 `male-qn-jingying`；模型切换不改变 voice ID。
- 禁止正式任务使用 HD。既有 HD 音频不追溯重做，避免为降本再次付费。

## 官方口径

MiniMax [按量计费](https://platform.minimaxi.com/docs/guides/pricing-paygo)：

| 档位 | 模型 | 单价 |
| --- | --- | --- |
| 最新 Turbo | `speech-2.8-turbo` | 2 元/万字符 |
| 上一代 Turbo | `speech-2.6-turbo` | 2 元/万字符 |
| 最新 HD | `speech-2.8-hd` | 3.5 元/万字符 |

HD 比 Turbo 贵 75%；同样文本从 HD 切到 Turbo 可节省约 42.9%。
官方[接口概览](https://platform.minimaxi.com/docs/api-reference/api-overview)将 2.8 Turbo
描述为最新 Turbo 和更自然逼真的音频，将 2.6 Turbo 定位为音质优异、超低时延。
两者价格、接口、系统音色、发音词典和语言增强能力相同；2.8 还支持当前应用并未使用的语气词标签。

## 轻听场景判断

轻听是移动端少年听刊，生产输出为 32kHz、64kbps、单声道 MP3。这里更重要的是音色稳定、
断句、数字读法和韵律，而不是 HD 档的极限保真。2.8 Turbo 保留相同男女 voice ID，
并覆盖现有发音词典与语言增强能力，因此预期音色身份不变，差异主要是模型对韵律和情绪的渲染。

## 成本基线

- 每轮 MiniMax 硬上限 12000 计费字符：HD 最多约 4.20 元，Turbo 最多约 2.40 元。
- 2026-07-26 实际请求 7913 计费字符：HD 约 2.77 元，Turbo 约 1.58 元。
- 若 60 元全部来自同量 HD TTS，切换 Turbo 后约为 34.29 元，节省约 25.71 元。

精确账单仍以 MiniMax 控制台为准。Actions 从本次变更起同时打印字符数与 Turbo 人民币预估；
已有音轨、失败快照和已成功句子继续复用，禁止为切换模型批量重生成历史音频。

## 验证

音色小样工作流使用相同文本、相同男女 voice ID、相同 32kHz/64kbps 输出，盲测
`speech-2.8-turbo` 与 `speech-2.6-turbo`。若听感没有明确反例，保持最新 2.8 Turbo；
2.6 Turbo 只作服务兼容回退。
