import { DatabaseSync } from "node:sqlite";
import type { SQLInputValue } from "node:sqlite";

import type { ImageRecord, ImageSearchParams, ImageSearchResult, SessionFacet } from "../../shared/types.js";
import type { ImageIndexStore } from "../domain/types.js";
import { ensureParentDir } from "../utils/fileSystem.js";

interface ImageRow {
  id: string;
  file_path: string;
  file_name: string;
  session_id: string;
  thread_name: string | null;
  generated_at: string | null;
  file_modified_at: string;
  sort_at: string;
  prompt: string | null;
  width: number | null;
  height: number | null;
  size_bytes: number;
  call_id: string | null;
  session_path: string | null;
  has_prompt: number;
}

export class SqliteImageIndex implements ImageIndexStore {
  private readonly db: DatabaseSync;
  private facetsCache: ImageSearchResult["facets"] | null = null;

  private constructor(databasePath: string) {
    this.db = new DatabaseSync(databasePath);
    this.db.exec("PRAGMA journal_mode = WAL");
    this.db.exec("PRAGMA foreign_keys = ON");
    this.createSchema();
  }

  static async open(databasePath: string): Promise<SqliteImageIndex> {
    await ensureParentDir(databasePath);
    return new SqliteImageIndex(databasePath);
  }

