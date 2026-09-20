import { is, getTableName } from "drizzle-orm";
import { PgTable, PgColumn, getTableConfig } from "drizzle-orm/pg-core";
import * as schema from "../shared/schema";

export const allTables: [string, PgTable][] = Object.entries(schema).filter(
  (entry): entry is [string, PgTable] => is(entry[1], PgTable),
);

// Parents before children, derived from the schema's own FK graph — no
// hand-maintained table order to get wrong or fall out of sync.
export function topologicalTables(): [string, PgTable][] {
  const byName = new Map(allTables.map(([key, table]) => [getTableName(table), [key, table] as [string, PgTable]]));
  const deps = new Map<string, Set<string>>();

  for (const [, table] of allTables) {
    const name = getTableName(table);
    const cfg = getTableConfig(table);
    const d = new Set<string>();
    for (const fk of cfg.foreignKeys) {
      const parentName = getTableName(fk.reference().foreignTable);
      if (parentName !== name) d.add(parentName);
    }
    deps.set(name, d);
  }

  const ordered: [string, PgTable][] = [];
  const placed = new Set<string>();
  const names = [...deps.keys()];

  while (placed.size < names.length) {
    let progressed = false;
    for (const name of names) {
      if (placed.has(name)) continue;
      const d = deps.get(name)!;
      if ([...d].every((p) => placed.has(p) || !byName.has(p))) {
        placed.add(name);
        ordered.push(byName.get(name)!);
        progressed = true;
      }
    }
    if (!progressed) {
      // Cycle (shouldn't happen given the audit found none) — append the
      // rest in declaration order rather than hang.
      for (const name of names) {
        if (!placed.has(name)) {
          placed.add(name);
          ordered.push(byName.get(name)!);
        }
      }
      break;
    }
  }
  return ordered;
}

// Which JS-facing (camelCase) field keys on a table need Date revival after
// a JSON round-trip — only columns in genuine Date mode, not the *String
// variants (those are meant to stay plain strings).
export function dateFieldKeys(table: PgTable): string[] {
  const keys: string[] = [];
  for (const [key, value] of Object.entries(table as unknown as Record<string, unknown>)) {
    if (!is(value, PgColumn)) continue;
    if (value.columnType === "PgTimestamp" || value.columnType === "PgDate") {
      keys.push(key);
    }
  }
  return keys;
}

export function idFieldKey(table: PgTable): string | null {
  for (const [key, value] of Object.entries(table as unknown as Record<string, unknown>)) {
    if (is(value, PgColumn) && value.name === "id") return key;
  }
  return null;
}

const SERIAL_TYPES = new Set(["PgSerial", "PgBigSerial53", "PgBigSerial64"]);

// { jsKey, dbColumn } for the id column, but only when it's an actual
// auto-increment serial/bigserial — not the uuid/varchar/text PKs some
// tables use, which have no sequence to reset.
export function serialIdColumn(table: PgTable): { jsKey: string; dbColumn: string } | null {
  for (const [key, value] of Object.entries(table as unknown as Record<string, unknown>)) {
    if (is(value, PgColumn) && value.name === "id" && SERIAL_TYPES.has(value.columnType)) {
      return { jsKey: key, dbColumn: value.name };
    }
  }
  return null;
}

// JS-facing field keys on a table whose column is a foreign key into
// `users.id` — used to remap rows when a local user's id doesn't survive
// import unchanged (e.g. it collided with an already-existing Supabase row
// sharing the same email, so the winning row has a different id).
export function userFkFieldKeys(table: PgTable): string[] {
  const cfg = getTableConfig(table);
  const dbColsReferencingUsers = new Set<string>();
  for (const fk of cfg.foreignKeys) {
    if (getTableName(fk.reference().foreignTable) !== "users") continue;
    for (const col of fk.reference().columns) dbColsReferencingUsers.add(col.name);
  }
  if (dbColsReferencingUsers.size === 0) return [];

  const keys: string[] = [];
  for (const [key, value] of Object.entries(table as unknown as Record<string, unknown>)) {
    if (is(value, PgColumn) && dbColsReferencingUsers.has(value.name)) keys.push(key);
  }
  return keys;
}
