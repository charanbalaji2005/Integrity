import { type IRouter, type NextFunction, type Request, type Response, Router } from "express";
import { HTTP_STATUS } from "../../../constants/http-status";
import { AppError } from "../../../utils/app-error";
import { sendSuccess } from "../../../utils/response";
import {
	ConfigValidationError,
	getConfigAudit,
	updateAgentConfig,
	updateConfigSchema,
} from "./agent-config";
import {
	getAgentOverview,
	getLiveSessionCount,
	getRulesView,
	runDiagnostics,
} from "./agent-control-service";

/**
 * Mounted under /api/admin/proctoring-agents, behind the existing admin
 * middleware (admin + support). Mutating routes additionally require the
 * `admin` role — support staff get read-only access. Enforced server-side.
 */
const router: IRouter = Router();

type AuthedRequest = Request & {
	user?: { id: string; email?: string | null; role?: string | null };
};

function requireAdminRole(req: AuthedRequest, _res: Response, next: NextFunction) {
	if (req.user?.role !== "admin") {
		return next(
			new AppError(
				"Only administrators can change proctoring configuration.",
				HTTP_STATUS.FORBIDDEN,
			),
		);
	}
	next();
}

const wrap =
	(fn: (req: AuthedRequest, res: Response) => Promise<unknown>) =>
	(req: Request, res: Response, next: NextFunction) =>
		fn(req as AuthedRequest, res).catch(next);

router.get(
	"/",
	wrap(async (_req, res) => {
		sendSuccess(res, { ...getAgentOverview(), liveSessions: await getLiveSessionCount() });
	}),
);

router.get(
	"/rules",
	wrap(async (req, res) => {
		sendSuccess(res, { ...getRulesView(), canEdit: req.user?.role === "admin" });
	}),
);

router.put(
	"/rules",
	requireAdminRole,
	wrap(async (req, res) => {
		const parsed = updateConfigSchema.safeParse(req.body);
		if (!parsed.success) {
			throw new AppError(
				`Invalid configuration: ${parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`,
				HTTP_STATUS.BAD_REQUEST,
			);
		}
		try {
			const user = req.user as { id: string; email?: string | null };
			const cfg = await updateAgentConfig(parsed.data, { id: user.id, email: user.email });
			sendSuccess(res, { ...getRulesView(), canEdit: true }, `Saved configuration v${cfg.version}`);
		} catch (err) {
			if (err instanceof ConfigValidationError)
				throw new AppError(err.message, HTTP_STATUS.BAD_REQUEST);
			throw err;
		}
	}),
);

router.get(
	"/audit",
	wrap(async (req, res) => {
		const limit = Number(req.query.limit ?? 50);
		sendSuccess(res, await getConfigAudit(Number.isFinite(limit) ? limit : 50));
	}),
);

router.post(
	"/diagnostics",
	requireAdminRole,
	wrap(async (_req, res) => {
		sendSuccess(res, await runDiagnostics());
	}),
);

export { router as agentControlRouter };