  replaceAll(records: ImageRecord[]): void {
    const insertImage = this.db.prepare(`
      INSERT INTO images (
        id, file_path, file_name, session_id, thread_name, generated_at, file_modified_at, sort_at,
        prompt, width, height, size_bytes, call_id, session_path, has_prompt
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertSearch = this.db.prepare(`
      INSERT INTO image_search (id, file_name, thread_name, prompt, generated_at)
      VALUES (?, ?, ?, ?, ?)
    `);

    this.db.exec("BEGIN");
    try {
      this.db.exec("DELETE FROM image_search");
      this.db.exec("DELETE FROM images");

      for (const record of records) {
        insertImage.run(
          record.id,
          record.filePath,
          record.fileName,
          record.sessionId,
          record.threadName,
          record.generatedAt,
          record.fileModifiedAt,
          getSortAt(record),
          record.prompt,
          record.width,
          record.height,
          record.sizeBytes,
          record.callId,
          record.sessionPath,
          record.hasPrompt ? 1 : 0
        );

        insertSearch.run(
          record.id,
          record.fileName,
          record.threadName ?? "",
          record.prompt ?? "",
          record.generatedAt ?? ""
        );
      }

      this.db.exec("COMMIT");
      this.facetsCache = null;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  syncRecords(records: ImageRecord[]): void {
    const upsertImage = this.db.prepare(`
      INSERT INTO images (
        id, file_path, file_name, session_id, thread_name, generated_at, file_modified_at, sort_at,
        prompt, width, height, size_bytes, call_id, session_path, has_prompt
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        file_path = excluded.file_path,
        file_name = excluded.file_name,
        session_id = excluded.session_id,
        thread_name = excluded.thread_name,
        generated_at = excluded.generated_at,
        file_modified_at = excluded.file_modified_at,
        sort_at = excluded.sort_at,
        prompt = excluded.prompt,
        width = excluded.width,
        height = excluded.height,
        size_bytes = excluded.size_bytes,
        call_id = excluded.call_id,
        session_path = excluded.session_path,
        has_prompt = excluded.has_prompt
      WHERE
        images.file_path IS NOT excluded.file_path OR
        images.file_name IS NOT excluded.file_name OR
        images.session_id IS NOT excluded.session_id OR
        images.thread_name IS NOT excluded.thread_name OR
        images.generated_at IS NOT excluded.generated_at OR
        images.file_modified_at IS NOT excluded.file_modified_at OR
        images.sort_at IS NOT excluded.sort_at OR
        images.prompt IS NOT excluded.prompt OR
        images.width IS NOT excluded.width OR
        images.height IS NOT excluded.height OR
        images.size_bytes IS NOT excluded.size_bytes OR
        images.call_id IS NOT excluded.call_id OR
        images.session_path IS NOT excluded.session_path OR
        images.has_prompt IS NOT excluded.has_prompt
    `);

    const deleteSearch = this.db.prepare("DELETE FROM image_search WHERE id = ?");
    const insertSearch = this.db.prepare(`
      INSERT INTO image_search (id, file_name, thread_name, prompt, generated_at)
      VALUES (?, ?, ?, ?, ?)
    `);
    this.db.exec("BEGIN");
    try {
      this.db.exec("CREATE TEMP TABLE IF NOT EXISTS next_image_ids (id TEXT PRIMARY KEY)");
      this.db.exec("DELETE FROM next_image_ids");
      const insertNextId = this.db.prepare("INSERT INTO next_image_ids (id) VALUES (?)");

      for (const record of records) {
        const sortAt = getSortAt(record);
        upsertImage.run(
          record.id,
          record.filePath,
          record.fileName,
          record.sessionId,
          record.threadName,
          record.generatedAt,
          record.fileModifiedAt,
          sortAt,
          record.prompt,
          record.width,
          record.height,
          record.sizeBytes,
          record.callId,
          record.sessionPath,
          record.hasPrompt ? 1 : 0
        );
        deleteSearch.run(record.id);
        insertSearch.run(record.id, record.fileName, record.threadName ?? "", record.prompt ?? "", record.generatedAt ?? "");
        insertNextId.run(record.id);
      }

      this.db.exec("DELETE FROM image_search WHERE id NOT IN (SELECT id FROM next_image_ids)");
      this.db.exec("DELETE FROM images WHERE id NOT IN (SELECT id FROM next_image_ids)");
      this.db.exec("COMMIT");
      this.facetsCache = null;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  search(params: ImageSearchParams): ImageSearchResult {
    const limit = clampNumber(params.limit ?? 80, 1, 200);
    const offset = Math.max(0, params.offset ?? 0);
    const where: string[] = [];
    const values: SQLInputValue[] = [];

    const query = params.query?.trim();
    if (query) {
      const likeValue = `%${escapeLike(query)}%`;
      const ftsIds = this.findFtsIds(query);
      const queryParts = [
        "file_name LIKE ? ESCAPE '\\'",
        "thread_name LIKE ? ESCAPE '\\'",
        "prompt LIKE ? ESCAPE '\\'",
        "generated_at LIKE ? ESCAPE '\\'"
      ];
      values.push(likeValue, likeValue, likeValue, likeValue);

      if (ftsIds.length > 0) {
        queryParts.push(`id IN (${ftsIds.map(() => "?").join(", ")})`);
        values.push(...ftsIds);
      }

      where.push(`(${queryParts.join(" OR ")})`);
    }

    if (params.sessionId) {
      where.push("session_id = ?");
      values.push(params.sessionId);
    }

    if (params.promptState === "withPrompt") {
      where.push("has_prompt = 1");
    } else if (params.promptState === "withoutPrompt") {
      where.push("has_prompt = 0");
    }

    const threshold = getDateThreshold(params.datePreset ?? "all");
    if (threshold) {
      where.push("datetime(sort_at) >= datetime(?)");
      values.push(threshold);
    }

    const whereSql = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";
    const rows = this.db
      .prepare(
        `
        SELECT * FROM images
        ${whereSql}
        ORDER BY sort_at DESC, file_name ASC
        LIMIT ? OFFSET ?
      `
      )
      .all(...values, limit, offset) as unknown as ImageRow[];

    const totalRow = this.db.prepare(`SELECT COUNT(*) as count FROM images ${whereSql}`).get(...values) as { count: number };

    return {
      items: rows.map(rowToImageRecord),
      total: totalRow.count,
      facets: this.readFacets()
    };
  }

  getById(id: string): ImageRecord | null {
    const row = this.db.prepare("SELECT * FROM images WHERE id = ?").get(id) as ImageRow | undefined;
    return row ? rowToImageRecord(row) : null;
  }

  listAll(): ImageRecord[] {
    const rows = this.db.prepare("SELECT * FROM images").all() as unknown as ImageRow[];
    return rows.map(rowToImageRecord);
  }

  count(): number {
    const row = this.db.prepare("SELECT COUNT(*) as count FROM images").get() as { count: number };
    return row.count;
  }

  close(): void {
    this.db.close();
  }

  private createSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS images (
        id TEXT PRIMARY KEY,
        file_path TEXT NOT NULL UNIQUE,
        file_name TEXT NOT NULL,
        session_id TEXT NOT NULL,
        thread_name TEXT,
        generated_at TEXT,
        file_modified_at TEXT NOT NULL,
        sort_at TEXT NOT NULL,
        prompt TEXT,
        width INTEGER,
        height INTEGER,
        size_bytes INTEGER NOT NULL,
        call_id TEXT,
        session_path TEXT,
        has_prompt INTEGER NOT NULL
      );

      CREATE VIRTUAL TABLE IF NOT EXISTS image_search USING fts5(
        id UNINDEXED,
        file_name,
        thread_name,
        prompt,
        generated_at
      );
    `);
    this.migrateSchema();
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_images_sort ON images(sort_at DESC, file_name ASC);
      CREATE INDEX IF NOT EXISTS idx_images_session_sort ON images(session_id, sort_at DESC, file_name ASC);
      CREATE INDEX IF NOT EXISTS idx_images_prompt_sort ON images(has_prompt, sort_at DESC, file_name ASC);
      CREATE INDEX IF NOT EXISTS idx_images_session_prompt_sort ON images(session_id, has_prompt, sort_at DESC, file_name ASC);
    `);
  }

  private findFtsIds(query: string): string[] {
    const expression = buildFtsExpression(query);
    if (!expression) {
      return [];
    }

    try {
      const rows = this.db
        .prepare("SELECT id FROM image_search WHERE image_search MATCH ? LIMIT 500")
        .all(expression) as { id: string }[];
      return rows.map((row) => row.id);
    } catch {
      return [];
    }
  }

  private readFacets(): ImageSearchResult["facets"] {
    if (this.facetsCache) {
      return this.facetsCache;
    }

    const sessionRows = this.db
      .prepare(
        `
        SELECT session_id, thread_name, COUNT(*) as count
        FROM images
        GROUP BY session_id, thread_name
        ORDER BY count DESC, thread_name ASC
        LIMIT 80
      `
      )
      .all() as Array<{ session_id: string; thread_name: string | null; count: number }>;

    const counts = this.db
      .prepare(
        `
        SELECT
          COUNT(*) as totalImages,
          SUM(CASE WHEN datetime(sort_at) >= datetime(?) THEN 1 ELSE 0 END) as today,
          SUM(CASE WHEN datetime(sort_at) >= datetime(?) THEN 1 ELSE 0 END) as last7Days,
          SUM(CASE WHEN datetime(sort_at) >= datetime(?) THEN 1 ELSE 0 END) as last30Days,
          SUM(CASE WHEN has_prompt = 1 THEN 1 ELSE 0 END) as withPrompt,
          SUM(CASE WHEN has_prompt = 0 THEN 1 ELSE 0 END) as withoutPrompt
        FROM images
      `
      )
      .get(getDateThreshold("today"), getDateThreshold("week"), getDateThreshold("month")) as {
      last30Days: number | null;
      last7Days: number | null;
      today: number | null;
      totalImages: number;
      withPrompt: number | null;
      withoutPrompt: number | null;
    };

    this.facetsCache = {
      sessions: sessionRows.map(
        (row): SessionFacet => ({
          sessionId: row.session_id,
          threadName: row.thread_name,
          count: row.count
        })
      ),
      last30Days: counts.last30Days ?? 0,
      last7Days: counts.last7Days ?? 0,
      today: counts.today ?? 0,
      totalImages: counts.totalImages,
      withPrompt: counts.withPrompt ?? 0,
      withoutPrompt: counts.withoutPrompt ?? 0
    };
    return this.facetsCache;
  }

  private migrateSchema(): void {
    const columns = this.db.prepare("PRAGMA table_info(images)").all() as Array<{ name: string }>;
    if (!columns.some((column) => column.name === "sort_at")) {
      this.db.exec("ALTER TABLE images ADD COLUMN sort_at TEXT");
      this.db.exec("UPDATE images SET sort_at = COALESCE(generated_at, file_modified_at)");
    }
    this.db.exec("UPDATE images SET sort_at = COALESCE(generated_at, file_modified_at) WHERE sort_at IS NULL OR sort_at = ''");
  }
}

function rowToImageRecord(row: ImageRow): ImageRecord {
  return {
    id: row.id,
    filePath: row.file_path,
    fileName: row.file_name,
    sessionId: row.session_id,
    threadName: row.thread_name,
    generatedAt: row.generated_at,
    fileModifiedAt: row.file_modified_at,
    prompt: row.prompt,
    width: row.width,
    height: row.height,
    sizeBytes: row.size_bytes,
    callId: row.call_id,
    sessionPath: row.session_path,
    hasPrompt: row.has_prompt === 1
  };
}

function getSortAt(record: Pick<ImageRecord, "generatedAt" | "fileModifiedAt">): string {
  return record.generatedAt ?? record.fileModifiedAt;
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (character) => `\\${character}`);
}

function buildFtsExpression(query: string): string | null {
  const tokens = query
    .trim()
    .split(/\s+/)
    .map((token) => token.replace(/"/g, "\"\""))
    .filter(Boolean)
    .slice(0, 8);

  if (tokens.length === 0) {
    return null;
  }

  return tokens.map((token) => `"${token}"`).join(" AND ");
}

function getDateThreshold(preset: ImageSearchParams["datePreset"]): string | null {
  if (!preset || preset === "all") {
    return null;
  }

  const now = new Date();
  if (preset === "today") {
    return new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  }

  const days = preset === "week" ? 7 : 30;
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString();
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
