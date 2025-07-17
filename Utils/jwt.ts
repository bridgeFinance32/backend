import jwt from 'jsonwebtoken';
import Config from '../config/config';

export const signAccessToken = (userId: string) => {
  return jwt.sign({ id: userId }, Config.ACCESS_TOKEN_SECRET, { expiresIn: '15m' });
};

export const signRefreshToken = (userId: string) => {
  return jwt.sign({ id: userId }, Config.REFRESH_TOKEN_SECRET, { expiresIn: '7d' });
};

export const verifyRefreshToken = (token: string) => {
  return jwt.verify(token, Config.REFRESH_TOKEN_SECRET);
};
