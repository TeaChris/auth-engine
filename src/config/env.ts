import { cleanEnv, str, port } from 'envalid';
import 'dotenv/config';

export const env = cleanEnv(process.env, {
  NODE_ENV: str({
    choices: ['development', 'test', 'production'],
    default: 'development',
  }),
  PORT: port({ default: 3000 }),
  DATABASE_URL: str(),
  REDIS_URL: str(),
});
