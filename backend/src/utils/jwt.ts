import jwt from 'jsonwebtoken';
import type { Secret, SignOptions } from 'jsonwebtoken';
import { config } from '../config/index.js';

export type TokenScope = 'admin' | 'h5' | 'password_change';

export interface AuthTokenPayload extends jwt.JwtPayload {
  userId: number;
  isAdmin: number;
  scope: TokenScope;
  passwordVersion: number;
}

export function sign(
  payload: Omit<AuthTokenPayload, keyof jwt.JwtPayload>,
  expiresIn: SignOptions['expiresIn'] = config.jwtExpiresIn as SignOptions['expiresIn']
): string {
  const options: SignOptions = { expiresIn };
  return jwt.sign(payload, config.jwtSecret as Secret, options);
}

export function verify(token: string): AuthTokenPayload | null {
  try {
    return jwt.verify(token, config.jwtSecret) as AuthTokenPayload;
  } catch {
    return null;
  }
}
