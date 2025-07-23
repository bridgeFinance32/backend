import express, { RequestHandler } from "express";
import {
  createTransaction,
  reverseTransaction,
  cancelTransaction,
  getTransactionsByUser
} from "../controllers/transactionControllers";
import { authenticate } from "../middlewares/authMiddleware";

export const transactionRouter = express.Router();

transactionRouter.post("/send", authenticate as RequestHandler, createTransaction);
transactionRouter.post("/:txId/reverse", authenticate as RequestHandler, reverseTransaction);
transactionRouter.post("/:txId/cancel", cancelTransaction);
transactionRouter.get("/user/:userId", authenticate as RequestHandler, getTransactionsByUser);

export default transactionRouter;