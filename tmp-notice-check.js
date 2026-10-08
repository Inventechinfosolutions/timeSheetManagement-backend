const fs = require('fs');
const mysql = require('mysql2/promise');

const env = fs.readFileSync('.env.local', 'utf8');
const read = (key) => {
  const line = env.split(/\r?\n/).find((row) => row.startsWith(key + '='));
  return line ? line.slice(key.length + 1).trim() : '';
};

(async () => {
  const conn = await mysql.createConnection({
    host: read('DB_HOST'),
    port: Number(read('DB_PORT') || 3306),
    user: read('DB_USERNAME'),
    password: read('DB_PASSWORD'),
    database: read('DB_DATABASE'),
  });

  const [mapping] = await conn.query(
    `SELECT employee_id, employee_name, manager_id, manager_name, status
     FROM manager_mapping WHERE employee_id = 'IIS-I-085'`,
  );
  const [notices] = await conn.query(
    `SELECT id, employee_id, title, type, is_read, createdAt
     FROM notifications
     WHERE type LIKE 'APPRAISAL%' OR title LIKE '%submitted%'
     ORDER BY id DESC LIMIT 15`,
  );
  const [managerMail] = await conn.query(
    `SELECT employee_id,
            CASE WHEN email IS NULL OR email = '' THEN 0 ELSE 1 END AS hasEmail
     FROM employee_details WHERE employee_id = 'IIS-2467'`,
  );
  console.log(JSON.stringify({ mapping, notices: notices.slice(0, 2), managerMail }, null, 2));
  await conn.end();
})().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
