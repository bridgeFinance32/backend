import { NextFunction, Request, Response } from "express";
import { User } from "../model/userModel";
import mongoose from "mongoose";
import { signAccessToken, signRefreshToken, verifyRefreshToken } from "../Utils/jwt";
import { JwtPayload } from "jsonwebtoken";

interface AuthenticatedRequest extends Request {
  user?: { id: string };
}

export const register = async (req: Request, res: Response, next: NextFunction) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { email, username, password } = req.body;

    if (!email || !username || !password) {
      await session.abortTransaction();
      res.status(400).json({ message: "Missing required user data" });
      return;
    }

    const existingUser = await User.findOne({
      $or: [{ email }, { username }]
    }).session(session);

    if (existingUser) {
      await session.abortTransaction();
      res.status(409).json({ message: "Email or username already in use" });
      return;
    }

    const user = new User({ email, username, password });
    await user.save({ session });
    await session.commitTransaction();

    res.status(201).json({ 
      message: "User registered successfully", 
      data: {
        email: user.email,
        username: user.username,
        id: user._id
      }
    });

  } catch (err: any) {
    await session.abortTransaction();
    if (err.code === 11000) {
      res.status(409).json({ message: "Email or username already in use" });
      return;
    }
    next(err);
  } finally {
    session.endSession();
  }
};

export const checkUsernameAvailability = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { username } = req.query;

    if (!username || typeof username !== 'string') {
      res.status(400).json({ available: false });
      return;
    }

    const existingUser = await User.findOne({
      username: { $regex: new RegExp(`^${username}$`, 'i') }
    });

    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.status(200).json({ available: !existingUser });
  } catch (error) {
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

    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: true,
      sameSite: 'none',
      domain: '.netlify.app',
      path: '/',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.status(200).json({ accessToken });
  } catch (err) {
    next(err);
  }
};

export const getUser = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ message: "Unauthorized - Missing user credentials" });
      return;
    }

    const user = await User.findById(userId)
      .select('-password -__v -refreshToken -emailVerificationToken');

    if (!user) {
      res.status(404).json({ message: "User account not found" });
      return;
    }

    res.setHeader('Cache-Control', 'private, no-cache, must-revalidate');
    res.status(200).json({
      id: user._id,
      email: user.email,
      username: user.username,
      role: user.role,
      isVerified: user.isVerified,
      lastLogin: user.lastLogin,
      balance: user.balances
    });
  } catch (error) {
    if (error instanceof mongoose.Error.CastError) {
      res.status(400).json({ message: "Invalid user identifier format" });
      return;
    }
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

    res.cookie('refreshToken', token, {
      httpOnly: true,
      secure: true,
      sameSite: 'none',
      //domain: '.netlify.app',
      path: '/',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    res.json({ accessToken });
  } catch (err) {
    res.status(403).json({ message: 'Invalid or expired refresh token' });
  }
};

export const logout = (req: Request, res: Response) => {
  res.clearCookie('refreshToken', {
    httpOnly: true,
    secure: true,
    sameSite: 'none',
    domain: '.netlify.app',
    path: '/',
  });
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).json({ message: 'Logged out successfully' });
};

export const verify = (req: Request, res: Response) => {
  res.status(200).json({ verified: true });
};