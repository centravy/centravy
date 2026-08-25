import { defineLink } from "@medusajs/framework/utils"
import ProductModule from "@medusajs/medusa/product"
import SupplierModule from "../modules/supplier"

export default defineLink(
  {
    linkable: ProductModule.linkable.product,
    isList: true,
  },
  SupplierModule.linkable.supplier,
  {
    database: {
      table: "product_supplier",
      extraColumns: {
        wholesale_price: {
          type: "integer",
        },
        retail_price: {
          type: "integer",
        },
      },
    },
  }
)
