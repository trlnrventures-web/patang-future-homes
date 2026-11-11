import Database from "better-sqlite3";
const db = new Database("data/crm.db");
const res = db.prepare("UPDATE users SET role = 'sales_manager' WHERE role = 'caller'").run();
console.log("rows updated:", res.changes);
const rows = db.prepare("SELECT id, name, role, active FROM users ORDER BY id").all();
console.log(JSON.stringify(rows, null, 2));
db.close();
