// dsh-ark-usage — browser half.
//
// 两个入口：
//   1. 侧边栏底部的小卡片（sidebar.footer.action）—— 三行进度条。
//   2. 右下角的「小火山挂件」—— 仿小鲸鱼记账挂件的形态：一个常驻的圆角挂件，
//      点一下展开成一张用量气泡卡，可以拖动、位置记在 localStorage。
//
// 数据都来自宿主路由 GET /api/ark-usage（见 lib/index.js）。
// 只用 `--dsw-*` 主题变量并带兜底值，跟随明暗主题；失败时说明原因，不显示 0%。
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
			return Math.max(0, Math.min(100, Math.round(value * 10) / 10));
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

		function shortReset(iso) {
			const full = resetText(iso);
			return full ? full.slice(6) : "";
		}

		/** 12345 → "1.2 万"；123456789 → "1.23 亿"。 */
		function fmtTokens(value) {
			const n = Number(value) || 0;
			if (n <= 0) return "0";
			if (n >= 1e8) return (n / 1e8).toFixed(2) + " 亿";
			if (n >= 1e4) return (n / 1e4).toFixed(1) + " 万";
			return String(Math.round(n));
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
					transition: "width .4s ease",
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

		function useUsage() {
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

			return { data, error, busy, load };
		}

		function UsageCard(props) {
			const wide = !!props.wide;
			const { data, error, busy, load } = useUsage();

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

		// ---- 右下角挂件（原生 DOM，不依赖 react-dom） --------------------
		const WIDGET_ID = "dsh-ark-usage-widget";
		const WHALE_SRC = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAIAAAACACAYAAADDPmHLAAADeUlEQVR42u2dO3LbMBRFAQw3oFpy58Zu1LpJiqxD3kOKLCOF92Cvw0XSpE0jN+7s1F6CXGWGwwH/H7zPOZWHkikC9+LhSyAEAAAAAAAAAAAAAAAAALBJJAvm8fP58qd57ce3eIcBHAqv0QgJKdcRf8z3SlIh53zqJV2D6FQB+dL6mhH2uqtUd4X4od+jChAgfE783GdTS7fkqJAo9ZOjw532BiARAPy2Afrq/KFtAu0kxM+L29IAfMUANrtx12OuYwAAAAAAAAAAAAjMBQjicDpfxv7P+9NtxACOBPduiIjovs0QEd23GSLC+zZCQnybz2UmAmjKYA3R4HA6X+rPmRDfz/Pmni+SkT6iQT1PRUcAC+JLS0eb+OIMYEV8Senpe4ZEZtlN15DfTohvL32H0/ky9DdZFezcbInSbyedU34jIb6N9A65d65rGqVmxtvjzZfmtav7l98WjLD0GMFQY+V+V2QbICd+13Xq/KBnMqivhdonsgUTLFUVLHGfRJ3v20QJ8fUJuORaxygxoV1h3kpDcGqjcKpxihhgjsun9ALeHm9yhjFjgjn5ubkBtg75OfGtmGCJvGy7d7Iu/pDPJbcL1s7LZFH83f4YdvujehNskZeVtZZ+Xfjd/hg+/v11P2Tc1b4wNRvYLPVt12AFA9DPd2wAKeLnwr3GKoAXQ0bQ7OLVBa//raUrGLS9GCKl9FsYBygxxmCmEdgmMuKvGAFo+BEBgEYguDQA4Z8IAEH/8DIGIAKAZ0wfHPnrYf4U8NfvLxjAg9Bj723FGFFjL2BNwa1HiuaAUEUpX/75NEWHCtF9m0HkXIBW4TVUEaL3CLIq/hLpen+6jWvsPFYh/PZpnBMNmiaYG4VFLAjxIP6cKmHpV8fq96so+eXSvUa7YGyEiCUXhXoVf0wkWGM3ETV7BYOSXsAUl1L6+/Nhi/2GEwcn+N5smiogsB6A41McbzWfOEPH9zkDqVQirC+0mNINLFF4Eqdp+T5hJJVMlPco8D/9JQtLlLDrhde5AAlRMkkIcd4igRTxi+wW3jdvYDkaSAj5KraLt7oiSGLDOEreEcuCEaQKL+7gSEtVg8RQr+bs4CFrC6S/F6BpDCRa2DCxhCGaPRetA1/R8u6Za78baGG0M3ICV3A9vB05iYN5DAAAAAAAAAAAAAAAAAAAAAAAAAAAAABQyyfievcRVlGK0gAAAABJRU5ErkJggg==";

		const POS_KEY = "dsh-ark-usage-widget-pos";

		function readPos() {
			try {
				const raw = window.localStorage.getItem(POS_KEY);
				if (!raw) return null;
				const p = JSON.parse(raw);
				if (typeof p.right === "number" && typeof p.bottom === "number") return p;
			} catch {}
			return null;
		}

		function writePos(p) {
			try { window.localStorage.setItem(POS_KEY, JSON.stringify(p)); } catch {}
		}

		function el(tag, css, text) {
			const n = document.createElement(tag);
			if (css) n.style.cssText = css;
			if (text != null) n.textContent = text;
			return n;
		}

		function injectStyle() {
			if (typeof document === "undefined") return;
			if (document.getElementById(WIDGET_ID + "-style")) return;
			const s = document.createElement("style");
			s.id = WIDGET_ID + "-style";
			s.textContent = "@keyframes arkWhaleFloat{0%,100%{transform:translateY(0)}50%{transform:translateY(-3px)}}";
			document.head.appendChild(s);
		}

		function mountWidget() {
			if (typeof document === "undefined" || !document.body) return;
			if (document.getElementById(WIDGET_ID)) return;
			injectStyle();

			const pos = readPos() || { right: 20, bottom: 24 };

			const root = el("div", [
				"position:fixed",
				"right:" + pos.right + "px",
				"bottom:" + pos.bottom + "px",
				"z-index:2147483000",
				"display:flex",
				"flex-direction:column",
				"align-items:flex-end",
				"gap:8px",
				"user-select:none",
				"-webkit-user-select:none",
				"font-family:inherit",
			].join(";"));
			root.id = WIDGET_ID;

			// 气泡卡
			const bubble = el("div", [
				"display:none",
				"position:relative",
				"width:214px",
				"padding:10px 12px",
				"border-radius:14px",
				"background:var(--dsw-surface-1, rgba(28,28,30,.92))",
				"color:var(--dsw-text-primary, inherit)",
				"border:1px solid var(--dsw-border-default, rgba(127,127,127,.28))",
				"box-shadow:0 10px 30px rgba(0,0,0,.28)",
				"backdrop-filter:blur(10px)",
				"font-size:11px",
				"line-height:1.5",
				"cursor:default",
			].join(";"));

			const title = el("div", "display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;", "");
			const titleLeft = el("span", "font-size:11px;font-weight:600;letter-spacing:.02em;", "火山套餐");
			const titleRight = el("span", "font-size:10px;opacity:.55;", "刷新");
			titleRight.style.cursor = "pointer";
			title.appendChild(titleLeft);
			title.appendChild(titleRight);
			bubble.appendChild(title);

			const body = el("div", "", "");
			bubble.appendChild(body);

			const foot = el("div", "margin-top:8px;padding-top:6px;border-top:1px solid var(--dsw-border-muted, rgba(127,127,127,.18));font-size:10px;opacity:.5;", "");
			bubble.appendChild(foot);

			// 气泡尾巴，指向小鲸鱼
			const tail = el("div", [
				"position:absolute",
				"right:16px",
				"bottom:-6px",
				"width:12px",
				"height:12px",
				"background:var(--dsw-surface-1, rgba(28,28,30,.92))",
				"border-right:1px solid var(--dsw-border-default, rgba(127,127,127,.28))",
				"border-bottom:1px solid var(--dsw-border-default, rgba(127,127,127,.28))",
				"transform:rotate(45deg)",
			].join(";"));
			bubble.appendChild(tail);


			// 挂件本体：小鲸鱼（图片内嵌，避免找不到资源）
			const avatar = el("div", [
				"width:68px",
				"height:68px",
				"cursor:pointer",
				"position:relative",
				"transition:transform .18s ease",
				"filter:drop-shadow(0 8px 16px rgba(18,44,100,.35))",
				"animation:arkWhaleFloat 3.8s ease-in-out infinite",
			].join(";"));
			const whaleImg = document.createElement("img");
			whaleImg.src = WHALE_SRC;
			whaleImg.alt = "火山用量";
			whaleImg.draggable = false;
			whaleImg.style.cssText = "width:100%;height:100%;display:block;pointer-events:none;user-select:none;-webkit-user-drag:none;";
			avatar.appendChild(whaleImg);

			// 挂件上的角标百分比
			const badge = el("span", [
				"position:absolute",
				"right:-4px",
				"top:-4px",
				"min-width:20px",
				"height:16px",
				"padding:0 4px",
				"border-radius:8px",
				"background:var(--dsw-surface-1, #1c1c1e)",
				"color:var(--dsw-text-primary, #fff)",
				"border:1px solid var(--dsw-border-default, rgba(127,127,127,.3))",
				"font-size:9px",
				"line-height:16px",
				"text-align:center",
				"font-variant-numeric:tabular-nums",
				"opacity:0",
			].join(";"), "");
			avatar.appendChild(badge);

			root.appendChild(bubble);
			root.appendChild(avatar);

			let open = false;
			let lastData = null;
			let lastError = "";

			function paint() {
				body.textContent = "";
				if (lastError) {
					const e = el("div", "color:var(--dsw-color-danger,#f85149);font-size:10px;line-height:1.45;", lastError);
					body.appendChild(e);
					badge.style.opacity = "0";
					return;
				}
				const windows = lastData && Array.isArray(lastData.windows) ? lastData.windows : [];
				if (!windows.length) {
					body.appendChild(el("div", "opacity:.6;font-size:10px;", "还没有数据"));
					return;
				}
				for (const w of windows) {
					const percent = clampPercent(w.percent);
					const line = el("div", "display:flex;align-items:center;gap:8px;margin:5px 0;");
					line.appendChild(el("span", "width:46px;flex:0 0 auto;opacity:.62;font-size:10px;", w.label));
					const track = el("div", "flex:1;height:5px;border-radius:3px;background:var(--dsw-border-muted,rgba(127,127,127,.25));overflow:hidden;");
					const fillEl = el("div", "height:100%;border-radius:3px;transition:width .45s ease;");
					fillEl.style.width = percent + "%";
					fillEl.style.background = fillColor(percent);
					track.appendChild(fillEl);
					line.appendChild(track);
					const val = el("span", "width:40px;flex:0 0 auto;text-align:right;font-variant-numeric:tabular-nums;font-size:10px;", percent + "%");
					if (percent >= 80) val.style.color = fillColor(percent);
					line.appendChild(val);
					body.appendChild(line);

					const reset = shortReset(w.resetsAt);
					if (reset) {
						const sub = el("div", "font-size:9px;opacity:.4;margin:-3px 0 4px 54px;", reset + " 重置");
						body.appendChild(sub);
					}
				}

				const session = windows.find((w) => w.key === "session");
				if (session) {
					badge.textContent = clampPercent(session.percent) + "%";
					badge.style.opacity = "1";
					badge.style.color = clampPercent(session.percent) >= 80 ? fillColor(clampPercent(session.percent)) : "var(--dsw-text-primary, #fff)";
				}

				// 记账：token 换成人民币（本机账本，估的是本机会话的消耗）
				const spend = lastData && lastData.spend ? lastData.spend : null;
				if (spend) {
					body.appendChild(el(
						"div",
						"margin:10px -2px 8px;border-top:1px solid var(--dsw-border-muted, rgba(127,127,127,.18));",
					));
					const money = (n) => "¥" + (Number(n) || 0).toFixed(2);
					const t = spend.tokens || {};
					const rows = [
						["今日", money(spend.today) + " · " + fmtTokens(t.today)],
						["近 7 天", money(spend.week)],
						["本月", money(spend.month)],
						["累计", money(spend.total) + " · " + (spend.rounds || 0) + " 轮"],
					];
					if (spend.balance !== null && spend.balance !== undefined) {
						rows.push(["钱包余额", money(spend.balance)]);
					}
					for (const pair of rows) {
						const row = el("div", "display:flex;align-items:center;justify-content:space-between;gap:10px;margin:4px 0;");
						row.appendChild(el("span", "flex:0 0 auto;opacity:.55;font-size:10px;", pair[0]));
						row.appendChild(el("span", "font-size:10px;font-variant-numeric:tabular-nums;", pair[1]));
						body.appendChild(row);
					}
					if (spend.total > 0) {
						body.appendChild(el("div", "margin-top:5px;font-size:9px;opacity:.4;", "累计 token " + fmtTokens(t.total)));
					}
				}

				const plan = lastData && lastData.plan ? lastData.plan : null;
				titleLeft.textContent = "火山套餐" + (plan && plan.edition ? " · " + plan.edition : "");
				foot.textContent = "每 60 秒自动刷新 · 记账读本机账本";
			}

			let seq = 0;
			async function load() {
				const my = ++seq;
				titleRight.textContent = "刷新中";
				try {
					const res = await fetch(USAGE_PATH, { cache: "no-store" });
					let payload = null;
					try { payload = await res.json(); } catch { payload = null; }
					if (my !== seq) return;
					if (!res.ok || !payload || payload.ok !== true) {
						lastError = (payload && typeof payload.message === "string") ? payload.message : "刷新失败";
					} else {
						lastData = payload;
						lastError = "";
					}
				} catch {
					if (my === seq) lastError = "连不上宿主路由，检查 arkcli";
				}
				titleRight.textContent = "刷新";
				if (my === seq) paint();
			}

			function toggle(next) {
				open = typeof next === "boolean" ? next : !open;
				bubble.style.display = open ? "block" : "none";
				if (open) load();
			}

			avatar.addEventListener("click", () => {
				if (moved) return;
				toggle();
			});
			titleRight.addEventListener("click", (ev) => {
				ev.stopPropagation();
				load();
			});
			avatar.addEventListener("mouseenter", () => {
				avatar.style.transform = "translateY(-1px) scale(1.04)";
			});
			avatar.addEventListener("mouseleave", () => {
				avatar.style.transform = "";
			});

			// 拖动（按住挂件本体移动；松手落在右下角坐标系里）
			let dragging = false;
			let moved = false;
			let startX = 0, startY = 0, startRight = 0, startBottom = 0;

			avatar.addEventListener("pointerdown", (ev) => {
				if (ev.button !== 0) return;
				dragging = true;
				moved = false;
				startX = ev.clientX;
				startY = ev.clientY;
				startRight = parseFloat(root.style.right) || pos.right;
				startBottom = parseFloat(root.style.bottom) || pos.bottom;
				avatar.setPointerCapture && avatar.setPointerCapture(ev.pointerId);
			});

			window.addEventListener("pointermove", (ev) => {
				if (!dragging) return;
				const dx = ev.clientX - startX;
				const dy = ev.clientY - startY;
				if (Math.abs(dx) + Math.abs(dy) > 4) moved = true;
				if (!moved) return;
				const right = Math.max(6, Math.min(window.innerWidth - 70, startRight - dx));
				const bottom = Math.max(6, Math.min(window.innerHeight - 70, startBottom - dy));
				root.style.right = right + "px";
				root.style.bottom = bottom + "px";
			});

			window.addEventListener("pointerup", () => {
				if (!dragging) return;
				dragging = false;
				if (moved) {
					const p = { right: parseFloat(root.style.right) || pos.right, bottom: parseFloat(root.style.bottom) || pos.bottom };
					writePos(p);
					setTimeout(() => { moved = false; }, 0);
				}
			});

			document.body.appendChild(root);
			window.__dshArkUsageWidget = { root, load, toggle };

			load();
			setInterval(load, POLL_MS);
		}

		// ---- client plugin body -----------------------------------------
		const inject = ["slots"];

		function ensureMount(tries) {
			if (typeof document === "undefined") return;
			if (document.getElementById(WIDGET_ID)) return;
			if (!document.body) {
				if (tries > 0) setTimeout(() => ensureMount(tries - 1), 400);
				return;
			}
			mountWidget();
		}

		function apply(ctx) {
			// 只保留右下角挂件；侧边栏卡片按使用者要求去掉了。
			ensureMount(40);
		}

		exports.apply = apply;
		exports.inject = inject;
		exports.__internals = { clampPercent, resetText, mountWidget, ensureMount };
		return module.exports;
	},
});
