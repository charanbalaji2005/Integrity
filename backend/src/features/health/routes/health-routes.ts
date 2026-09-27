import { type IRouter, Router } from "express";
import { getHealth } from "../controllers/health-controller";

const router: IRouter = Router();

router.get("/", getHealth);

export { router as healthRouter };
