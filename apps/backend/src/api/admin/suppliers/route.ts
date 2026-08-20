import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { SUPPLIER_MODULE } from "../../../modules/supplier";
import SupplierModuleService from "../../../modules/supplier/service";
import { createSupplierWorkflow } from "../../../workflows/create-supplier";

type CreateSupplierBody = {
  name: string
  email: string
  phone: string
  collection_address?: string
}

export async function GET(req: MedusaRequest, res: MedusaResponse) {
    const service: SupplierModuleService = req.scope.resolve(SUPPLIER_MODULE);
    const suppliers = await service.listSuppliers();
    const sanitized = suppliers.map(({api_token, ...rest}) => rest)

    res.json({suppliers: sanitized});
    
}

export async function POST(req: MedusaRequest<CreateSupplierBody>, res: MedusaResponse) {
  const { result } = await createSupplierWorkflow(req.scope).run({
    input: {
      name: req.body.name,
      email: req.body.email,
      phone: req.body.phone,
      collection_address: req.body.collection_address,
    },
  })

  res.status(201).json({ supplier: result })
}
