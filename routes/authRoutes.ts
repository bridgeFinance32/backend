import express, { RequestHandler } from "express"
import { checkUsernameAvailability, getUser, login, logout, refreshAccessToken, register, verify} from "../controllers/authController"
import { authenticate } from "../middlewares/authMiddleware"
import { authLimiter } from "../middlewares/rateLimiter"



export const authRouter = express.Router()
//authRoutes
authRouter.post('/register', authLimiter, register)
authRouter.post('/refresh', refreshAccessToken)
authRouter.post('/login', authLimiter,login)
authRouter.post('/logout',authLimiter,  logout)
authRouter.get('/check-username', authLimiter, checkUsernameAvailability);
authRouter.get('/verify', authenticate as RequestHandler, verify);

//userDataRoutes
authRouter.get('/user', authenticate as RequestHandler, getUser)

