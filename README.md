# dsh-ark-usage

火山方舟 **Coding Plan** 用量的侧边栏卡片：5 小时 / 周 / 月三档配额百分比与重置时间。
DeepSeek Harness（DSH）插件，形态与「账户用量」类插件一致，占侧边栏底部一行。

订阅制套餐没有「余额」接口，只有配额窗口——所以这里显示的是**已用百分比**，按请求次数计。

## 前置条件

1. 已开通火山方舟 Coding Plan（个人版 Lite/Pro 或团队版）
2. 本机装好并登录 arkcli：

```bash
npm i -g @volcengine/ark-cli
arkcli auth login
```

插件不保存任何密钥：它调用的是本机 `~/.arkcli` 里你登录后留下的会话。
`ARKCLI_PATH` 环境变量可以指定 arkcli 的位置（默认找 `%APPDATA%\npm\arkcli.cmd`，非 Windows 找 PATH 里的 `arkcli`）。

验证一下 arkcli 是否可用：

```bash
arkcli usage plan --format json
```

能输出 `items[0].periods`（session / weekly / monthly 三段）就说明通了。

## 安装

```bash
dsh plugin --profile <profile> add dsh-ark-usage
```

或从设置 → 插件里安装（桌面版 profile 只能由 App 自己写入）。

装好后重启 DSH，侧边栏底部出现「火山」卡片；点击卡片立即刷新，否则每 60 秒自动刷新一次。

## 卡片上有什么

| 元素 | 含义 |
| --- | --- |
| 近 5 小时 | 套餐的短周期窗口，滚动重置（`arkcli` 返回的 session） |
| 近一周 | 周窗口，通常在周一 00:00 重置 |
| 近一月 | 月窗口，跟随订阅周期重置 |
| 颜色 | 绿色 < 80%，橙色 80–95%，红色 ≥ 95% |

悬停某一行可以看到该窗口的重置时间。

## 数据来源与边界

- 只读取本机 `arkcli usage plan` 的输出，走控制面 SSO 会话；**不调用推理接口，不消耗套餐额度**
- 宿主侧缓存 60 秒，避免每次心跳都起进程
- 只监听回环地址，拒绝跨站与局域网请求
- 失败时显示原因（没装 arkcli / 未登录 / 超时），不把「查不到」显示成 0%
- 不同版本的 arkcli 输出字段若有变化，卡片会显示「arkcli 返回的内容看不懂」，升级插件即可

## License

MIT
