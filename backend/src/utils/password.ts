import bcrypt from 'bcryptjs';

const SALT_ROUNDS = 12;

export function hash(password: string): string {
  return bcrypt.hashSync(password, SALT_ROUNDS);
}

export function compare(password: string, hash: string): boolean {
  return bcrypt.compareSync(password, hash);
}
