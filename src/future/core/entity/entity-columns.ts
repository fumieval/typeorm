import { AnyModel } from "../../../repository/model"
import { AnyDriver, DriverTypes } from "../driver"
import { FlatTypeHint, ForceCastIfNoKeys, NonNever, ValueOf } from "../util"
import { AnyEntity } from "./entity-core"
import { EntityProps } from "./entity-utils"

/**
 * This type is used to define entity column properties.
 */
export type EntityColumn<Types extends DriverTypes> = {
  primary?: boolean
  type: keyof Types["columnTypes"]
  generated?: boolean
  nullable?: boolean
  array?: boolean
  default?: any
  transform?: {
    from(value: any): any
    to(value: any): any
  }
}

/**
 * List of columns defined for some entity.
 */
export type EntityColumnList<Types extends DriverTypes> = {
  [key: string]: EntityColumn<Types>
}

export type EntityPropertiesItem<Driver extends AnyDriver> = (
  manager: Driver["manager"],
) => any

export type EntityProperties<Driver extends AnyDriver> = {
  [name: string]: EntityPropertiesItem<Driver>
}

export type EntityMethods = {
  [name: string]: any
}

/**
 * Gets a real compile-time type of the column defined in the entity.
 *
 * todo: also need to consider transformers
 *       also add support for manually specified types (maybe through the function)
 */
export type ColumnCompileType<
  Types extends DriverTypes,
  Model extends AnyModel,
  PropertyName extends string,
  Column extends EntityColumn<Types>
> = HasEntityModelColumnType<Model, PropertyName> extends true
  ? Column["array"] extends true
    ? Column["nullable"] extends true
      ? Model["type"][PropertyName][] | null
      : Model["type"][PropertyName]
    : Column["nullable"] extends true
    ? Model["type"][PropertyName] | null
    : Model["type"][PropertyName]
  : Column["array"] extends true
  ? Column["nullable"] extends true
    ? Types["columnTypes"][Column["type"]]["type"][] | null
    : Types["columnTypes"][Column["type"]]["type"]
  : Column["nullable"] extends true
  ? Types["columnTypes"][Column["type"]]["type"] | null
  : Types["columnTypes"][Column["type"]]["type"]

/**
 * Checks if entity model has given property name defined.
 */
export type HasEntityModelColumnType<
  Model extends AnyModel,
  PropertyName extends string
> = Model["type"] extends object
  ? PropertyName extends string & keyof Model["type"]
    ? true
    : false
  : false

/**
 * Returns object consist of columns and their types based on a given entity column names.
 * Careful! Marks column compile types as non-nullable.
 * This was made so because there is a requirement of that in the place where it is currently used.
 */
export type EntityColumnTypeMapByNames<
  Types extends DriverTypes,
  Entity extends AnyEntity,
  ColumnNames extends string
> = FlatTypeHint<
  {
    [P in ColumnNames]: P extends keyof Entity["columns"]
      ? NonNullable<
          ColumnCompileType<
            Entity["driver"]["types"],
            Entity["model"],
            P,
            Entity["columns"][P]
          >
        >
      : unknown
  }
>

/**
 * Returns columns type map with columns where "generated" set to true.
 *
 * Columns value map is an object where every column name is followed by a computed column type.
 * Examples:
 *
 *  - for { id: { type: "varchar", primary: true }, name: { "varchar", primary: true }, age: { type: "int" } }
 *    value will be: { id: string, name: string }
 *
 *  - for { id: { type: "varchar", primary: true }, name: { "varchar" }, age: { type: "int" } }
 *    value will be: { id: string }
 */
export type EntityGeneratedColumnTypeMap<
  Types extends DriverTypes,
  Entity extends AnyEntity
> = NonNever<
  {
    [P in keyof EntityProps<Entity>]: P extends string & keyof Entity["columns"]
      ? Entity["columns"][P]["generated"] extends true
        ? ColumnCompileType<
            Entity["driver"]["types"],
            Entity["model"],
            P,
            Entity["columns"][P]
          >
        : never
      : P extends keyof Entity["embeds"]
      ? EntityGeneratedColumnTypeMap<Types, Entity["embeds"][P]>
      : never
  }
>

