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
		const WHALE_SRC = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAQAAAAEACAYAAABccqhmAAEAAElEQVR4nOxdBZhc5dV+r8vYusRdiQuQBHcoVqQtUmhLCxXq8vev/XV3pwJtseLBNYRAQoyEhLjbZn1nx+5c/e7/nO/ObJYUKG0pJGEOz7C7k9F773e+I+95X6BiFatYxSpWsYpVrGIVq1jFKlaxilWsYhWrWMUqVrGKVaxiFatYxSpWsYpVrGIVq1jFKlaxilWsYhWrWMUqVrGKVewwNEEQ+M9hQ5qVJQ/+fqWqqjBNQ9A0DbIk4ZQT5gzo2PFCuPipu9PLnrk/fPbJ+bmWbS+G137gvcdLkgRD1wVFkaEqCui5FavY4WDRVV8xbvF4XAiCIBzQPEB/8O8PFlcs3+i2d2TVtq4utHe3w/M92K4HLwggSDJkRYamSkjETdRWxzCwsRoDm1LWsbMnmZe//9rm5StfaJMVRchms2HlEFfsULS3pQOgzT4sLcnqqqRAv+u6Lj/x2P3uqtWt2Li1C+vXt7LuLh9BoEOUdQSChDCUxCAEGAAmMEAKISCAJARMgA2RFRHTQ7EupbLRQ5vECeOG4+xT5+LMi06p2rptc1aSRHT3pCvOoGKHjAlvxzA/LK3+utpaceFj9wR7Wy08s3QDXtyw39/X7iBAArrRLDNmwnUFuL4ASVQg0E1WwEQJQRiCsQB+4EEWGWSRHIEDQwkgegXYhU4/YSpoqDFx5ilT5LEjajBj0hDMO/M0c9369cW3+FBUrGJvHwdw8MJvbmiQPD8QfvOzP3lPLtrkrt/WC1dIgslVqgMNHhT4kMAggongCx2BDwYJIWR+fxBKEAQZsixHrxsEkEMPihBApUcJHkLPBlgOdnaPO3JYEnOOHu1edtEp8fMvOM3YuGmDTZ+r/JkqVrG3wo5oB0ALjG6MUdAODBs8SGGhgBt+9gt3w+Y0Hnp6nZ2xEjpTGmEFJgLJhCfK8EXAFzwEAkMgBhAFny97QZAA+i1KB7gzkEUZIRPA/AAC8wDmQWIhFDGAIklQJAYVReR690D0ujFlfEP+49ddFL/2g5eamzZtLFacQMXeSjtiHYBIC7+0u44eOVKVJFX89U9/097Z6STvfWixtWu/jSJLmILSCNGohR3o8KRo8Xtw4YZFBPAgSiEgOHw3lyUFlPVTQABIEAWFFxRE+l2SIIsiRIEhDAIEvoeQ+bzYIIcSTEmAk2uH4Ldj4qia/LVXnRH/1MeuiG3ZutkSRbHPSVWsYm+mHZEOoLygxo0eo8VjcflH3/rpGl8YOPL2+5+1X1iz0c8UvLiWaIKZaIAdqrCcEIIWg8tCuKGHMAwAIUAo+RAECvgBVZIgiAIQhAj8EAgBSaQ0QITremAhg6Qq/L4QIRg9Tgj433bOQVUiBkMKke/ei9Buw7AGMX/d+86Kf+P/ro9v2ryx8FYfs4q9PU04End+VdMwYthQ/ZYb/7IwFR989C//9KD73Opeu8iq4z4EEaIIQZXhsAC278NnAfSYCT9gCGkhCxS6i0DI4DkOwkCELKhQZAUCY/A9F5Iggqr6QeBDlhXIigIvDOEL4K/jUVmAegRhANPQketNI7BdNFXHIbo55Dq3YfzIeP4jHzwr/t1vfzK5avXqXBDw0KJiFXvT7IhzAIZhCMViMbzzlpv/lKoZ+f5f//mhjj0tfl0WA0RfqYOkaYAYwnFt2J4DUQyh6ApV+iCGDLIg8FIf/S74PkLfh+cXWBDYbixmQBYlwPOhiDKvL3iuD9cNAFmVRcmQoRhgigYGBU4QouDYMBIyfNuGazEk1ThMWYaXb4UudmH44DD//W9eHR8/YaSgkBPxvLf6EFbsbWQyjiCjijwt/tGjRhrrt3dK2xbsdjftSNdI8aGioCdhBSF8J49QFCCEEiCpFA/wIh48BoXu8h3m5rKuEDhImhpqquJoaK7TR46K63U1McTjCWiQoEoKKMUvFFx0deexZWc7duzqtLtzPQgcUxW1pKjLBiRDQDbbAd00EIvFUch4oJJiXG2A47rYvnNP/E9/nb/32Dlz6p5fsqSrUhSs2JtpR0wEUN49R44aY3z8k199fNOOcN6iZbt9piRlwUzADkXkfQFBIECUVQiQEQQuFCmAKnsIrC6IbhY1RohJwwdheEMNhjU1YMyQIbBZZ/6lPS98JR7XZVPXfSr28XqAz7uDcldXxh8zcvy1VXWDxy1fsQkLl67D1t0dzA81UVRjKBJ4SI3B9+NwHRmSkISmAgo6wdw9GFht44ufvhi/+tlXmp948uk2+h6V9mDF3gwTjqSi3+jRI4xPf+F7jyx7yTnh6ec6rHj1aNOVA+SKaUDwAArboYIh6t2H8CAgDynshejtZ0PrFWvC0Opuq33PtyYMGyKmYjEvUVsnvbDs2RW//Muf1rzWZ7jovLMGXnDJZee27dhvTRo/4wd7WnobH3nyueye1kw8E1SLiA8Ek+PIWhKYVAPdVCEIHVBZD/x0q3/OCaPcr3zmTHPgkOEC1RR8v5IKVOy/b4e9A6BBHLrNnD6l6sMf/djfX9hgn37PYzstURtlChRmiz5cVoQYBpBALbuouMd7+2IRQtCNwG3Nn3XKUeInrznfNJHtGDJifOPB70MDPmGpyNjfop1agOs6ffddfcWVo379458/397SU/frP93Bnnh+HyyhRkQshbQlQtSGQTFN5Arb0JAQEKS72aAqGx957+wt995909l3z39gJ71OpTVYsf+2HfY1AFVVedFv3tzjLnTdqtPvf+CBnlAZUiPrKnzR5T17UdAgMUAMAoihi9DPwyt2IBZ3MW18U/6Ki8+Pz5w2AH++6TfnF3PpDK/qyxJfgGUgkeu6/7T+QJGIIivCTTf/bRsL3LmTJ04Zd8UVZ/29edgu9db7nvXbetNyIjkInuDB9xwYmg7HLSBmxMS9LS1sx66OcT/90Y/X3Xnv/JiqqHDZa79nxSr2tnYAoijxot+4cWPj2Yx29F9uWZ6HOigZSw5CqKjI2QX40CAwCSIjQI4H0c9AZGkMrmXZk+eMwwfffVryxtt/e9ozj/dYP/j5L5eUX/tfDcF93+c/XdcNqV3419v+vgX4+5Yr16+d8p3/+8Vmz/PFP/79LiYwXQzEevjFAKnGBDJdGSQTSejxOix9YTubNH7Y86qqIKwAgyr2Jthh6wAo7Kcd9+QT5tRdcuG7/vLs8uLZe9oc26wZKvuCgayVhcNcSLKCwPNhSD6KmX3QhSymTWzKfvVTlyenzGrAFz/1yWO/98ufL6XX5HP8YQj3P2zF0dgwRQT0en+77fYtgY/Rn7j+f+7csmvwsAUrdiZFdYBITglMg6KbcJkI1ahBd2+XuGTZBoWARZJ02J6aih1GRiC3w9Jo8VO1fMSIMVPzdvLsRcv2d9U0TNKZWI+8LcLxGRRZgCi40GQbdu8mpPT9+dNPGNLzmx9fl7z1jh/N+fSnPjqDFj+F20TkQWH+f7r4+0cElmUhHosJt955+7bRw8zU/33h8qoRAxVbCnqhywxFqwBNM2G5ARxmiAXHZK3t+dGf/dTHjqUBJHJyFavYf9OEw3Xx023usbMajz3mjO8+t6JwSVdhhC7HJspp24ODPOJJD57fg2K+gJTB4HSszH7ifacnP/WxS/C/X/3a7B/96Mcr6LX+2+Ab+pwEB37XO88ZoeqyPv3Y49b/8Zb9yAVDmK0roscYQiZBYwyGW2AnzjDFz3185t4xE2YOoQjin9UeKlax/8QOyziTFhXtsMlk7XAjMfR9+3u2Z43qZjltuQgkEYZuwLXzUEQfgtsNu9hmf+9/Lks+cN+Nsz+47rGev/z19u0UYkui8Ibt+K9mVECk28133LeD/t64ZffgVOKEFwI3aCh6VKFUOZRYCARACNHZU2Tbd+x7kR5bwQJU7L9th50D4GFxGOKkE+Y1z5o579NPLNqelc2hpsNMSIYBh5B+TgGq4IEV09CCLvvEY4bbDz948zF33XvPmvJrEIb/zYTeU1eBipbPL12x70PXXpJZvjHXoIQxgAaKqJ4RSnygqGAVRJ+J+pv3ySr2drbDrgZAbTk/CKAoZoOZGHxJS6fAINfKFs3gxyS4QQ6u0wNTciB7GUwcnnJ/9MUPVC14+qmX6PmU678VQze+H/D3pQGiE46bKsPrQcKQwXwfIou+F80dhoKMdG80HFiJACr237bDygHQzk2L4oxTjm8+9+zzvjP/0TVZUauLQ43DF0LkrG4oiotkDHDzLRjWoFmfufo8/O9XPjvOtu2QFtl/O+T/ZxYEDONHDMjVJEWIzIXKQgghkY6UnRuQLTmAilXsv22HlQOgBUK7qCBo8bracWd394pMj9fLviRCUgQUihkYug8FGSQ1C/NmDsucceGc5KIli3bk8vnwUKl4jhrRNHnsqCb4xTw0WYLEiUUZhNCHwEL4boUmrGJvjh02DiDK2wOcc9bpDd/9v+/9+YmFm7N6bEBS1hPwmINQ9mGYxNJjw8q2YPyo2vzXP/Xu5mve/96x7R1dHp8XeIv598rIwrmnnGA21Js9FAEYqgyJxpBpBFmkz8egG2bpGYeKy6rYkWqHjQMoj8k2NQyoGjN8+rxsTkbADDGgqEDy4cOBEVMQMBuAlb38kpP093/q2tF/uvFvWwoF65DA1Zdz+pfWry9Wp3RPITZhIiBBCEkMIQgU3QBVySr+fVX5sKvRVuwws8PGAZRNFATazCOqLceB53hQZQWhC4SewId+hgxqYGNHNrK169bu58+hJxxCRtgDKkgQWtAjMhHiJiAKEZXqE0UkUkmRnIVlF7kq0SsZfafy/EHFKvbv2mFz9VDfn9KAW++8Y9PH/ufDcyYeVaMHXldeFxWEhRgUrxYsr8LqKWLIwGaMHjdMrapOaTgEjYBHvY4bFpgEV4whEFIQJBNdPbsweHgKAdzW0cOHKC89/9T91PHQiDzgIKOIho7JoRDZVOzwtcPGAZBRWFwoFBAEhcyxMwaritDti2EWVZqGxkQC9TETbqYnO33CiOTZ554/5LnFS9OHEuNuuYuxcNEjj4SCVu8wkTJ/zjDsOllMmzYEp585C0OG1NTt3tfq/eyXf/jc4vvv+h3NBmglvUGKHsiufvelo1tbWtZce9XlE/j9lXShYv+GHVZJJu14siTj9jvv2OC4wryrLr1w0U13LM/arD0pKyZkoQjR280G1UliOt2Vo4VzKIbINcmmmcVsq5g0YnB8H47XjZp6hnPfcTTOPnMmevdvqKV25Y49ezpGDh02l5xGWdykbPGYaTYNGDC5trqqmv4+FL9nxQ59O+yuGqLioty/OqUX3/3OY8RjplWhuboTMtuA6vh+HDulTpw9qQnJuCEdqnX00NcyVrYIhflgdg/ksBvzZo9gpxw/QUx37Hhh4oRZs4+fc3Tqhp98587hR8+bRCkAfef+NnTwwKG3/P5XH//hr36/mGYGiF+wYhU7oiOAcv5MYfDv//ynVbIcnvC9r3716YeeeD67f397PJk0ek84enzVdddfN3Dhs0u6I9ruQyP872+5Xkts270fTtqHaSQwaHAVzjltKhpqArTu3utZVpGUh0U9biSLtv2yGkB5cOmL3/ze/VyLQJL4wNA9N/32C8+vXPX0D3/1h+VUHCzzE1SsYng7yH/1vx2qRovV0HUseWLljg9f9d1w0thrwiGDLg9//otnAscLww2bV6yhj08LmOxf+S6UAhzK371ih6YddhHAwXY44OVTyYRgO27oOA42vrh88dBx04fblsh87yGsWLkGx88eC1UEYnIY6/91/pXvdqgUOitWsYqVrFy537564bNTJ00wyvdvX/PiwtANw9ULN4a3/35+mN6dC5zObm/FogfupF28HAFUrGL/bavEjG+ylfPzjcufXRjTaqsLBUccO2rkhM6e1t3Dpk4ZQTl/xSpWsSPAyjn5uNEjNcr9y3Yw1VeYy4Vh0QrDntawqaFBJCdRyecrVrFDyGgt/6uFNk4yCmDVs4/dP2nieJ4ClJ9Pi5xu5Bi2LFn4+PqFCx7asWrFM2Hr7rD/cytWsYodQVbmM3wl4I6haVh07x2/ot8rdYCKVewQsPKOTZX8WbNmxoYNGSSLJC76L0QChFt4rceTDgAxFVXQfBWr2CFm5Xz9/LNOaw7DMPzzz7//AfrbNPuK+q/NCCxJL8MnzJ4+LX7cMcek5h49O0X4/f71AD4C/CaF/mVJtQr1+NvbKv2m12m243qOk8/WNjQ2DRs0QN61b79Pi7W/km85tC+j8Pr35sv0488//GBObBwABAyCLAllwlAuPCjQcwIe/tNr/je5C98KXsSKHXpWcQCv0xRFliTJVc+7+Lxv1TU2DLvifR/68M7d+/hKpwVbpv/uv+jPOuWkesmIiQsWPNXuOBFWf+eO3U83FsMJzLFx4dlnDXBdx3/oyQUdr3hyOB6g5Bn+iR383gdeg5iUWJ+TKhOrXHXpRSNlTZOY54U33n7n1ld6TXpseYKx4jAq9ra0coh80XlnDaIUwG7d4oVhLnz6gdt+ccklFw8aOXxINJ8L4KTjj6m+/vrrp4weOZzH8T/71tffSc+ZM2tmovwYt2WbE4Z+GBISiLlhaGfCS899x+B3nXfekEvPe8fgS849Z9Cl77xg8Mlz5tT8q5+VogxyGpRavForsVxnePKOm3+4+NH7f7fwntt/Tn+XH0s/6XUq48VvD6sAgf6JlfkEpk2eaH7i09dfNrAqPm7OsXOuNWQlLtQMwsN/v+lbtz345J+XPb9k3zlnnnjUeRddeeUXPvvJr6xYtZZT+37t09effOeDjy7etnOXQ3vwz7/7tXenamrq9u7Ytf26qy77qywramzw0GSpz1ga0FThte6yPvi5/5msSLLs+h6PNPp28fKJIxZhz2OyGRcfffjhne2d3f8QAnzio1dPvf+hp9a1tLT5nEDkX4ROX3XVVSP37tjSs+DZ59NlXsaKVexta++68JwhtKtntm1sL+7angvb9tGf4de/8KmT+j+O6gMxs0zu+Y924glza4td24t+tjUs9ramM5170+2tu9JtLTszbS3b011d+4IwDMIw9MKQsfCf2b233/Lla95/9YQPfeCqyVdefunY66//0BSqMHzrax8/taYmyf0FLWD6XNR10DWN3zTt5aRJcdMUPvi+q8d98Morx3/vy186h1576WPzb6J/6w9mqtiRYZUawOs9UFztV8GeffvTTz32wI/mzpx9nZPO5jxDzs2/8YZv3H73A0viMVNQVBXpdG/IhUZLM/rvPP+cYcOGjagNBSk0TFOnRfWd73xnyY4de5Hu7UFHT6Yqky+iJ5NFNldA0fNgF12WLRayxHOo+joEyDQiDF2RoOs6TFOFKktIJEwxldDYmIknffMX5172zT5CYQBHTZz53ocffPipi95x/vhEbcr4yU9/9UJ5Bz+4NVmuDTQ3Nso3/PnGjchRABMi29Xa0tbevfW1hpPejKJlxf47VnEAr9MofKYI/fkVq3O/+8Vvfn7KQ+d+Vq9KxiEZGD1yxKyqmuQtG7dtc1CwcM5pJzZOmT17lOS5YuAL7Mtf/r/njOokWltttLZ1YF9LFz77pRvy3elCPJ2z0NLWAdsLUXQDuAEDE0gpQBC9gCUlT4TGYlw7UJQAiQ8LCVAVEYIUIKarSCYNqPoSOx7X3JqaBJqaa8WmpgY2+/hL//qh938wyhdkYEDNgAs6u9o7qTzw7R//fHH5u5VFSMkJdHR1+b/68Q8v/dhnPnMHCgUk65oHDmxunEiPezUsQ4V74PC1igPoN7n3z1h1aAMkkpExY0YOee6pB39/ww03/UAIAqFp5Ji6zs5u+5QT59WddOqZUz909ZW/rB84ZBxyHro6Ldx02wq2aWdHfm9LG/bs2Y/uTA5MUJNhKCMQVOjxJkCQEcoqZEOBSANDEKAwukkwBQMkGUQtwiAkFuEAXuiDCT5cx0dvJykh27rrdemBb0PTJdQ11OL2uxZaE4c0+aMHN4ljhg9kn/zEF++TSuVIw0ydW7QLdshc/zs//uVCiipCxpDJ5cLrP/v5O9vSXfPc3qyvJuLy9i1bWug5B6soU6HQ831c/6Grp3Z2p9N33PvA7rJ4S8UOD6s4gJLR4i8DccKQgfgEDzbKoUngM5WKVw0fMXxmPKUnDDNuZHpb/YvefdHc66655qfDRoyfunL5Vtxx1/z8+vW7sW9/Dvu6XTPvSsmAdnG5DvGaYZBUE2GowGWAFwgIBVIHEOD7AgI/BIMAgUIOJiIbBBAhQmAqQlIQEkhVmDZ2RlzoECUGVZdgyiEYs+H5DrozLrqYZ7a37saqNa1obNiFB5/ZkB89qhnjxwzGl7789QfAexUhJFk/45vf/+Hj9BfVBCga+Pa3f9AXIZSNGIr7W7mguGtvS9v2bdvTVCxVFPlNFV2t2H9mlS4AJ9iMCX/97Q8+/64PfOL7XlRwLzmDcodP4Ltv+d9ipo7f/PYXH3vvez/4y/4H87HnXsDTz6zOb93abe7ZkxezPQEcT4ZZU4dQUuB7FN7TQJEEQZRBkiAsFOAzgFF4HQpgISkEhJz7kByAEIYIfRcCaSGQuBnXEIzOHP0gNSFBCIloEGHoIYRfOqsB/6FJCkLHh+faUEUPqbiGIQNrMXJ4Q370sFqcPHeKOHx03Pzdb393WUfLzp6vffsHj8ViMep+CBQRuB4vQvKd/mArdwVmTp0cO/+iS4758w2/X7Rz7z6v0i04fKwSAdBSYUG4YvW6RbTA//znG94fWunwAx/7wo1l8E7Zjp97TOr9H7zuPT1trR0NVQ2DC0XP2tXaYW/YvEN/ftVGtmrNDn33vkw8YCmoWhPkqiRikolikEMAD4JKAmACQmrW8f/xfR6033MTREgiaQTT0qXdnX86iApDKITcOUT3lRuBAgRSFqY7yQnQH/x+ehe6VwATFDBV5xFHIIrociy0b+jAhm3747UpDZu2tmHu7HHWdddedytFFaqqvuOLX/vWQ+V3oohAkEQoQoRk7G+kXFQMAnz+o9ddd8k1H/7RcXOm/fozn/nfL6xeu65wKNGxV+zVrRIB9LNVq56+ddq0E99zzVXvHvvc8yt2fes7X70+39WVj9U2mfffe9d9GzZs73jhxbV5eiwFA4uX7cSTz72AJSvWYV9HHpYvgolxyEoVwtAEC1SItAOLFkGAosNdkiilBUprtk8zkJYrOQUuElpa0Aj5wue/8Z8UEZSwAvSTZgz4f/0Bg+VKPbkVhlCV4VE0wAToigGJxEdtG6FtQRV8iH4WY4Y1YOLoJuv4uePUubPGyA8+Mv/jRkJR165c9sI3v/+jheXjE7UMQ7AgigjKsw7jR43Uf/G9b37/hPMu/vg1V7xn3J9uuX0zpQLliKlih65VHACAZCIuLHrkzr//4s+3fHnPtu1dTy56vmfQwCZp775WH143oJho3b1+5/pNrfNnzD7huuUvbHMXLd1qrlm/T962txseMyHpSbiQIaoxQFBQpLDbDyHzyUEXIkq7Z58DKK1x+oXmAmjhw4fINQBYX4TAROoIiCXnQXWC0u/cCUhRbeAVTyPt/h4CPYATuggDcgAmdFEH80MIjgspDKAJAZidgcAyGNKcwNEzx7EzT5sjTp3SDFkIcecdN30xVV+lPfXwIw/99Dd/WHnwu5SZl0cMHqSMnzyleuXyZV3tnV2s3Fas2KFtR7wDoKKe73tgPH5+lccoCi54xxmD77j3wb3096OP3vtt1QsSM2dN/6DruExQFVGvqtMLjoTHnliJ+Q8uwYvrWhCKtRD1WvihgUCUEdCOXVIhZiHtfgI0RQHzKT/vXxmjnbzsBCh/j3Z8gefttNMzrnHIHxRK/LXLz6G6QeQMIkcglv9+mUXflRyAZPrw4MDzQkISQITGowgZEhRRgm9bMBUqNubhFXshhBaqq2L2zCnjcPop0/WzTh4NWQe69u3LPvPMgl9UNdUYD917362/+ePNq2gsuli0+9CSFTv87Ih3AP+qte7ZsKZp8PjJcNIopHuhGiaYXouVG/ez2+96xH9+2UY1k5OhGU1QjQZYNu3bMk32wfFdMCrE8Ru160ISM+W7dHnnL2uxRKF8dF+0U5brAOXaAOt7XEiLnD+ejKIA/i9RIsFfovxv5SJBydmJPkQpgCC5oPUZhiICHwhCeobEVZYExiCJkaiqJPgIAxdFqwAWFDGsyWDvPGuGP3vaKMyYPlo1YtFb/eon37ny+s986eb+x63MlkSOoLLzHz52xDoAquBTK+/5R+76w2e/9t3PLFmxKstLa6WwNKrwC31ovYa6WvGum377i2/89NdfrUkk4zffetP2QleP6wYwN+4p4sa7l2HZC9tR9ATU1g1FrhAinbWRTNUilERYdh6iEEISSKwjhBge2N0D1j9IF3knIHIIYp9foCVf/i36tewQAIkXDcv1v/Jij4p9UTWBagW8YlByIJET4KqDngAllCHSyLFIPQKKL0IEpXIEtTwlajeSs6JBIkmBYxXhuDYEuxupsAsXnHscTj99Dhs2KOVqalFs3799jScIG2760x9+9Jvf/2VdedT5YCOcAHUy+o9MV+zQsiPWAVB4SmH/rGmTYytWR4M5r2WDBjRJe1s2+oJQLZiGKRSsPGvd25pdtGh58vYHV2PNrgCq2QhR1GC5BMqRoOkmbNfhi4Umd2lwUKKlTLsqdwBRHsz4YqMVfCB/LzsBWoRU9ycrO4O+YIH/C71WtPrDUqvwgFG7MPrJi3O8qHDAAcghoHomJBYV7wIxoA/Iez8+AgTw4YchB0F5PqkNU+tTAwuoMOlDF2wg24LQ7cW0yWNxyQWnYvb0EUjEXNQ1V+EH3/7KBV/86nfmExS47EjJSNI8qEQCh4UddtqAr9do8VP+T4t/7ZIH7p5y1Dij/3jvyoWP/m390kX3l3n4u3t6g9Ejp6mmqQubNm96fk+rbd18/9r4T29cgTXbA0hGI3yocAi0Q4eNFlFAF73PYbk8nObLX0YoKvBFGb4g8Z9MJACPBibIHObLA3y+oClPp02dFnJ58VIXILrxdiClAKXKPzmUV77Rv0mQQgVyqEKGBgU6BMEAk0X4is9vgUROgMEPKUynsF+ETJ/HZxCZCJU+i+9BDH1eACSsglHTBMkcjLUbHNzwpyW4d/5upHuNbBgGrL0j30kh/8FUZgQYIsd3089/ds369evvHzlsKAdUUDpUsUPLjugzUsaujx45VN3f2uHlC1ZYDlfDYk8IPQ5FMYX+WPb9+/evDpTk1N/86RF2/2Mvirl8HGqshlfjeVutFMmWh19eTY6sf8hLtXr6u3xfWe2XFn//z3nwqC5/bV4WoBbhP/+eB//O//4PXDx1I2SRAb4CJTDhWRaqYxLOOHkUu/iiydbQYWLm+o9ec8pfb75zM9cvDCNE5bJHH/jzhz7zhY9+93+++MWzrrjiK1MmTjDWbthokwP4V8eRK/bftSPaAbyWNdTWUtWKhl9Y69Y1a0KmMibHYgVfG33rPQvYQwvWiC0dHszUIChGCjZBg4VoIZPx0L5U+X69DuDg+w92AH2P+RcdwGs6hP/IAURoAs8JkVBjUMCQ7tiD6riPc86czC69aA6bML7Guvqqy2be/vf7tpaVkBrq66Q7fv+b3/3k93/4+qLlK/ane9KM5M4rdujZEZsClI2KfbQgdq16bnF9bY24a/Uzi5sb68WO7m5Gi7998wvbmgaNnNw8YtzUzrQ6+je/f4A98PAq0QsSGDJkLIyYAd93/qPwlZfqXuX5/6kASDmyeLVbnzf5N4wx2rFpOEmC5ecRagHqBtbBhoD7H1sm/v6mB8RVa1v1v/z1tlWXXXbxcNr9VVUR9rbsD+qbqka6gee3t3ewV4IRV+zQsLcFFJgWQnWsamh9ba0y9cRz5+Xy+b5l0TB0+MicJbKNWzvwuxvmi+s2d4mSOhS5ogcXHp/O84MiRFGHyIt65dc8sFW/0hLuH+nSCG95MdKezrH+xLfHH3ggEnijwrL+UUYECv73LCAnAgnxZAyW1YmMnUbM1CDEUnCLKp5YuFn0PFE2P/ZO9pe/3LYBYTjp1tvu3rbsibv//I0f/eKDDz32VNuhKtFesbeJA6AWFx9RRejSz95MNuqmCUBv15Y2R1CxfX9W/P2N92PN5m7krBhSsUaooYNMoRty4EFVdXj+v7+QylZGx72Rsl/9X+sVW218Ef+7RsNKgOs6CAXeM0DeDiGFKmLxJjAliSef3Soy3Kl/8mPn5/928x0b1740KZW1rc4ALKBiYJkW/VU/3yt8j9f8PhV7Q+2IdQBUlKJhnkfvvOkXx59ywvU+VLsnk+GJKBUCW3ataDOr6hvXbGzDPQ+sxMJlG1DXNBW+z9CRttHYVAdfAvLFbqga7dXlQZt/3WgJ9ofGlvN5PtxHQKHS/QdP0Qr/pmN5oxaOyGnKGbK5PDQD0PQYbxHSGHPBEVGTGAArb+PBR15AY311PLzw2OxLL71UOOO0Uxoff3Jhh2kYsIpFLF9w399mnXTeFWNHjda2bN/OHXH5MxIKM2aawrpl6/zN29N+a3dO9kLBHzKkRu5q3fC3K65+19XUpbGs4hvynSr2NqkB0OKnotTpF1/18d2bti6ZMXNetWVZYU11ldC2Y3VbVc2AxtYOD4uXbcK9Dz8DLdWAjO1CMU0ohomudC93BroWh+dSIP3GH6rXFQmU54Je4zX63173674O48AmMeA/FUlDGEpwHKotqICioqMnh3jVQNQ3TsT8+ctw2x1PM6sQIlVVw4kGy4s8ZcYanI792TXPL2kfN3KkWv58RKHWtW97+PyyrWzB+ox4x3N71D88tFH848Pr1d/fvVJsz9ddvmVza/jXv9zwfXq8VuEkfMPtiI8Aurav2nXhlddNWbthk71lzYLH6wcOHiO4cnWAWixeuhR/vPlhMKkakLQIJRc6YKIL4t+iIr8YEPSWBvZfvhI5nOc1FtrLFiHn5T/wvL6cnzC5/YA/ZRdT/vdy3eC1dvR/ttvzBKDfQw52Dq/92h6HCcdUFcyTOGeBKhsIqTjIcQIibCdAijASYYgFCzdWGdrNvXfcefeeSy65aPBdd92zL/piImaddErjSxs22x2bVm2ceuJZRxVtm7Xs3cz2ZlT28Ko9eHr5XjHjpcAGDobte9iW7cb+J3awZF0TE8KkYhg6ibO8LJKq2H9uR2wEUL5Itu/as8j1vGD40EHymCknn17fOH6YKyRal67Yhb/d9hQCVgWIcfg0dScyMMlGKDoI4ZSINqKpu4PL6W/WRcjxQW+g/SufmyBPEicnI2izBJGpAIsGk1jg8Q4JAZvaO/IQxDoUigk8sfClqm/99MaeO++8e+8733neAHqdsbNPOYMWPwGGGsZNH7+/rT3o2L+ZpcOYv3xbp/j8ti5xZ1FDt1yLbrkGnXI1MnoTXGOUeveTG32levinbvjbn38ejxmcdLUinf7G2RHrAMqUXkefcsF7l61YnX/o3t/fN3PGUbGW3bv224459NY7nmJr13dAkhshSCk+ZRfSMAxsQHQAweUDPWEJbRcdqn7ttdfZhnulBUeLuv/C5pOB4T/+O3/MfxjNv9JneL1OgL8/zQjwzydGTiCU+GclJqKinYeiyTBT1cg4IbTUILRlVNz7yKqa2x5+tufuu+e3nHfOaU3Dhw+VdV3re98BAxulvblc6/qWbnnRup1Y19qLnBJDVjOQFoC8LMM2qlA0m7AnI6u3PrzaGj3j2I9/44df/ILrOFAJdFSxN8SO2BSAjBfYRBHDhw5W5px82bkb1y9vjSUb62/4xXy2eMlmsaFxDAIhAZeIK2Ra/AT2ocEVvzRlJ3E6bjIaminb4RiCHtx9eL3foQxDJkcY8oFnPkrEHYBN+AhFhRlPwoYPT5MhJgZgb+8u/OG2hTVVMdOdP39+KzEnDxk8QN67rzUYNnSgvGnrUq/VMfD0wyuweW8WgVoHo6oZGV+C5bicV5DijgJTkTSGYH+uR35q6W4/aQxWk8mkkM1mw0oq8MbYEREBUC7+SmEhzeLThf7E/bcsTqd7GVPqUnc/sAwPPfa86HoxaGo9rKIE5ikImVLC1RPqjpNpRTda+Hywhf1bu/9rgXHKu3zf4zgh4D+PIP5d+1dfj8J7SgJoKoHagDT3AMmjwgjvDuimCcspoDPXBSmhYn82i55AQWrQNDz9QgduvOsF9dHndvRYtmdNnzGjftyEUfpLmx/3fCFur92yn63f1oVsUYNi1ECUCWcRQBMDqEIRTCggLzvIySIcvUF9/Nld/oSpZ3z993+84ccDmhslmvOopAL/uR32EQDH1B8kfEnGB1RK8+ktLW0bBox2x2/f1avecddjYme3i4bmo9DZVYAvaFDjCbhhDghlfhPpYufwW0KwcfrdPvt3wun/BIzzn1p/UdD+972exUPP9IWyQKmPUCRuQv5qYJQSkHvQVXiMocjykJMGzGQKkpnCiInVWLRiLRqqdtTUDxqA++57oBXoRrebs4tM1le+uBu9WRmhUIPA0+HmHCgig0qnwLdRpHjM0NHWm8Mwox6F3qJ+69+X9/7h2+/6VNe+veuu//Tn/kxU5rZt/zcP3xFvh7UDKDPRjBg6SMnnC0FHd5qVx4DpfoKgTp88waxvHDisUEB8/kPP+1u2d6Kqehg8FoFcNMPkNNYSTe4RdQdd8DzcjSrodJHzsPffzKNx0PT+oZYCvHyQ6OUIRl4XCWmQz0MoUFGUUgB6kMJpzN0ghGJq0GMyJF1BsroRopJEvqCipmoUmCVg9dY8ap/cAFcZk2+s9lkq3hj3fANbd2ZRKMahJurhMh1EjazqAgTXAXOLYIYAW2EQEpQOxOGGNdi3v0df9Fzarq0eWjN8yGBl3/42r5IKvE1TAFr8NHc+avhQ5b7bbrr9D7/+6RcHDRggSVLk0y46/6yBdAnf9Ltf3TpmytEnPLpgvb94xU6ZqbVgegJpKwstppD+DnxGpJ0Bh/oSD3/IiIM/otoiHv4+It4S/PffCcsPTOn/4+0f7GUw44gjkPME8htV5PgMMa9RRD6cfkr8M4ulm8RvVLgrcxC8cvuMs5GVnACXEafIp/QfPZo6IwGvAkYaBSIrAZfocbIAnwIk00Rq4GAIyRQKkgjf1NFRtJAcNhI9ShUeWrkbtz2xNf7Yi7nkyjZZfHGvh+3dAgow4IoyBIkIS2SILETgB/wzSIEAoegipcYRMhmeFENvqOh3LljuvvvqS374qY9/+D2eTyjNSkHwbRkBEJrPcRx8/Jr3nT/p6HnvnHSs9s6/337vLbfeN38XMdFcdflF76uurronE2ht+/cV/DsfWiH2ukl4soG07cOIx2AVM1wNRzP0CK/Oc2T6UZr5526hxMr7Mjj7vxbQv4zD4xUfUPpx8Dgwp/yiT0KforRFc0qw6GdEDMpH9koTg9G/cDagEuNohELs97kP8gH0nqIkEzU6XMfjjpVCazKf+XyB00HRmMgXJV+k9M4Sg+04MFJJaMladFsBoAUQZB1Fz4KRNGBxnvEGOGoNnt7QiyXb92DUcAleIKPNS0GPVyEXEMyYY7YRsgAh8SoIOsKAIRlq8AoOpFgMUsxALgBa3Lz4Ymun21G0ul7pmFXsbRIBlE98uifTHdiuC8/BcaeccmxTY71I0NHzLr3mW1df+f7Pz5s359r7H1mBva0ZMWdRHqtC1al/TTsYkXiGXEmnTMMdHZIy0eahMS3NndHLuP+ie6OCJRUqiUyU8vOIUAQUqhONOM3yv4454nJ6QIufUqjyfS/zF33EI/2oyAVwchGIxIasIRBEXr2XiIREYCiwAAWiOtXiQKIRbRkBy9bvwfbWXqjJWhq1QiCJoGArEIimTEAQ0tyGyMlIZEnhRCuO58JhPlV1kXFs9BRsVTdj6sFEJBX710083Ad9JMoDNA23//b3H7/uw1fdevXlF88u2jbecdZpTan6hpq2fRn3qaefFzs60pBEGYoadQY4CQhdu6S4Gc3llezAwj8UdhcuJEK6gVSgLFGC8z48LXyBlgrJiJJjoxamDyZ6YCL99BEQruF1EgnwSIAvKBIuiRY/PZX4CF/Zj1BKQcVSnzZvPvHIKHwninNKA0Ifeszg4X2maMHxQ2imCVHR4BKRikJMSYQujGYgOMFKiauQHAFpHJGeQSgJ8Ol9RJHTlWXTWdayrwM9Pdks52OosAy9PR0An/BjDJ2dnV2SpKp/vOuuW955/oUDN27evosigG9/8yu/PWrS5HPvfWglNmzaL8rEia8bkESJMwJxViCqYvNptVev7kdtvLfQEfAQvxTyc1QiTSUQOCfa+UOBAE/UrSBJMB9M8jn3ny8GEbLxdUYA/3hfRFNK6X9fPHRAc6REVEI6pQFCPyIWpYiEISCnzB2P5bpcOYgWv+UHCKRohqDoM2Qshy/0crGVviJHGQghvJIDcMhJU6GXVJHoO8sKil6obt3W4s85eu5ZM2dMTYiCCF3TeC2gEhG8TRwAXWx00R49fVr8zPPPv2jB44/8OGAeu/ehBfvnP/R4G+3u23a1L+nsLLIFi16AExhQ1Bh3GETjVd7taPH3RQMH9fUje+sjgEjgI7qR8T2af6xIR4DEPSIdwIAvPt6zIPZfkfj/Xt8ocP/WKe+slGTJOASohATsQyWWNAkjXQMBzAvgO84BR8F3ZV554MpAuhlDPFUNKBrsMIRNDGOkUKAaUduWkyPSMY9qMFwjie6nbgwxMNH3CALe0aEyjW6k9D17e61zzj3ns6edcuqxtl3ktQgiJY3ESZWKMzjSi4C0wxP7zNwZ08aeed6FX373uWcNXbh4aW8ykRCCIAjPOvOkIeMnTDrjoSdWYuuOLlEx6xGQth1XAKaLnFR+IydCF03EZU+v3L/hX66Ql+9/a5xB/wJin5BIv0SF6gOlJRvhHjjLcD8GYc4+/E/e4+CWIBcgid68f5rddxRK7UKJcn4vQLGQRywWj9iAecE0apvScSbaE9t2eR6vyAof/+WMySSHRh0XDjOOHFfEnBSlAbSzi5RbkHIqOQda/RLt9ilkrF790ae3u9Nmn37a5z6BgiKGoWDqwl9uunHpvpb9fVPVlRbhEegAyrv/iXOPrTrjnHMuovvGjR87XHjosT10wguWhcsvu/T6sePHnvKV79xtO8zQBTnGNfokgRSC6MKIWGpo56drPpIELy+pqNxfdghvfRmgNCjQj0OA5+T0B+2QfGRR6iti0nejD11mC349fusVgUG0gA92iC/7VEQYKsFjPpyijUQIyIIIO1I+jSKSIOQ1AfJKiqhBlSUEvg/XcaGKxGIccR3yukHJcZXDC1r8Ip0jz+cKx6qiQqYIJYijvb1T/d2f5+OUmWM/O+/Ycz87tCmFMZNH46jhY370wrqXHqxrqjO/9c1vPEoksBrRnHNnFGlAHAp1nUPJ5MN19x8/YuTA089/5xfvve0v//PQ4wtWEvef53vh1VdeOmrE6ClH3Xv/UrulNauqRjMcZvKdRSZabApPX8bQG+1CfdJWr4jc/c8umn920b0WXyCv5pcWVd/ez6vztGKI019H0XYRikRvLsGyHWiGBo/QTSXCEe4QXmEM+GBG4/6EIvy9S22A8uAS36FLQCu6kwfsNBpsO3DzBShVKejcKTAeHdCipfYkgaxkPZJoC9zoOSqpEXmRFqJBhUHX4+pKPmNQFYk7CU2S4RG9u8hgyCIkX0Qu6yOz38HW9v3YuGa7m9IDt65KFeuqDDZ9+qTPnnDKez47dvQQDBk45Gsf+vCHvpnvR/9GEYmqyrx9XLHD0AEQvxzlgscfOzt16eWXXkP3LV+89JmVa14qVFWlhN7eTHjuOWdcMnnylDP/+LffWpYniYGkg4Eq/9Esebngxzn5qAXFBPh+RO/9+pr2b4z1dwqvReRBEXhQGk4iMRG+s1PLjsJnrkVIkuPU0QihUJeDymeOh7hpomDlwQgwxbUF/5E+/NUgwX2fpw//UKYvLikKRYOR0TFkAryiw9MALZmEIgm8eEfYAkUS4VpuhKiUNARuwEv+GrUNfYZ8ZyfsXAEpw+D1mUSqiqcxeiyG0PWhayoEnyF081xb2XF9FHttFGwFZmokkoaghkFWbS9ksDedw4pti+zEYy8xQwmtd507++vvvfJa2dCVDclEnNUkDOn6z33mNscJoCgqPO/l0u9vVzusHADl7RS6z5o2dfSJZ5z7yXtv+cv/PP7sc2tjpklePfzQB66cMHHqnFNWrtxut7bndCdQ+LXLJN5M46HggVA/AvyQRbvkwQvh4L//e6Hja0cIDCIfU444CaJvQs0/kVfIiZCDFhtN5wWei8baFO8IMM+BF9hg0Hifvr+T6Z/zvxqNWN9jSojAMiagjIdipXSMREVsp4iQJMeps0IpGhdipSd4vD4RUi2AkH0llKFC0QGF+Z6PYncH3IBBkSW46TTsIIAaSyAQAVs1ufhKwByEvoeQpjYDSkxiYKIJm7qDggLJTEA2HTDf1rudAGHOMn/xx4ftGROavzJ+zAiMGTcGpxw/E4nqxoF2sbv3uus/8UdCjAYklPg2t8OuC0Ch+tatO/Y5jpNdsGDBI6vWrrNUVRVIpfa4OceeMHbsuFOeW7ye7d7bK4qiCUFReDO7BOgtGS2Cfwb0EQ4pMNABMDH1yUUEvIfOhcO4U1BkAZ6TQ0O1gbNPOgZykIYp5mFqB05xfyfwDwIirzgqfOAY8ApDWU+wHBCUJNAkFsK1iijm8hB9mugjKDUjWtBI4YjaeCFV8SO1I3qOSFiAwIEpCUjJQIKii2wadk8XrO4uuN296G7ZD6urB0G2F8zKIrQtCL4PVdIgSQnYTEfO1ZBxJVgsBtBYcXIIYjWjYdaM1Tfute07Hlltfevnt9tXfuRbVlev9sOZs0/9w9133PFFWvwy6bm9ze2wcQDUsqN20CnHz6n5+ve+8jNN05KjRw8fQxcu0Xx/6OrLJs478fTLOluK1sZ1e/Tebh+ioHEyH9srgDGa8492v+gC71dVe9nufygt+sg4IId/5EgpmBY9jeoGJOtFFUGZWps2RBQghj2Yd8woTBlXA8FrhcgKUSfjVbgDX2sqMDpO9J4lDcNyFMCr9IQBIoZQQJMVBEUbhd5eMN8DkX/wVmBI4KSoLUhNSm5U2SexEbuAXLoLYuBAFxgMCTBEoD4RR23cREozEJdlxBQBMQWIqURNFkITGYQg4AVcKnPQUBITFPhMhOsJKFohCgUBec9AoDTrgjnMtKUB+vZ2ybzh9iX2F755i7Vlr/2dr/7ft79Br/F2nyU4rBwA5W6jhg9rmjr9+Hfd9pfffvyXf7hpvqHr/GKYM3vWccNGjJy3c0s3du3sEcFDX40XqjjP3yvM87+yvfkO4LW4BKjtF+kRlIg5+Gw+gWMiXj5CyZHcoevnEDMZsr07IYUduPzi4xBXM7ALXbw9d3Cd4Z+RiPL3Lv/RL/wvjR7wNiNjhD+gIp5KgoCwszm4ls2r91JJqJTgyEwIwMIATBIgSIAXeMjne6HS3IEUwncK8ItZwC8ipspgrg3HysJUNEiBh8DJg9k5hL4F+DaXLvdpYpB0DCXq4kjQFIkXHknrUBUMhFISRbEKtlCLUBsCMTYatjhEX7/TM3/z56fstm75K5/7wle+31/U9O1oh7wDoItT0zSO3KPq7d79bZ2u6+bXrV23etuO3Z6iKPw6zeftdBiGbOvWFhRyJAya4K0/Bg+KGg3VvAzd1+/138jPWg6X37DX5C8WiX9G3IRRFMDR/zSgR9OKogtRLEKSC4DfAyuzC8dMH4J5s0fD0Mp8Ca9/5+9v/acW+z+FjiG15RRqzfHhIxGB56OQySGfy0Wfm39khkCgG8F6OXgAju8gne2F51nwqRgXuIjpKlSq9IuMoxw1iRa0wEVKFRJgFVzoUoCYDqRiKhIxFZpGC95D4OXhFLPwijnAsTmugDEZrhCDgyTyfhJ2WI9QGw4lMQ6J+hn63+58zs0XY5+/8Y83/uTAuXv72SHrAOiERP35kC/88WNH6ytWLP7r1774yV+qqhqvqaquKT+WK/7KhDOFuHVPC2yqTIcSPIKgWgXICgF/Dhp2f1U7kB4cwNGXePGiKLy08GgnFg6U5Ig8hBSEYEPmRUVSAo6AOXzx8L78P/L/RRmI8LIb//597f/IqfQV67gziB7AiMFABtzA57wGtl1AIi6gKuHCL+7GhWcdjYZqEb6TgSoRvXcEuOGjPOVBHzou/M3o30uqxKW7yHGQg6H6CUUdRAse1RwiijBRVvkYL43lUp5PGbWdy6HYk4bCwJ1DJHAcOUV6pkbtv8CHk8vzFMIwVTQNrEVtnQFNKoK5PVCEIpIxGZ6d40NOkiRwdmLqdPiuC8e2eAQQ+C4Cj+YRBI5JIKARrzd4PlwmIBA0+IIKNxBhB1QvUcFCDa4vYNDAUepjjy90jz3m+E/hbWyHrAOghU/h2ajhQ5T29l3rn3r87xsmTxhx5eyTzn3Xb3/24yuzhd7e3/7kG++xisWQagPZYiZLi2RnugVpuLBlOum0k+jw8h7B5CN0WamvzSvSRBxCqQGfpAtLN9Z347srn7Cjx1IK4cGHA6qt26IIjxhyRAdyaMMICxhcLyChZZHp7oIoJhBQH1smCi0REmQuEkq7Gg/mSz16nsOKclTUg8wXGC1QPulP2AQGeIIEjz6H6EGCy6mzJDgQRZvvqEyMo+DEEYbVqKmOw5B7IBd2YvrwGM47aQKGNwDF3t0InB7OuEMhOPXq9YSBQHAQhDSzV4AoFHktwXdpFyXMhQJGBVRF4JLnoaBSwA9BiIOJOmcLcmmBS4RHIMrwEEKxAKEnB7nXhhJEUugejRkHIRJhCCWThdCehmEzJGPVEOg9ZAfXXXcxTjtpFGBthd21EaHTCk11OKAoCGQUPQ2Wp8FhBnxJA2QdgqQglE1AqEIoVoMJKQSSAY8cvmLC90Q4ThGSWIQuZ5HQuxFXOyA6eyH7Hbj43FPVhNp/EOztZ29pGfSVqrC0z1Gvf9yYUerS5Su3rVm68L7TTjt3xszpk4b96cZbNt5zxy1f/uz/fuXmWMwQ6+tqFEoNrv/we6Z95MOf+uWa3S353b3dZqfvIpYg5J8MmSrkYsT3Rzz8/9jmf+WooDxEQz85dJUjYqLhGo5X5xDcqKAl087qZDFn5gRs2bEFnW2ZaMRNDiGpAuBE/fSIXbiE2ONOh3bIMsCHilkRgi96SIRo5aQcpXYcuQeEnLcIAtzS4pUQhBoUYutFDKm4h5hsQ4cHr5jBu8+Zgf29S9HduQOaqSNrZxDChBlLors3DVNXOMknpUjcORE9egkBGdBvEn3bcrhAfX8lag3y4xjwFh0VWCWB9teITUkuunA701AMGWpchagqUEIBim1B7M1AJnomyLALLnzFhiqmMXpMFY4adiamjq3H04vWYM2m/cgHLphkQJFUGEYCokgAJ8B2fLiBx0eGKfDikCRy5OSkS90S5oXQZAkJnXykhdBJwwsyiMsWYoki5kybbp9xwnQ277QTqvhxfpsiBN9SB1AewjnYREnCjl173KOOOmp4T3d3MHXSuMTV7zr3Y0OHDlWsfI6R3JTtOKyzq8e5/trLpvzwxz9Z6Omp+PZtabTnQ5EZScipWtCYf6FQgBoKMBTahSPGG478K02i9dPi5j8OFuqMjPFqOw97Q2pjRaF65BSoJC4iXyhg4rgRSMZdbFizEr6foS0cUauZQRCjDj4vjJWRffy9IndSnvbjLoLDYktQ3jIPAA/FKXqIwEyl2DoaaSaokyKCFV3UVlcjHjMQBhbPrRtiBbzv/KnQWB6PPL0BUtiIRCIFKx9AV+p5bQWhyim/AprQlySIOvH+Uzpgc6APuYToWBGgqoSio4MoUxneQxC4PJKRZRFExhL6LgqZbsg9BBdOwYgl+Vixl+2F29sFoViEJouQZYEjC4u5DPbu2okTpw/HiAtOwlFjJ+GJZ1fjySVrkS866OnpRDEvQdFNKLIBAzI0qv6VYOHRbEI0t8xJXLlLyPLuhKYAxB3iFDqRisvuMdNHYerEYThl7lS9uV7Dzt2739a65W+JA+D5rCBg40uLlwZi0igyEbZvM0HuFTtb9q694PT3XjlgYJOycNFjC5Om1rxm6fPzL7364x9va+/kvSSC/RJ671Mfft/07/74V09nPM/MeBJaeiQxMXACRjTXcPFKp8jQ29UJq7cbvk0tsgPqe686/vsKn5eKWIxyCAriGUUVkVqQKFGeGV2IAYFehCKOnTUWTz7yAvZ3d5CuLs83RWrZ8c0+ovUSSGCv72BEnPt8Fy5/lgj+U4Ljln1TlK0R1j/CMERdAfJYxIpMUYjHHNTVJGHqBs+fVRHwMrswomYgLjtrOkffPbJoN7q7W6FXjUCgGLAdAhRRrUWEE1BXIYTGQ37q5ZMPIwdxABZMBchocCcaFyYHSCkAlWEkcnLUmQh8LhyS7/QgeDkY8SoetYTpXoT5DFTiEpQU7nxEyeNQ32xvJ5xCNScAGTu0DkOHnIJ3v+c4rN3QgxdWrsKmzdvR3pmGVbQ4WIiKHxIUDuaJBrqIFyHkXQACRUmC54u2AzUQMHboAMyYehqOnztNHTKwFg01BkZNHKlaRSt4uw8MvWUOgE7ath7x6NVbW7B5Tw9c5qG5WcXghrrJty987uh5E8cm923evHTaue+YRyeIYL4H4KsE4fWgxZKGZpjJLbs7s0s2b00+tnQ7cmI1BKMaPURAoRtQquthpbMwaJisv553PxjAP7OoHhByPjwKgSWKJaSINptydirE6SQjXuzB0ZNmY/bkBjzw5FbIbABkrYpHHbSHUpGNWxT5lxprURoR7e0U4kcLPSq6RYVIXgzkvIClQiBfi/R44jSkugLVNVzIoo3qKhMyEXJ4DJR9qCwDFFyMaxiC955/LGKxJjzw9BbsS++BGGuCqpoQKKeWDN5HZ1TnoFSJ+ACYDIW/L33ECMxzoCxKE3q0EBmH9vKIiKb6Avq8EnRZ5u09ryuHbJaKeTJ034VGI7vkNAm6TPz/JI/GPB4FGGIAz8owUXJh0Pi25+DoiXWYPfEMsWh76OjKYPfuvdi7rw0dXWkUCkUEzIdLCERqPYohSDmIzsrQppQ8cnADRgwbhJq6KjTXV2H6CXOMlrZWh45jT0/P23fVv5UOoMzke/tDD69/dl2GLdtcQFchDiMRw5Z1ndClDrEh1j567cYenDB55Enbtm3fuvCJe35/0bs/+EMaJSU0GXUFPnzt1ZO+/u0fPPrc2tbsoyv2Jp/fmkFLQYeUbASTdRTyFmRDQypeDcdyUNxTQMjx3/8GoWcJBMNRbBxeTNNlATza0WURHoFZDAkpkwQvAxw/cxCeX7oKe6weqGoKHs+ZRU6lXQru+evyBV/e20vEg1GZgCKCcjpCO3z03lEbMEoBIviyyKMRmgYQWBExTUBV3OCtMz6wQw/3LEAXIbpdGFI9EFdfejzqGptx+4PPo7W3FY5r8uq4oKjQZQLwEGMP7eKR9l80p8+zfx7mH0iZon/jsN9Shd5jNAEYOQyqJyRkiROCFK08CABAuzsN+JADDXxq1WpQYIAVQrS17gaC8UjFJTHgFG0+YikdfmDB9gIYOpAYoGJ48xgIGA+BF00Bzw0QeB4fiCZHGLIgO3BkXfIdZ53d/H/PP9cmyzIfEaePTOlgxd5CB1BG8z2/9NmXlmz3Jzy3thu9whD4Rj1Embj5u6GaDC25fWh5oRXdmR3JQIkn3/mua35wt5LAxRe/54f0Oh/8wOXjf/3bP764Ymur/cQLe+NPvtCKLr8GYXIwClQMYyGKBEMt5BHqEiRqJ/K8+sAu+mqEnK/kHnhpSaLR1ohxl2sGMp9fgEySUSykMTiho6FGhde5FdMn1OKUuaNx61N7UXAKkJQU/FL8QbsjH0/lb0ZQ2gOAGz6vQLFCadqPuwoeVpenFCMKLV44LKUFlD4Q6Iby9eoqEamEytcjjxBoFNdIwOvphpzQoKYCaLk2nH3iUIwaXYvb71uA7Xt60NXrI1eUIOk1EJQqeAGJbuiQRANUIuAdi9Ln6cu3y7XKUlsySr0pcSk91mdQJIp6CPwjw+cgnQMXHDnEzu5epFIhkrEE01RF7M31rKubPHOSrCh9xeA5s2ZUL3hmQZfd0dGbULUq4iBkoSsKochEmjYyhFIhkGdiKNo+k2SReV7BsSzrUGF1OWTtTW8DEmOLy2qqd7UFyAZJpJrGQIk3orsYQtCb0FXQEMRHwBwwDS/sZfjZbYvxm/s34OgTLv1BMZ0J0u17g2/+4Ecb1rf2iIvXt5gLX9yL3rAOctVIML0Olkf5tgqVJswIBuTReCyVgqNd9d+1yEFQmKtQbY8X3jhEl2oEXhF1tSZSpoBC53Y0Nmo465SpaEgwwMlG4F1Gz6UqudLvppZ+kuYevUsEguGuisAzIvXh+buX8pbyd6D3pteLnhe1BS2k4oCp01x+1OsnenN4IZRkilN4e9n9UFg7arQeTBsp4xPvnYcTpyYxfoCHerUTBuuA7KcBLw/Rs/mC5jBbyPAEhdc7OHEn/eTDSBpEgRiEVQhQIQkqJIkckMzVlJjnQQpCqIIEndCIJepx8ksUQeixJK98FN0ANg36iJJI4fz4MSPNdc898iy1gRcvW5GWFFNKDR1VqzQ2S+//yLWjjMYGfP6rn5/xvus+MFJI6lYh29aez7a3IKXmr/nohyZJkiQtWrI0/QZdske0yW9my4+q/rvXrNm4vjc5cM2mF5ianChm7ByKgQAzrqDo90JQRWQYkCkq0IwhkBTgzme70dr+Ij753mmiZBjoyjMs2rQFz65vQ5ol4Gv1COUkcjY4LbXjFiCHIVSZdgeHj6WSXDjciBC0/zRcuQlHbSRu5TIBr/JHE29EcEk7T1I3IRTpwqfZexLKpS51CObnMbi5ASk9QFVSgd21A2MHDcBVl56O7/5hEayMDrNqAAgqY3kRhl1WYyAQY+DbEFhJgbeEVqT2W8nf8BCbOwE+BlxGEkWNQRLqDHwPmkGKXUVMGjcI9bUG7GI3dCriqRTSOxEUl4OACDvgg9lFyKGGQTENH7hwFl7a3IrFy7Zj7bZutOa6ICg+HDGECwMh9elLqQu12Si6KrlCjhOg35xikVf/abcnii5FlTkvoEh1Uyp4ck6QCNLcV+0QFfghYGhx+HkqiijwS+N5L760wRo+/YTjUIoC+PkpsQw5ju2l0+md8Zhp/vIPN754611G7JWuNyoSV+wQrAGEsqq0dRfgUU+XNijYpeIY5bpUVFK5WAQhuCxfgOUypAQVi7e0In7PGlx8yRS0FHN4ZnUbtnZ6kFLDEbgp5Gk2VImQgzxnpuJVFLyX0HSvba9WDS4ThxKWwHd9yCWYnONbvABIpBee4GLwgDiqkwq8XJrv9lXxAEdPGozjpg7B8pd6+Ux7wZH4+GqqdgD8gCGfz8PgGnf0WSl1iXDztLjIGVAEw/N9/g14pl8qv5VD7egE6tROYw4aG3QOlQ0KtNCpQ8DgEoeCSCg/ih98SIQjYDQ4VOTRhyHHcdKUIZg8cjhWbGrHguXb8OLWNnQ7aYRCLSyH+BRoV2ccTUkLm3cFQgGOQ9N+VHWnz0bISAmaavBPSAuX2q+EK6D7ORS75G45QrI00+AziiUU2B45NuVlUOX+56NM2HL3g4/se2TQoBGiKAjVqaSgaLpQtKywUCiEpmkK1CGiZ+Vz+bDsPCp2CKUAezt2r9m2b5vvy8T+6iFgFiQhB5FloDALAmyEMoMvhSgqDFk5RDpk2J318NCKLbjtyS48sKQXm9s85MIaZHwNHr+QqMBHKDnKqynkjtpu/MZ77lHe/Gq3fyDMKOXmdA3SjiWHEhySHKcWmUxL0OEOS0GAakPAyIEpxCiid10ecTAvjzGD47j4nFloTrgQrVZU6R6SOlDIdNBOBsMw+Cx8hPujth81ywgvGOXalP9HFvHicWguDsBz6W+NQpHAQVwPMWxIDUydEDw2p+amQqCPAL5EGn8+fFI+FoiFJ+DjuKLvQXILEO1eNMQYzpgzFp+59mx88kOn4LQ5dRjWkEdj0kaNXkRCziAm9cIQ09DFXshhL6SwAEMNEdeVaBjItvnADy+Ycq5wtQ86zBGOpQGhcpgliVTUpQcrcIkpSFRfs01LTu3TH7tuJi323N5NrGffZrZvz5bcFZdcMJGOxR9/+t1PdPe0s56eLnbKCXPq+Hvw6cOKveURAOffE0XMOf60i8796Le2ifrEkUwUOMRVpt2FWkyM5KEoXgyiMVcOnuFs8RBiMXQ4Hu5duBYFDygGSYRaEkU7gGJQ+4d2DJuz5EZcc5HMFy0Vosd+vbWgf4gESq/FvCgEhkK9cg+SQjz1AoJiFiMaExjUYII5eYSUs0gK7GwagtiOudMGYdcZk/Hg4+vQlmlBLDkQBSeS1IrFGniNgrZnLkUm0o5aSj2oE0AMQCS1wck9eYzEFz/HNYO8DTiRRj6TxsixMQxqSkBgNjUmSg6MIo4DPU++s/Z9tSjq4gVFJwuPaLL0PGpiCRx7VBXGjJyNHfs9PL14Pzq6LezZ24audBqezyDKJlQ5Dpsku4pFyGZtSU6FgD8qXFZqF5bUhSnfp8gmYgDlEEn+U6EghTvAKFOQ6Ni9gsViplBTUyNecNapR/34l79ekdm9roPUX/SGgfFv/u+Xzr7rgUc2DBk0gEozcHs782pVTfxt3No/hFOA0kkp2DZ8jfDtKnzQxB45AFpbKlhAFWRyFgRPLfKLSuFDKQIsKQHPM1FwaVmokEQdIeX5cCFRld6nEDdingF/XdqNPERNIh5Yl8LQ/oQX5cXRf9cpEwOW2nWc3JIGTmROieUwG6Ya7W35bC/GzGzCgDodXrEHChX1vJDnx67ViVhKwWXnzQSh6G+evxAdvQVUN4xFIQiRzXfBNOK8WEbLNYIWl0P+aCIgSg9owVOvvTREQIg3FiEB6LG21YthQxuQSolw3TR0RURoBxBFFQqUiFGX1zvop8iBO9y5cEZUDaISQvUY3KAXfi4DVRXRpMtoGFWLaUNno6M7j5a2JuxuacOuva3YvrcL2/fsAsIENLGGRJmgSnFIMgmvALYfjf/Kos7bdXRyRXLCVOsIySV4HGNAMuOcVIScBwF46BiUlIn6d41OmntswwOPPdnmd+2G1bbDjyUSDfxUZTrxjW9+eeE3fvBNHoEgSwrPQEdb+4Z8vuC+XSf8DkkHUD4Zo0eN0lSpRnc8Hb6ucykoEuckNBhveVGhiXZb+pvw6QTwIDAaVZzNqNDHRAN6LBXRfbk5+F4uKvhxR6KWFn8kokG7Ao2i8jbUPyH4Pnj37yPODAWooRJNvsGFK3jQKEWxCjBlGeNHDUF1QkGYcyEEIkLHh1qd5Cg4N7sLpsZw0TumoxhY+Mv8xXDcbsiawguCRtyE4Jfeh3cZomp/VCyjSQZa6JHCT4SgLE0zERKXaK18G3FTx9hRQ6GqATzbhslTh2ixSzyqokZDFFURzz5PISifp/DbL9A65A5CVWROyAlmc2iz53UhLnUildAwttaEO3kceouj0drlYF9XgK6siuUv7sWqDfuRdy14BCSKOL+hGgpEXyiNNJRTMXLQDHJI348Ymqk5yjjvX1zTCMwTUNpSpiIvH//unrS1dfPaJ+qTxjRdFms4SIkcmCzBK+R9lu61NENPwjTRlimuPee0c45dtW6DVXYgFXt1e9MSpEiEg+HJh5/MDh4wZWChIDOfqbwN5DIabHHhsyKXoqYQXg1F6KEG3TegOCZEz0Ao6HBBIaZOg6UQaYfh1XOX1w5EysvpFTnTL+3PKnwqKPJC1AHO/FeyV2LH7cs9QxGKRPJcjIf/AlEQSAyum8egAXUYObQJShhx4olGHKGsgxWjKUEVWbjWbtQki7jgHbPwzvPmIW7QSGs3qpIEdKHWRUl/i2YB+M4c8enzejkf0CFQTrQ7lkFAvCBHunmOjeamBgwdPhCyTOmUD+a7EKTSl/VlCMyA6GuQaZBHlMEIKSgxeErAC5iMz+4GgJtHkOtCaOUQ1xTUpWTuAAy2B4q1BUp+M6qFdowZIGLe1GZceOYsHD11GDSBYNYWh/UKIoNEmotctSgSViiTsUZjRjTM5EXtTs+GRuAA4gSURMTiRtVxx8xKlRd+ufL//MpVuQ++74PvqmoeWud4di+HIXMnyKWJoDXUJ3fv3r1k5fptfzv/7HPm0OInlGFl8f9ze9MrJK2tPatopFX1i1DpQg2pGKjBEiTYXBaK7nOgMp/PlBOOPlRk2GHAoZ/xeIKHqNlsBpZdgKxqvPUXhLT0qXtAOHbabaiV5vBwk2CynJ6K76QHdoT+c/kR2o9UdQ4g//jFy2fgQwSSi4C4ackxiSZUX4Hi5zFpVAwjGlUIdo6vIUGMQZBNBEULHlXaDRepqhC57s2oT7i47Pw5OH32SAw2PNQgDzHXDZ15vJNOC5rgxTSW41LrjkIfmXa7aAJPkEj+i9CC5dQgD+Z0YPTQGAbVmNDcAArNvXvkAA2AlViRqN9GcF+F2JO4yBYX8JRVgaZqESqk0Es1AECKGxA0E6HlgfVmAXpPIulQZE7IYYRZqG4rwuwOxJCGLtiwCznOvajEYlB0DRJhBmyf7/7cWVFtgC9qBUyg0WeRRyO6JqCYT0OTQ1HTNGbGEwO//b+f/x4tfGob03OHDhkkn3Tc3GrDjMnUeZBEUxRlg7dSHc93i0GY3b6r5en3f/wL75g1a857l69eV6BiIakSVewQdADJpCGZYg5x9ED3ctC4znwMhVCHrdL8PAXvDqTAhUCiv8xDXnbBNGpBEQV1BqJgw9BDSCJNogVwPQleaMBlKhxauTSkExYRsjy00IbMCDOeh0sXOYXStKPyKCGC05If8ELaDQOeLtAtgr9FVFoUNruSjUD2+bSc6msIMz4GJIB5M1IYVONC9YpQFQOUo9DTpbgJT5NRkGxYbg9U0UKYb8EA3cKHLzgOHz5/DiZWhaj10zCCAiTf5lN1VEWn6lioMYR6AEVTIMsGFzQJGEVJDNSMIIcWBh2oiqVx9OQ6DKpSIBUDyJ4EVYpBCHUwgebmVYSBh1AVI9FNj44bTexFwiiuXwQj1t2SsyHjZKNGAmG8FiHRa4kxBGEcAUVd8GAIeaTkLFQ/DSvTw7kMAsWEHSooONSBUZCQk1CJQ4AwE7yLQhk+ITI1+FT9F0PEYhLy2Q6YqsyGDBos7tqxe/Xx513y4TJmhHb/VCwmn3n6ycdu3rajlxxIEOpMNmogxQjcpKrJxjE1P/vh9z+5YNHzaVKGKkPNK3aIOoCm5qpJgwZUQfTz8Kws53EjrnZRMeDwwrQCRdGgSoRxj8JAxyfdNw8yTX4V8pBciw+OyFRtdh2OYZcl6j8rEHhhkcJ9Cp+p0ESLOKpRR3P0Uf7MEXQlku0I0EqOpyyvXSICKZGH8pBUJCZajQtZBHYBrJjGtIlDMGZENUJCz9GYLElY8yIWofDos0sQQsptI2orOSzCz+9HfSyP808bj+veexwuOnMM6uNdkPy9CIut0IUiEpoGAyoUT4XoaggcigAMhIzUcWJQCX3nObwNN340pSAJSCwLObAgh1QQDSAaRMGVR1hog1inw811wentQaKxiadORTuE5VAXIQ6IJkIqXgpE+iHBC3yKlSCpVPQU4HMEYFRBochKICxBSC3XKF3j2ARSMBbkqG5BMwuspKrEOzylcirvZtBrkuYf5fadGDl6BHwCFwkq6hubms44+cTGci2mrrZanDxjWvOjjy5Y+qGrP3AqwYuXLl+j3nfPI37AFKzfsP2B+++/48vtnekeSjEtywori/8QLQKW87pbb735gwNGn/BbUQpMGiHlu7XDIAd08RCQh1qGRBtFfW6B49w1UYFCxatCEb0dPZyKqra+EaYZg1sSqKSCECHjaBn7IQFTaBsm2KrASSSoxUitNgpIOS01l7ZGX7GxhOl7eY2ghLcPqUXnRXr1xGIr+r1oSAk4ZsZoNNfH4BR7YBLwgNKMgOC+tAAkyD4tWiogitxB0Rwhc3JwCrshxfOYMMZAfdNoNDQDL7y0Hxu29iDvBAhcH4qnQxYI5KbAdh1oCeqAFPkQkq5SmJ+BZ6UxsHEkmhsMhF6aI/hY4PDBIFERIGq04IoRolByoMeT8B0PluWhqm4YoKlg6R7eBQCz+HEU+Zx+VCjktYlSh4SASdELlXkF6bjQsSX+vah12b/oTilKX8n1YIViGiriPxQUCg5ielw0kjUsFq8a+udf/2bTwPETqokHcmBzo/bhD3/gC363ZR5/7nlX7t+Tce9/fFF88bOLsmPHjk7ee/9j3/vOD36w5L9+8R7B9qZFABSqU3j2sU9/7uZEXG5V4YmmQuIQHheKoLUjk4pPICJwSOQi6oWrgshHUkXHQZDOwO/tQaFtH/Jt+yAWsojTEiE0mU/rnVBgUWjP1WWJrlpQ4FA1mhBrfEeOSDei6noJNERDLCV12r6ogJNtUiGLChHELpSEwqiynUdSs3Dc7OGYPqEZMiux1dJj6UOIfuRUQgkSqRL7MchIILQZmONAV4hhqBf5rg1gxU0Y1mjh0neMx+XnT8TZxw3DmGYgHnTAdHtQLbqo0YDquAqT4AU0JWdbCAq9UNwMhjbomDymESmTJLpzUHUVihnj6DrPyYDBQqi6CJ0u6EmV1zfSHV2Q5ATa9mVx++9uw7NPr0ami7AISYSBgjAQISkKdzSUGnDSomga+OWLl8uzhxzxx3kGecRFMOkI0hwNMkaLnzc1S4SpJX1jfo5kzYDjhchaLl7auANZO2SeoO886bjjmmjic826TcW5c0+77u6nFvykN1/seXFLm7u7w0ZHLhQ3bN4Lz6NvBA6oqthhAgXWVBWNtaaqyx6swIFfyMMwkvAJNkpTmwHVv2UOuaX92nEtFJ0sglwWYboAQnjYvge7u5VKYEjVD0AiXo28QOSUETstNw6iIaIOBt8hkBFn5ItotqnVxIEyUbuM8/1RqY9QbDxMjXa7CD7kQxJjEKEhdC0oQS+GNAs4+dgRGFwvwS/0QpUilh8qPxCFVjQVJ0Nh1JKkoQEKDqjX7/Ow2jQBRfLhsx6EORuMxTBz7CCMGTwLayd2Y9mKFqzf0Il9rduRzYoQktXIFwPEJA1GTEGutxOK0Ik5Uydg7qwRSOgO7J4CJM+BrMo8Zw+J2Yd+D2y4Hs1DJFGwHKixahQdEX/80+248S+3Y+zw4fjMx67BKafN45FAyAq8sk68AHy58loJpUClSmkfOUkE43V5z58WeIRK6K9bzAuVNANQkmWJUrFS3YU7EEDT4rCyWdx93xPi9KNGsJPnDp925y13t37pm1+aaOd7xSnTZk7/1Oc+/5cVm7L5hxatju9oLcILU/KTC1/wzzz+2NOfmjx51Zr1661K7n+YOAAS9jTkgI0Z1oAX9hUgwoSi6DysJz04OSDpKFKOZQg8G14+i2K+E36uAMMWEDdV6IKCgl1AobOVZ/Z1apxj8m2SkpZKYhm8JyAi8BnXrqO6UCSZXabgKqEDS5RSHI7Lf49iAD58Qx+YLlo+516A6HejqSbAzMmNGD3EgOz3gnk2ZEXu691Tp4HHGBQW83SApv08iGYCEHSOuqMOAQkWkc4Bp8v2cmD5FhhCFWZNqMbk0bPQsr+ANet2YM2OVmxu60RrRw6uA04xJlrtGDTYwInHDMfAWgl2uh0xMw5WJPxDDFrMgM9oxLcXMS2JQMjBKwRQ9RoEQgIPPbYAd9/7MNxAxpKNO3FFezePcgjByEsfVGuhXj6BeCI55QPHg6cAVFeRwBhpNUYUa7xjwrEX0RqnUkhEJFaSMu7TF+OsCiUHQupBHuLJeuzavQ5/+svdolM8kx07YwT73Q03rOcXDANWb85aTy/eHH/smbUoWDoaBk7Q16zflf3h/37iK5u3rlu6au3ah2ljoWurYocBIxDx800/ajxW79iIVExAt5XlrScOuKFRXt4itlHM9qBopSEGBcRJbFKRwRyCujqISwy2m4eT7kExloaSUmEQXp846jibjcfpoSQipLAdXhNgFKZTREDOoY8ejApQHKLC0XFc377EyhNN8FPHwOUFN1NKY9QQHWecMBaNKRes2ElcG3yx03QbjdwSAk6kYmBfxKtFBTFCwckSBInGZ0sz/V6EgtMUou4uAFIAVbVhmAUkRsoYOWIwTnKHYuv+DFq7XOzcsh+tLftRlajFMTOGYeLwGIJCKxTi3vdlLFmyHtt3d2Dw8PGYMH0KaupHwnH3R4tUJEdbhWXL1uFvt9yFlo4sdFXBpCHNGDh4YMQubDsRYEfqt26jMID8WinJj4p7ERsScQdSehAVXCn6igRFoh59VBPoN3nZR7gYYR35iJNmoGjnUFU/ACvXbkM2d7u4etVYjB5el62tVtCeseVVW3rNp5duRUevglSyDkywkcllxAWLVtpZ281QATDSPqjYIe8AiA+AGGJnTT4Kq7YxrN1rwaKqsuDDcTz4ngWv6MOnPrqd55VzWfR5VEBVfJoX12UHMuWooQ0n34OuPbuRaAwhxFOQDREaT/+p6u6hWCwgLGQg8GGhaNqO+tpE5xHN2pQHVTQ4fgCZsKwccUvwXw+KSD3sAjShF8ObAlx49hRMHJ1CmNvOPxtBf0M+My+iYOdhmIQYLIFUbBK9IFprHzTG7BeKkBQJcqwGfrEQjdMyl2MdZDOEn89DMWksdj98j2oJIlJGHHOmNMMJDGQnD0CuN4+ErnK+/8BrBXPzMM04dm1twZ9ufxDLV25CTcNATJ19DC688B2YPXMYdDMJN5Cwe18W9z3wBFau3QJZEWAHHi6+5BxMnDIOkD04xN+nRaxDHBFJ4C2P1H1LXRE+1ntAn4BCeJLvjjD//dSMSDVYprYj8fRFbMg01lxKDPjz6WWI+IPgw3nPR1w3AT+F9VvbsGd3i9hYqyfh5+BLMbQXYsg4JszkYE7uEngZtLUXWEdXXs90Z3JUX6LrihOcVuzQdQBE6VW0bTg286lQpgQM2Y52SHqKh51+0YZbdBEUfC4ySZV/UQrBAlpIEkRJR8xQ4RYJQy8iVa2jtbMI38oi10V87zaUhAqYIsekEz6cwCxCPh3NwXNy3ajdRwNCPN/nOxFBRkXORkzFKdcpRguBqL4IqeZ2oyGRx2XvPA4nHDMMQWYLQqsLhmbykDYg4I0sQ6MoRvZRsHJcHESXTM53R3B8gg8LOuXkIRHzE5kArELAeQuJREOSA05fTeg4AVQZJxbzAEUvD6uzB4KYQJVUjYYGDUJQQFDIQJEKHGMfuEUUHRe79/Zgb9FDx+59eGn3fDy1dDnOOeFYXPau8zFx8lTc/8gfMf/RhSh4DLosYvKEwTjz/NORqjPhub3ccQlKCM8mfEVEBRZBo0u/87NY0gano0gOoCStzhc4ZUslB8CZgHgdIDr30WRlRAZbvod27qJrQzV0FL0CVNlErEpB6Npo785BVw24hD2QaxFL1MAmrIjDuOqTbNToi5avs66+5PyPPPv8wk+tWbeuWIH+HsIOQNc0vvg/87HrTt+1t7vxicUvsqeW7BTzYgpqMkSaNOUkmYeaMiNNe+Lzp2o6VaNpMZAKDuWlIYq5NKZPnQVd0fHo48thGHXI2XnYgQ/L8vl0oKMwyH6AsMBg8JyWaDai3Z/IP6jOR4M9ZcZb4vejC66QJWyCi7iiwwuo4p5DY8LCOSeNxrmnHgUvt5k7hFTSQFggZGEJb0BVfyZy/kEqSFE7LZrBEXnhr6ezHbX1Tbw9WCw6MKuq4OeKkDQNlmNBdAF9+FgwWtg5whUwOFaBd0FozkEAtRhzED2qmxDLTiSaQQy8JNoxePhgnHzyLOz6ewfSBeItkNGybw9+d/MOrFm7BceffArmP/gg2rsziBsqskUXx8w7BsNGDIJrEYGIB9lU4dsWX60qfX/b5Yo8fXLfJeOEZoQX8Bkc4uQrfU+KWKibEjmEaJ6j9IRXUF8n3kI6fnRu6TmEDwg4ixGde6qr0BAXwb89Ruci4hugKNB2PdQ1DFKXr93Mrrz0xGv/esvfaj/xkes+tHj5KjpwkfOq2KHhAHjILyuczvnzn/rY2Weedv5Dt9y1ECvWdSLjpWDW1tE2gsDKQyU+K6K5JokJyt+jSX5enAtJ3Tcowrbb0VRv4Ir3nISt6zfgwXu6oMhV3FHQzfeoDx7AlQMwx4PiqohLJoqcOC5q85GV9H6itiHtRooMlyviuKhNqtCRA9xOxCQLJ88ejSvOPwZOehsCuw0NVSrHA3i0m1FHQYpaZ6QUpAomNJ0WuYV80YWhxaAJAsxkAh5Bk2UdRao/EJNPKokX167HT358E+obNLzrsoswdfIkBJ7CC50KgY80Eb6d4wMyBLyJhoaiFINzFfCFGCCWNHD1NZdwctX5jz1HugoQmQYpjGHR2lV4fu1GzvsfAaWAOUdPxHsufzdfpMR4FNGm+JxJR9UiyS+/SBWRiHCPuid9WTYvCEpwaYLQIY6BiN+f1wrp38tz//ScPq7zfpJnvDXIBccQlpiGo1cnwBOlaYTslDkYKaQJ0VDmbEJEShKJvRJMWkcgmfovbrq744E7f3Tx8GEj/nfh4mVpEost0nxFxQ4NB0B5Gd0+c/0nz5067cT7f3fbs+6mbVkZaqNYFa+DEyhwiw5imgZFKglulAB5UV2HdptoF6QWVRikcdyxUzFvZgNYdjcaqkRYbpaz/2ap7kzU0Bx1R6QXPpRA48WuIPD4qHE0UUe7TjSoQhYB1mg01UaKsDdOJ7o6t2JAVYjT5k3GRadNQlPMRtu+faitN2BbebiFHFLVA8A8FYV0GqquQ46RiKmPvOsDqgnZ1LhGnVPIIK5ryBFTD8GaRRVFP8SOvXvw89//EQ88u5GyBF7in/x/48FYRMpJpJ6BTdGKBoE7xkjCrFxW561NWeThdi7Xi+aGKnzwmksx+5hpeOD+x3HfQ0+jJZtBXK2CpOgo0MQewY1dBzX1DaiqqYdC9NtyFnYxzdMdCsd9x4FAKZimIqDKOn/P0vtyTcSoYMphyTwFkEusQJHD5sQfnOG4rLEYTTqWrYy+jP6VCrNlFaQIv8HLCgQjJqfNuzP0HB8yj0RoEIjB9hg0ow6b9+6t+d5P/tb7kY98+ivLVrzwoQ1bttiVVOAQAAIRRxzt/j/8xtcvvOnXf/rS0EHT7r/htkVsw25PlmLDRC05FJCScFxK1QMu7xyt+BLzDQs4RJSGfERJgyAEKGT2YcSQKlx8/lwIvodxI4Zi7uxxsDIdkOEQWQ8odaedQmKEeS/N2DshxECCwqi9WNpNiD24JLJJoTQh6Kg3b0gOAqsFIwcoeMdJ43HZeTMwdoCGXMtWVBkSNE3ndQpJNSPZLt+CXpeCFNPBrDwU1QCDhmyeIeMokGMN0LRq2AUCKCvIZknJ14SkVmHB4hfw2NMbIRMzBoCuLPXpk7xWQu0xckoUxXCILhXd+A5IHQYqdkXDNTY5CJHqDyJymVaokoUTjpmEz3zkavz+R9/GKcfOgu0XYfk53qUwYyZkRcfTC5fhK//3bTz73Ap4vgCzqpHfL1I9ghf/qCBLaUbJ2fSpppd7/NQBCDkYiIheiPqrT0Gsv5Uol0pkxqVbuT1YRhvy3kuf3kEkPiLzzgoXXuFdG4cwkURPyp0Bb+aqcRSFhHzzfQvNnpxw5d333HP3iXPnVJGoLF17FXsLIwBN1YW8lQ8njJt2VSo+5PyPf/FHrhUfqMrJYbB9E8VcCRWmmFwiioZbAiqYcegtK130kSIerySzEA11MZxz5rGYOWkocj1tGDKwCqecMAuPPb4OhVwvRL59RyEiRx5GcpxwHcZHeDkUl5wLjQfzi668rzFQK18KbU7iQTDfay47A8ccVY+h9UCY3YcYTRh4AYrdGcTMKigxE9l0msOKY6IOVqCxXkCO1+CJ+Q/jT7c+AFdO4KSTT8A7T5iOuOhCT9ZAFhkcW8WGddtw733PIG1HfYgxg2twzHHHQ4wbYG4nPDsLTY9oxGlGgqPrRGpWUj2DdkrCF4icRisMZDDmQuKYgjw8L8CA+kYMaByB9Tv3Y9mmDehOFyAqChxXgKLrPCW7++5H0bpjG95/+QU489TjoJNCMHOgEVJJkuAWemHoUl9OHUVKpRZeeWKSU3vJPA0KPdrNyzt7ufl/YI85oHwUiZ0Q4IjmCg6M9pYar5wzkKjYic+AujUkihr5Ck7DwsGZxB0pQk00obNjm/rLP9zZftuvvnq2pupasUhj5RV7SyIA2j3isThf/F/6zJfPb+/G9C99+wYL+gBZMQdzdVfLI++uQzFMnmvSBcb5bXj1WIYsS5AIy845PXy4bhGyYOPMk2fg4vOPg8RygNcNSXYxacIwTJ0ymuPfacxYpn52QFJRJCut8DFWGm0pq35Ho/dEhiGWIoFoVyInRFRanmtjQHMtTj35WGhKEVbvLqhCHrImQtA0CA5JUYXI9GZ410A3NTi9nRzvI5km7M4ePP7oM1jy/DYsem41fvCT3+Fr3/oxnnn+Jezel0N94zhISh3m378Aq9ZupglcGBKNvTbh+OOOhWv1ICBeBJGKcQ48VgQTQy4txok8+uXPrEQK4ttFXrwzNYIMazxsDwoWOva24qmFT4EJLm/LGYaC5uY6OIUsX4yUci1fuQ3f+PYfcPMtd8J2BU7OaVO7UqJoJ5pl4Mg9KuiRgyFSkZKgKa+gkCSYFIF7yFkR5JpjHHgB8AAykOsclLQQyaLZgRIDYpnCrVQnICd9ADdUYhPi488RnwBlbhR5kPovaRjEqgdi647O2u9+/8/+dVdc/8tFTy781ZwZMxKUGnFy1Iq9eREA7bz5Qj78+ue/ft6sWeff97Mb5yMnD2G+lhQti8giXMQI0CO6/EInWmuek9PADjSohN+nCrJvQxJ9mKRaBRezjhqEa644GdUa5d8diGsB7N42jBg5EkfPHIMN25bAYwVIrgKdyCDoUqEUQqPNhcGni4jUegNO8cmhwMQfSDEHLSqqZsuiAiNWh137u7B81TrMGkeTbVQYI+JSFWIoQ9cUPgCjEoUZVcg9D7KuwrOLYKkklGQcTYMGgYmriKKUzzE8vHQNXtiyH6NGrcOcObsxathYPPHYYpgh7ec+EnKIi8+dgcZqB3Zme5TKKBpIyEjWYnAI4kw035wHkB8o7rxIDEQgOm7+bSU+dcg5+6QEJC2Oex+5HQuXvQTfIJAOwzWXXYxjZkzBA/feh+UrVqK90+cB9c6uDH5z093YsmsPfvCtL8POdkJ1aXHrYLbEC3wRlwJ1HHzeyaBFybl9aQ6DCqFcNIWOFz2S5JCp7Urcf+VdPWoJ8uJrKVXgcxmhzGncKGojZ1DiDY6ERuitBAEusTGRC6EaEYcZRqpEfJaMQ7xjgNwsP7hoB3qt+CW/uOQCMEH9IjkSKgoSWenbWf/vTXEAZSjmn374g/cfd+I5716/rmPuXQ8vx760yJBoEt1QhUFDK4ELz8mC4CXEXEs9cEFSo/FZLuThw7ayaGxIQVMCtO7bghNPmI3r3v8ODKgmfsAcQiHa6T3XhawLOHrWeDz2zBrsaE8jVtUMOxThUu2AKvvEK6DSDkpQHbro1IgKqzQURIuH2lfUBbDtAKZZg3R3G556ZhnmTDkTfpF6/NTzDniLKxRVPqTEQ15GbasAsm5w7Lydy8JMxXDZlZfDURO49Z77sKe1wB1BujWLzS0rsHzNbjSm6tGS7oIq0EUPHDdvFKZPGQMxzCFZW0P0GQh6HQQlKHFIOT+/finsp0VG1GkR+45n9fJIRJANgBiSZA1qvAF7dnXg0YWLoMYUFIoMk8YOxTvPPgnzjjsGx00egRXLX8DdDz6K5S9uwJ72Ira3FVG/cRsCQYVGXADMQuhSGkWsTYSiJEdNdYwI5chxQlwigeYqorYqJy7h1G4u5VPRhRGJGpScwMu6iX3ngRPBUpTBNQfKUKHy9CERikazmuWiLa/tkLYgORiCVTgCVLUWFtOwYHWLe+3n/5796fd/9eAVH7r41O3bd3p0fKiXXHEC/2hvWHxECD0a4fzfH/zwpqcXLdu+5MUt5rMr1rqSWS3mbA+MBCYUES718XlIS+SUGl9QHhF60G4nGCC1iEENNZC8LNJtWzH3mDG4+vKTMGFUDKFnR6O/PuW91DJSEVoFTJs6ClMmDScsHlQKSWlXgQFdjvMW2csptktWHnXl8PXSNBsvVhGngIYXVm/Czn1piEo1vFBFUKIWIzfCGW14Hi5GsleuE6U+CROBZ3GBzuuvuxI/+86XcfpxkxGTGRKqgKQhoyfdipd2rYWsUFVBRaomgXdcfBlGT5qHXFFHV6cLP08LS4emxxHaNHMf1QmidCWSA+OnjiYcSYlHT3CSDa70LerI5IqY/9BjWL1pNwrFgGsWXnf1ezBryliI+R4MqEvhgnNOxRc+/RGcdsIsjB2WxKA6CUeNH43AK3AWpdAv8ujn5WW9l5OpcuZvTkFcGqnmm7PEUwKeFvwLpJy0OAmf0R9NWC4a9td0Lb8iTxM4f2CJdlwQYRDikYnq4wuXVC14euvx3/ufHy3YsnHj4w01NWKkF1EhCf2vRQARP52DCy+49LTd3da5Dzzzoq2khutFn8JFDYEfoNezIs44XY/aRj4x1EQcfjItKqeIhuo47EIrPKsVJ8+bhMuvOAtjRtejkO2GZhd4q0zjAiABV+1xrDziqQTmzBmPFS9tw/6ebohaExfyYD6JbRCVFu1SEVy1XG3mdeky8QfxChOdFoXy1AenKCDTioceX4bPffgs5DtzUFRqd0U9a56T8udHC4EITGjeQGRFaIaCgpVBIlWPs84+DSOHD8dvbrgZ9z/6DNq6s/wzaJLJtQWKHsO+3jyeXrwBR02eiZQ5FJoa8rkAYgrWFZpniFSLaD6hXEGPGIQp3w4g6XEuMkKhNrUWU1UJbN64C488tRBWwaasB2efOAfnnToPcPKwChkePREg8ahxw/H9b30N67duQz6fw4jhg5FMxuF393JFJRgm76BEdpAjoIlHEkyhYjufHqTjUxq0OqBp/pr2ahLtvGnYj6C1PFJQnk3g/04RI5HGlkhfKN2jcy5LKmJVA+S7H1jNjp00eN7AwWPx4osvrpl73Lzpu3bv8fjkZyUdeGMjAGq5UIj89a/938XnXHjVw48v2zUwL9arWu1weDSxL9DOSNy2KqixZPsh3MCHx1ww4gdUfCRiDIbmoKN1E+SgGxefdzw+ds1FmDamHqrTA8XLc9YdootSZAMyDE6VRcEhEWMcPXscZkwbAbfQzeG3VPEnSCsVycqQ1ohks7Qz8RZUqR1FWyunrxfhMZK8SkA1G7Bw8QbsafOgmc1wGCULtNNEij1UnOJ9blGiuXQoKjEG0bh+LxJJUuh14LTuxsjGWnz1c5/Fuy84H7UJBTFVAMlf5+wsAtol1Thuu+dxfPaLP8Cd9z6Dtk4fWrwZSqKGI/GoSEp5tsw5C6KLP+I1ogggGjV2PGI9JrJPqn2IaOvswo793UiHwKghCVxy7smoTyoQ3Qx0Q4CaIkahAmBnASeD0YMbccy0iRg2uAFubxuYU4Ci8byupPpZYlDqz+1B7L6iAJUESCjfJwIHIgLlN/rnV+oJvtzKC5HXN8qYjLImWt97UoEwahOScYgB1W+kCHsQsQgrfCYhV3T4WLlCitBik7j0pSz7yvdu733yyfVH5fIWo/oUP36VwuAbnQJE1F2WJ9cufalFTDsx26wfLXb2hpDkKq6qK0OBJqmcMcf3iVzThSITi28GTnEfcpltMLUejBsew0c+cAE+cMWZaExJYIU0YkTDLQSIaQqnro7wo5GAiELYdbcXgwckcNK8yRg6KAkFVhTGBi6PLGim/QAhBVlUyaaqOi1kuqoMQ4/4BCQNjichlKrRk9fw+MKXIMea+OhsVKiOquFcnKPUF+cSXjIN9FAOTl8tByEoQhEDDhiK6TrqqmsQ2IQ/Jvish/qGBDRdgO2Q/HWIJxYtxfd/9Ft89/u/xOOPL+KaB3LM5FOE0URieYyZ7ADAhnZySr0oBCe+wky2Bw1NtZgzeyLGD4jj7FPn4Ogp46EILrSYCi/fA5Zu47wC1DI0FIaETmVRhw9NOYVeyDR/USyC9XTxKcEDC7mkVsAPGbVOSZCFIhNa9B5f/H36Cq+j5tbfAZRv0Xk6sPP3DVW+zPlEykO0+O2iw526qhIZq06c0sgUfHhSAr4xUNzXI1X94Jd3s/Mu+MDG5595akciERMqtGFvYApAoAtScf3ht75z4eSZ5/7kSz+9yxL1ZjOUalGwLb5gFc4FT+SdIDVnnjeqtPjDHJicRTwZojqhYsKwKlx1+UUY3lwN37EQU0PYvRlYoo+q2ioOtOFa0PyK8BAQVt2ktqEHv9iNY2aMwSknTMUDj6/leTt3OJRqcF37fjpzffxV0S7OeUTLdOCCCpuGgJQktNhAPLdiN844fhqaTR0hK3JmXk5yUdKjpvWpV9cgl83B7t6P6uZGiH6IXG8ampaA0dCMZc9vwhNPLUSB2nMApkwahOuu/whWrlyHO++4D1aOLlsBvs3w6GNPY+/O9aBR2JkzRvEogNcv+jS4+/vtUkuQZnIFSo1EkirGlAmj8LX//QR27tiB8WOHorE5BS/dzScAacCKT0YaKdhdPdBjRKlGk4AuQlWCQay+pHHmiIAbkZtEPIcHdfXpnEoCSBVM5AVCGmai6Cgar46mBiNthtfyBmUdQI7eIzQmr8McQAyUHlXCCZZUkel1qcMT0LsRDJmwIhIHVNHruMQBEXgIVAVVzaOQ7ZbEBc/tGi2LL+LOvz3UOm1yszB04uRGy6rgBd6AGkB0sqoSVYmezoyZ7s1bBRQgGTaqEwYPNeMKEWmSTHYASSUOeBuem4brtqO2WsKsGWNxzPQJmHfMTJgyCWt0QSWq7FCFmYzBc4tgBYuTUHA1XV2AQJC/XJHaPVA1hVfuGwePw9yjR+LJpxfDd0PoWi0VhThhZVTzL+X/L7seoxqAbVvQiDzDJuppHbKmc4371p5uvLRxP4YckwCze/juSDJmvDUW+pAVE7nuNDQjDrNpINLpDiRiCcQHNKLYkUfQ0Y0nn3wWy9duRDKuwPE8zJw6BpdddAZOP/5ojB82EPfd9TD27+5AR3cnEYljy54ebN2zAzPmjofjkjRnGQcfJcFRBSLi3qeR2nw+A1kleW4JAg1E9foY2lyLptoJfKCKE6lKIQRC9qWSKHa2Q89meEuTQndJJpFQjYt0eK4PP0f1DI/XbsoCiQdES8oLk0ESSQGJ/ANRp/mcR4CEUaJFLf3Txd9fpZlHABxm/I/Rw6tVE2ix040eYVk2R0fQ0Bk5LL1a48xRe7qKqDaakNCr8dDjm9Hakm38yucuo+Kh8Lr14o5g+48dQPnk2I5TrFOYLzILSZNaYzZyve2IE9kFtcfkAA7x+PsM1YaOIcNSmDZjGqZNH4XhQ+uhU87pZbiePBWWZZlCSxdFu5hXiSdE0lXPdplsaiJg84KhpNOYoMtbhyZFItk0ZkwdjtNOHo/5j66mJjo8l3rGxHFHISOF03SR0ScuUXgJxNgbUdgEng9J0DgQqUg0WmIc6WIaTz23CufMOROqFgfzuyERlyEnvZfAggCmanDIsue73HHIpoFCTwbx2iasXLIRDz36NDyf2Hqocu7j1BOORljoAMu047rLz8IJkydgw7oduPmW27F8/TaMH5vCgJGDkGU2Aolan6WqP+2sXKaMopBoDNd3i9AoDIcLzypy3gRNFQCvh2MVnGKEtKNcnRh/QqsIzYxF+ylvaxJ+wIskxLlAL3Exi5xAlSP+uLcpN+7L55wqk4yrCNXWJKCoIUiAjbQS3aKPYsFGjE7TQYu8/99kZRovvpOXeQR4yy6q8JcfGnUYyAlGBIVc4owXCqO4gOIASSEF44hmjEBILizODEUTjl6oAb6BeNVEtHT24DNf+jW79+8P+xdeepbsem7oUmj6NrX/2AE4rsOn/a7//Kfu/MTHvljz7nPm/u6+BS+6oZOTE7In1ho64kmfDa5PiWNGjcPwIc0YPXowBgyuIeBOhyDYcLMd8OWwLhaLEbSGdmhfNeN4bsEzN5zwjnd99PQT59U+8NjDuxBkZaeQVVXDF0WFKMMczvaraAkI1FGwM6itHYDTT56GZavWYeuefahtnoX2LmIcDbhToQXEWXtLktx06ZIzIGBNNHVIYSxBUBW4gkoE/+joyWDL9nZMH1+NXDYNnYNiyGeIkAKB8+K7NOOv0FShCps6AkRIIMh49PGnsW3vPpInQWfexkffexbmzp4COL1oTilgmf2YPKIOw+urMGpwDXa17EXj0AZMnjkOShywqVjn00xEuTpOqLwQPr2vT9OF1IWI7lcpNeHtMx/wivBcD4pqclwBhcSkviNoOudEIAwFTf5RRFOi/eTnMwq0qcFPh6g8+19+TJnTL1qEtPurGomM0Pt76M10Q9GrEI/H4RN1et/swKvbwa3CchuwD1BcStWixR5FIn2DBf3COU731jd6QM7NRyB4/HgQUxxd6p5gQgporNwTf/3HB/HAvQ+y448b4SdrxymFt2k68Ia0AbkUtA+MHT8oc9pJx+ycOnVEc7yqTqSR19qkiZgWik6hp8UQBTemK5C0PPPzObF53FEj+IcgzT27Nyy2tfvUWtKqEvKLy5+/ixZ/zDTx+MLnus885Ywh9zwwf7XkCtUaV6KkbhxxACoIHQqFdfieCzffiVnTR+OiC07Bb296ApneLmhaPTyuDhTlp2ViC1IJKueg1FfmzMAR7Q2nE6fWIc0q7E93YPHKbZgwZi6gpMDCXi6QwXGwRGKqUEuTSPZDiIqEXD4HU0nyQZ5Fz65GL8fpKxgQ13HOmafCEAUUe9pRk9ThOjaNTCKpxTBzyghMmjICnkQIRQ/ZbJ53AKJNONI3IB4+yq8VTYeRqo4YlOw8D8f5KDVFTzxYEKDKGlw/hOMT8SiDS4VKKlJyVWGZFz5dAmBEPYW+xRo5AVIWPkg+qWRRE4Wg1gJqqpPQVQGOTAzPkVOkY0g8BYRSjNp5r3zd9PX7y+eAdCH7lzr5dlCqO5S6ruQEqDPAxU77DSdFuI4y1Vj0+fj9dPxIdo5jQQIUCJkYmFi7tQ2/u+lpFk9Wi2071zmDx0zTc/lC+HaTE3tDugDU/yf7yEc/evvoCaNGdOxd9pHJI421DbHM6rjas6yqga0944Izh4w9ZsaIQVMnj2geP3FU07ijRpQrv5qmCrs2bX5OEmQmUmmeT4BF9NN0QshBPLdsRfrjH/nYKYlBY5OOK2S9Is2xE4rQ4HJXRCFGI8NOLsPpti445wzMnHYUxw9w0TD+Tcu7SjTOWma3JRwCCZREinyR6i5dYEQYEkpEWSVh2YZWbNyThxprQiCSCAnluNSLl7kaMD2X95gZoRQpN44uxonjhqBWUTAwGcMHrrwUR0+fDBUMtbW1CIsOVEo9XCLt7OU3wSvwQaBiJg3B96ER2zGNF/M0QIpm5ZmIvE3zCA6KNrkiE26oE9E63JAEVjT4oQZf0CHJGkzDhJmIw4jFuEQYjfBSoYyq6BG2oCzeWWbqK0/lvcruTVV4mptwLNTUVsOIybCsPMcQ0FAScSGoCmk3kp7iP79+yg6g3AUQDrqfO4Jyd4CcdHlePNJ/LgUEJf5GrhVJ3RYRCu8+0T+6CCQbvuTyeC/PZBjVw7F2U078+W8eEfe0QNzx0speutaimsLbx97QWYDyCfzw9Z+6kW4v/9dSftfPyt7WsorhOZe859T1L71ok8Qz8zzfMIx4Q22N2Nmd5mf4/HNOH/jXW/++rdi1r0cSzBq6wHWFWlku59ajXJiKVIamIZO1UNXchAGNTaip6kLWyXDmHSLPIALLKKCNxkxLyBLOvEMXWvRRo92DK+lSwVlPYXt7Nxau2oXho2ZCldJcp4DCf17sIhCRSLBjG8y1EddJlDvqVV/7gaswbuJk/v7nnn0C4loIlyi3KMemegfVDIiRl4p7fNKOIS6JnBAk8KIwW4/Fkc8TvTeDpMSg60k+LWl7NBYbDQlZFAlwKGAEiFFVEzFdA/NzQEDdi4i0g7Z1ahtS+8JziVuRvnAE5Y3ao1S5j/AOROEVaSRE5y9qx1GKQYsMyFs5DB08DMOHDMaafXtRnfJ5asKHcGTq0b9+Zp5yKtAXEZQw/9GocMQzwHf/SIeoBD0u0bvw81V26FGHhoRmJDoLnP8x4FBwkDwaE+B7kdBLwhyKZat34y+3LJLfefakzoHNzVJ7Z2fwdqIYf0MdQPmg0UI/OLejxf5q4RWFooufun/z5mXPParrseTQiePmjJ0y+cwVix5afMxJ585t7ehipBwdBI7rM1Hs6slCjyVhJBvg2a18ElCJa/DyeX6RJPQa7N2Rx44teyARvbUWEVRGcmGRKEVkkRJv+dI5gDk9APahq4mpcaTzLpa8tA/HHjsCkwal4BV7QZxFPE2gkFolIosALrM5F4FHc/zQMe6o8Rg7YWTUK5d8OD0dHH5caOvkuTLNvZfhriEVwwIfqipBlSVOUsocF4FKEYaEmGZCUhIo2AJ27NmNHbv2YcPWbdi3vwUu0WtBQDKZxOBBgzFu3ESMHDYIQ2u1yOkEHhVqedit6aQ3KPGiJ58r4HJfpS4JT60p/TnQeC/HBNHPEoiKsFMCSL4LAwc2QRL3wbWL5C2hqlR8daKqQgQMeNVrppwG9BULSQ9Cpsgh4hqIEFok3hI5AHJ29NkikpGIurivO1EqCvLzEVD7WUQguwglOp/ENUcOgKZPJciihrzjwjSa8diTa9jg+tjI5Y8/3TFw0rhavI3sv8IH8K/mUdSPrR4wbhj/QLKMJc89etP4IUPOaRo2bOqShQ8uOeO8y44PgoBJkqzavm89teAFTqp58QXnwqTBFb77uXyBizRAwwwsXfIC1r+0Bb2uBrMuxot7JJJLxvPNEqC2bFHeSFd/FG7TRUPkGzR15hDfn1KNnW1tWL52O44aMR0BcQDQbldGvNGwEMln0gVMPWhqOAQFsDAD3yWSUA8+8/jQlGDEo8cT6aVDuzB95qinz2MkDnxj0BjN4vvI9xaQqG5EKBrYsn0fnn5mORYsXomXNm9BjohUQyDjRgwH9FFMSURT8xDUJFR88OLjcfbxR2HAsKFIUHcil+VzG1yOnLf6aMcv0y9FO2+075d21/JMTj8+EB6F8/67hC2bt2D79u0c28ElwImimwUc+k3DXnxxv8p57ys/cifUb/eXCGwUcp5GHrT0nwIof6hSHaBM6tIHHeIEL9FcBx824nPUDCGJnvAx5Si1Y4oKq+AgHk/CtrrwyOPLoGv+ngljx+kUmm3att0pFySPZHtLdAFeDVAklBzAt7/5o/+578GHr4LViWHjxh/90Q9ccf5f77jnYcYEP2cJeOSZTdi1sxOhScCfSRjcRAzSbdDicRRtA2s2tOGxRS8hXSTWGJ2TSIqiEV2MfPeiELIMrqElF03Y8+IW4dqp586jSioiEUBF4ojGdLEX67Z2I+/qiMkxhGEOCK3ooiTWIdqsFIPvUJpKPXmRA5QUNQrxqShHOYXfm4cia2Ae5eAR4QbnJNBpKjJiJxJod+b5r45Yw2AUPAHPPbcC8x98EouXrEBLD40CS/D9EFZpXXD5ThEoBgw79u3GXoT4xk+34NllR+G6D16JqVPGcTIUwjFQR4RGeCnq4Io9PPQvLTQ+KVmquPNOAEUvDEHowqYSjWoglFLYvt/D3Y+tw9KVu8CkIdDEFO+gUDuSIzZFqsCXBAZewaLi5gGacL5/c3xF9DFo6g/91ntZoKSvQFmyKFUptQV5ikKvHfDBMw70IpfApw0jnslACGHlMqirSsAq9CIWrxJ3duzB489smPrc4y8VC5ntWwZPHjeWUqVyfetItUPGAVD+WlKElX7y0+/c/uTdt/1Ab6yNr3rm2ac+8eVv33PFu86joqG89qXdrDUdx94s8M1fP47F69tx3ukTMXZIDRyLYeXqbbj30UVYs30PoNdBj1chZzkwdTUqSvFw0+PpSvmiith16JKhRR+RbUTXIy0KBaqchCTFYeVi2LU3hw2b23DsuCq4mS5IUpHXFkC6gURgaQkIKDYmIgsUIRuEFSDPoEU7HScfkfrSJcIgUODhksJQwoCXzUUhNhGUaBoKno5ey8DSFWvwox/+Dpu2tyKuyyCQo0u8BIaK2piGRFWc78h5y0K2UIRluSg6AdKBgpsfX4cg+RC+OXIEqg0JJjHv0oK2STFJgqwS9RDBtCNUITkWvjw5ExBpF/gQlACOU4RvmhCTddi6x8ffH12LJ5e0ww4HQ0EzBCcGkeSLqCiqlsQ6ysP/EZ4oyufLEXu/EnRf5b+EAyIXRCKoxOVAQEePSF64aju1f6JOCK8D9LuG+uIEKlDKPjw63jwKUbjDIHAYOTaN7lfo9fJcZAQGTTTVYsmmTva7+1bmZx5V0zrlqInm+k2brf7pyZFoh8V8JA0bTZ9+VPy3v/n1jY88svHMP96xRU82TJK7snlke7ZhUF2IUQMH8NC5tauArjyDQ6xCJi0KlQuO6BoND9Gob79ec78TW/794JMdhbDEXGRC9vcjie245sKj8N5zJ8Dt2YiEVACVmygloUUe0ogyhdci7aw2xxmQrDeIzKNUV+IZdWkGiQfTqoxiPg89GYdTtKAn4pwS3PF9IDYIDy/ajO/86FfYvXMHl00vuAEScQMzJ43BnDmzMGT4EDQ3NfKJxHQ6zenXN23ajKefeQabt3XzyvegKmDBozdjQC1Jjmc4pyL3U1KMC4LSTs+BQJRj83kHoiGnNKG0i1K0oehwtVpsbfNx230rsPiFLhTcJmStOBiSUA3iG6QwyuE9eNJdIAzCPxzjg666f6AML3cfadqRAy7oeBFPJC3a6DNFjZoDXIMvf3JEIx+NKQulOkvU6uWFzjDkcyWZTDc/jsTrSPwK1MuuTiT8X33/I3KNsGXd2OkzJx3pUcAhEwGUjU4Y5cll0AexA9GJX7Zsdf66a6+/9uoPfLm7N5fv0Wv9GiORgCI3wXZaOegndAUwJQ49WcuhsVTkIVILg3T5KLRmUZsnEqk8MHv+zyxaxCTWoSHfUcDatZvRe/xYxKUUr3oTDCIqklG4SSAhLrDHf0YoNuILJChzmR6LMAiEUIxufNqNRDn4iD8VqkIEgsy5+7bv24vb77gDW7btgEFMRyzAtHFD8a6Lz8a8eXMxqLkR1VVJTuBpWQXuLJOpJPbu2YPjpozGA/c9jC2b9mNwow7DzkGwVM5/aFP3JJYE8wlUFH12KmRSSYCxIkJiG6JvQ+hJMQ5Jq4PDqrHqxTQeWrAJz63KoCsXh6jHISukPESsSlne+1dUAhqR89O5kzm4IlResH2RwEF/l486p3Xj+AcqDJb4HIUAPtcAjLoN0fNLg95957I0qxH9Go1994GaooKm7XgwTZJcd/k8B6Us9Dl27d6JJ59ayI4eJ62l4aojefc/JB0AHXCqVvc3WrQU9jU3NyepvijJskiYeo8wBGYSDCSzJUHQJTiByhF8HiHlSGrcI6gp5aQSZKk8dfZyappyJZrsZRXpcieDV+gjGLGmJrB7Tzc2b2nF3KkNcLNFSEKk/BuRZRKbbxk/F/HnSyIRb5XF9kolLX49RgIanmdD1YhViLoOMrL5AnQzzmm5H3zoLjyxYClihgLmejh+3hR89NoPYvrkCaipiiPd2Yp0aw8Spoq4QHx+3Wjr3omYJOGdZ52A2ePHYMeGTRg6YSQaqqu5lLlAxzMkGjMK96mNSHBhcko+gsCF6+Y5JTetGV8xEUsNRFuXiqUv7MUTz+zF6g29sDAQqllFLIwQFKINc6PnEiCKDwUcOMIHj/a8vguh/IMn9LwjU57hos9aOkEl3XI6ZyUkYxkP0E+PgJcheSRzYM7QKhbR1NSAzo790TSlRJwQQHVdM5YuXyMOTA0ViK1aOcJHhw+bb0e7QaFgBZneLN8yEtUpzkmVLdjEKABfNGFDRSEQ0VtwYbk+D0nNWJKj9Xj42Lfr/2OPt3/bslyN5r/3/SfBtUMkE00EVcCL63YilJMg5gGPtg7JByRSBaLpvYDvTjKvC2gAsRdRisA58+hGBcJIhoyiEcIBcJkswhaQhgHJZhs6urMZPPvcMo53ILQgzetf94GrcPzc2Rws1NO2CzVxBdUGwKxuCHYPUlqAppSKGoOGgFoxqMHA8XOnYeiIoXw3JbGQ0FGgxetLop6E6CMHVYDnpeES9JjYjWUdol4LJAZie4+AB57ZipvvWY0V62x44khAGYJAqOFFStsnpJ0NSDRVaMN2SFGIcBekFfByJp/Xsj4GoOjA9+FG+LkrEXmUAUNkZcgwnw3o57jL9d0ojSjNFXCIeRlKLHBQVE+a6NQUyIqGUKJNA9DNKnH77lbW3Z0fddbppzZwcNAR7AQOi2/WF4WVJKiof+0UC/ziVcl7yypyBQ+OL0OLpXg3gBaRTUSdvs8lxHhdmw+YlHrdLwvtDuz+/2B0wXGhcYIaq5DVGti+jm17etCTJ41BjUtYMZF2UQei4EAWfA4EkqFCYQbkIAahdBMZ6QUaQKhBIgEQUkFSzagTQOQWhIswiTGJGJIoDA/QQ8SjAN57xXk49fSTkOncx+tWpibAyXdz7oFYTIWqMoRugdN5UdoiMhu+Rd2SEIV9uzlJh6gk4Pk6INJnoMoY1QIopKZuRgSqMsw6iFIj7KAZW/ZruOXedbjr0U3Y2aHClRvgqSk4nEGA6D+LsFkeQWhxqnVyaoFPGANSeYrIWPof5ddbdOJDv5xt+ABUuH+UFl0XfWHCy7AG0cRChD+I5r4OYBo5hwuJ0puRAyA9R5JGDxg5Qw1ZyxUtm7G8Fc768Xe+O58cD01cHql2yKUAr2QHaDyIBptGQIkZzEbRJrQdId+kSOePxCRo8kMiVh8RoU8il0TJSaT/5YumfCv1vfmFdSD0PzgFoF9lmRYqOQAHdiDCZgYyloL23gCN1TGEPomPkhoRMQbSQiZYMHUWSkAWFlXVyyPyB4QxInJLQgSSxJZumnBdhzs13ykimYjjivecDzd8GsfPmYBLLnwHXKsXmhQgpss81QgcF7Iqc+k0vsNxVFMp3ZBEyJoKR7Qh18ThUr0ilPl9dk8askbsyCQwShThKqwiobATcFg90lkRL+7J497FW7ByzX7YThJafBCKjsEFSgKFwWV5QCE6dnpvH6FPk4TEnhyDVyT9AZGLjb6M2qv/lP8r5v6l+zlHA6EzozSgnAZGhUByWAeKuVFS1a+lWHqXqB1YGiwq1QmiVi+Qy+Q4HDug4iBXaguh6DF4HqWLMaxctYkdPWP4GpKkP5LrAIeFA+AQUA5YEaVCweY7v6FKcMIQDtFXKSoUw4i06giBJgu80EWEkbJLu1xUUKLdicZ3D97t6d/o9fvXAspGf9MkHZiNeCKOop+BFehcrnrr3gKaGwdw7D+NwfLeOtUAeKvBB3ybt9Cg6CX+EboiS0o4ZYYijoSJyDQIwy7TT1JF4tyHCi48+1TMmDIVTQMGw1AV5Hr2Ix7X4dtZPv0nKySU4XMVIb6SyTtSUZFCIBlwmBsVI2USSMlBVygSIj4FKj5S/YEcqIpcMUCsejBssQHrt2aw8PktWLmpG+v3FuGiEYZRC5tpKNJ7UTYjElcwFTYdjrakISVaihwOzsmaqPZCPqiE1ou8bIktqA+RVT7Bpb9LIXv5vNM5K01dls8TheRl3Yf+iz/a8F9+/ni60G/AqeweOMSLJMnNFByboizKF4iqXoakGPBtiTQSxF372kIaNVdLkvFHoh0WDoCMTvjOXbuzU6bZxETD3GIBiqxHhSrHhVKaIydEGk350WSgxHwoHglkErV1GZQS4f/KF0o5v3wliy6oaIqMePxs3+HsRkZVE/b3ZHD/Y6vhu+NwzIR6VOmUcuyH4/RCFXwYtENTS4wCY+IzlCOV4L44mNpOnA47GmYhpp7QsSCrVDMgCvIQQiBAE3WMHDqIRzLEgZCMUTHQjph9qCpemo4nERTOvc93zSjioYVPvBckCUZQYSOuwrUznNKLyDPdAtUrYhBjAyEEAbqsOizf3IP5T72E51btQ96LI5Ycxtublk9uKwDTAgQhiW8SAQjhKSKiVKpr8OJfSLQiAY9ECKTEORB48ZXomqNqCq9/luC8L+M3KoEAaNfnuzcdm375PoeT+z4Ces9+m3K0w/f/Oyr8lacF+8cFZc1J3TBhc0XqUsFSpglGgjERwtEQbddjihI7+r1XvHvczbfesYmKzDQ+faTZIY8DoNCPWltjR402zjztws8/u6r7fwpoRCEwdSZqUQvIJVYbAy5xAsghPCpqUT7LGHRb57m2LYXw1BKTLRFtli6ssgM4OL/sbwqx7SgCetMZJGMJJDQNvR0tgNWOAVXABSdPwenzxmBIg4C4lIWTa4EYWpB0kswKAEZUYBGHAIevCiQYUma7jSrZvCBHGoiSAppd5f1uIr3kEQhxHxIFOO2u1NIqUXVxTG5Z8JT63BGjTjRUS7/TbxaPFgyiLctkOSIulqpGT3saVYkBCIUECkIN9u538MSy/2/vPeAtK8tz8Wf1tfvpZXphhikMZYChIx0EK4pGY+xRo2k3zXi9xpubYozJP1GTaIy9dxErIFKk9zqNqUw5vey++vr/nvdb+8wZBAsmgjAfv82ZOXPK3muv7/3e8pTd+M7tj+KRkTYCux+23YMcHEQEaXEUSs1/vh7Z4pECDQl4WWyLDjn8ZJuOOAByLdh85BiPKL+Oh6C89J8CAXUyA/UlFB3trE4AYAZHmPGcnuBhtqOdTENhCA5zNOb1kF5BRzcgCywZQUpRjpSBieVNoRzvi/72//y2uXBh9P2TTz33Mtd1ROfh2bae0RmASst5snqc2eaOO/7c//uJb/775Mpj1vTVZj0p6yn6KVxvafR0VJ46hpNqg6hUM5sAcMPLqXtIe+5nKVhzZOgHDQHOVLoKSKIY040mrHwfLLuMA9P78YVv3ocd20Zx3mkrccyqbvRUBpF3PaRaCw26GFUMQaTx9FKJMqsSdRJyikVJLhEk4ZprbGnSG6CaD8sCuhgxY1CbrFNXKz8DHreSR8hNnXHrM/VgRDrcQhfCWgtJGMHM5VGjvJpbRCN2MDHl446778Ltmydx+5YJjMQlWD1HIXK74LUTOBTQ0CMB1oiPX+b+y7k6xVhEmVgAtgr7IAAizZfgk4R0NaYwijrNBYMhGYniCHTKsU4mMLeyHkBHp0Hes45ykAS/n3PjSELQcSp+XJNw7ld1rMs6UicZGVqozibnn9iz92CSyzlb5r8tz7b1jA0AHYGIrlJB++C//cfvbn7wsQWf+cY1XqFrUbkRECNPvTrO+pkmElqrRnWqvs7CgFhRqc9zBNhxqmUNLDedIMmyk+HQbz7sebBvwBkA/4v8EBHHeDylTRex6UArDWO2PombH5rEo3tGsHJRHscfO4zjjlssCL2uRcswPbVTYKeOVYBtsD+hnpF0qdnH8FhHK90/Obl4O5JUxACYpbeqm80NoL5HzbkUkYdB6ZD3Hk9YprHKc8+0iwibTfihjcqSNZidrmFspoXungW4+a6tuOH6e3HX/bsx2TQx1rSh9y6HHbbFTcg22B2PYWkRDCOZ28hUVdJjQoSt7BbKSLpzMzwVgMWJQRpxqjGqrieZjUoopAPo7xCBDmUA6hTv9Avman/JfjoKRT/3BsqUgTrPLqMSyPcrmbG0U3xkCEjReMjEDphNtdu+bjss7p696xkZADojnzWrVzv/+V//+c/HLFv3jocf/CoePTAGt2c5qi2Ki1KHL0ZKIw/23mMGBZ6EWWwXRBtpwB2Zjw4GQOncSb2cAYKEVz4XBR53GiXUvndhahZm6w3oeQNu0UUrDNBqtmDrOsq9w0jCFkaaU5h6tIGH9z2MH965HeuOWYpjjlmMY1cvQcWJEJJanIYC1dUo54VQ3IJzVj5Tu2HjkDd69tzIS+CfOwAWCWCswZneKht0FcSYGVD+nE+X6bEKWMyg/NkmNKOAfKkXt968B9/4/k8w2Upx2pnPw3nnXYbuxcdj00UzCGIDk80UM34eD++awpXX3gYr3y0Q4JRKQkzduQSTrx3KuIRMlVGIBQiVMSnEP5AZAt8DlbF0GnedZh2BTvOv+FxPQBq+TPnJD1Hs0rnvfXKZkrmlqir1lfIdCk2cIYgPvc+aQhjN0zrMdBGy/gTLxWe7KsAzMgDwBiAE2Gu3krNOO/sd7/yD94xcef3mfq3vWDMyivDSGHk2sYK2pM5KMUYRREgJVrLfKgOw5O98mcR6KxCQ0gPQf/FMJDQknS1aOYSIBakYWxH0UspTQmbIrs6RWzegdyPSA0yP17HthlF87yd7ceLKfqxZ2IOjli/EsuVDGOwpIOdGyJlUD/LRqE7Atcgd4HiLsOFY3hjPb8t1sDSemEQUsp7m5uNJFsu/SZMv4+6oEiGZKwtSjR4MKXSngNvvPoAPfOQ72DGuox67uPbOH6KpL8Uf/v4Fcu557VmZ30Mv4Zofbcf13/o6jNBHkisjZBecAhuyoTWYBDLJic1Tk01AlakonxVL/W5ePJYHhPHK1joE1xWDDr4Och3kImddgwzbz2atBAz6R0haPo+n0TF5OQT1e8JWlqg5zYMEK/DXT3+txuA0FwAyqTERPDFRLJclCD2b1zMqAPA9VeSLAHnHwSc//tmP/tPf/sf0jXdt7zfyQ6bmdqMWJDBJR9UMUM3VFdHHzDF2Hm4vEaEOZSjdcaV98t/75IwvuWk5x48daWRFaImrMW3CDIv68xECj2WIAzh5NFkCJ64AhihC0vJquOmucWx5aBY9lRF0lS10FU0MD+WxYmkfFg7lMdjnoLsYo5i3xWGIdGA/jWGXyjBTkoh4AutIY19gutxp9FmiHqAWqmDBRh1Tc55ywiWg3Vliwe1egUd3V/GZb9yKh/fE0LvWQtOL8P0Z/MO/fgZHHzOEE9ZX0FPwQd1iKw2RT8aRjO9G79IKau0GwsBC4ptw3BwcOwedfmU05Yy5+ZUtGc9/Nv0IfxIDU7l6h656pxSfu64sfdqeKgOkmlHYfpWqq5M7oa7gfJ2AuZHek+77w37fz/tsKmNENSiMpaxSHoxy1+gRXJuuxFmQepauZ1QAUA0/X4LA96676au33zl6xVev2x2F9jFmahQQxZZ43YEuNEEozDh9juXF0VAsXXKLzj4dmUuO1+jPKwwxlYbOR5bNF6Z84udEYFGM1AkQZPN5m02shNBRTzj/zDz4vIifl5MnToR6Kl17u4ikx8R4FGC85sOYped1AP2haTj2bhTcNnoLTRTtKnqcNpYs7MWmU87A2uNOwk23bMb27QcQe+yFODjxuGU4dv1CaMEYZqcPoMuNYKW+CHs6Vg4t3xemoOWWobs2/NDF3jELX7l2F27eWoXZtxSpUxQdgN5iDxqzk/jmF7+Oiz74ToTePjmnW0mA6VoNuutKw45gXkmE4wB+y0MUtGDbLiyqExmWuClR10DUljhHp8x4hm3oSI9nV1JO4znnr0xRiJmBlC6qWTA3KeGiTmNnaioDzjngXxYK5vMF5t4vtZE56pxfLFDxUfo/ygJG/s00LUGLMgugSlKssykZIfarKOYDrF+5JHnswN2ceT5ru4DPiADA95tgnt6eiv7tqz7/yYd3TxVuunffy7/4zXu8KF3omhYlxNkIooNO5oSTvdFSF+qddDQFe1WHSVjz6w2VSirJnEPp4y+K8IppA2aq1FUccBIdRqSkw3kCizGm5KYU8eBMWfnXMxDE1BlwbMSGCcPIw2U5EutC+/VaVWhVD+3pvXjdFWfgnI2LsWr5QixatgZb987iI1+6Ezt2TqA7343Am8biG+7D+WevxiXnrMXSwZWYHd+GpFlHb8lVYyxbZRBWYQBeqqEROvjmdZvxw9tHUUcXKl194n2YsoSJI+QcC7u37oQWEnZMvUGyDTW0OfZzHHFBpqyWMPBkehIrKfaUaU4qFGmdWgri4dARW1HFtkInKPTj/Os8/+8E+ChOFKcc6t/Fdmzua+eBeh4HKf6ZK/sZh5MLFQNT9SzUmDUV0REzkzVPpP9C4BLLmoIdYd1RS/WguXfl45/Ls2k9IwIA7wfai03PVJMNGza97hs/+Dw+89Wbo0LXOteyc5IVkN5LF9zOmFed+h1G2C+ymbPjp6M8+8tYV3cOG2lcdySz5lGJO2OrudMq46tnaa0SAlENPbGyltNRgZZYa5a7ynj1q1+Ns09ZSXVSJK0Ut375x9iydS/c0gK0IwtRUsL23VWMjd2HLY8cwIVnrsHpG9djcFGKNJxF3WuJhXmutACBVsJd923Hd665HXc8Usdsuwy31CPJba1F7nsKN89AZGB6egr1Vh30ZWFqH7cjNJt12QSU/Y6FJ5/pAGa6g1HiI20zYESwmFHI66ByUoIwihSwSrQGDo0lDw8Cv47NlLEE5c+q0SdTCgZz6fQn8JOWNCJNy0ToB9J8NQ0hZkUrli0wt+185MrXvv2tryAOxRcK8rNvPe0BgBJg+Zyr3X391VfvHW3q//uvPhF955r7UCwsNnP5LnHeJRKPkEzBgh+20RXT6xfBM6nUMFOsncfueiL475N9v9hfd/TnuB+eKPBkslWHViKTAmYwWhwgpi8fy4aYMOG2OB4bRoyu7jKhc0i8NianQjzw0DaEiYWF/QvRmGnDMoso9iyGlrTwk7t2Yfu2W7FjVx1nbFqBRcO96O9dLm/ntoN13P/IDtx8xzbcevcI7NIwyqUSQlOXEoES6jkCmzg61agqxGkECS/sM6jJApuPakDCQKXGY+x5CCJSsnvqK7L3oK69QfdimnNKGZDJi8+ZsR4CWP26MfXqnVKvU/5OU1d5Miq4hYEPh6rukS+6AI5DJ2vFI1mxfEHi+43RPY89Fjq286zlAzztASCKItTqjXR4cP2F3/jB1bj+hseg28tR7F6IqVnaVGuwbAONBr37aGl1qB6bO4B/wTdHTv7Mi+CX+b4544lOGsBtIRL1mayYwEfVaOxQiaGkr6QnwX+LQ4RxG2nIUoJ9Ag+pTu58ANvVBerLn6dbrtCCRydrgFlAtUFhERc+DS9bBvJOL/K9Bcx4U/jSD7bi+tu3YfXqISxZOCgn/JZHR7BtxzhqDQOpvQSWU0aYhPCDSNL6QrEgp3UQNZGGIbpyOdFj7MzcRRAkpq06T82OzKgKfNKvkxdFUFIqzkQeAT60RItCWE4OlkFqLfEZHajvT+sr/Do20+OHhQJMmssA+Hp4sBAKTY6EL+8f8RmNWgN5J8EpJ6/Ve3q1xQpZ+Ozc/E97AODFrY88OLZ1W338c1+/OfnGd+5Dai3W8243ml6KiNh+qsKYmkhlM8XsNIg6SDiF3spS7l8gE5jfVf5lVV87NlUdNuFh39sJBPNaUnISsuyMfKShR1E6QeMpWnIgYz9dT4Tcw5Q0YcmQahibrGJyuoHu7kVI4MhNShw/bcUnmz4ci6n+IIy4iFFvBmP3T0N/YFzNzPU8dHsY7mAFieYg8BsKw25aMHTllkw7t1jciHIo2K5g9f02Z+4sj1zBxNsOGZAEFfF5drwUmOorBCNDA0FYZEhGFA8RwZQUGuUFdUqvHboST08JoIKPCLxm6b/0KLJ/4ng0Jl5Cs4QOTeHWJG0hCmai9cctMlut2W+fddFrX0pvh2ezd+DTrgew8thzhw9OJ8dc9aN74aNfT8x+NANDaJrFUkluqiii8aRKw+ZvvA5MlOsX2vzz3Ge4ftHN35lfd+rZOTzBE/+SeXBkRfQJvRbCdk24+uTok0lviWgIjTx8NGqziGjQKc6Wmrj2VOttSasTCo5EEVpeA5oZo9DrIM3FmPXrqCYxmmkB9aQbbX0BAnsJAqMf9cjCrB+gzozDJPe9BNvJs8clUlhRGMt1IL7doVYikY2ckEhgo3EGsxj6FxFjwK6+AlUobr7qpqs0nxr9qmkWRG34XgNeqymehHMncKbMoVDK6S/3eMpLuNCHSkMBTKmTX3ECaBZLafY8Uuo1wIHDAOxNY7BPx6UXn4SBwYI1NT2TEgr+bE3/n/YMgBf205/5wvbvX7s5uX/7hN43tBh1X4OZ02GaqdJ+E2aYDt9jE+ZwgcnHz5Z/3u/6maD/p/QCOn3FOT5b9jFLkyUeENBUR+I3YLEcIB5etzjFF0oNkX35oo1SieVNBM9XwpftdiAiQwxytm0h4uiTijuxh4hsPB7mhgPLpQYCXYK5XU3IIa9RU99HCh9Jm93+HJJMr59KP6bpwIqaCP0mzJwNnZ9jEODriAkeUkSezmuLaaiQaRiqpdR6BWrMJCEleIeqwR7iSIeTmLDztsp+8DQtjoclfVfajGpCkTExUhOu04PE4/uiw2RASD1E/mSyYdM6c3DQuv55F593GZt/bE4/m9fTkgF0TuDHdj40umXH5Mrb79+rdw8chUAzYbhsSfnwozpinYaeJIIoPz918s5/yE+Tn/Vk6fz8rxcr8IwJ2LGi7nAOHv/8Dleh4ferxhG/h7+GvQuhj2Y6Ah2oqlBVSZUVB+0EntdSfoHiT8ibMELkN0X1l1116hqIsAdtvqJYmIo9Xd3yPAkZNknrjem4w6YhG3aRNOpYQoQx2WlKR4CCIIKPSHjCU96roRiRFkd0ytKLY7coCBHSIYhjvSjCwqEF8Op16DzxqadAo1WyElNLMgHKZCnWPUExFvTEgpFacMyc8haJYgHMBG3alNtyfdivSSNe7592iJr/nsz3BJz/+GWnNE+0VIV4aBQsNb+AA0yksYvpcR+9lSVIA1tGoFrQwIqlRbz44vUoF5phu03dCTzr19NaAux6rFq54969qAcOPN5w3Ix6jESaY0zZspGNMM7E9uIp/y7emCTXzL+xftEJwE/p0M0FH/nXuTGTGlEyoMSIogBB2Ea73RTfQnIAmDbTopvquy7HT4YmwCLC7El95ffwI7vwOZe4iLLIi1H6KwnbSIIAtmYgZ+WQ0x0UDBNp0EASzKDgRNDjGpJgFiUH6CuXhHJMJWECl3TKlNE52FAowpQQ1zhCd7ks0ttUVWJmYOiWslAnZcd058GmlWdg50FyDycJbHAS9FPIO4jDAL5HkdT59mtPz+L7bVOh2NClx8Gl4jyxByb6ugYwfmBS+iDdeReNqf3J2ZtW6SsX5e4749RzLlan/7O39n9aSwBuoHw+j5tv3xE9sGUEib0cMG1Rp03AppPa/Ir5dngn+akuOV3m7KoP/1k/b0QlfMKMDPP4TENVw5nKREdeTOTM2buIRFPeEeHNjCMv6QxLHEsaUzxlg1YgGYA4DeccyRRKRQeaFmN8dgpFK0WFEt46kWvUOtCQs1zqgcFrTWN4qAtrj16C6ekZbN6yE+2pWdj5ilCBQ41S3TboJJKkvujeEQDkkqzjp1iyeIGSLk9jWIa6HYKAhCOWGEp2rMOiVKRZjglUlqPIfPRBbAnxhxoBhuGIhBqzC/FDEHLiIfqyut6/SP/lVzubxGFJpjedpq0m2Yq8Tho5taqoFE3ocRPtxn6cecoqvOolz0MU7ht5Fpf8T38A6Oi63Xr9re0P/McPXY6rygM5Gc8J8YIS20SacSSVnTbKO+5XuCFIQZXa+/AG4Pw09GcGABkfZsrC8xRq5Xv4FAWDT2AMMfFKQ0BlBGp8yOSBs2WDryWIxeXGYGourjXKpJPSVDo3TOihUs5jeLAHO8enUS66yBmQk5VpOym6/Pkmr1HcxKpVg7ji8ktw+UueJ027b191I6750W3YvWcSE1NN6GJVnjke8URjx57BgPP/xMPaNSsUziLyKHouxiYMXIo0lXErhVo819bIdAgIreYUI4Zr6KIMTLszQWcmsRixyDhwPh/giSTXn/xN+5UyPgZlQftlyggsa8SEmaVJ2obrJHC1EH7jIJYuMpI/essVeuJXv3/siRdfxvJLnJafA+vXHgD4/g/09+t33rejun3PlFsqD8FP6F5LSW02lig8oSvTTRGd6Nw0nRHgLx+eOwSTQ8/hlxv/KdSf4gUcRmnNBCQ6465DjDO1ZHaupwiiUEQ96EhLRRydLjwiW0AXHg05N4/YV32DsDqDroKL5UsG8dCuLegfWomYelxk4QkJx4dXncWCwRLOPv0kXHbJJqxbuwB6OANT0/HCi07AaSetx+13bsWPfnwLHt66DdO1ccSGhUr3gHT1a7OTIu+1oDeHNUcvFd8CGpcmYiGeR2py03PzhopLIblzdv0F5Jcokgy/h6WNpQkzM8eGopWXZmGx5IpHYSyMvicWXf2fWtz07KXImFIalVSOJsyZKEUGzipK5RxGdj+ME9cPJ+94/Qv10Bv5/jHPU42/58rm/7UHAJ7CxNPve2Rr+/0futJuNFPkervRagdKuIETJnJvyCYjv5+CfxnGX22yp5YFSNiYL0aZrV/sNFKpKzcsxTF4U3WahvIj5c9KU0B9TpGSeArKR0p00bAjpAuwBtfKwTFc0NgkSaifb0ltGgZkQLqIAk9wATyZr7zuXkyMjUBPcygVykqLL25i3dp+PP+CTXj+BSdh8XABiGYRh225to5ZwKKBMi676FhceMGJuPb6W3Htjbfh4e070AqrqFUn0ajWsHT1Slx0wekYHKwAmIZp0AiEsmPcMDpMWwnzET0nphwCAMpGapmwqWGmaHsNtJttVLp7YTmWMAZzbg+CiEYhHR3+x/MB/oeDQAesxGYsDWIC5eIsikKpB8doY3RkW7L+mAre9Iaz9Zwz/b0zL7roBc+1zf+09QDGJ5u7tu48uMawivBCdTPZjiUEFfGCC5WQhKo9qWrLBpqi+z61pf1M3b+ffTMqohF5CPPTf/VzDg8iFMjsfJ44eMp7x7ElzLmo7aPVbsHQTJhGTqkUJZrInBMdGEbs4DNLED1snH3Gqbjhrh2454H90JmWxyF6exycdOIavOj5p2LT8ctgJXVE/n6q9olkmTTk2FhMA9gWSy0dV7z8PJx8+sm4/Z77cN/DW7Frzyhs3cI5p27CxedsFFej0KvDdPg6CP1VpzpdgtQ0Q8GBZaaXSY6xQUu6LFmNlhFj2ZrleOnlL8OPfnwHHt5yAKUlfWi2PXEK1tiofAI48P8kGEhNYIjtp+4AFZl16bUIk9OKUCxG2LBukf72N1xEXcdvn3vBS1/yXNz8T1sAaLVCZ2KiilSriJ9d4piCQ6dGnC4zWUNUZpm+MdnkSSSSXgJC+eV/n+pVKfAOBSpVj1vNGAjV5by4IxvV4aRn4mJK6kKUupQSrYBlMhEZna4xTKZFlswETAchJb514v8D2Ck7+CGOWzmAsb017Ng1AS9so9BtwxPYLf3uVJyjpkDQJkiIm64pSkJvfNWF6K/cggP7ptHX141TT9uAc885CQsGXMT+FFKCijSllCvqtnzORBvqtEPXUcoXMTW6DYt6FuP1v3UeXjhzJiYm67AtC32lIvJGgMgbQcr63aYgaQ5xrJyLDEJ5+bMosKrnkSSuwiToCYw0AMIZ5DCDVSv7cNllJ+Etb7sEMwcfxQ1XX4NioQTd6YOpuxnWQfkhKmQelYuyIDDn+63W4YODeRBcOdGzC/X4N/aJ7gfJVHThN8SRCUujZpQv78myhRYWDOWxcV33t+1oKjz/gpdewXLhubj5n7YA0Gi2RfSDVFnXdRFZuthjE/ZLfXsy55SbC6m+MWLWoYrAdYhcMk8P/mel7p2DhlBVIZ9y45n0l+foi51hpaIjwBamwHPKNITlKkovJbOtTHswEhlpPje69YRwqBAU8ayzALuEerONnB4jjZsI6/txyqpufOCPXobtD9yFL1x1E66+cyuSpBv0DsrlCmjOtmA7mth5cwNqaROJVwXCFi46YzlOO3YY1dkmenu6YdsmErr9NGaFwCMnKum4BoFF86SuuFFYstTb6M/riNv7UXvMkI2wME9EpQetNYVAoyRZJFwAz9NgFbuQBhZyZkX6CZydiwyo7iBK8vC8JnJlHXFtFml9Hy44azne+jsXYeHCPPy91+K843vwvaUlHJzajcRtors8BMctIYyVVgBRjXOCnWkqak3yRFkqSaBVwi4MElwqUHQAXAqM9Hjd/3nDBfWuKwUXUUOiF0K7ESDfVYSRBOjv0fCW15wbHbfaMtev2/ASfv1z9eR/WgNATGIL031aMjE9E5lndtAz/za5Ieah/jqnw1PrAarfmenK8ceavIkoJsJE3LIOb+plv0A06JnuMyvhSZ/JVSltuc6JRABQCtfOoe4lSNqhjMDCYAqVXAjL8vCCczagYu3HBWcNoDJ4ISoL+vG167bCcvrRaM6iUikjJ9k1HY9IxyVXP4SdZ6OQwSRArpf6eo3McUicSlWWYirLKtWT0J7gEKRXAq9zijwFVMW6S+lbSAqvxUJSguUoJ/A2g68tWRLVgWybCkBlHBxtoJgvo1zIod0Yw0DRxJmnbcLrLz8R65Y5sM0awlYNx64YxsnHLsRXr9kM1ywj9lvwU/oh5IV3L5mUjEuJyegM5pUOH3sl81+Ces+V1PihN11BeX/WdIDvoFKBStFuNpErdCGXy2Fqdj9yAw4GustYu7IfvT09er3RSJ7tSL9nJBAoTBQtVYAnGiWwTCFlcA7ON53682oAfQjXLcYTvyK4pKNHxzEXoz4f/PPc5yL1987nOMtWjaNDIynekJSNYidfrMhYn6cWUs6YeIClAcquhrg1juNXD+LsU5YD6U7M1u/BylU2XvyyMzEwmBO7cWLmaThRm53B9MyU6ANYOVvUaTQaa0bkpudhibMQG6isY9kUPYRiPEwy6/GPuVfe6Z/o82TSVclAfUNlw00Igo1S0YVjZQrFYYLWRIC+QjcqLoVEZpD6dVx60Zn4sz95C45aQQ/BBpK4jsbMGPoqwIVnrcOCsgOXuAbPQ9BqqSCaMSbnI/068IIOXZeLf55XFDyFd1mdEgT/uMRUmAbq9Tr8MMbuvQdx5bevxd7905iann7Ob351ZzwtS9FLBZbJmh85GLqrxCUz5hlBQYq/zYxAac79KjYmHZgpNzM3OCM/H/QcIFiHHzt/5udlFs5vlBuVnHJ1Z0rWQDkruXtNpLoNj8KbtgPD5onrwUIdFauBF513LHqdOqx0VmTBeeo9uvVR7Ns1iqBloK97CcYPNkRPsNHyAUeBg/gLZOQY02YslQkBG6R8Aryh6VcnlmUMYJm2/hMt5Yar1Hp++q1WQY3GlyRbtbwWfL+NttdCozGFIKxLP8JJYxhRDdMTj8Bv7YffmBBeQ1fRkuahRk/COETO0JC0x7Fx7SA2rl4Ib3IMQaOGMGzCbzdESUiszyRwKej0Yc9m3sY/dOY/lQCgRo2+35L7LAh9NFstLFq0BJrh4qab7tQf3TGKy1/8wkUsfZ7r62kpAag8Q4JLS/D0inkmMlJpgITqvZlqC4UoBIcuTaSnnv4/Wef/yebS8yHCnZO0c1PONbBkU7ESN4TGyyBBDEPODtGe2YVLz1qMc49fBLO1GzZ9ANx+7N5XxfU/uB2V/EJMtwtAmEc5PwjTTNBoMjVX3HSagMj8nRqIDrEDdmaH9dNyZj+rm57lB4eE+J7gS6m/yCBXzOuwizmENWITAiHHmLqHJQsGUKgYSExyDiw8+tBufONrX8TSrhpe9/LTkAZV8UUklx5JE8uHunDJmcdjy8M3YyJsIo0dRB6lyU3YBnECzPSoKkSBF6XN12n2qbR/nsLfU3i/OyRxy2RgC4QgRRBWyIzTKKDZ0vUf/PCW5Btf/vo+Lec8B9D+z8AAUCja6OmpoDrGDnoE3c0LSUU87eYZe6j6kBuUGYBot/7Kv/vxRJMn0gZ4QlJRh99P9xtpYqkAwOTWcCx4YQA9aSGfD1AoRbj0nA3oLbQQz8wSsQunewhbH9mBO29/AEnpRPlZXrMG207RbDYwOTEhmnTSvbYNZa4ZhSKNTXXhOWeceaSmjpDHk40x5VX+HMUkBmBOOGgSmqQz0LUCzj5zE7r7BrFgeDGWLlkKoopDbQahr2N8Xw1f/tQX8eUvfR8nHLUMpx23EJ5HIlMTljgd17Fp3TIcs3wrbt81CS8lyIhiohY0KwdL3mNlfDIf7Sel35yKz0/3NH7h9zcb25LqXG/4wgUg+3JkdALlvIFy1wL85JYHcd2P7qy99lWvWv2lr399+5Em4K95lfJus6c7j9GqgVZTRWueIlL3kg8wr/mjekMdhZ1foQuYrfkne2fzdDACTxQAOl5zc9rx2T8J6ScrDVR9HcHWW4jbo7jorA3YsKIHSXOH2G/DqGB2Wscdd27B0PAwZhOgkMsRqo+pyVGk0SxazRrgukjrnRqd3ghUqqE+Pq8N+QPKqrqDRZiPbfgZr3ju46EUWz1jubaaDtslJThFs9VGqauI888/C2ecfTZyJUOMSFOzgVCnPbqL4il9OG3jifjT3/tzfP4LN+CEtX8Et2wgbO5C4LWlLFi+ejU2rBnAA3v3I4hbQspJIg+x15AZquHkYRIfIGVN50llrMss+KsR4S///irVRV3Gy1zMNMTcJVeA7bJ3kqJVd/WHN+8vf+bjn9322S996TmdBTwtGcCypUPHUP12y87HxLlX2WSJutzcvFiYnEJFVVRWym3/d67Hb/IncwjmEpxA5ljbeRrSryDBRG1VmGkbRjSLxQMGzj11DSqOD61WE7CMkS9i247HsOyoYbzgd96AalrGRC1CpBmYnhpH2BzDuhULEPhNRTUW0V0NluXIBTCJf8gYbaJln/Ep5kucP/maM8Y6NEUR+TKFfRBbMleDqVtwHfZH2tB8g1gNULbfMgLUWtMo9pWV+arvo9RTRv+C9fjWFz+Oy+/eg/PPW4zYewyeHyGXN2HYHi6+4Hjc+OAWtCfb8APA4EuJ6XzsIAnZoCsioM7AYdBpBv759f9Te9M54iXfggGTGA02IV0G3DRCrZXAMbtw+11bcM6Dj87+4VvefPyHPvbx+/EcXb/WANBJX9/57nefeeqpL7nmBz/enC/lymj6Nbimi0Ck4TMO+Zx+hzp+xRDT+Omf92Tr8Zvi8Wn/4//tZ6MBeTJlBpiiBqocb5RKMDX/yKFvQ2+M4tyTT8bapd2Af0Bw54ZbwGQ9wMGZBt7wJ2+HXelGww+h58pCU5HhZxBA9z34s1Nw6DeYjUMtixRhZbWt9AcP9QDmKxs96TWY/z9iFw5pdDKqymnsujmx+xIwEDdMGiMJGnBtA4Ztw60Mohj1wk9TtH0P+0dHcMM1W3HjHZtRDwr47g33YMPGXpTyaqJDwpU/sQvHrFqKY9ctwp6fPIo2PRwcR7IBLXXIQoYGoiEzSHWW4ymPEJYiKXTiQJi+/6x3RbDYT/w+E9hEKDabpoKTYKlD7R+rJLObR3fvxUw17Prghz9834c+9nHt6RAtfc4FAJ5YvHH/8YP/fsttL3rNgaE+c/DAVL3c8Amio2Y9G00csllzZlJZYjgH6PnveIserwPw8974Tm0qrMQ5vg9hrppAbhHNoKDNYtGwjRNWdqPPjRHONgXnYNg9uOuuCXzmq3dgxekvw9r1/Wi2a4i8KsKYQiGAkxqwUhN5puJRx6lWrpja/NqTNzJ/VhBQ7In5vfUsG+j4KYhWtpoUsCHHJEg3lHoOU+WgleLB+x/Ajr1jGJmcxv7xMRwYH8fNN22HFnShe+Fy3HTvAzjl7i684OLFsCwakUawC0yXqth00ir8+K5tBBdD13z4IeFTOuy8JZwHUzMRc+Mp0z7l3UdT1CxL+ZUW+cwdhyFeJzYcE8KkLYSwBSK87dG9OGqJPYLn8HpaxoCcAJx61rGrXvHS55WnJ7ci54aIOSaT95y2UiYSItwU7CarBQ5n2v2y64k6/b/Ed4s9dseaUnkRKplpjfp+aQ2GP4JzT1yGtYvzCOvjIvZhFPow1crj7kfauPW+Fj74r9/CfQ+Nw7L70Ns9hGV9y1CmUq9rIW+aMpk3MoDRnLvFr3IqSZKSuQnLtcss0+Wh2m0i5Z1FGSYFRD/qZGQmARzTxcRBD+//u4/jX/75i/jKV3+Mb33nJgRw0b94OfRyGQdrVVx98y04OFNHqNmy2eO4CU1v4PRN67Bm1TAstIGoBhOkNHuiiEyHITIl+ZoJA+9IicsUVNfl8XNfXkd/4fH4B5Y4CsupwFpUBObzkgyD4DMLfqzjwUe2kSVI4cnn7Hoa6MCpKK28+U1vXjMx3TSXLR54sB75eiPgiZpTxhmiOE8WGqHBGWYgo+T+KliAJ5On/nmptIKpKtNNZdlNuCqfT4g0rKGg1TFYjrBxVQ+G86HISxEn1ErzeHifhxvvq8IobcQ1Nx7EnvFP4Oyz12Hdmn6YaOCCczYJVVhnXpwh5SQl7jDvZCM8xRc9r/RXyMDMDbfzd9n4nYuaiXdm7wDJNJatYdPJJ+HsM8/CVdfegHJ3P3K9C6GbXaiyQaAZKA4sxD2P7MAtd+7EZWcfj4KdR9ycgpbWMNRXwNmnHouHN29F1ZuBWyogSQNEFEdlv8d0oek8jVXjs+N6LisT43zqb7cyLO0UGUochImBhjgl69HCrr37xK/hubx+7RlAZ9N94nNf2nbV96565MUvPGs2CSYQeFOKYz4HWmGdzREO3SoyItp/83N4sr8/6fcJSlFHQvESdufFj7CNqD2JszceheOWdcFN6yIzzecfGD34/s2b8cjeBkJzAczCUdi1N8K3v3kn/uov/xXX//BuWGkRqa+LUIUuun4KoisCHnOovV9xKVHAw/+cpdjK1DuT/Jrj7REZmML3ZtHda+F1r38RenpczM7MwHV7Ua0nAvG1K72IzQqm6y6uu347ZqsGXKcMgwpEcYTIm8WmE9di4WAZWtTiFYGVRgiDFiK/hdBvIwkD5WqcTVbmZha/ijBwJ4kSkWWl2KTwBalkAeJjaNDunQjBZ7f55zNWE5ANJ5YCb37D5T1LlvbUigWOAPnm8VRi+s/kUKH/WBqoE/G/r0nzy/kBqINYbiVq72c3kfAK9Bi9ZQvnnrYBAwvKSPxpRM2q6O/vGWvgB7fcg6m4DqMbMEopzJyJ8YkplEp9eMfbfh9mYkIngzDhqC8UqXCewHIOp9SqfyJp3UOziLnX8/gvOixudEqAThkwv/s+1xVUD/ZpCESSkosWYQexYpWDM85eiThpoTrjIU4ctAMDM7UYXlCCZazA1kc8bN08iYiqzrYr4CW/1cDC4T5s2rgBpaItqECNsmFMx8NQBFODwBcWqFKA6ownO+HgZ70n2s9+sKRJlJKR6gOwCFBjRoFGUJsiTQX9+FxeT1sAoNY9S4ErXvlbC/+/972zvGggP5v4U7B0D4ZOl1+m3boCB1EZl6O6jvImV4cp2hEL6czofooxmp0rj0sn58hFj/ueQ7L0vIk66TeFJR2h3Eo1KSagAXJOjCiYxCknrcKy4TyCxgT00IPlFhHrZVx19e04MBXBKjnQnCaa/jiqjRGsPnox/vEf/x/WHL1CVHyVcpB6tiK/JaxEtfETmX9yMkIuRDYK5GxbZLotxJEh9uVi+iH/xlo6yygkcrEGPmTUrWSxDwPcZ+l/fHifQJR02JsZRbk7wvnnHwPXVToDlmHBsQsIxYU5j3xxCar1Iu5/8ACm6hRDUbJl7I8U3RgnH78WveUC4nZbbrhSMQdd5/vfQhy1KYksTE/Z+MK1Vu91x1loPpbhFy+H1Pd3mqnz7pSMb6D4FORCPJfX024M8u2rvnfw7b/3iuF///vXdK0eno7scCuC2T1wDA2O040YJfh6AbGVFyw3m7tStRo8J2ORvbZEi08ZcBKpJ+MlYc3xvtZFFUYQBvz3Dthkrh4kS67T3lOVI3H+1CQgJ06PHZhpCXpaht80YCU6XN2HEU8gau3A0gUxzj5jOfr6TUT1KQStCEb3Mtx5z3786Ma90M3l6C0shkOLg2YTp6xbjv/956/HueetQb22C3EyK72OSLMQp3TloYgIO9YxjNQXGDFbZc2GJ6IgEem7FRuRHyFu5+Hai6Cl/Zg6WJPNTcBL1IpgVXrR9CN45DUY7KjwklBoxc4yLJVxJUYsnP+UEuwGZcGoYtQR/7GRxjmZTJx07BpccOZ6JPU9yKGGpF1F3jUQaiE8M4LRU8Ztj+zFo/sDaDbpzjFyVgPR7A6cdtxqHL1oCczEkU58zZtBZDcAcwppPA7dryFPz0I4MFIHAVmiIlDaCd5ZIM5EYjriTnMOTY//r/M58XKkKAjl2zlWPAQuk0orZdBUjMrn6nraAwCbalddddXoH/7Jmwb+6o8va21YrkdGcACaNwNElNVuw6OVFUdJpi6SU3YuB4Pc+IzsQV89bmOSTVja8uQjfZcbeT4zroPZ64BNOthz5eendO46gNRs2i7oxCQ2EPoaHLsk6rd5Q4MeTMLw9+OF56zFsUeVUJvZK4HH6FmEg/s83HzXXhycoJpwL+zURmPkAE7ZsALv+tM3Y9PxC1Gf2I5CicdeW2pUNqYi2XB86CI0ajBtZY1ql1BZshq58kLoVhnTjRi+3ouRGR033roDkzMpBtaugZfGaDbq0MmzmJ6CTY0+h6YiDHG8BkrsQ5NAoAhWqi5OMjl2TjqU4xGzH24QGyXA0zDc241LzztNmp12WoXGmb7mw3QS1II6EtfCntEZbNk5icAsICGmIJqBEY2jJwecevyxqOTz8r4kWogobQBGA2lShR7UVeYUMdljl96Qh5oRZLfonCnJ4yqan/pEp3lwqOchvAq9MwFRn9cNWzJMx8rhubye9gAQZ9iAa665duL0551ZfvNrXzz725ef0+oveUjqu7Cg0sKingA2qoiCukhQN+o1+O02XNMSSCk3pQhOCJNQWULNEUs6OX3n2M+G6tIHy7IGIvn4EEksYSFGSHVCkpUiTmR4SG1CYmO0vViw/bnYxCkrl+P5J63GoOnBCmeRELiS68Ut9+7GT+7dBdPtEiHPanUbNp7Ui7e+9VKc8bzlyLkxYq8OhKEiyDDbYGdakE7qoSAwTGNL2DOm4dNfuh0f/cqdeHDUhd2/DAdRxN9+7ia87j3/ij/6wMdwx6MHERWLCB0NdpeNOJyGkTZg8nRmYOywAzOxEzFGmRv9MShkQiJZcOAkRgKGsA4DcQ465aSNOHbDOnEUytF0IOXJqiGMYiSpgWY7wgMPb8V01UNqOMKqdB0dfmsWZ52+EUsW9cLWQ5QLzFwIeGL5olx6A78l0GeqDHeAT79Yuv94N+a5z85hHyTg8bry69QJIXThOInhOC6ey+tpDwBcJG8wCJx/ztk9F19ySt+7/uiV+Ve+6KTW2iV6YLS3J/Wxu1uadwCOGcMwKI2dSi3quG5mxKFEJtLHbXKp9ToW11IPKiihPtcyIIRXbX7V9Mpax0yL9RiRESHmqWgFgN1GmDblhm9Va1hQKOB3nn8uluYixNP7UHEt2IU+bN7bxI/u3o0D0xxjGkiiaRy9qoC/eOcVuPCiDZg4sAMIGyh3VdCYrcHQ7KzpJVfisAf1EUigefCRXfinD34K//m57+Bv/+XLuG1bDZvHW7h/fx25BStw8+atuPont8EoFRDbOmamJ5DvysMwlSW5oi9zS8eg4K/J+j59/C3ADZJtFFHuYWpMJCJ1CzzhBCwYGsBpp5DIxPeBDQrKmfuwLRdhlMLNlfHI1t3YvG0/CwAxJ+XJHYV1LF3chRM2LIWGJlxLw0DPAGw9L//OLC4Im4hSUniVXbl6Zk+96StmLqKO1LEDM6QxK1eZfgxUM9Y1GPaREuBpX6zlwjDCj2/8yczRR692fuvVF/f/r7ddmH/nWy+xX/n8tfoFJ/blK9Y0omBazC2KBUvkvCLfR7vVlgDALEC834gklDSzEwu4mQkC4b8dSinltpB+gXpw5s5UkbuFfbeYsl7k5TMIwEeYtMDDwrUTFLU2zli3CKevGUA5nEA+asJrBoi0IVx/zzhuemAcoduPqelxrFiSx1/++Wtw2imLgHgMWlRD1G5CD2IU7ZJEKQlIIjYQAnRFytR6gBCGGWKo10RvGfBqo7j2u9/Cg/fchrzmYd+OhxE0J7BwqIyFwyXE7RpyhgGHHoGhAa0ZQQ8AMysndPHzUwo84pc5r+GprotKuwmZJWCGEwhD15DPuQg9NvASnHrKSVi5bAGCdk0xI6kT6LgIwwS5Yhcmp9u45Y5H0A5y0sOh1oChe0iSKZx16tEouyGiVh2lXAF5qwjbcKVW98I6AmZR8GQawPdGsrdf+CbSfuoh7sYCtmYmkxm7ZPkhpw/lrhJM62m1x3za1zMiA5i/tm9/NLjmumsml65aan3qs/+8+vLz1197zdVfq/zDe38/OumkY2quA7S8Kjy65VLFxqW7rbKyVjGfmn2M9kSEdWbeqhSYg3yIE45ytjVEgizjA0i3PCMjkenH0NAJIomHJKzBm92D9UsdXHHJMSiGI0jCGehuAU5uER7YVsN3r9+O8bqBAxMzWHnUAP7g7VfgkgtPRNiaQnVyP3oqRTiGhdRPoNsuYk+YP2KIAs0XQU9hRGbPWUs9bNy4HO/9y7fgza95CU7bsALxTBOD+R686LwNePvrX4SP/NO78crLzoPh1xE2moj8BLGnAXY3QEQlNyqzJElylAYfyx2FEMwiwWEltRoJin8grwitwuXbIqxcvhCnn3o8Wq0puSbFQkH9SHoeR8RH5HH3vY9ibDKAnetGGMSw7QRhexTHHbMIxxw9jLTdRFDzUMhV4DoF4TmFURNBVBNEqI4gK89+lTspQxWylyF4twwAJc3ARMqNJUsX/MqI49/09YwLfx1SxmOPPRZ94cCBR6/64TUXH7thXfmSCzaaE+iPJqdvwOjBEUS0t865YACv1Vuq/qas2LwbWmmIZul0Vv6xxcXTUJlbsDXGQMCa0xD9e258ZhFz9tIyDlM+BVF9P4aKLVx81lIcdzQQje0XaGtiDaMR9eMbV9+GOx4aQal/EQbKBn7vLS/Ey196BvzmQRnLOSgAHjFwmRKN2Hzx+WU9h6wBFzF4sS+gmfC9JoKkjbM3rcVpG0/CC88/FaVKAf19OXz43b8tiEk/mAGqE8iZHkynjCiyxYSEXoIa7cAMdVJ3lJHlGneukACEWCIdarQxe5JJiiAD6SjkSyZAgQ0nr+HkE9ej++s/RCtsw9BL8KMUpuWi3mqir9iFPSN78fDWgzh68UoBTiFtC2mq4LZx3hnH4v4tN6E1W0d3Xx+MyES13YAXtZAGNdhhAZpVhA53HghqXiT4uUEhwxBkvQ4Bk0kQ4P3B10PjGR+aGWHdmhW/UpnxbFjPuAxgPjyXAhizs7PprbfdWb3w+Zcvnp5o9zy8+YFZcaPRKC/eFHVhNqiEXz7PAlzN+Q91fUVYfC7v5ebn6c/7nzeIINKhgTUr019+pDw5NytErdiOPZSNGs4/dQgXnDYIf/ZBGG6I1CrDi/vwg1v34sY7diJkINHa+L23vByXv+hMxO1x4feasS01r27SyAOIaXfOBmaxkJUoKSK6CBkcrbkIkUeIEiIq9OZ6MdsCJibaMM0yvFaEyZEp6JGOgm3AMXgNiKIEvIhknCJCTi9MB7Ew/NjlYEaTSa7J+FPA1ocEV2XD8xplAYHXx1Q06NBrSq2choT/hli2uB9HHzUsBJ9Woy6X3LRz4iRMT8K6Z2DzjnE0PfoxOqIm7JghmrX9OPnYVRjqyUsD1HXy0j8QC3IapsfUD6RFWiguyCo4PsX7qPPOZ2pSnZmHAbr+tpFzIixa1MeA8JzGAj/jMoDO6vDe+fHMTSd1/a+3vv3uv/jQp2oDA31lvxWKgi519XlDk3UXku6pfLrmgT7mNdTmocKztpA6CcXxiiKcLqZmaugbGoIX0GLbQz5Hx9s2ClaMoDGOk+kkc/lJ6CKBLJ1FoBUQ2Itw84N1fPo7d2M2SGBaHv73n74Gr3v12dDDUQT1abhWAQYKFKdC6hELT5y9JSCg0I8UgYZKvPkKothC2+NXluC3DTx6YAK3PvAwtmw5gNF9VQRBXcZri4b7ceqmE3DZpZuwYsVi1Gp7EfikEyspLM70uYloItquM93XUOjphV/nFKWK7p4ulXnIgyWOKgss24XXDkRr0C6VELaasF1SeAl7psR4FUevXoCNx6/GTXc8hOHlCzDbIH7AgpsrodpqotSzELfcuQVXPP84HD1cgcnN35iBW7CwZLiERYPdODDewNT4KIpdvegd6MVsc0zq8WZzGnm7W6jINFjt1O5zpKW5Q6IDZvppcBA/bQpnA2i3fOTLZTnq2u0GypUYralJDPWl2HTiepjReB7P4fWMDQCdxTe73mgZe/ZPDLZ9f9ag07U0dbJaXXCd2ew645NjbtZPVNkhzrn6pMoC5qDxGufvGvwowsqjjsauvQdg2zp6u7vQnJ1Czk6ge1NYWIlwxcXHY/kg4E/XBJ0YGL042OjGN264C/ds3w/dNvGX//sNuPyFJyBp7QUl54KYenQBDIMTC2UvJh5/NoObLueP7hTgyRjNRWp2Y3zWx20/uR+33fYwdo5XMRXyFZZRyi+F26Oh1TyI+0am8OCVN+G6ex/A6193GU47eSm6in2ImoGoC/X35+E3iD40oTllFEvdmJ6aRuiF6BtchFptBjpBP3EbuhGhkM+JvXer3UDOLcCOTXjNqlwLhYdgwsK+SgjDirFkcQ96uvk9vqAWqajMaxrGRC3mMFVrYWTCx6qFRSCpwXVCQf1pSRPrVy/G7ffdJeVNPqnI5uRER4xh2HQNGtCtHHSNQrE/Td7K7ownHRMy9acfIzUBCoWC0lQwYrg2n2AdttnAScevQyUfY8GiY2QM8FzUAnhGlgCPX9S9m5yp6zfetgVpmkMYaWL4oMZ+CuPNPr064dnhPiQlpTr98ygmIoqhAoL8X5SGTHHLpTZ+oxWIpVfONpEGdUH8me1JOMEoXnXpcXjeiUsQt6dgOyXUoy5MeAP4zLfvxdeuvhPNNMZlLzoZb3jt2Rjq9+T0j5t1OEZRmmk60XaahxRNaBa7/QFCPnPdQVsrop32Yrrdha9+5368/c8+gv/47C3YPV5GA8NIygsQdS3ClN6Nx/w8ppwFaHatwmRuKe4f1/EX//BFfPabd2OiTtmuPCpOBcnMGPK6D90qAIUF2HGwgVqUQ2XBSrRSG2apD1auC265W/QXeB3FEJQbmneFrct8XoalhF+KZkDmp5R6WLN6EZYvGUDoE2ugCeeeNGl2MnQzj6Zn4OFt++FHNo3fRH04JYAiauGUk9bB1EN47arKVlKgUChJyUdYMAVJKK8uDbu5PZ41LBnspZfx+DulM8kgeUwTjUa6NGkW+yhUawpRIPy4MYqy3cal554ILZypUQX6ubyekQGAqT/XSSccV/Bb9fRNb/6Lx+56aDecXLkLmlKeEedgNrcF+dVxr1UPQZJL5q8aQIehyOZpAhI4xK9mFmA5OYxMjKLSxbo0gh5VkUurQPsAzjh2GC84Z518rl5vw0MFob0Mn/zKzfjUl38E0y3h/HNPxx///m+jy51Fc2obCoS1MYVNbQEpEYYaJW0khNyaCZp+CwHHlm4FXlLBnQ8ewP/7x8/hI5++Fr4+jPLwcWjqPYiYDufLSB0bnqajkaZocYpQ6IJRGUbsDqMelfEf//kdfOy/foCD+0NYRg+idgS/2YRd6MeXv30zXv+O9+DP/+qf8YMb7kMjziPSC5ioB9DMAux8ET6JiIQS2zzVQ+hxIorBISXKeJ1jNiaJTGwiCWpYvmwYS5cMCyiI2gdEYUoGxuab6QJGEXfftxXTDeZkeZEBM4m19JtYvmQI3d22zP4DmpqmGnKFcvbWxAiDpvQbOj2AQ7JnmUszP/mzTmwaqJg6AlKPYzVR4LjfSNuwkho2HD2crFzaNd63aBWdUZ/T6xldApAINDPjJ9fd/rBnFQfd1MhLB53KQoS38tSaE4XQlR+8OvHVUs7w2dy/IygqpCA1FVBkeZ5aFNj0Ue4uKnpvOIuCWUNSfwzHre7D6192JgZzASYmxtA1tAwzXh4f/uQP8N0fbUGh0o8Vg134/TdfgaMXdcGIqXMYC3fBsioImh3hzhhB7CklXz2FnySwckVp9N10+1Z8/ps3YtdIiOLgOjR9G3VuGNdF0x9DXJ+Bbhbh0DjEZMbjw/cj4QPkdAf9PatgtXvw+c9fD6tu4e2vuQR95UH4yRQagYWrbngQtaQHEztnEX71GuS7hvHo5rtgaS2sWNqHMzatg2alwtPPuRxN+qL1b1k2KNQuFOiYG4gZV4AkatDiHUuXDCGNH1EMP4P224pERGQFm4Fbd27FyFgTC7vKiIMqbMsUjwO7HGLZ0gFsPbAf7XYdOaMAx85JmaTsu+nL0IbjKDWfQ1SmX2BmlzX9WFIEZFjqGgp5C2nUgOdPYml/IXrjqy411xyzcfBn6UA+V9YzMgOYvyaqnr7tsTE9VxkENHaMWRfSZmq+ui/TQmF3HEYklzo/MxrtcN7Z2ZeXnSoPOqHdMnUlKMiI0Q5m4Tg+GtO7sHjIxBtfdR6OXpiHEVTR2z+MfWMhPvbl6/GJr98AzyjAtW289rdeiLNOWI2kOgnNyQsKjs+VbEfNJABNFxJTnBCCShchU7IGQoX3HqjiW9+9BTMtF62kiFpgC8++ZcaoJXUUe0so5BR2QKYWYSjuPHrkoeK6cHQbjWYCyx3E4OLj8Llv/wRf/OEdGEtziHsXoQpgZCZFIyrCKC7CWBW49qb78Z+f+Qb+/gMfwW13P4i2TwHSAiLhObPeVyNQsWw3LRHPIIqO2gwcpUVxG3ZOx/JlC5DL2yqNz1iSDG4eNQ91G00vxY5dIwgjNmoLkIuRRmJ5tm7tcjgOM6Gm6PXRGz7nMsAzZLMP0FT25B3Cz1zPpiNz+DOk0DK3oYgoUHFq1tBqzCJnA2ecsj5ZMty12XVzz3EEwG9ABsA12WjDj2nDyROGHHnF4JPTXW5KnvySo8rNMzcHnsOI6/PoPdlpzM2eccap3CN9AUJ821WU2RNOahgYsPDyl56DU05cgmRsG2KvhpYOfPzz1+Pfv3YDlm84GxMjk7jgrFPwysvPgelPISa3vxlDD3Mig0szD47PaD/nGg5MK0ZMTboIcAvdaMc53HnXvdiyYxSJuwhDi1ehkZoYqY6j0OWCmfTk9DRykQknLYgYqcBXhS6bQPNbSH2LdzomqwG6y/3ILzbxL1/7HrQVMV78gjNwz7YUzbgML0lRcF3kuwrIlbpx7oUvwEBFx9rlPapmb1VhETuQ0D4theESR0BgkibMS/4OXk76DIobURxg4cIh9PZ0YWwmkhKHIpy0eW/XAskkbLuIBx7ejueduBDLBgqImzUYpiN33Zq1y2E5N6HWaiJOepDEOhwnj3arLjDjMPSfpNk3TwW5wwx9gkkAs0MGjjCiUxOEk3DMmqNab3zdK/IrVw2t51TjyPoNCACeH8AwC/CImDM6unwkjNDhV1FmErrmSKe6gwGYpykv1FASbXQRiEhTgloSQZ9pIhnNz/PLArhGG8W4ASsaxUuefzIufd4G6P4MGqGF/VMlfOwr38P379iK5SuOwc7tW3DGpo34w3e8AhWHY8IYLuH0DQ+2m4Mfp3ALOfgBdfB4s7kigikbKQCsfBF1T8NDD+3C4MAKTEUFTMy2ENoOnIIDL2ghCVswM+IK6+EkaSGKmtCdFI5Ftp0M8JArFNFs+phqtVAulZBEQ/ivL9+O4TVLsWNfEQenPPTkc5gYeQwXnXox/vIPTsGB3Seip2ig4DJhb2J6to6eCj0LYzmRbTbgpDQiy5J/4hiQJ6oCT0dBjP6+bvT3ljEyMSJjO15TYjI83UdI6U23hIe378fYjIelQz1ox6GUMYYRYNlwBd15YGqWkOJQRqKOQ4BUKrgLvi4BFpArIRiNzCZewDyd8o+NSVsOBfYolHgsSxaF9MwRJRY0YMDH0gVG8uqXnp5P0tpNXZWKNjU19dxs+/+mBQA7NWFGNhzDRqC3JQvQdSL+TJLZ5e9qLMguNBPREEmW+ikxz1iw5VZkI0fnXq+BVGshAevcBF35EqLQF8WaidEdsK1pvPrys/Bbl52EPGrQQx8P7KzjXz59Cx7YOoUFi9dhZHQP1i0q4/d+51KsWzmAsD0D02SHP4HGm5jEGyMVm29O/Nyii0azjpxuCvmH7TAtMFAwAL8Zw/NSwHZESISpqzxnvqpEhy03Od2UG4itzC6dICgGPSY8DhBEszALlkiKNz0fCQpo14r4u/fejXZiwsnnYZt1pOksLj9/HcxpHwvMGaStGtJAQ2KkqJSoQ0AmZAo7byJhCk4HZYPcgBiGFSJOCVemrRvFQDQsGBjGwkFq7D+MnnwJSaIjaPsolSzEQRuwCtj52AHsHmng2HX9MPIOmq1pWLUcFnYtx6a1S7Bt6y2whpeIklB3dxnVSRNBs4lC2UajWkW+XIBt5xFFzDxC6CYfMeKI3Qk+FxdxaIjADJ+rYTOo+wi9AEWbjPIRdHclyRWXndM6ahFuWrlixWXzVBCf8+sZHwDIOqW+XKVQwHizLptHiUKoh/gFzPG8Fec7U4E7pAek0eg2gOkYcK0I1ck96HFjnHTCKhy1dIGgw8olE/VqANNs4LJLNqDSZchN+a0f3oiPf/FW7JztQ//y9ZiY2ImWV8NLXvgSXHH5RQgbk0jiFnSSiMQ5OFOjlamE+uhHHC9m8FooBaA0aMJyKli/fhUePHAv9EKvkNVi4vgTDZbpStYS8RTMXH1FZYf+o1RISiJEdOBNYpFXIxSXkYG/kloaYaCjXk3QTmZRKWuoHdiL9/yvN+C4NT1ojO9EV4HXjcQjZW8WSZHdAdrwEndEODpw6gxF2SEOJZpQesvlElzbhG0qpGFIp+VYlVohsyu7jD0Hp1ALlqNMN2iLku987k2sXDYkzM5GbRa6A+SDPMqVXjTkZ5CB2UQCmqVkPQgxY6EpiialBDUUvDbtyGiV5oowDPUVwjRED1/z2D4Mdie44oVn1t7y5hd1FQr5F0hAy1yVjqxneAbANyqfSwPW5RSP1CMHCe+UOWXrbOxHFh1ngoT4SkBQghZsABLjz80T621MzIwih1GsP8rGa154Cs7dtBIu6ijmEhwYfRR9g8vhp5zNt7D9QANXfutOfPlLN2K66aI4MIQgqgNmiE2nbMRLLr8MYeyj0ajCMQFbbiwlOSJOwiofkOcUCR5fNRrZV4cZw0+mYZlFnHjSMtzw0GbsnZ0k4AlWrh8FtwtplCBNiOgjXZYJcceTQN3wcioz30kCBD7x+orp5+gWKuW8KN747VkEjRGESRsvu+x0XHrRcSLkUe7Noz61D109ZQShCpUK7NPpm7BkwlyWpQaEmSuLFkvA4P5xcjmUSAbKvt/QDTml04hGKY56/baDB7bswPj0WpQHCYUuCmqTbMvlK5aJcYfvUV7NRMsnV9mBR94FNzKqMvIVLgZ7IMRs0Iqd411mgpoFi9MWm0pKPlr1GUTpLEqlBI3x/VgxnMflLzi99bpXX9h1z103f6m3u0vff3D0VzeYfBatZ3QAsCxTX7dqkb14QVdrz9gBWJWjEETs6vO0zUAhWgSdAh48WTMzEcX/tuSUShNyBNggs7B/1y4cv74bb3zFWThtbQXldB+82X2YHqlh8WAPxkZ2Qu/qx84DM/jkl27El791H4YXnob+gR60Qx8Hx/ZhwVAOL3v5C7F2zQrUpvejUrJhpkrkUgmPKWFtwdtLGcIyhS4/CWLW9ZyZmynSsIEoncKKlV1YfVQ3preOozoZoGh1AZGHqcmqmIUUK91IdaXqEzFFJ7ZA1yTdZcaTy9E9OBGVXboT29ygFE7xfPjeFFYstHHC2oV4+xsvQzmXoD6xDwN9OTh5U8RVQBCUwGzVxueoT5GklCahaqzyNqFaklCpJBhw3Cp9FPYH2EsRZV9V/nBCY5gmQhqMuHls2bEPjx2YwtL+HoXhYKDWQiweHkBvVx5TXgzHdpGwPwJd+icULIjABmFLRrR09qVwibzrqQbbpMVYIojGnJ1HuWzBLWoyeYlb41i9yI1e9vxN3hve+ILiIw/f/plTTzv79WIQ8hx1APqNGgN2HG8mJ8a9W2+58aNnblpv12fGIpMNIUJNRa9PkTtE5y9j91FVV2NAEKov59bk2mtwdQOz+7Zi44ouvOUV5+Cys9aglE4gmNmLvryDvnwZcdNGJb8C9945gj/78w/h6uu2YOXasxGaPZhpR9AtHk4pjjpqKc4+5zSZmRfymell1JLGogiLHFIWFFWdRDT4mLXkEEe2OhWZplsxwnAGlXKE337lOTj71KPQlaujPrENSXMEA0UN/UUDjhbAopy2FsE1Umk0Ui+R+DorVag58g3g12AmdcTeGNr1vXDtGo5eUcHlz9+IP37Li7GgO4IWTqBcSBDOjiFXysMPSIzpiG8q0VGOAGVUKjRpRamVR6z0+JRUWIa14EYlylFwFiooUH3HoFhprDSW4DiYmGlg52Nj8CgimprCymTQpFz4mpVLEHMUmKnz2k4OmkXUDoN3iDikkYgyieww/DgF0ZIIppGgUraRt320ZvegPrkVFacabVzT7b3rD15mvuMtLyg++MBNHz/zrHNfzxFmh1tyZD3DM4AOEejRHbvCN73t7X/0lc9e+cZvfe++WhR6PZyvc+7Pm1GkuSXNpktvJyNQg+A5VzmmxQQNNcfwJ7/9Opxz8jAmd9+D7hzdaxI06kChtBJ+1IWvXXkzPv6lq+HrK1EsdaHZtlGvN+HmXfgBrb5irD5qhdSuzamDyBmU8I6RsjwR33vFtlOOoTxFKbzJlN2CoSvnYyOmJXobpm2KJLUe17Fm2RBe9eIzsGiwH7fevh3799M6rC6kHHIJ7EpPRmnI2I6cepKrz3KFU4awBctOULINFLtM9HRXsH7tUTjphNXYsLwbC3o0jD+2A715E46RcCYJvzaLfKksKL+O6KZsMBFTnSezlZGrMpF9+ZRsQ92QUR2lvDi2kyyE0FvpVRiIIpqfpjBtDalpYN+BMQTBBpESs2Su30beDHHmpmNw/5ZxtOuTyOsW8sVu2JaBVkSOgcGWCTSLVmWKy88XT76A0HpprUZ1KD1AMTcb9Q4bwQsu25R/xRUXmvfefM2Hv3bVzt1vev3v/islyzqGqkfWb0AA6CzeTEetXFI5YdMqe93qwfCubZMwcoNZy0/dpInG0RGdbLj5SOXtKN4owUtR046aOOuYZThrRTfy3gi8eBqFnIXQKsOyVmJspoRPff42fPEb98A31sAudykV2SiEo/so53VUa0SoxVgw0CubqM4bPPLguBxHctxEqXCmx+ykYy4rYQNLj0wYpguDqhqJB9+rI+9QbThE7DUx09iLFQNLsOjFG3HqcauxY/teHNg/hfGDkxidqWHSmxWF33bbQxSyBKCpJ1N/oLtSQqXUBcuMsXCoG+vXLcOaVcvQ1+uKhJrlN9AaGUVJj+FoxiF2HxtnQoNWGYts3DllIp7snQDA05eGhVlDkHLtwsTU0fQ9VOuzCCNfnISk+cfXy8ZiQkJOADuOBec/MTGj5vYxy6FUSYC1JnHZhafi2h/fh4d3zyAN8nD1EmxCpdsxTJAQRGVm6jOTsegDCZuCLSRxI4qDmue4hr5s4UBy6UXnFS+79BTztlt/8O8//MGV97/rXe/85MjIWNKBlQvP4Mj6zQkAnTLg0Ud3zF77o6vf/zuvuvidt7/nC17BLru1RhvQC4JeCzIFcLaRZdNy94snfGbnhRT15iRe8IqTkNNnETb2oavMc8RDM7VQrzfwyS9fh69+bxus7hXQtCKmWjWUKzaCdhOuTUvsOvJuDlbOREA6b6jD4kgvMhC3efozp8+AKUkA6hUQ7aebFPUAAo7PGAT4dayzGah8UnB4YzNMxGhPjsrY7KihAtYvXocg1DAzVcVktYHJZgutMILfChAyAGgWHMsWaK1tmujqLsrmL1NhLAwQeDXEtUlELIeCEE4SI+/kMwkvC3E7Rj5fFjgxm24dlLRsfpmv8x1QQBoZCbDD77UlNdfzBSQeIbYGpmdnMTkzrYRUWP4w2nIEy4wriWBTeDMM5cRXdmMhHFuX52gIfbuBpYOL8LpXXIwrf3QPHtg+IqVY0UrhiVEkcwANcYvsS5rJ6HDtNvKFIFq5fNBcu2pjcclgL848dSPuuuOm//r2d758/T994B++vnPX3pCvgEGSehFH0v7f4ACwY9fe8JWveu27/vn9/zZ7yQXH/el1Nz2ia4ltF4tF1FotBJEFK1fKDicl9BGTdJOQFJMKDDTUPKxY1g23HMjgYNarwy2WERp5/Mcnv4Dv/GgvtJ5j0Yx0hAk19XNoRXWYbqZ8m2qwdBeT4+O4544HMX6gif7uLnhVT3T7I2HNZexDx5YGGGvjhB3xNJJuuR43kTDf5t8dF2kYCjCIjSziA5gNJH4dkVdDXVxygbJtoGuhjTXMeqT+VbqHRM2x0aZUfFPEkY84nEA0SSZfhFzWGGUWwiBj6jZSbnYCdUwlgx0xtaYeX8cAhQAa2fYKN6F0ElW2wVlsGqr5IlGYTS+UDGrv/oMYHZ+AWyD5R/ViFN0ikkyImg2EPRpphNUrl4l6k22mCNqeYBaIzw+mD+DS8zaKDsMXr/wRNu84CJv1feTBcPKI/Abi1MPA4gpOOGFV1Nunz55y2lF9o/u3XXffvXd/sD2d0w4efBAf/8+PXr1l+6PyRpDEREViz3tuM/1+owMAF2s2y7IwMzOTfupz//Wxq75//fsuu/yPJqdmm32WVoZj5hDHBqIghGE7AlyJwkDmxESvaUThiKRPDM8KJBCQVZfLL8J0M8Cnv3oNbrx5O+J0AESG0uQiMgmyjaDZTGupUKu06vXUhGPmcd/9W/Av//oRvO63X4xjjjsKSWMSfmNGGHGe15bnq5s2Uo/pegTTNmCYbYCTipDFC/UKLWiGo0yPo1S8EfgfUW6SJIh+IcsFlggNBO0pNV2QFJqNLDUTZzOU6TbddS3x86OZalYfd5R1M3VUgqfURVVOQQoKzXS/Yz2WFVbzhPjIqCMU2G9UkSt0SWLlNwLYlUGRHtu5+yAOjk3AtDnao7CnB9PMyySB1UXoecibQF+liJNOXI+uUg5efQyu+D0a0Noe7EKEA/sfwvFr18ByLsCXv/Uj3HbHZhiRL4Gz1ZhGIV9Ed8nDK15yqnnyaYv7du7ccv27/+IDL7vttrtJdZhbwl4MQzzXKb6/8VOA+YvNJNM0MTU51vzOt774+3/2h69IuvLN2YkDm9Fb1jDQ53JwJDUo71ACbhzXlvSPGyuOQwRJjD0zE6jpFlpGN8abRXz1yvvw/e9vQ73aDVMfzMaFlPJuItUbggUIybwjtDWkKImH/r4F0PU8vvr17+Fv3vev+MSnvor9UwGMwjD0/ACM4iC8to7mFDXuDVi5skwDWs0ZpGkTRtmAUaQ4dwy/RdYhT0kbOq29EiL/NFgxYLFOTgCLDUxoKBgaigZQ1DUUTaBkYu5zeS2Cw6yCgKA4gcmAQuYe3ZCijPyUdfllTsHygz0L6Vewc6/ScxFIla9QbLo4c+sV4xXW/5YFJhGxUUKu2Iudeydw592bUW8nsJxC5jykyq6QgSsOkWdQDiN0V/JYunRQJjQKwsvPp0I9Tv0ayjkfRjKK1UsLuOScjegpWnDoUpTMwrZaSKKJYGZiK774+Q/91zve8Y4Nr33Na2Tz53I5Cbjc+LT54sY/0uh7FmUAh0oBYPOWLf5XvvSpr3/3+9f+W3NqHB/99Pe8mfEtbuIMouB0w5ObTuB26kbkzawlME0L/YNLcM0tD2Pj8S/Awt5h/NP7/w6337ZVGoDtpoa+ylK0mn4GJspENMVejM0spq05MdeYqdaFsEKc/vW3PYD7H9mKH1x7M049+QScfsrJ2HjcBpT6AL/aRBL7cgoz63fyPTKi9An5FWktCwYNNJkF8GROvEOGNnMnsPIxYN3OU1xZZSsJMxkJZN35jtsRL5LautlIT/2IrKHPiQGrB4WRnDv9ZcOLJlqGoOy4JXE0aIpjEMgE1Cw0CdIx8nCdXuzfPYuPf/Jr+MmtD6BQHEScOggTdvzpogTxCuCNVXArmJ0dwfDwQlEW8qKm9AXSyELss3eiIWw3UOrLY7K2E8gN4bRNR+OH31+ILdt3IUx9kRnTk0Q/sG9XNNiddO3av3Pf7fc+ULUdW1yjjqxneQbQ6eCym7t7157Zt77tzetjb/xdH/nAO92jlpSmnXQcib8frjkrqrN5O4BrJar+z6T2Hbsb19+2Bw/sCPGZr9yB71yzDTO1bjTbHDktQL2qiQegoMu4H+JUVIAFCEPLrjCGH1JdxhH1IKvQjfLAMvhGN67+yQP48Me/gXf+9YfwB3/+9/iPj1yFex/aj5ZP9l8v8uWFSI0uNMMC/IAkoSISowjYRUQw0fZDQQ8w/af8OOsCJckpsqWCJYhiQ+zJuLmE+CJy3dTeIR8gyfwLEgHtEWhEheTEoNKRgVgER/lvyuxE8SX4kYQq5aOonJEyNSXh2ypfgJjByXbkYxSbMO1ujE0F+M7VP8F3vvcTjE+34bi9Mt8nE9K08jIKZeSxTAtxSIBSgv6+HrEDE+FPgWyxBFLsRnEWCmeQz1EybAqFXITTN50gzdMCTUQpTKrBrFVr0YY1a6/4k7e//U952v83GkU/p9czNgPghmfqz2aOOP8gxeZtO/zN23Zsvmrou1s//rFFzkf/7V3/9x/+9Qsj2/dOFw5M1pNau1qMUjewrZLpuhWbyLI41OE1I5QLG/BP/3w1ENdg5mioqcE3UrTQQt6yZYadgLx2SmmHinufiQyRdWi4FKkM4RP1B3rLt2CYFiqDqyStfWDbKO6+fyd+eN3tWLlkECuXDGH90ctw9OplWLd2FXp7B1DuLoNgucRLhJ9OZCBptRodfIgREKYbYbLCiVMKvtIdYHnSOakPed7pQnrK5E4FunvI/agjokFjTLE8m6v1mfp3TDIPNe4y4rzSLWSiQm/fIBRkXV/PEOLQxf337cSXv/xDfP+am9EMLPT3L4cXUFORWYKSVqdDkGU54iDst+kJkMPE5ATGJkdRHEwRxIkgHMVt2VbPZbZxEG63K+y/RnUMxx6zDgMDC9HIuWi21VSiVBzAzKQf7TL27xU1p6cB0GMYNKIlyKnDPVG9JtKjf1PHjM+4AMA3l6o5rOe4+XnBO/BN9gP4b6OjY8mbf/dNf/vJT/yn8cH3/957tu5p4a4Hd+LaG+7E9LRnHtg3jbGR8dlKsb9s6wWdp3nBXYh9u7fIiZcrloQNGCYe3ApHiVV1Bmqk7TLlFoMgmIS7JoooQ/0+mnXQbVc0Cc0cNNNEU3w9DBS7F0PrChEHHjZvH8OWLbtx8y13o7urgAXDC9DfP4ClyxZj9dErsXLVMixZ1IfewR4JCOHMGJLYE+56Qrgv6fbcwhxrEh4vM3hFfpKNq2eqxllKz7pbpfqZbFZHD0EamFnpkIGI1HeowNYx4BKqcWZFLprJpg3DyqHodqPuN/GT2x7GXbc/gpt+8gC2bKbtVxHl7gG0IiBKDJjCGEzEHYiKP/liEUmkFH0LhSJuvvVOXHzhSiwdGkYUN1Fw8qhXPRQEcBigUM6j0a6jmC8pNqKpo7u7gpmaB9cto2jlMHVwH6qzkTk+s7vJ+4AZxq97xXGCmLqGT7A6KMOOES3mfxQRE6VkIqbpFIh4hqxnrCpKf3+//rd/8+5Xv/Vtf/z5zucsSkqxs26aEgz6e3uN0844o183DH1qupH8w3v/742f/uKX31kxypdecs4Lf/fKH96cjM+GNbvYX965a0Kv1hqo1UbhuDo0XenF0VVIhLG5CbJCXGppOfnZ/bdEFy9gOWAxJU+UsE1HmSBS5Bx22QlRpTYehw8mU15xEyLwpy03SC7voFIqo6u7hP6einjtDfZXcOIJG4RXPzTYh+5KQU4aQePz98QhvMYMLObEHNWJFFosgSKifBa3rMzMFSBCmYsckkeXSQEbfrwRecJn7kcdvT265BqaDtPOw8oTSGBgYnoW+w6M49HdB3DtDbdh964R7N2zH77HTnsZbq4CP4jRpnYgy6KO5HpCym4AxzQFvsuGZpdrYGr8fpx1+gq85XUvwIrBMtCsYrjbRXNmP0yLJh0tcTGeaejoHTwGj2yt4/984FMISkPY89gESjaVgpJkZvSx6IqXXXjfdGviLZ/4/OceFDm3X4Owh8FSKo5x5plnlP/8z//iDx65/Sbfi0KnWCz5R61a4XzoY5/59xtuuGn2l/mZzCqzmDAXGERo5bkaADonf19fr/GJT/3b3z24df/CVUvWvObh+x/4+9OPX+X86IbrvvG+f/3wbQ6zgyB4Qmjn8ccfm9u6dXt76YIF9pLhhaX3v/Nd1x5/7vNPuOfePXjX//soduydmht1Eb5K3zretGwokbKLuVaYIqXIR86zaFctHlIdwQkmyDy9Orh/zuU7pJlsxKbHMEziEDjmk5mmUHcZwHxB9IXIuwwIRQH0FAuObP6uUh4VOv/092GgvwdDAxUsHuqGaWnI53MoFgtwRW3HgGkqiS5VDqgOPp8fMwPlgkPh1E7moBqqlCUPohghdRVFVFXHxOQ09u4bxf6Dozh4YBx79u7Hzp17MD7lIdYq8FqCF0YulxdcADdDpyJhKs73QTEJM5FWKSuUw2COkIioCTNt4NJzNuJ3XnEelg5YaE5sRSXvo5BLMTUxgUKlF7FWQit0RLJs874aCgvX4T8++hkM9AzCtRw0Z2cax69dVmzF1dd87fvf/kIhl9Pavp/+T3f+TcOQMu/lL7ps9T/83/ds+9AHP4qpah2FcgW9vV14aPMjd+zd99gNjmMampbEvewRFfIoFfLo6u1Gb18vunp6UMwV4p7uLuPS33rtXz7Z7/l1B4FnTADoLNp9/efnv5l+6KNXwky7k2X9ffrzTliGN/3uixp/8zd/+aK//9cPXs+IzHmvOtWYeqnvVeYWh9ZxG9bnevsH3QvOveRb379+6/P2jnhC0ucN0+l+MpDwwY1J9I102WWklTnJMgCI+TBrcqYFRLwd+j1Sq3c2f8eGSspwbkS1cThr56nNkZzYmZOeHEVIIsVgbDWaqhHH7MFM4TomXJtuRzpM3YBl2HKq2tl4k4HSsdlAU2g3PhiyLJNBQSkIiYqQ8PfVBqU8GfXxKZfd9trww0hm9yOjE/Ix8FN4TOHDWOjHvk+pdQu5Qq8KtJLd8FoT0cfpinJiooiICpSZA9O8j65lIvJacG0dWtyAEVXxqsvPxRteeT70YASxN4qSmyAm6McqwC704P5HduPeh3bhghe9ErNJHn/y5+/F9HhN+hCRFyVT46OtjccftW20uu9VN952y6P8XWL1LXX5/8zSs57D0gXDPZedecbIdbfdM9PdM9wdxBR6DeDmHLvgWLBtaiTYMtJlgWLZVJs2YfFzli4IUNuycd1Nt33S0PQ2jWfyroGenhJK5dLEJ772vb9mU1T1vJ5jPYByqaT96Mpvfur7P3nQfv+/fCeotnvRVV5q//iuvcEDDx7wVqxcVd54/IlnJ0lyPS8iJaekETQvYs5ne/FEeuChR9rAI+2R6f2PJdZy2mwlhmbq3Hys64kTYN0c8aZmPS3AGKUoSTKq6AmIfmCGmBcorcL4q9/RsdxTqr/yFzEdyWZ67KaJsCVPXuqaxNKpZ4OMcF5m7vy33p6CMN8In+VJzoZgW5yPfcQRlYCZmnOj0ZpLna4KtqumI7xp+AT58/hnIc5I2sHXyK8n8kCpJlMrn5kPT3FmAW2PYCVX6LiWnVNAHsNAsWxLdtT2WqLpz2slgYSBa14DTv3x8M0v10bX4QWs1XOiaRAlEertWXzrBzdBQ4hXvvgsVLocNNvjKBa7EAQRdu7ch1qzjXUbjsXRG4/H9GQdL3z+ufjPj34WaTSAifEZfcHQEndy0j9x6aLV3/3+V99xxwc/8tH/c/X1Nz1mi/aiIID/W5eeve6TjjumcsWl53/9yquuCxYsWtSr6TkzJ9MSkaSL4iRJiBchUpK2b4Q7sxSLSNjiiJonS8LNDfT2Db/RMQwJ3Eh8zE5PwzIS/OGbX2l/5DPffLdMgn5NxKVnTAAwLQPHrD3+dd+5dQQ+ZlEaXIt620VusMv2vAPJ5668LjlxvVaVeuxJLs78i0ahCa6P/vt73vHxL3z1hY/sGY0K3d2m4NW5U+T9YGSn8QW74QrML3t3zlCMpzJ/ikpvefJL1zwDzYowhZLPmaOqSuItJXimTERYrO4KZp9pJKO7KBCz7tayMVicyoiPslcMMDzRbLuE7v5eQf01G2TbWXM3JMtH2ehi2BnOZUPy82XMlpF2GKwydZ6ObibRkRzt89VaKTC4UImCqI4/SxSlXMzTigKg1DEga1LS/kxsZf61fmLXHmktotry0D8wKGltvd1ET+9STLfG8cVv34SDY2O4/LIzUHTJpqwK6nK2VseSZauwdPnRhByiq2jg0gvPxP133Id77nkUCxasZqPRrDfaSbW1f/VNNz64+l/e//6z/+K9f3XGd39w7YGc64iG5H8r9j9VjT1dQ7leq57bjqLZLrdgskHJwMj7KdWowaTEVAnusow89HxemrOEfZmc1mQiNfSICOI4oqGt7SXIk2jWCKN6MGnXw+RNYRi+e0709LkUABRQ3cLm7btaptudn6iFsPMD4uJq2S34hq/ffvftHm/Ejkfcz/xpWVp/0sb1b/7KN9wuhHFEM01p4sm4S0mDR0KrVeMvZRfGjroajfHGF8mxDv+dYhdZh4Ark6HMAoQSrVRCpVmAkNqYDjsMAsqxlycBS5WOgJnUHDodiG04TOWpIBRHgjtoB55C7Zl07uGNTb07TeDDcugTxWcYEjwZVNSkIAte2UxfF7Zkp0OtnnUHL8TEZXy6rrYrx66Wqzz1Uk1Ob9p05x3VAGOzjT+DqX8n0+oEhSdaDBD5fEGVEx7xCjnhXmiuhvGp3bjy6jtx59134Y/f8dso51N0lXNYs/4oLF22HFo+j8b0KIrlitiIXfGy52Pf3hExDm21ExiWo1s5N/nmD38cPbJr6+JXv/Jlt/lBsOna624c5e9mAGW2898SBjSCrxJs37m7sXrJcGJaTtLyYzEyiSlgIkKz6qKL9wR1J5NQRFPlQBBBVWVNLfTmiI3UkqkFlKmLEcYWNLtg+kk7OTg6VfrWFz/+wZe++s1/1Gl0P2eAQHQBPuaUjYWZ6f35MKp5gwu60I5m4WsNtFBzb7jvtuC4jSf8zfv++q9eLDp4FI34GYssMGYLp5z5qhNca+Dr6xat0o1WFOnU0Pc02KEFzdehhyZs+g3EROQZc4IXHJ8JWZZCH8J2y0Zk2bitM6Pv6OeojxnMFhQttaWGljMg5JyYgYYbnwAcNiEVT4GCnOwSsiRhfd7yAjnFiKwjSpDU2xCeQJNhBMJRMJwQuhNDzxE37CPUWoh0H5HhIzF8pLoPGFRR5r+TAJjKIyZYSKORGlPSABEC2KQz0wzZiBAkTYRRHXFCuy8asFJWO3jCk15p9WeGrE8m55bPi0cAx4NUCG60U9Q8DU5pGPnuxbhvy2NYtHwDNp1xHjZuOgPLjz8eRiGHuEniVAteewaGleLsU07AK15+GZK0JaWJ5eqoey291DVg73xsLPmXD39ysW1Z13//m5+/5bxzzurhte54CnJTMiD8MsvIKMSdsueEY9fnP/+xD96+Y+9orbdvoEumHWGMMEqkl8LMiUrKKikyoOms+R3hhNAdWTdcYavyfuCj0fTl8/kCzWDZ/efvs+hRmY+i5BLetwzE/Pj4R4fe/KwLALzQI6Mj7UsuPAszE/tQndoPy+BsfEY86cM0TsarQV++3DvEEuDnpUlslPGE+u7XPv/3n/zn/+/lRS1J9OYs7LAJM2zBpmFnFIAOXq6M+zpGIlk635nfZo9DPtqdza7EPxS+nlMCPiwRqgw7D42ngQk3X0TOtSWQxEkgOHmZxhOhl0SSEbBU4O806P7j5kQ8k5x61s6aydk/pw8qgIgbYuqLDl5MMw5JMVVpwgyH4ihEFvKj/D4yDUlT5p9FNVkhCA0tQhi1aKUpHHyb6T6xEKkHXWy0aR6qRD4Efccyg32ADPjy+Mbf/EWSUqM6K83LUqmIgBqHqQHbKkLT80hSB0uXrkG+1IvuniHYVh5xtYqoXoWehigV8zCpM9CcRt9gFy696Cycd95JaLbHBLfh5mm2ElLx2GyHejI6Vl/zT//yX6dbsG770Pv+5oG1R68uKu9IZiqHypX5Dz0TWpUeyrzVKTH58dhjj3Wvv+nHWw+MVo9qe3E5SjTdtB3JIg3TgEVBVMcS41RmjpwmBfQlDFTTlWUByz4+OgFTMqiECMgQnudhaGgIp5xyGi6++Pmcy47z2hJv0rnO8x/SwBaDFu3ZNwUYHhrUv/DZb8av/uOPeJXFm9wZv4BiyUWtuhP5dApFvdr60Ht/L3rgvpt/58/+7M+u6gCGnmh1wEPDQ4NGEITJt//ri3d896qbTv78V7+VuIUunR1n2AX4sY2GH0vqxjm/zJZjNcOXLrtDgQsLQaiahsrHXjXCpJFn5JAkSqwynyuhUulBvpBDO2hjZnYGLTrsEuWXkBqs6nJlUkr473zfOzVSU89dddsFvTdnY8Z1+EYTOvC8Px8yRZv39RIMOIGY//lsQxxmuzFX3R86FRJO3zuiIb/c4mtls7bdDAVjwEyIxCeqKtWrIxjqsRC19uO6734Wtj6LshvANSOxY2f/VLQTEjbQNMRGAXaxH9t3HsTHP/sVXHPjzeLo7FLSnWlyBtnWUy2xDUtnszbyx8eHhvLNdWvXNC++5PzCq9/yZ6sOHBx70hmblt0vixcOGZ/84F8++pa3vafd2zuUO/nU0wvnnXfRwP33P5L88Jrr9Fy5AsfJodXmfcfxoCoE0/nXlVlkdk0F4i1Ik0yoNjNZjcWCPhCK9F+9589xzjmnw3Z1JO165Hn1fepN6AAFgMj3fbPc73zu4x/7iz/6i/d+nQGZweBX7Xc8g3oA6hZc1N+FwXIe9VoVJlxJTUtGRWq66XoTe/a3y5bmlp/YIXbez8r+cWRUvenPf90VpwRBkP7Dn71r21e+dtXqvQe3JeX+JXoQOejuGkStxRNN3fq2xQhP/LuPRp2ilC04blEAQOT6M/pT6JMHS8Tozs1H1A6x8IaLEI50vs1cDJsThfaknNwKjXfI567jGdgh73Q8Czuvi9ME0QGQMeOhJVt9/uaXF/zT7jgKME9YcyYtPreUXPmhzwg2MCMXZZLmv6JuPnshFCYtFvLi3dBkZ5xZA3UO8nkEfh29lQK6u0pwUlqLs8Hqw5QNE4sUGFNtZlmePyuTmtUbluIP//A10OwA1/74BtlEhu7KpCGJTQTtRCe2wbXdxHb6BmZmG7jl9s24895tOGp44fiJa9dGA0N96OnuwqKFA1i2dDFKlTIc25o8/cJXrOfzZt9o/0htuWGUYbu9uP/+Hbj33kc5KdGdXFmCfIs6AxKk+f6wTp83/WAmOfeuEIil+BYM9p3rLRoQORd2kUa0KY4/dgNKPRWg3USgdzWQlQAAEd1JREFU62b30ILlmULLIVtE6SOkeNtb3/ypN739T//9gx983++8+91/d00HHPcbnQF0oKpDQ0P6yJad8Rv/+GPe9XdNuWbxaNHEyxUBL5xGq30Qm9Z2Nz79d2+1P/axf7j83e973/eYBRAy/Isu27Jwyw+/uetLX/3h8mtuegDNMIdm4CBX7EcrUMg+vrkE59DFhtkhZ9089fkGcJ7O5o3oVOrMDnKIEht2roJK1wBsq6BENEzq4jHKN9Ge2AU9rB3i2ksHr2NsqvT4leJ350bKbiFpIOkZFuFx9liHnf7z38j5gYD/oODNT1TtKfZh5w5TjcssF1H/l2DUsVv75d/TOIzQVamgVqOCky1CKLXaJLpLBqx0BkcvreALn/wA8noTsTcBLWnzyzI/BRkNKQCVZmB2dgahpqN7YBCtMMGXvnIlvvyVb2Jyso0oMDDYvxSFXB98LxZmZxI3YRgdLUB1DVggUauFZRb7SI5roF6vwnap3mQ2ikUXvT29+kMPPJoPIyVHxjKAvQwK0PA9ZfBvturKMCXTZZzbrJ3mMC3cqA8JWsJnwVQ2s8q3BD2aJIL1WLJoGF/66mcBLUTYnIFVzAuFWjI/IX0d8sCkdX1M7Aid2qim0qji9/7Xuy765Be+ddtTDQTPkAwgqyXJJdfi1uknHqPffNd1cA0bcaghblPbrwzTCbFtx37s3jtuO+UeuUs6JAzWcRz98dR4osWmITXrfvzdT907tGTR8r/55/8vOeuG+/S/+8ePob6/hrpHYo2rjCs0atYF8NptOZkIzmFDjG8gf6nNjWlznGhDN3Jigsk31rZy0rjz41hGdJqVk9OXN7CyDDnkdHt4DaemDcr4Qs0HKDHe0QBl8/DwjZ31Jg4xh+ex4w7/OjWl4A0pV2neJVcqQIfEQDJoX2YKcujnPbU8QFm2EVgUKoUkuZVD5B1OX9piprJm1TGoz06glcxAC2bJe0TOtZQJKSdrRoxmu4VSVwVdfV1oNxqIWlRS7sLb3vp6XHrBhfjSl76Ja6+5BWNjj2FWmxQ/QsJwOsYklB5LBJmlXi8ZivRQIE188mAVPb09aPseZc6K7SDEwdHHoLvdKGlFTEzOyPtY7umFoRmo1qsCVLNtB6FIKs2/PJ3JkNyV88xqsuurdOvkc0Sz0lCVvIl2u4md27Zi6ZJBBXOPIxF16VxFmSoJDJxCMgYMi8a4IWzDLU7PTLfe88dvvrU6Wz3pG9/78T28/9l3+I0LAJ2O7dj4eLLimHXl2699OPr3z17bCpNW3rRK8AMfZqkIS9Mxe3AX7rnnEdgUjHIdFAsFvdFqJn/9J7/1xt9/4ws/8dj+8URPifYzkBgONKuEwMhBF6trG+3AwLev34Kb77xS37ZnGlMNF+XBhag3IoRBjCAJlbo/62bTAAEbJoUsQqoCc9/IEF7GhxyVBZGHIHHQ5VQEtUfIMA8F5VxELJDq8FIuu7PJZHNl83lOBOa4/vLxcJVeZWTKVPiQc89hSz4/zwvxsAvL38VpSbYB5n52hzg0h4c8FAQyMrKKI0/yc3+R9zSLQ5xolEpdqFaraHt1lAtM1avImS2cctKxaLem0Z49CD1pwTU1zLJ5SVISEXGajmKpiJY/ikLeRalUQMv3UT1wEJo1g+GuLrzzT/4Av/WSl+L7P7we199wM/YfGFOOzzGBQTGSiMalxFU4islHUhmtz4ncc+k0baDlMVMwUO7qwYxHSD/dBBVpjHJvzaYn9ue0HBdretqQSUNUSafPR45kb8rcR+n5zO/jaECz1USlXIbfamHfvn34x3/8AM553qno7SljoK9btA/L5Qq6e3qRq5Sh6Q60MEi8VhuabYoDkt6qYXrkYDBxYH++I0n3VN6rpz0APL6b6ft+Cqu69Zhjh5fcfM/+xMgt0ttxgDw3EO2hNLf4o+tuxt/92Uu/9sprv4Q0rYqU13ithXs2jyWlUg9yTiWhoWiSuqj6GtqeiZvveQg33XYvtm5/TK+3NDjFBTDzA2in9N+rINftIm7UkPrc6AEs10Do1xDQjDON4YrdVlvQZuTca6YL1yqiVCyDP49uOMxgOglzB5NEeTKe5prG567Yb4IryJCHVMmdwzU8PgB05siCP5hDDqgv7Zz1kjF03JB+6uoemvvPlQEd45RDXyyS6pmsunyc94Oe6piImVlXdw8mJ6fhxeT7u9DDGNXZMdhGE2ecvAHr1q5AGEwKFFhkFCXd0RAQQckASm8ATUdtdhZTk5Mo5GxEfiTpeLlMqngVSdPHYFceb3nDFXjrW16NA6MH8MjmbXjokZ04eGAKB0cOYmxsAq1WUxqHNC/VHAaINpwceRDjKFbK0rUfHZ0QngWvhNdqwXVzcHKu/D7Fd0jg+f4c6++wKzTv2qssTonSqI2vSjx5r6QZYKDRaotgas7N4UfX/xjbHqVgzTq89IXPR21mSuky6gbsXC7pH1igL122VC/394nsHZIAfq2Fx/bu7Boou+juqnSaSL8ZAWD+pp/fxRzsK+lh2MJ5l56/8d1//5+tb93w6UZP3i4mdoo2ZawTJf80PnEADz28JTn9+IGk2YwQGjpKPUv17tyAHsQ5TM342LN3Blt27sBDWw/i0X0zmOUYPd+PfO9aBE6ISM/DLfSpMlM3UGs1oJk28m4RjtZA5DMNN1HpqmCg5KJsaajOzmCmXkWz2YJPBJ7fQhhwVu7AMEtiYsE3SE4FaWDF0kcIBVVH/V+lxyfdW54eHf/CDpWU/2WBQ4KCqPjQ82D+KTN3FTvmY/MaePP+Pufnp+DLHflvJaV+eJ9AZQNZytoJBHP/mr2eX+b9zZ6NtFNsKvN6YH3NRdHVk45fg1e84sWwbA3NakNYknQjZlAyqO5MMRYOAUyI8jCrr1KhJJkZX0trponZ8ZoE0kKpDKvgwso7cEsuBvot9J+zDs8753gkCbOACI1mGzPTMzg4OoWx8UlUa23s3z+CmWpDZQyaiVbDgx+GqNXqyOULcPO2jOjYPyhHRYTZtImITpNQ9JBAKUUSmruWogfPlxFnPhWHrqRYu8n7oombM9N/PY1Q7KrA87owMjqOemMJFi1aiAlECcenumHqtuvq1foMrr5my4OtZpuKNUmBTdRWA+NjB1ubNq7LR3HcUNdde+YGgCfb9AsG+0xGxkrRNR/81rvaB9uA2XU07tjuoZLzikk0A9vpUeMenYSLIqbbBnZNxvr5w+v1xmRZrns1dnBgt4ctjz6G+x7cg+17JlH3DKRmEZG9BHapD7NVztvLsIom6jNVxDVPCDSxPwMjacFKm7CjujjN9PVqWLdqLc489Tgcu3o5SpaOmdlZjI6PYd/+A9i1dy927T6A/SMzaAQJAq2FNKpCs2y58bjBCfW1yAjUE/hJE6A1ueD1Owewmgd3qkeSgWgeopp6KQwqAGdjJhEJyE505d1Bp2D5LgUBJuyXZWKHFEWAIf+uTAqyjd8xLM1O2GwMqVSIFPT5kMkqF2Guh08Z1JRAPV/VjMzQjB2RkSzhoPTX1OgIBvr7gZyB2uwotLiJY1b04YoXnItTjl2J+uQuhEEdXYUCEIcCrKG6MK8JgTVsvtqmpaYGXhvtZhtd5YpkWvQTtCkCGkcIWnXU69OIxiKqnMPN59BdGRDwUck2UckXsKC3hKOPWqTs2xiQpX/jQC+UUZ+chh8kmJ6awV+9969x6533oat3SH4+ob5kYhLOzdFbo9GQN6/TBFSxUXlRZFBLUVTWO+PelBKth7QWeb2rs7MolwqC9nxszy4UChaKpTwcNyf3ecFxdVtLUWu2KIh7+833PPCpd//Dhz/28/YYHZKfUQGgs+lVA/TQpl+yYMAilZW3y73f/qhP3rgWhxgZmfUEUBPVsbBQdi8983h85Qeb0b9kERqhJW9IgDwmaiY2T5jY3u7DSLWBrY8+ip/ceh/2Hqij3jYR6kXo+cVIqCpLMQ/aiYUGzFxBDD20pIW8G0CLpqH5VeTRQJcdo7+sid33qcefgGPXLkVvxUKjNgN/7D54ZioCnUt7DawaGsTFpyyUBk2cWmjrZXziqz/G927bDavQj1aTYpoJOP0W3/sCVT0CeM0JBH5T+gqgik6SF51A3qgElcRULY4DaTLSHViLLB6ZyJkpfFpj0yTTVPoFJPKwkSXJRpTJghEiJMGAxqEMNLQl65iWZmVC5gMocGRJMxlAVANWTjPZ1xmmgEAnaUQqyzDhPsT8M6cjxD4ogAuDE383eyRMdlXQSJHn1GRmVKzNurQWTj9tHV77qhdi7eoh1Ee3w4hr6C7Qp6Alv5O6BNLUJWtSBxxGMAqNtNpSc1NcxGf9zbm/TZS9oj7TikyUhuHIuDiupxibOgjdtODmcigUXGnemWygZYGKega5fAHezD62SFHq6obWaOKYpWXcdtMEeakIIwt5twvN5izyhW7J3jj2ZV+i2W6IKxHHfJLqiyciO/eAlQF1eN3l+mQlnuyBNIHr0EiVmzVAsUBk4CzarTqWLVsClvrbHt37k6G+LvP+zdu+9473vv+f+b10gO6wMudWVop0OCZPZf23B4AOgo6r86T4/+WLhqxiwTXDIEqv//L72pUK0WEaJsdqLQs2TOjI2aW8SPHpBoa7Szh29VL86Cc7EPkeoiBBLQiQKzqwuxfgof1N/N1Hv41dj27H6MgkYJRgu8OATr29EojtYZqeGBEcS4eleWK3xQeNOYl8669YWNTnYqhSwgVnHo9lwyUsGSrCCOuoT+/DzP46KqUcursNNOtNaUyxsyzeI4Iyi+H5CQoDq7FkuALb5N+bMK0+mU9zKB14s6jkUlzxqpcSBIqHH7wT1bFx+n+iNpuiRV1LzUC9XUMjqIkOGe8Tv82RJCGkLjS9DJjEGOgi7DnXqtN0+DTZMA2UCyU0mw0EnodSoQjHsVGr1sGThBMSnqpK7IQxIYFBHAPPfDoacYKS+YqL2lAmVqE2OBGKamNLNiJiJEqURBCCdCk2FAOR5CFyFoKwLSIoXfRV8GoYHqjgBc9/MS668BT0Vgy0qgegRXVYRBpmP78z8hTsQ1bgmGK1lvVLsvtL8PadjLsjaiInjOqpSMbDc55AmShCc3YW9alI5MfcnINSsSgf2ZNA4olHIfdV0q6hq2jiRc8/HwuXLsa4lyJMbTzyyE7s2nVQsjOOBPm9vObqOanySWA/82zTBCTGH9rpCwr3bF5fJQObLV++DM+/5ALcdfvNmJgcTS686GJ9dGTkjpf93p9c9ESnu3Ac5pGwpIf0K7IG/9sCQAdayYvUOeyXLRqyBnorbrvtJ1/78P/Zc/TyJX1h28e+2XGvXp+KeEO7dq5oEcUljR92bWP4KaNzivVrjsLi4QewZd84cpUlIlXVDFpohyl2jzVxsBrB90rQ832iVouY9EpDRD11OsrSIAQNuDx9G2MompEIbgz0FrF04RDWrFqCY1YvwqLBMsL6BPS4hurMCHJWglIlhV6yEXh11Fs8bR1BpakUV819OZeV564BRTa5kMqoSstVVOefp4XrIJoZx/kbjsKaVQNonLMOeuAhCVJMjbbghSZ27j2Ig1OTGKmNoh56aHo+ZuoewtDFbMvBtoMeTKeIKCT8l+OnjJ8gYqmGNLC85qRIbfXku+C3PFRnasjZtNbmTUIiT9YFyGCvvIF5ycVPIRsCSA7B1JvQZMkIMrNVg7qEhth/yy3ODc9TjqeejDwChO0WWkFLdA0qXUVUenNYuWAIG45ejpNPOg4rVw4DURPTUyOwDB89lTLa9SlV7hxG7lKnp/IfPNSr+CmMYwarncsy552Mskmk0aocnGJpJqbw2r7U3vxaypYVCgXJKjg+o4cBwV3r1q/HMSedCr1nCNMzTXzww/+FrVt3IfQ9+EEqHpCkRHPuzmCosiWV4HcmrQJ4Yo9H7hVVNHXqc1FojkPse+wA/ub/vRcXXXI+fvdtb0WaEnpt4bFtD/WevumksmmZehiGcRiGiWZaGB8d9ffuOzCX4x9xOzqyjqwj68g6so6sI+vIOrKOrCPryDqyjqwj68g6so6sI+vIOrKOrCPryDqyjqwj68g6so6sI+vIOrKOrCPryDqyjqwj68g6so6sI+vIOrKOLDwn1/8P/XskqSjaYkMAAAAASUVORK5CYII=";

		const POS_KEY = "dsh-ark-usage-widget-pos-v2";

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

			const saved = readPos() || { right: 20, bottom: 188 };
			// 旧坐标可能来自更大的窗口/更小的缩放；先夹回当前视口，不然会跑到屏幕外。
			const pos = {
				right: Math.max(6, Math.min(Number(saved.right) || 20, (window.innerWidth || 1440) - 74)),
				bottom: Math.max(6, Math.min(Number(saved.bottom) || 188, (window.innerHeight || 900) - 74)),
			};

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
			whaleImg.style.cssText = "width:100%;height:100%;display:block;object-fit:contain;pointer-events:none;user-select:none;-webkit-user-drag:none;";
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

			// 挂到 <html> 上：桌面端缩放如果落在 body 上，fixed 会跟着跑，缩小时就飘出屏幕。
			// 主题变量从 body 抄过来，搬出去也不丢明暗配色。
			try {
				const cs = getComputedStyle(document.body);
				for (const name of [
					"--dsw-surface-1", "--dsw-surface-2", "--dsw-text-primary", "--dsw-text-secondary",
					"--dsw-border-default", "--dsw-border-muted", "--dsw-color-success", "--dsw-color-warning",
					"--dsw-color-danger",
				]) {
					const v = cs.getPropertyValue(name);
					if (v) root.style.setProperty(name, v.trim());
				}
			} catch {}
			document.documentElement.appendChild(root);
			window.__dshArkUsageWidget = { root, load, toggle };

			// 窗口缩小 / 页面缩放后，把挂件重新夹回可视区（之前存的是大窗口下的坐标）。
			window.addEventListener("resize", () => {
				const w = window.innerWidth || 1440;
				const h = window.innerHeight || 900;
				const r = Math.max(6, Math.min(parseFloat(root.style.right) || pos.right, w - 74));
				const b = Math.max(6, Math.min(parseFloat(root.style.bottom) || pos.bottom, h - 74));
				root.style.right = r + "px";
				root.style.bottom = b + "px";
			});

			load();
			setInterval(load, POLL_MS);
		}

		// ---- 插件页「配置」面板 --------------------------------------------
		// 插件页里点 dsh-ark-usage 卡片时渲染这里；数据与右下角挂件同源（GET /api/ark-usage）。

		const BUTTON_STYLE = {
			appearance: "none",
			border: "1px solid " + COLORS.border,
			background: COLORS.surface,
			color: COLORS.strong,
			borderRadius: 8,
			padding: "6px 14px",
			fontSize: 13,
			cursor: "pointer",
			fontFamily: "inherit",
		};

		function fmtPercentText(value) {
			const pct = clampPercent(value);
			return typeof value === "number" && isFinite(value) ? pct + "%" : "—";
		}

		function fmtResetText(iso) {
			if (!iso) return "";
			const t = Date.parse(iso);
			if (!isFinite(t)) return "";
			const d = new Date(t);
			const pad = (n) => String(n).padStart(2, "0");
			return pad(d.getMonth() + 1) + "-" + pad(d.getDate()) + " " + pad(d.getHours()) + ":" + pad(d.getMinutes()) + " 重置";
		}

		function UsageBar(props) {
			const pct = typeof props.percent === "number" && isFinite(props.percent) ? props.percent : null;
			const width = pct == null ? 0 : Math.max(1.5, Math.min(100, pct));
			const color = pct == null ? COLORS.track : fillColor(pct);
			return h(
				"div",
				{ style: { marginBottom: 16 } },
				h(
					"div",
					{ style: { display: "flex", justifyContent: "space-between", fontSize: 12, color: COLORS.text } },
					h("span", null, props.label || ""),
					h("span", { style: { color: COLORS.strong, fontVariantNumeric: "tabular-nums" } }, fmtPercentText(pct)),
				),
				h(
					"div",
					{ style: { height: 6, borderRadius: 3, background: COLORS.track, overflow: "hidden", marginTop: 6 } },
					h("div", { style: { width: width + "%", height: "100%", background: color, borderRadius: 3 } }),
				),
				props.resetsAt
					? h("div", { style: { fontSize: 11, color: COLORS.text, marginTop: 4 } }, fmtResetText(props.resetsAt))
					: null,
			);
		}

		const P = {
			text: "#a8bccf",
			strong: "#eaf2f9",
			border: "rgba(255,255,255,.14)",
			surface: "rgba(255,255,255,.055)",
			ok: "#4cc46a",
			warn: "#e3b341",
			hot: "#ff8b8b",
		};

		function ConfigPanel() {
			const [data, setData] = useState(null);
			const [error, setError] = useState("");
			const [busy, setBusy] = useState(false);

			const load = useCallback(async () => {
				setBusy(true);
				try {
					const res = await fetch(USAGE_PATH, { cache: "no-store" });
					const json = await res.json();
					if (!res.ok || json?.ok === false) setError(json?.error || "HTTP " + res.status);
					else setError("");
					setData(json);
				} catch (e) {
					setError(String((e && e.message) || e));
				} finally {
					setBusy(false);
				}
			}, []);

			useEffect(() => {
				load();
			}, [load]);

			const plan = data?.plan || null;
			const windows = Array.isArray(data?.windows) ? data.windows : [];
			const spend = data?.spend || null;
			const subtitle = plan ? [plan.product, plan.edition, plan.account].filter(Boolean).join(" · ") : "读不到套餐信息";

			return h(
				"div",
				{ style: { padding: "20px 22px", maxWidth: 560, fontSize: 13, color: P.strong } },
				h("div", { style: { fontSize: 15, fontWeight: 600, marginBottom: 4 } }, "火山方舟 · Coding Plan"),
				h("div", { style: { fontSize: 12, color: P.text, marginBottom: 18 } }, subtitle),
				error ? h("div", { style: { color: P.hot, marginBottom: 14, lineHeight: 1.6 } }, "读不到用量：" + error) : null,
				windows.length
					? windows.map((w) =>
							h(UsageBar, { key: w.key || w.label, label: w.label || w.key, percent: w.percent, resetsAt: w.resetsAt }),
						)
					: h("div", { style: { color: P.text, marginBottom: 14 } }, busy ? "读取中…" : "没有可显示的配额窗口"),
				spend
					? h(
							"div",
							{
								style: {
									borderTop: "1px solid " + P.border,
									paddingTop: 12,
									marginTop: 2,
									fontSize: 12,
									color: P.text,
									lineHeight: 1.9,
								},
							},
							h("div", null, "今天 ¥" + spend.today + " · 近七天 ¥" + spend.week + " · 本月 ¥" + spend.month + " · 累计 ¥" + spend.total),
							h("div", null, "token：今天 " + (spend.tokens?.today ?? 0) + " · 全部 " + (spend.tokens?.total ?? 0)),
						)
					: null,
				h(
					"div",
					{ style: { display: "flex", alignItems: "center", gap: 12, marginTop: 18 } },
					h("button", { type: "button", onClick: load, disabled: busy, style: BUTTON_STYLE }, busy ? "刷新中…" : "刷新"),
					h(
						"span",
						{ style: { fontSize: 11, color: P.text } },
						data?.fetchedAt ? "更新于 " + new Date(data.fetchedAt).toLocaleTimeString() : "",
					),
				),
			);
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
			// 右下角挂件 + 插件页「配置」面板（点 dsh-ark-usage 卡片时显示）。
			if (ctx && ctx.slots && typeof ctx.slots.inject === "function") {
				ctx.slots.inject("plugins.bundle.config", function () {
					return ctx.slots.register({ name: "plugins.bundle.config", key: "dsh-ark-usage" }, function () {
						return h(ConfigPanel, null);
					});
				});
			}
			ensureMount(40);
		}

		exports.apply = apply;
		exports.inject = inject;
		exports.__internals = { clampPercent, resetText, mountWidget, ensureMount };
		return module.exports;
	},
});
