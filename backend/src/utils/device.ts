import type { NextFunction, Request, Response } from "express";
import { HTTP_STATUS } from "../constants/http-status";
import { AppError } from "./app-error";

/**
 * Server-side half of the "exams only on laptop/desktop" rule (the client
 * check lives in src/app/utils/device.ts). Uses the User-Agent and the
 * Sec-CH-UA-Mobile client hint. iPadOS in desktop mode can't be detected from
 * headers alone; the client-side check covers it.
 */
const PHONE_UA = /iPhone|iPod|Android.*Mobile|Windows Phone|IEMobile|BlackBerry|Opera Mini/i;
const TABLET_UA = /iPad|Tablet|PlayBook|Silk|Kindle|Android(?!.*Mobile)/i;

export function isMobileOrTabletRequest(req: Request): boolean {
	if (req.headers["sec-ch-ua-mobile"] === "?1") return true;
	const ua = String(req.headers["user-agent"] || "");
	return PHONE_UA.test(ua) || TABLET_UA.test(ua);
}

/** Rejects exam start/resume requests coming from phones or tablets. */
export function requireDesktopDevice(req: Request, _res: Response, next: NextFunction) {
	if (isMobileOrTabletRequest(req)) {
		return next(
			new AppError(
				"Assessments can only be taken on a laptop or desktop computer with a webcam. Please switch devices to start this exam.",
				HTTP_STATUS.FORBIDDEN,
			),
		);
	}
	next();
}
