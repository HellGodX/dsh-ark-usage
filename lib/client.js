// dsh-ark-usage — browser half.
//
// 侧边栏底部卡片：火山方舟 Coding Plan 的 5 小时 / 周 / 月三档配额。
// 数据由宿主路由 GET /api/ark-usage 提供（见 lib/index.js），这里只负责画。
//
// 设计：
//   · 侧边栏展开时是三行进度条；折叠成 36px 图标栏时只留一个「火」字方块。
//   · 60 秒轮询一次；点击卡片立即刷新。
//   · 失败时说明原因（没装 arkcli / 没登录 / 超时），不显示 0% —— 0 和「查不到」是两回事。
//   · 只用 `--dsw-*` 主题变量并带兜底值，跟随明暗主题。
window.__ModuleLoader__.load({
	id: "dsh-ark-usage",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		const react = require("react");
		const { useState, useEffect, useRef, useCallback } = react;
		const h = react.createElement;

		const USAGE_PATH = "/api/ark-usage";
		const POLL_MS = 60 * 1000;

		const COLORS = {
			ok: "var(--dsw-color-success, #2ea043)",
			warn: "var(--dsw-color-warning, #d29922)",
			hot: "var(--dsw-color-danger, #f85149)",
			track: "var(--dsw-border-muted, rgba(127,127,127,.25))",
			text: "var(--dsw-text-secondary, rgba(127,127,127,.9))",
			strong: "var(--dsw-text-primary, inherit)",
			surface: "var(--dsw-surface-2, rgba(127,127,127,.07))",
			border: "var(--dsw-border-default, rgba(127,127,127,.22))",
		};

		function clampPercent(value) {
			if (typeof value !== "number" || !isFinite(value)) return 0;
			return Math.max(0, Math.min(100, Math.round(value * 1000) / 10));
		}

		function fillColor(percent) {
			if (percent >= 95) return COLORS.hot;
			if (percent >= 80) return COLORS.warn;
			return COLORS.ok;
		}

		/** "2026-10-30T02:46:29+08:00" → "10-30 02:46"；解析不了就返回空串。 */
		function resetText(iso) {
			if (typeof iso !== "string" || iso === "") return "";
			const d = new Date(iso);
			if (isNaN(d.getTime())) return "";
			const p = (n) => String(n).padStart(2, "0");
			return p(d.getMonth() + 1) + "-" + p(d.getDate()) + " " + p(d.getHours()) + ":" + p(d.getMinutes());
		}

		function bar(percent) {
			const width = clampPercent(percent);
			return h("div", {
				style: {
					flex: "1",
					height: "4px",
					minWidth: "28px",
					borderRadius: "2px",
					background: COLORS.track,
					overflow: "hidden",
				},
			}, h("div", {
				style: {
					width: width + "%",
					height: "100%",
					borderRadius: "2px",
					background: fillColor(width),
				},
			}));
		}

		function row(w, idx) {
			const percent = clampPercent(w.percent);
			const reset = resetText(w.resetsAt);
			return h("div", {
				key: (w.key || "w") + "-" + idx,
				title: reset ? w.label + " 已用 " + percent + "% · " + reset + " 重置" : w.label + " 已用 " + percent + "%",
				style: { display: "flex", alignItems: "center", gap: "6px", lineHeight: "16px" },
			},
				h("span", { style: { width: "44px", flex: "0 0 auto", color: COLORS.text, fontSize: "10px" } }, w.label),
				bar(percent),
				h("span", {
					style: {
						width: "38px",
						flex: "0 0 auto",
						textAlign: "right",
						fontSize: "10px",
						color: percent >= 80 ? fillColor(percent) : COLORS.text,
						fontVariantNumeric: "tabular-nums",
					},
				}, percent + "%"),
			);
		}

		function UsageCard(props) {
			const wide = !!props.wide;
			const [data, setData] = useState(null);
			const [error, setError] = useState("");
			const [busy, setBusy] = useState(false);
			const mounted = useRef(true);
			const seq = useRef(0);

			const load = useCallback(async () => {
				const my = ++seq.current;
				setBusy(true);
				try {
					const res = await fetch(USAGE_PATH, { cache: "no-store" });
					let body = null;
					try { body = await res.json(); } catch { body = null; }
					if (!mounted.current || my !== seq.current) return;
					if (!res.ok || !body || body.ok !== true) {
						setError(body && typeof body.message === "string" ? body.message : "刷新失败");
						return;
					}
					setData(body);
					setError("");
				} catch {
					if (mounted.current && my === seq.current) setError("刷新失败，检查 arkcli 是否可用");
				} finally {
					if (mounted.current && my === seq.current) setBusy(false);
				}
			}, []);

			useEffect(() => {
				mounted.current = true;
				load();
				const timer = setInterval(load, POLL_MS);
				return () => {
					mounted.current = false;
					clearInterval(timer);
				};
			}, [load]);

			if (!wide) {
				return h("div", {
					title: data && data.windows && data.windows.length
						? data.windows.map((w) => w.label + " " + clampPercent(w.percent) + "%").join(" · ")
						: (error || "火山用量"),
					onClick: load,
					style: {
						width: "28px", height: "28px", display: "flex", alignItems: "center", justifyContent: "center",
						borderRadius: "6px", cursor: "pointer", fontSize: "11px", color: COLORS.text,
						background: COLORS.surface, border: "1px solid " + COLORS.border,
					},
				}, "火");
			}

			const windows = data && Array.isArray(data.windows) ? data.windows : [];
			const edition = data && data.plan && data.plan.edition ? String(data.plan.edition) : "";
			const head = h("div", {
				style: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "4px" },
			},
				h("span", { style: { fontSize: "11px", fontWeight: "600", color: COLORS.strong } }, "火山" + (edition ? " · " + edition : "")),
				h("span", { style: { fontSize: "10px", color: COLORS.text, opacity: busy ? 0.4 : 0.85 } }, busy ? "刷新中" : "点击刷新"),
			);

			const body = error
				? h("div", { style: { fontSize: "10px", color: COLORS.hot, lineHeight: "14px" } }, error)
				: windows.length === 0
					? h("div", { style: { fontSize: "10px", color: COLORS.text } }, "还没有数据")
					: h("div", { style: { display: "flex", flexDirection: "column", gap: "2px" } }, windows.map(row));

			return h("div", {
				onClick: load,
				style: {
					padding: "6px 8px", borderRadius: "8px", cursor: "pointer",
					background: COLORS.surface, border: "1px solid " + COLORS.border,
				},
			}, head, body);
		}

		// ---- client plugin body -----------------------------------------
		const inject = ["slots"];

		function apply(ctx) {
			ctx.slots.inject("sidebar.footer.action", () => ctx.slots.register(
				{ name: "sidebar.footer.action", id: "ark-usage", order: 101, label: "火山用量" },
				(props) => h(UsageCard, { wide: props && props.wide, ctx }),
			));
		}

		exports.apply = apply;
		exports.inject = inject;
		exports.__internals = { clampPercent, resetText };
		return module.exports;
	},
});
