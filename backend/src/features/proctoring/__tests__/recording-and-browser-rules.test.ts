import { describe, expect, it } from "vitest";
import { runBrowserAgent } from "../agents/browser-agent";
import {
	baseMimeType,
	detectVideoContainer,
	parseSegmentMeta,
} from "../services/recording-service";

describe("recording segment validation", () => {
	it("recognises WebM (EBML) and MP4 (ftyp) containers", () => {
		expect(detectVideoContainer(Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0x01]))).toBe("video/webm");
		expect(detectVideoContainer(Buffer.from("\0\0\0\x18ftypmp42", "binary"))).toBe("video/mp4");
	});

	it("rejects non-video payloads", () => {
		expect(detectVideoContainer(Buffer.from("<script>alert(1)</script>"))).toBeNull();
		expect(detectVideoContainer(Buffer.alloc(2))).toBeNull();
	});

	it("strips codec parameters from mime types", () => {
		expect(baseMimeType("video/webm;codecs=vp8,opus")).toBe("video/webm");
		expect(baseMimeType(" VIDEO/MP4 ")).toBe("video/mp4");
	});

	it("parses multipart metadata and rejects bad values", () => {
		const meta = parseSegmentMeta({
			sequence: "3",
			startedAt: "1763460000000",
			durationMs: "30012.4",
			hasAudio: "true",
		});
		expect(meta).toMatchObject({ sequence: 3, durationMs: 30012, hasAudio: true });
		expect(meta.startedAt.getTime()).toBe(1763460000000);

		expect(() => parseSegmentMeta({ sequence: "-1", startedAt: "1", durationMs: "1" })).toThrow();
		expect(() => parseSegmentMeta({ sequence: "1.5", startedAt: "1", durationMs: "1" })).toThrow();
		expect(() => parseSegmentMeta({ sequence: "1", startedAt: "x", durationMs: "1" })).toThrow();
		expect(() =>
			parseSegmentMeta({ sequence: "1", startedAt: "1", durationMs: "99999999" }),
		).toThrow();
	});
});

describe("browser monitoring agent rules", () => {
	const baseBrowser = {
		tabSwitches: 0,
		visibilityHidden: false,
		isDevToolsOpen: false,
		fullscreenExited: false,
	};
	const run = (browser: Parameters<typeof runBrowserAgent>[0]["browser"]) =>
		runBrowserAgent({
			attemptId: "a1",
			browser,
			state: { tabSwitchCount: 0, lastReportedTabSwitches: 0, devToolsOpen: false },
			cameraQuality: 90,
			now: Date.now(),
		});

	it("emits nothing for a clean frame", () => {
		expect(run(baseBrowser)).toHaveLength(0);
	});

	it("emits fullscreen, clipboard and window-blur events", () => {
		const types = run({
			...baseBrowser,
			fullscreenExited: true,
			fullscreenExits: 2,
			clipboardEvents: 3,
			windowBlurs: 1,
		}).map((e) => e.type);
		expect(types).toEqual(["FULLSCREEN_EXITED", "CLIPBOARD_ATTEMPT", "WINDOW_BLUR"]);
	});
});
