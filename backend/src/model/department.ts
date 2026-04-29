import { getDb, saveDb } from '../db/index.js';
import { queryAll, queryOne } from '../db/query.js';

export interface DepartmentRow {
  id: number;
  name: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export const DepartmentModel = {
  findAll(): DepartmentRow[] {
    return queryAll<DepartmentRow>(
      'SELECT * FROM department ORDER BY sort_order ASC, id ASC'
    );
  },

  findById(id: number): DepartmentRow | undefined {
    return queryOne<DepartmentRow>('SELECT * FROM department WHERE id = ?', [id]);
  },

  findByName(name: string): DepartmentRow | undefined {
    return queryOne<DepartmentRow>('SELECT * FROM department WHERE name = ?', [name]);
  },

  create(name: string, sortOrder: number = 0): DepartmentRow {
    const db = getDb();
    db.run(
      'INSERT INTO department (name, sort_order) VALUES (?, ?)',
      [name, sortOrder]
    );
    saveDb();
    return queryOne<DepartmentRow>('SELECT * FROM department ORDER BY id DESC LIMIT 1')!;
  },

  update(id: number, name: string, sortOrder?: number): void {
    const db = getDb();
    if (sortOrder !== undefined) {
      db.run('UPDATE department SET name = ?, sort_order = ? WHERE id = ?', [name, sortOrder, id]);
    } else {
      db.run('UPDATE department SET name = ? WHERE id = ?', [name, id]);
    }
    saveDb();
  },

  delete(id: number): void {
    getDb().run('DELETE FROM department WHERE id = ?', [id]);
    saveDb();
  },

  count(): number {
    const row = queryOne<{ cnt: number }>('SELECT COUNT(*) as cnt FROM department');
    return row?.cnt ?? 0;
  },
};
