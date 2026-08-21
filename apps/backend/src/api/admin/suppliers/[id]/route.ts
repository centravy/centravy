import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { MedusaError } from "@medusajs/framework/utils";
import { SUPPLIER_MODULE } from "../../../../modules/supplier";
import SupplierModuleService from "../../../../modules/supplier/service";
import { updateSupplierWorkflow } from "../../../../workflows/update-supplier";
import { deleteSupplierWorkflow } from "../../../../workflows/delete-supplier";
import { UpdateSupplierSchema } from "../validators";
import z from "@medusajs/framework/zod";

type UpdateSupplierBody = z.infer<typeof UpdateSupplierSchema>

// listSuppliers returns an empty array for an unknown id, so the read checks for
// itself. Throwing keeps the 404 ahead of any write to res. See D-008.
export async function GET(req: MedusaRequest, res: MedusaResponse) {
    const { id } = req.params;
    const service: SupplierModuleService = req.scope.resolve(SUPPLIER_MODULE);
    const [found] = await service.listSuppliers({ id });

    if (!found) {
        throw new MedusaError(
            MedusaError.Types.NOT_FOUND,
            `Supplier with id "${id}" was not found`
        )
    }

    const { api_token, ...supplier } = found;

    res.json({supplier});
}

// POST, not PATCH: core Medusa updates a resource with POST on its detail path
// and ships no PATCH handler anywhere. See D-010. No existence check either —
// updateSupplierStep retrieves the row for its compensation snapshot and throws
// NOT_FOUND itself.
export async function POST(req: MedusaRequest<UpdateSupplierBody>, res: MedusaResponse) {
    const { id } = req.params;

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
