import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk";
import { SUPPLIER_MODULE } from "../../../modules/supplier";
import SupplierModuleService from "../../../modules/supplier/service";

type DeleteSupplierStepInput = {
    id: string
}

export const deleteSupplierStep = createStep(
    "delete-supplier",
    async (input: DeleteSupplierStepInput, {container}) => {
        const service: SupplierModuleService = container.resolve(SUPPLIER_MODULE);

        // softDeleteSuppliers, not deleteSuppliers: the generated delete is a hard
        // delete and nothing can undo it. restoreSuppliers only reverses a soft one.
        await service.softDeleteSuppliers([input.id]);

        return new StepResponse(input.id, input.id)
    },
    async (supplierId: string | undefined, { container }) => {
    if (!supplierId) {
        return
    }
    const service: SupplierModuleService = container.resolve(SUPPLIER_MODULE)
    await service.restoreSuppliers([supplierId])
    }
)