/**
 * Returns columns type map with columns where "default" is set.
 *
 * Columns value map is an object where every column name is followed by a computed column type.
 * Examples:
 *
 *  - for { id: { type: "varchar", primary: true }, name: { "varchar", primary: true }, age: { type: "int" } }
 *    value will be: { id: string, name: string }
 *
 *  - for { id: { type: "varchar", primary: true }, name: { "varchar" }, age: { type: "int" } }
 *    value will be: { id: string }
 */
export type EntityDefaultColumnTypeMap<
  Types extends DriverTypes,
  Entity extends AnyEntity
> = NonNever<
  {
    [P in keyof EntityProps<Entity>]: P extends string & keyof Entity["columns"]
      ? Entity["columns"][P]["default"] extends string | number | boolean
        ? ColumnCompileType<
            Entity["driver"]["types"],
            Entity["model"],
            P,
            Entity["columns"][P]
          >
        : never
      : P extends keyof Entity["embeds"]
      ? EntityDefaultColumnTypeMap<Types, Entity["embeds"][P]>
      : never
  }
>

/**
 * Extracts all entity columns and columns from its embeds into a single string literal type.
 * Example: for { id, name, profile: { bio, age, photos }} it will return a following type:
 * "id" | "name" | "profile.bio" | "profile.age"
 */
export type EntityColumnPaths<
  Entity extends AnyEntity,
  Parent extends string = "",
  Deepness extends string = "."
> = ValueOf<
  {
    [P in keyof EntityProps<Entity>]?: P extends string &
      keyof Entity["columns"]
      ? `${Parent}${P}`
      : P extends string & keyof Entity["embeds"]
      ? EntityColumnPaths<Entity["embeds"][P], `${Parent}${P}.`, `${Deepness}.`>
      : never
  }
>

/**
 * Returns a type map entity columns with primary set to true.
 * Returns "unknown" if no primary keys found in entity.
 *
 * Examples:
 * - { id1 } it will return a following type:
 *   { id1: number }
 * - { id1, id2 } it will return a following type:
 *   { id1: number, id2: string }
 * - { id1, name, profile: { id2, bio, age, photos }} it will return a following type:
 *   { id1: number, { profile: { id2: string }}}
 * - { name, profile: { bio, age, photos }} it will return a following type:
 *   unknown
 *
 * Implementation notes:
 *  - we use ForceCastIfNoKeys to return "unknown" if object was empty
 *  - we use FlatTypeHint to return "clean type" for type hinting purpose
 *  - we use EntityPrimaryColumnValueMapAsCondition helper to simply code a bit
 */
export type EntityPrimaryColumnTypeMap<
  Types extends DriverTypes,
  Entity extends AnyEntity,
  Deepness extends string = "."
> = ForceCastIfNoKeys<
  FlatTypeHint<
    {
      [P in keyof Entity["columnsEmbeds"] as EntityPrimariesValueMapAsCondition<
        Entity,
        P
      > extends true
        ? P
        : never]: P extends string & keyof Entity["columns"]
        ? ColumnCompileType<
            Entity["driver"]["types"],
            Entity["model"],
            P,
            Entity["columns"][P]
          >
        : P extends keyof Entity["embeds"]
        ? EntityPrimaryColumnTypeMap<Types, Entity["embeds"][P], `${Deepness}.`>
        : never
    }
  >,
  unknown
>

/**
 * Returns all primary column names of a given entity.
 * Returns only primary column names of a "first" level of entity - only from columns.
 * Does not return primary column names from the entity embeds.
 */
export type EntityColumnsPrimaryNames<Entity extends AnyEntity> = keyof {
  [P in keyof Entity["columns"] as Entity["columns"][P]["primary"] extends true
    ? P
    : never]: true
}

/**
 * Helper type for a EntityPrimariesValueMap type.
 * For a given Key (entity column name OR entity embed name)
 * returns if entity column name is primary OR if entity embed name contains a primary.
 *
 * Implementation notes:
 *  - Deepness is used because otherwise compiler goes recursive and becomes slow
 *  - check for EntityColumnsPrimaryNames is used to exclude empty embeds without primaries
 */
export type EntityPrimariesValueMapAsCondition<
  Entity extends AnyEntity,
  Key extends keyof Entity["columnsEmbeds"],
  Deepness extends string = "."
> = Key extends keyof Entity["columns"]
  ? Entity["columns"][Key]["primary"] extends true
    ? true
    : false
  : Key extends keyof Entity["embeds"]
  ? Deepness extends ".........."
    ? false
    : EntityColumnsPrimaryNames<Entity["embeds"][Key]> extends ""
    ? false
    : true
  : false
