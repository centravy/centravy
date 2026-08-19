import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { SUPPLIER_MODULE } from "../../../modules/supplier";
import SupplierModuleService from "../../../modules/supplier/service";
import { randomBytes } from "node:crypto"

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

export async function POST(req: MedusaRequest<CreateSupplierBody>, res:MedusaResponse) {
    const service: SupplierModuleService = req.scope.resolve(SUPPLIER_MODULE);
    const data = {
        name: req.body.name,
        email: req.body.email,
        phone: req.body.phone,
        collection_address: req.body.collection_address,
        api_token: randomBytes(32).toString("hex")
    };

    const supplier = await service.createSuppliers(data);
    res.status(201).json({ supplier })

}
