import { defineMiddlewares, validateAndTransformBody } from "@medusajs/framework/http"
import { CreateSupplierSchema } from "./admin/suppliers/validators"

export default defineMiddlewares({
  routes: [
    {
      matcher: "/admin/suppliers",
      method: "POST",
      middlewares: [validateAndTransformBody(CreateSupplierSchema)],
    },
  ],
})
