import { loadEnv, defineConfig, MedusaError } from '@medusajs/framework/utils'

loadEnv(process.env.NODE_ENV || 'development', process.cwd())

function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      `Missing required environment variable: ${name}`
    )
  }
  return value
}

module.exports = defineConfig({
  projectConfig: {
    databaseUrl: process.env.DATABASE_URL,
    // Medusa infers SSL from the database URL and force-enables it for any host
    // that isn't localhost/127.0.0.1. Postgres here is reached as the compose
    // service "postgres" and serves no SSL, so that inference is wrong and
    // migrations fail with a misleading connection timeout. Setting this
    // explicitly also survives the devcontainer exporting DATABASE_URL, which
    // dotenv will not override.
    //
    // No SSL is correct for the devcontainer and any local Postgres. Set
    // DATABASE_SSL=true for a managed database that requires TLS.
    databaseDriverOptions: {
      connection: {
        ssl:
          process.env.DATABASE_SSL === "true"
            ? { rejectUnauthorized: false }
            : false,
      },
    },
    http: {
      storeCors: requireEnv('STORE_CORS'),
      adminCors: requireEnv('ADMIN_CORS'),
      authCors: requireEnv('AUTH_CORS'),
      jwtSecret: process.env.JWT_SECRET,
      cookieSecret: process.env.COOKIE_SECRET,
    }
  },
  modules: [
    {
      resolve: "./src/modules/supplier",
    },
  ],
})
