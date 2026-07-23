import dotenv from 'dotenv';
dotenv.config();

const isProduction = process.env.NODE_ENV === 'production';
const jwtSecret = process.env.JWT_SECRET || (isProduction ? '' : 'hr360-dev-secret');

if (!jwtSecret) {
  throw new Error('JWT_SECRET is required when NODE_ENV=production');
}

export const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  isProduction,
  jwtSecret,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  corsOrigins: (process.env.CORS_ORIGINS || 'http://localhost:5173,http://localhost:5174')
    .split(',')
    .map(origin => origin.trim())
    .filter(Boolean),
  slowRequestMs: Math.max(100, Number(process.env.SLOW_REQUEST_MS || '500')),
  trustProxy: process.env.TRUST_PROXY === 'true',
  requireHttpsForH5Password: process.env.REQUIRE_HTTPS_FOR_H5_PASSWORD
    ? process.env.REQUIRE_HTTPS_FOR_H5_PASSWORD === 'true'
    : isProduction,
};
