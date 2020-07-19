import {
  isSaved,
  compareWithOriginal,
  getTableName,
  getPrimaryKeyInfo,
  getValues,
  setSaved,
  mapValueProperties,
  getColumns,
  createModels,
  mapQueryResult,
  createModel,
  mapSingleQueryResult,
} from "./utils/models.ts";
import { Adapter } from "./adapters/adapter.ts";
import { QueryBuilder } from "./querybuilder.ts";

/**
 * Same as Partial<T> but goes deeper and makes Partial<T> all its properties and sub-properties.
 */
export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends Array<infer U> ? Array<DeepPartial<U>>
    : T[P] extends ReadonlyArray<infer U> ? ReadonlyArray<DeepPartial<U>>
    : DeepPartial<T[P]>;
};

/**
 * Query options for find() and findOne()
 */
export interface FindOptions<T> {
  where?: DeepPartial<T>;
}

/**
 * Manager allows you to perform queries to your model.
 */
export class Manager {
  /**
   * Create a model manager.
   *
   * @param adapter the database adapter to perform queries
   */
  constructor(private adapter: Adapter) {}

  /**
   * Save model to the database.
   *
   * @param model the model you want to save
   */
  public async save<T extends Object>(model: T): Promise<T> {
    const tableName = getTableName(model.constructor);
    const primaryKeyInfo = getPrimaryKeyInfo(model.constructor);

    // If the record is saved, we assume that the user want to update the record.
    // Otherwise, create a new record to the database.
    if (isSaved(model)) {
      const { isDirty, diff } = compareWithOriginal(model);

      if (isDirty) {
        await this.adapter
          .table(tableName)
          .where(
            primaryKeyInfo.name,
            (model as any)[primaryKeyInfo.propertyKey],
          )
          .update(diff)
          .execute();
      }
    } else {
      const values = getValues(model);

      // Save record to the database
      const query = this.adapter
        .table(tableName)
        .insert(values);

      // The postgres adapter doesn't have `lastInsertedId`. So, we need to
      // manually return the primary key in order to set the model's primary key
      if (this.adapter.dialect === "postgres") {
        query.returning(primaryKeyInfo.name);
      }

      // Execute the query
      const result = await query.execute();

      // Get last inserted id
      const lastInsertedId: number = this.adapter.dialect === "postgres"
        ? result[result.length - 1][primaryKeyInfo.name] as number
        : this.adapter.lastInsertedId;

      // Set the primary key
      values[primaryKeyInfo.name] = lastInsertedId;

      // Populate empty properties with default value
      Object.assign(
        model,
        mapValueProperties(model.constructor, values, "propertyKey"),
      );
    }

    // Save the model's original values
    setSaved(model, true);

    return model;
  }

  /**
   * Find models that match given conditions.
   * 
   * @param modelClass the model you want to find
   * @param options find options for filtering the records
   */
  public async find<T>(
    modelClass: { new (): T },
    options?: FindOptions<T>,
  ): Promise<T[]> {
    // Initialize the query builder
    const query = this.setupQueryBuilder(modelClass, options);

    // Execute the query
    const result = await query.execute();

    // Build the model objects
    return createModels(modelClass, mapQueryResult(modelClass, result), true);
  }

  /**
   * Find a single models that match given conditions. If multiple
   * found, it will return the first one. 
   * 
   * @param modelClass the model you want to find
   * @param options find options for filtering the records
   */
  public async findOne<T>(
    modelClass: { new (): T },
    options?: FindOptions<T>,
  ): Promise<T | null> {
    // Initialize the query builder
    const query = this.setupQueryBuilder(modelClass, options);

    // Execute the query
    const result = await query.execute();

    // Build the model objects
    if (result.length >= 1) {
      return createModel(
        modelClass,
        mapSingleQueryResult(modelClass, result[0]),
        true,
      );
    } else {
      return null;
    }
  }

  /**
   * Setup the query builder for find() and findOne()
   * 
   * @param modelClass the model class
   * @param options find options for filtering the records
   */
  private setupQueryBuilder(
    modelClass: Function,
    options?: FindOptions<{}>,
  ): QueryBuilder {
    const tableName = getTableName(modelClass);
    const query = this.adapter.table(tableName);

    // Implement the where statements
    if (options?.where) {
      const values = mapValueProperties(modelClass, options.where, "name");
      for (const [key, value] of Object.entries(values)) {
        query.where(key, value);
      }
    }

    // Select the model columns
    const columns: [string, string][] = getColumns(modelClass)
      .map((column) => [
        tableName + "." + column.name,
        tableName + "__" + column.name,
      ]);
    query.select(...columns);

    return query;
  }
}
