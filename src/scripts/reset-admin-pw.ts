import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import postgres from 'postgres';
import { hashPassword } from '../lib/auth/password';
import { randomUUID } from 'node:crypto';

type UserRow = {
    id: string;
    email: string;
    role: string | null;
};

async function main() {
    const sql = postgres(process.env.DATABASE_URL!, { ssl: 'require' });

    const users = await sql<UserRow[]>`SELECT id, email, role FROM users LIMIT 5`;
    console.log('Existing users:', JSON.stringify(users, null, 2));

    const hash = await hashPassword('admin');
    const email = process.env.ADMIN_EMAIL || 'admin@google.com';

    if (users.length > 0) {
        const adminUser = users.find((u) => u.role === 'admin') || users[0];
        await sql`UPDATE users SET password_hash = ${hash}, email = ${email} WHERE id = ${adminUser.id}`;
        console.log('Updated password for user:', adminUser.email, '-> email now:', email);
    } else {
        await sql`INSERT INTO users (id, email, name, password_hash, role, created_at, updated_at) VALUES (${randomUUID()}, ${email}, 'Admin', ${hash}, 'admin', NOW(), NOW())`;
        console.log('Created new admin user:', email);
    }

    await sql.end();
    console.log('Done!');
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
