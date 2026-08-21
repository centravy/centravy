import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { SUPPLIER_MODULE } from "../../../modules/supplier";
import SupplierModuleService from "../../../modules/supplier/service";
import { createSupplierWorkflow } from "../../../workflows/create-supplier";
import { CreateSupplierSchema } from "./validators";
import z from "@medusajs/framework/zod";

type CreateSupplierBody = z.infer<typeof CreateSupplierSchema>

export async function GET(req: MedusaRequest, res: MedusaResponse) {
    const service: SupplierModuleService = req.scope.resolve(SUPPLIER_MODULE);
    const suppliers = await service.listSuppliers();
    const sanitized = suppliers.map(({api_token, ...rest}) => rest)

    res.json({suppliers: sanitized});
    
}

export async function POST(req: MedusaRequest<CreateSupplierBody>, res: MedusaResponse) {
  const { result } = await createSupplierWorkflow(req.scope).run({
    input: req.validatedBody,
  })

  res.status(201).json({ supplier: result })
}
