import express, { RequestHandler } from "express";
import { authenticate } from "../middlewares/authMiddleware";
import { accountController } from "../controllers/balanceControllers";

export const balanceRouter = express.Router();

balanceRouter.get("/account/:id",authenticate as RequestHandler, accountController);
