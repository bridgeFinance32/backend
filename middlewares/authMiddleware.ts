import { Request, Response, NextFunction, RequestHandler } from 'express';
import jwt from 'jsonwebtoken';
import Config from '../config/config';
import { IUser } from '../model/userModel';

interface AuthenticatedRequest extends Request {
  user: IUser;
}

export const authenticate = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
  // Try getting token from (1) Authorization header, (2) cookies (for iOS compatibility)
  let token: string | null = null;
  
  // 1. Check Authorization header (standard approach)
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    token = authHeader.split(' ')[1];
  }
  
  // 2. Fallback to checking cookies (iOS Safari sometimes has header issues)
  if (!token && req.cookies?.accessToken) {
    token = req.cookies.accessToken;
  }

  if (!token) {
    // Add iOS-friendly cache control headers
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.status(401).json({ message: 'Authentication required' });
    return;
  }

  try {
    const decoded = jwt.verify(token, Config.ACCESS_TOKEN_SECRET) as { id: string }; // Type assertion
    
    // Here's the critical fix - properly assign the user to the request
    req.user = { id: decoded.id } as IUser; // Cast to IUser if needed
    
    // Add security headers for all authenticated requests
    res.setHeader('Cache-Control', 'private, no-cache');
    next();
  } catch (err) {
    // Clear cookies if token verification fails
    res.clearCookie('accessToken', {
      httpOnly: true,
      secure: true,
      sameSite: 'none',
      domain: '.netlify.app',
      path: '/',
    });
    
    res.setHeader('Cache-Control', 'no-store');
    res.status(401).json({ message: 'Invalid or expired token' });
  }
};