import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import Config from '../config/config';

export const authenticate = (req: Request, res: Response, next: NextFunction): void => {
  const authHeader = req.headers.authorization;
  const token: string | null = authHeader?.startsWith('Bearer ') 
    ? authHeader.split(' ')[1] 
    : null;

  if (!token) {
    res.status(401).json({ message: 'Access token required' });
    return;
  }

  try {
    const decoded = jwt.verify(token, Config.ACCESS_TOKEN_SECRET);
    (req as any).user = decoded;
    next();
  } catch (err) {
    res.status(401).json({ message: 'Invalid or expired access token' });
    console.log(err)
  }
};
