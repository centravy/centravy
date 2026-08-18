import { model } from "@medusajs/framework/utils"

const Supplier = model.define("supplier", {
  id: model.id().primaryKey(),
  name: model.text(),
  email: model.text().unique(),
  phone: model.text(),
  collection_address: model.text().nullable(),
  api_token: model.text().unique(),
})

export default Supplier
