# dsh-ark-usage

火山方舟 **Coding Plan** 的用量挂件：右下角一只小鲸鱼，点一下展开气泡卡，看三档配额，顺带把钱也算清楚。

DeepSeek Harness（DSH）插件，界面形态参考了小鲸鱼记账挂件。

## 卡片上有什么

**上半截：套餐配额**（订阅制没有「余额」接口，只有窗口，所以给的是已用百分比，按请求次数计）

| 元素 | 含义 |
| --- | --- |
| 近 5 小时 | 短周期窗口，滚动重置（arkcli 的 session） |
| 近一周 | 周窗口，周一 00:00 重置 |
| 近一月 | 月窗口，跟随订阅周期重置 |
| 颜色 | 绿 < 80%，橙 80–95%，红 ≥ 95% |

**下半截：这笔账值多少钱**（读本机账本，按每轮真实 token 折算）

| 元素 | 含义 |
| --- | --- |
| 今日 / 近 7 天 / 本月 / 累计 | 对应区间内 token 折算成人民币 |
| 累计 … 轮 | 一共记了多少轮请求 |
| 钱包余额 | 账本里记录的 DeepSeek 钱包余额（没有就不显示） |

> 口径要说明白：火山是**包月**，挂件不会扣你钱。这几行是「这些 token 如果按 DeepSeek 官方价走值多少」的估算——用来心里有数，不是账单。账本来自 DSH 的本机文件 `~/.dsh/.dshw-usage.json`，没有就自动跳过。

## 前置条件

1. 已开通火山方舟 Coding Plan（个人版 Lite/Pro 或团队版）
2. 本机装好并登录 arkcli：

```bash
npm i -g @volcengine/ark-cli
arkcli auth login
```

插件**不保存任何密钥**：它调的是本机 `~/.arkcli` 里你登录后留下的会话。
`ARKCLI_PATH` 环境变量可以指定 arkcli 的位置（默认 `%APPDATA%\npm\arkcli.cmd`，非 Windows 找 PATH 里的 `arkcli`）。

验证一下：

```bash
arkcli usage plan --format json
```

能输出 `items[0].periods`（session / weekly / monthly）就通了。

## 安装

```bash
dsh plugin --profile <profile> add dsh-ark-usage
```

或者从 设置 → 插件 里装（桌面版 profile 只能由 App 自己写入）。

装好重启 DSH，右下角会出现小鲸鱼：点开可见配额与账目，可拖动，位置会记住；每 60 秒自动刷新，点标题手动刷新。

## 数据来源与边界

- 配额只读本机 `arkcli usage plan`，走控制面 SSO 会话，**不调用推理接口、不消耗套餐额度**
- 宿主侧缓存 60 秒，避免每次心跳都起进程
- 只监听回环地址，拒绝跨站与局域网请求
- 失败时显示原因（没装 arkcli / 未登录 / 超时），不把「查不到」显示成 0%
- arkcli 输出字段变了，卡片会说「arkcli 返回的内容看不懂」，升级插件即可

## License

MIT
