import bcrypt from 'bcryptjs';
import { loadConfig, saveConfig } from '../config';

const [email, password] = process.argv.slice(2);
if (!email || !password) {
  console.error('Usage: npm run set-password <email> <password>');
  process.exit(1);
}
loadConfig();

(async () => {
  const hash = await bcrypt.hash(password, 12);
  saveConfig({ email, passwordHash: hash });
  console.log(`Password set for ${email}`);
})();
