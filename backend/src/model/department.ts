import { execute, queryAll, queryOne } from '../db/query.js';

export interface DepartmentRow {
  id: number;
  name: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export const DepartmentModel = {
  findAll(): Promise<DepartmentRow[]> {
    return queryAll<DepartmentRow>('SELECT * FROM department ORDER BY sort_order ASC, id ASC');
  },

  findById(id: number): Promise<DepartmentRow | undefined> {
    return queryOne<DepartmentRow>('SELECT * FROM department WHERE id = ?', [id]);
  },

  findByName(name: string): Promise<DepartmentRow | undefined> {
    return queryOne<DepartmentRow>('SELECT * FROM department WHERE name = ?', [name]);
  },

  async create(name: string, sortOrder: number = 0): Promise<DepartmentRow> {
    await execute('INSERT INTO department (name, sort_order) VALUES (?, ?)', [name, sortOrder]);
    return (await queryOne<DepartmentRow>('SELECT * FROM department ORDER BY id DESC LIMIT 1'))!;
  },

  async update(id: number, name: string, sortOrder?: number): Promise<void> {
    if (sortOrder !== undefined) {
      await execute('UPDATE department SET name = ?, sort_order = ?, updated_at = datetime(\'now\') WHERE id = ?', [name, sortOrder, id]);
    } else {
      await execute('UPDATE department SET name = ?, updated_at = datetime(\'now\') WHERE id = ?', [name, id]);
    }
  },

  delete(id: number): Promise<void> {
    return execute('DELETE FROM department WHERE id = ?', [id]);
  },

  async count(): Promise<number> {
    const row = await queryOne<{ cnt: number }>('SELECT COUNT(*) as cnt FROM department');
    return Number(row?.cnt ?? 0);
  },
};
