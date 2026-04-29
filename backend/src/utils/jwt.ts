import jwt from 'jsonwebtoken';
import type { Secret, SignOptions } from 'jsonwebtoken';
import { config } from '../config/index.js';

export function sign(payload: object): string {
  const options: SignOptions = { expiresIn: config.jwtExpiresIn as SignOptions['expiresIn'] };
  return jwt.sign(payload, config.jwtSecret as Secret, options);
}

export function verify(token: string): jwt.JwtPayload | null {
  try {
    return jwt.verify(token, config.jwtSecret) as jwt.JwtPayload;
  } catch {
    return null;
  }
}
