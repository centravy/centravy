import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260817085219 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "supplier" drop constraint if exists "supplier_api_token_unique";`);
    this.addSql(`alter table if exists "supplier" drop constraint if exists "supplier_email_unique";`);
    this.addSql(`create table if not exists "supplier" ("id" text not null, "name" text not null, "email" text not null, "phone" text not null, "collection_address" text null, "api_token" text not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "supplier_pkey" primary key ("id"));`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_supplier_email_unique" ON "supplier" ("email") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_supplier_api_token_unique" ON "supplier" ("api_token") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_supplier_deleted_at" ON "supplier" ("deleted_at") WHERE deleted_at IS NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "supplier" cascade;`);
  }

}
