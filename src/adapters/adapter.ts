import { QueryBuilder } from "../querybuilder.ts";
import { Model } from "../model.ts";
import { SupportedDatabaseType } from "../connect.ts";
import { Table } from "../table.ts";

export interface QueryOptions {
  getLastInsertedId?: boolean;
  info?: { tableName: string; primaryKey: string };
}

/**
 * Database connection options
 */
export interface ConnectionOptions {
  database?: string;
  username?: string;
  port?: number;
  hostname?: string;
  password?: string;
  applicationName?: string;
}

export type QueryResult<T> = { lastInsertedId: number; records: T[] };

/**
 * The parent class for all database adapters
 */
export abstract class Adapter {
  private models: Array<typeof Model> = [];
  public abstract type: SupportedDatabaseType;

  /**
   * Run SQL query and get the result
   *
   * @param query SQL query to run (ex: "SELECT * FROM users;")
   */
  public abstract query<T>(
    query: string,
    options?: QueryOptions,
  ): Promise<QueryResult<T>>;

  /**
   * Execute SQL statement and save changes to database
   *
   * @param query SQL query to run (ex: "INSERT INTO users (email) VALUES ('a@b.com');")
   * @param values Bind values to query to prevent SQL injection
   */
  public abstract execute(query: string, values?: any[]): Promise<void>;

  /**
   * Connect database
   */
  public abstract connect(): Promise<void>;

  /**
   * Disconnect database
   */
  public abstract disconnect(): Promise<void>;

  /**
   * Query builder
   *
   * @param tableName The table name which the query is targetting
   */
  public queryBuilder(tableName: string): QueryBuilder {
    return new QueryBuilder(tableName, this);
  }

  /**
   * Register a model
   *
   * @param model The model to be registered
   */
  public addModel(model: typeof Model): void {
    model.adapter = this;
    this.models.push(model);
  }

  /**
   * Returns an array containing all classes of the Models registered with 'addModel'.
   */
  public getModels(): Array<typeof Model> {
    return this.models;
  }

  /**
   * Register a model
   *
   * @param model The model to be registered
   */
  public table(tableName: string): Table {
    return new Table(tableName, this);
  }

  /**
   * Truncates all registered model tables with 'Model.truncate'.
   */
  public async truncateModels(): Promise<void> {
    for (const model of this.models) {
      await model.truncate();
    }
  }
}
