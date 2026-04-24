import * as SQLite from 'expo-sqlite';

let db = null;

// Open database connection
export async function openDatabase() {
  if (db) return db;
  db = await SQLite.openDatabaseAsync('notes.db');
  
  // Create tables
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      category TEXT DEFAULT 'General',
      color TEXT DEFAULT '#6C63FF',
      is_pinned INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now','localtime')),
      updated_at TEXT DEFAULT (datetime('now','localtime'))
    );
  `);
  
  return db;
}

// Get all notes
export async function getAllNotes() {
  const database = await openDatabase();
  const results = await database.getAllAsync(
    'SELECT * FROM notes ORDER BY is_pinned DESC, updated_at DESC'
  );
  return results;
}

// Get notes by category
export async function getNotesByCategory(category) {
  const database = await openDatabase();
  const results = await database.getAllAsync(
    'SELECT * FROM notes WHERE category = ? ORDER BY is_pinned DESC, updated_at DESC',
    [category]
  );
  return results;
}

// Search notes
export async function searchNotes(query) {
  const database = await openDatabase();
  const results = await database.getAllAsync(
    `SELECT * FROM notes WHERE title LIKE ? OR content LIKE ? ORDER BY is_pinned DESC, updated_at DESC`,
    [`%${query}%`, `%${query}%`]
  );
  return results;
}

// Add a new note
export async function addNote(title, content, category = 'General', color = '#6C63FF') {
  const database = await openDatabase();
  const result = await database.runAsync(
    'INSERT INTO notes (title, content, category, color) VALUES (?, ?, ?, ?)',
    [title, content, category, color]
  );
  return result.lastInsertRowId;
}

// Update a note
export async function updateNote(id, title, content, category, color) {
  const database = await openDatabase();
  await database.runAsync(
    `UPDATE notes SET title = ?, content = ?, category = ?, color = ?, updated_at = datetime('now','localtime') WHERE id = ?`,
    [title, content, category, color, id]
  );
}

// Toggle pin status
export async function togglePin(id, isPinned) {
  const database = await openDatabase();
  await database.runAsync(
    'UPDATE notes SET is_pinned = ? WHERE id = ?',
    [isPinned ? 0 : 1, id]
  );
}

// Delete a note
export async function deleteNote(id) {
  const database = await openDatabase();
  await database.runAsync('DELETE FROM notes WHERE id = ?', [id]);
}

// Get note count
export async function getNoteCount() {
  const database = await openDatabase();
  const result = await database.getFirstAsync('SELECT COUNT(*) as count FROM notes');
  return result.count;
}

// Get categories with counts
export async function getCategoriesWithCounts() {
  const database = await openDatabase();
  const results = await database.getAllAsync(
    'SELECT category, COUNT(*) as count FROM notes GROUP BY category ORDER BY count DESC'
  );
  return results;
}
