import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk";
import { SUPPLIER_MODULE } from "../../../modules/supplier";
import SupplierModuleService from "../../../modules/supplier/service";
import { randomBytes } from "node:crypto"

type CreateSupplierStepInput = {
    name: string
    email: string
    phone: string
    collection_address?: string
}

export const createSupplierStep = createStep(
    "create-supplier",
    async (input: CreateSupplierStepInput, {container}) => {
        const service: SupplierModuleService = container.resolve(SUPPLIER_MODULE);
        const data = {
            name: input.name,
            email: input.email,
            phone: input.phone,
            collection_address: input.collection_address,
            api_token: randomBytes(32).toString("hex")
        };

        const supplier = await service.createSuppliers(data);
        return new StepResponse(supplier, supplier.id)
    },
    async (supplierId: string | undefined, { container }) => {
    if (!supplierId) {
        return
    }
    const service: SupplierModuleService = container.resolve(SUPPLIER_MODULE)
    await service.deleteSuppliers([supplierId])
    }
)
