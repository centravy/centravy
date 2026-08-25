import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils"
import { SUPPLIER_MODULE } from "../../../../../modules/supplier"
import SupplierModuleService from "../../../../../modules/supplier/service"

// query.graph()'s return type for entity "supplier" is inferred from the
// Supplier DML model, which has no `product_link` field — that's added by
// the link, not the model, and only core-shipped links carry pre-built type
// augmentation. Declared by hand for the same reason update-supplier.ts
// declares UpdateSupplierCompensationInput by hand.
//
// `products.*` is not enough: defineLink()'s "products" shortcut forwards
// straight through to the nested Product entity and never touches the pivot
// row, so the extra columns (wholesale_price, retail_price) are invisible
// through it. They live only on the pivot itself, reachable as the
// `product_link` relation (defineLink() names it `<alias>_link` on each
// side) — verified directly against defineLink()'s compiled source
// (node_modules/@medusajs/utils/dist/modules-sdk/define-link.js:246-283).
type SupplierWithProductLinks = {
    product_link: Array<{
        wholesale_price: number
        retail_price: number
        product: Record<string, unknown>
    }>
}

// Same existence-check shape as GET /admin/suppliers/:id (D-008): listSuppliers
// returns an empty array for an unknown id, so the route checks for itself
// before the cross-module read.
export async function GET(req: MedusaRequest, res: MedusaResponse) {
    const { id } = req.params
    const service: SupplierModuleService = req.scope.resolve(SUPPLIER_MODULE)
    const [found] = await service.listSuppliers({ id })

    if (!found) {
        throw new MedusaError(
            MedusaError.Types.NOT_FOUND,
            `Supplier with id "${id}" was not found`
        )
    }

    const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)

    const {
        data: [supplier],
    } = await query.graph({
        entity: "supplier",
        filters: { id },
        fields: ["product_link.wholesale_price", "product_link.retail_price", "product_link.product.*"],
    })

    const products = (supplier as unknown as SupplierWithProductLinks).product_link.map(
        (link) => ({
            ...link.product,
            wholesale_price: link.wholesale_price,
            retail_price: link.retail_price,
        })
    )

    res.json({ products })
}
