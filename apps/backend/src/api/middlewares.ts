import { defineMiddlewares, validateAndTransformBody } from "@medusajs/framework/http"
import { CreateSupplierSchema, UpdateSupplierSchema } from "./admin/suppliers/validators"

export default defineMiddlewares({
  routes: [
    {
      matcher: "/admin/suppliers",
      method: "POST",
      middlewares: [validateAndTransformBody(CreateSupplierSchema)],
    },
    {
      matcher: "/admin/suppliers/:id",
      method: "PATCH",
      middlewares: [validateAndTransformBody(UpdateSupplierSchema)],
    },
  ],
})
