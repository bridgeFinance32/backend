import { NextFunction, Request, Response } from "express";
import { User, IUser } from "../model/userModel";
import mongoose from "mongoose";
import {
  HTTP_STATUS,
  APIResponse,
  AuthResponse,
  ErrorResponse,
  UserData
} from "../types/apiTypes";
import { signAccessToken, signRefreshToken, verifyRefreshToken } from "../Utils/jwt";
import { JwtPayload } from "jsonwebtoken";



export const register = async (
  req: Request,
  res: Response<APIResponse<UserData> | ErrorResponse>,
  next: NextFunction
): Promise<void> => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { email, username, password } = req.body as UserData;

    // Validate input
    if (!email || !username || !password) {
      await session.abortTransaction();
      res.status(400).json({ message: "Missing required user data" });
      return; // Explicit void return
    }

    // Check for existing user (within transaction)
    const existingUser = await User.findOne({
      $or: [{ email }, { username }]
    }).session(session);

    if (existingUser) {
      await session.abortTransaction();
      res.status(409).json({ message: "Email or username already in use" });
      return; // Explicit void return
    }

    // Create user (within transaction)
    const user = new User({ email, username, password });
    await user.save({ session });

    // Initialize balances (within transaction)

    // Commit transaction
    await session.commitTransaction();

    // Return response
    const userResponse = {
      email: user.email,
      username: user.username,
      id: user._id
    };

    res.status(201).json({ 
      message: "User registered successfully", 
      data: userResponse
    });
    return; // Explicit void return

  } catch (err:any) {
    // Handle any errors that occur during the transaction
    await session.abortTransaction();
    console.log(err)
    
    // Special handling for duplicate key errors
    if (err.code === 11000) {
      res.status(409).json({ message: "Email or username already in use" });
      return; // Explicit void return
    }
    
    next(err);
    return; // Explicit void return
  } finally {
    // Ensure session is always ended
    session.endSession();
  }
};

export const checkUsernameAvailability = async (
  req: Request,
  res: Response<{ available: boolean }>,
  next: NextFunction
): Promise<void> => {
  try {
    const { username } = req.query;

    // Validate input
    if (!username || typeof username !== 'string') {
      res.status(HTTP_STATUS.BAD_REQUEST).json({
        available: false
      });
      return;
    }

    // Case-insensitive search
    const existingUser = await User.findOne({
      username: { $regex: new RegExp(`^${username}$`, 'i') }
    });

    res.status(HTTP_STATUS.SUCCESS).json({
      available: !existingUser
    });
    return;

  } catch (error: any) {
    next(error);
  }
};


export const login = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      res.status(400).json({ message: 'Please provide email and password' });
      return;
    }

    const user = await User.findOne({ email }).select('+password');
    if (!user || !(await user.isValidPassword(password))) {
      res.status(401).json({ message: 'Invalid email or password' });
      return;
    }

    const accessToken = signAccessToken(user._id as string);
    const refreshToken = signRefreshToken(user._id as string);

    // Set refresh token in HttpOnly cookie
    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: true, // must be true for HTTPS
      sameSite: 'none', // allow cross-site cookie for production
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    res.status(200).json({ accessToken });
  } catch (err) {
    next(err);
    return;
  }
};


interface AuthenticatedRequest extends Request {
  user?: { id: string }; // Matches your JWT payload structure
}

export const getUser = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    // 1. Get and validate user ID from JWT
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({
        status: "fail",
        message: "Unauthorized - Missing user credentials"
      });
      return
    }

    // 2. Fetch user from database
    const user = await User.findById(userId)
      .select('-password -__v -refreshToken -emailVerificationToken');

    if (!user) {
      res.status(404).json({
        status: "fail",
        message: "User account not found"
      });
      return
    }
    res.set('Cache-Control', 'private, max-age=60, must-revalidate');
    // 3. Return standardized response
    res.status(200).json({
      status: "success",
      data: {
        id: user._id,
        email: user.email,
        username: user.username,
        role: user.role,
        isVerified: user.isVerified,
        lastLogin: user.lastLogin,
        balance: user.balances
      }
    });

  } catch (error) {
    // 4. Special handling for invalid ID format
    if (error instanceof mongoose.Error.CastError) {
      res.status(400).json({
        status: "fail",
        message: "Invalid user identifier format"
      });
      return
    }

    // 5. Pass all other errors to central error handler
    next(error);
  }
};

export const refreshAccessToken = async (req: Request, res: Response) => {
  try {
    const token = req.cookies.refreshToken;
    if (!token) {
      res.status(401).json({ message: 'Refresh token missing' });
      return;
    }

    const decoded = verifyRefreshToken(token) as JwtPayload;

    const accessToken = signAccessToken(decoded.id);
    res.json({ accessToken });
  } catch (err) {
    res.status(403).json({ message: 'Invalid or expired refresh token' });
    return;
  }
};

export const logout = (req: Request, res: Response) => {
  res.clearCookie('refreshToken', {
    httpOnly: true,
    secure: true,
    sameSite: 'none'
  });
  res.status(200).json({ message: 'Logged out successfully' });
};

export const verify = (req: Request, res: Response) => {
  res.status(200).json({ verified: true });
}