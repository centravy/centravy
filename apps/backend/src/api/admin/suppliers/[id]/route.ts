import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { MedusaError } from "@medusajs/framework/utils";
import { SUPPLIER_MODULE } from "../../../../modules/supplier";
import SupplierModuleService from "../../../../modules/supplier/service";
import { updateSupplierWorkflow } from "../../../../workflows/update-supplier";
import { deleteSupplierWorkflow } from "../../../../workflows/delete-supplier";
import { UpdateSupplierSchema } from "../validators";
import z from "@medusajs/framework/zod";

type UpdateSupplierBody = z.infer<typeof UpdateSupplierSchema>

// The generated service methods disagree on a missing row, so the routes that
// need a 404 check for themselves rather than relying on the service. Throwing
// keeps the 404 ahead of any write to res.
async function retrieveSupplierOr404(req: MedusaRequest, id: string) {
    const service: SupplierModuleService = req.scope.resolve(SUPPLIER_MODULE);
    const [supplier] = await service.listSuppliers({ id });

    if (!supplier) {
        throw new MedusaError(
            MedusaError.Types.NOT_FOUND,
            `Supplier with id "${id}" was not found`
        )
    }

    return supplier
}

export async function GET(req: MedusaRequest, res: MedusaResponse) {
    const { id } = req.params;
    const { api_token, ...supplier } = await retrieveSupplierOr404(req, id);

    res.json({supplier});
}

export async function PATCH(req: MedusaRequest<UpdateSupplierBody>, res: MedusaResponse) {
    const { id } = req.params;
    await retrieveSupplierOr404(req, id);

    const { result } = await updateSupplierWorkflow(req.scope).run({
        input: { id, ...req.validatedBody },
    })

    const { api_token, ...supplier } = result;

    res.json({supplier});
}

// No existence check: core Medusa answers a repeated DELETE with the same 200,
// and we match it. See D-007.
export async function DELETE(req: MedusaRequest, res: MedusaResponse) {
    const { id } = req.params;

    await deleteSupplierWorkflow(req.scope).run({
        input: { id },
    })

    res.json({
        id,
        object: "supplier",
        deleted: true,
    });
}
