import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import Config from '../config/config';

export const authenticate = (req: Request, res: Response, next: NextFunction): void => {
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
    const decoded = jwt.verify(token, Config.ACCESS_TOKEN_SECRET);
    (req as any).user = decoded;
    
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