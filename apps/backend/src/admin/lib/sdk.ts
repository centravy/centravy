import Medusa from "@medusajs/js-sdk"

export const sdk = new Medusa({
  baseUrl: import.meta.env.VITE_BACKEND_URL || "/",
  debug: import.meta.env.DEV,
  auth: { type: "session" },
})

export type Supplier = {
  id: string
  name: string
  email: string
  phone: string
  collection_address: string | null
}
