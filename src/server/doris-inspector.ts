import mysql from "mysql2/promise";
import type { Cluster, DorisDatabaseMetadata, DorisTableMetadata } from "../shared/types.js";

export interface DorisObjectCheck {
  connected: boolean;
  databaseExists?: boolean;
  tableExists?: boolean;
  tableState?: string;
  binlogEnabled?: boolean;
  message?: string;
}

export interface DorisInspector {
  inspectObject(cluster: Cluster, database: string, table?: string): Promise<DorisObjectCheck>;
  listDatabases(cluster: Cluster): Promise<DorisDatabaseMetadata[]>;
  listTables(cluster: Cluster, database: string): Promise<DorisTableMetadata[]>;
}

function quoteIdentifier(value: string) {
  return `\`${value.replace(/`/g, "``")}\``;
}

function readShowCreate(row: Record<string, unknown>) {
  const key = Object.keys(row).find((item) => /create/i.test(item));
  return key ? String(row[key] ?? "") : "";
}

export class MySqlDorisInspector implements DorisInspector {
  private async connect(cluster: Cluster) {
    return mysql.createConnection({
      host: cluster.host,
      port: cluster.queryPort,
      user: cluster.user,
      password: cluster.password ?? "",
      connectTimeout: 5000
    });
  }

  async listDatabases(cluster: Cluster): Promise<DorisDatabaseMetadata[]> {
    let connection: mysql.Connection | undefined;
    try {
      connection = await this.connect(cluster);
      const [rows] = await connection.query<mysql.RowDataPacket[]>(
        `SELECT s.SCHEMA_NAME AS name, COUNT(t.TABLE_NAME) AS table_count
         FROM information_schema.SCHEMATA s
         LEFT JOIN information_schema.TABLES t ON t.TABLE_SCHEMA = s.SCHEMA_NAME
         WHERE s.SCHEMA_NAME NOT IN ('information_schema', 'mysql', 'performance_schema', 'sys', '__internal_schema')
         GROUP BY s.SCHEMA_NAME
         ORDER BY s.SCHEMA_NAME`
      );
      return rows.map((row) => ({ name: String(row.name), tableCount: Number(row.table_count ?? 0) }));
    } finally {
      await connection?.end().catch(() => undefined);
    }
  }

  async listTables(cluster: Cluster, database: string): Promise<DorisTableMetadata[]> {
    let connection: mysql.Connection | undefined;
    try {
      connection = await this.connect(cluster);
      const [rows] = await connection.query<mysql.RowDataPacket[]>(
        `SELECT TABLE_NAME AS name, TABLE_TYPE AS type
         FROM information_schema.TABLES
         WHERE TABLE_SCHEMA = ?
         ORDER BY TABLE_NAME`,
        [database]
      );
      return rows.map((row) => ({ name: String(row.name), type: row.type ? String(row.type) : undefined }));
    } finally {
      await connection?.end().catch(() => undefined);
    }
  }

  async inspectObject(cluster: Cluster, database: string, table?: string): Promise<DorisObjectCheck> {
    let connection: mysql.Connection | undefined;
    try {
      connection = await this.connect(cluster);

      const [databaseRows] = await connection.query<mysql.RowDataPacket[]>(
        "SELECT SCHEMA_NAME FROM information_schema.SCHEMATA WHERE SCHEMA_NAME = ?",
        [database]
      );
      const databaseExists = databaseRows.length > 0;
      if (!databaseExists || !table) {
        return { connected: true, databaseExists, message: databaseExists ? "数据库存在" : "数据库不存在" };
      }

      const [tableRows] = await connection.query<mysql.RowDataPacket[]>(
        "SELECT TABLE_NAME, TABLE_TYPE FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?",
        [database, table]
      );
      const tableExists = tableRows.length > 0;
      let tableState: string | undefined;
      let binlogEnabled: boolean | undefined;

      if (tableExists) {
        try {
          const [statusRows] = await connection.query<mysql.RowDataPacket[]>(`SHOW TABLE STATUS FROM ${quoteIdentifier(database)} LIKE ?`, [table]);
          tableState = statusRows[0]?.Comment ? String(statusRows[0].Comment) : "NORMAL";
        } catch {
          tableState = undefined;
        }

        try {
          const [createRows] = await connection.query<mysql.RowDataPacket[]>(`SHOW CREATE TABLE ${quoteIdentifier(database)}.${quoteIdentifier(table)}`);
          const createSql = readShowCreate(createRows[0] as Record<string, unknown>);
          if (/binlog\.enable/i.test(createSql)) {
            binlogEnabled = /"binlog\.enable"\s*=\s*"true"|binlog\.enable\s*=\s*true/i.test(createSql);
          }
        } catch {
          binlogEnabled = undefined;
        }
      }

      return {
        connected: true,
        databaseExists,
        tableExists,
        tableState,
        binlogEnabled,
        message: tableExists ? "库表存在" : "表不存在"
      };
    } catch (error) {
      return {
        connected: false,
        message: error instanceof Error ? error.message : String(error)
      };
    } finally {
      await connection?.end().catch(() => undefined);
    }
  }
}
