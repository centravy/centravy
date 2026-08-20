import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk";
import { SUPPLIER_MODULE } from "../../../modules/supplier";
import SupplierModuleService from "../../../modules/supplier/service";

type UpdateSupplierStepInput = {
    id: string
    name?: string
    email?: string
    phone?: string
    collection_address?: string
}

// The snapshot is a full row read back from the database, so collection_address
// is `string | null` here, not the `string | undefined` an incoming patch uses.
type UpdateSupplierCompensationInput = {
    id: string
    name: string
    email: string
    phone: string
    collection_address: string | null
}

export const updateSupplierStep = createStep(
    "update-supplier",
    async (input: UpdateSupplierStepInput, {container}) => {
        const service: SupplierModuleService = container.resolve(SUPPLIER_MODULE);
        const previous = await service.retrieveSupplier(input.id);

        const supplier = await service.updateSuppliers(input);

        // Snapshot every updatable field, not only the patched ones: restoring a
        // field to the value it already has is a no-op, and it keeps the payload
        // free of dynamic key access.
        return new StepResponse(supplier, {
            id: previous.id,
            name: previous.name,
            email: previous.email,
            phone: previous.phone,
            collection_address: previous.collection_address,
        })
    },
    async (previous: UpdateSupplierCompensationInput | undefined, { container }) => {
    if (!previous) {
        return
    }
    const service: SupplierModuleService = container.resolve(SUPPLIER_MODULE)
    await service.updateSuppliers(previous)
    }
)
