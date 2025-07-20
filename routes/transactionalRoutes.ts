import express from "express";
import {
  createTransaction,
  reverseTransaction,
  cancelTransaction,
  getTransactionsByUser
} from "../controllers/transactionControllers";
import { authenticate } from "../middlewares/authMiddleware";

export const transactionRouter = express.Router();

transactionRouter.post("/send", authenticate, createTransaction);
transactionRouter.post("/:txId/reverse", authenticate, reverseTransaction);
transactionRouter.post("/:txId/cancel", cancelTransaction);
transactionRouter.get("/user/:userId", authenticate, getTransactionsByUser);

export default transactionRouter;