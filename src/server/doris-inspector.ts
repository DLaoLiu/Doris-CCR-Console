import mysql from "mysql2/promise";
import type { Cluster } from "../shared/types.js";

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
}

function quoteIdentifier(value: string) {
  return `\`${value.replace(/`/g, "``")}\``;
}

function readShowCreate(row: Record<string, unknown>) {
  const key = Object.keys(row).find((item) => /create/i.test(item));
  return key ? String(row[key] ?? "") : "";
}

export class MySqlDorisInspector implements DorisInspector {
  async inspectObject(cluster: Cluster, database: string, table?: string): Promise<DorisObjectCheck> {
    let connection: mysql.Connection | undefined;
    try {
      connection = await mysql.createConnection({
        host: cluster.host,
        port: cluster.queryPort,
        user: cluster.user,
        password: cluster.password ?? "",
        connectTimeout: 5000
      });

      const [databaseRows] = await connection.execute<mysql.RowDataPacket[]>(
        "SELECT SCHEMA_NAME FROM information_schema.SCHEMATA WHERE SCHEMA_NAME = ?",
        [database]
      );
      const databaseExists = databaseRows.length > 0;
      if (!databaseExists || !table) {
        return { connected: true, databaseExists, message: databaseExists ? "数据库存在" : "数据库不存在" };
      }

      const [tableRows] = await connection.execute<mysql.RowDataPacket[]>(
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
