import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { SUPPLIER_MODULE } from "../../../modules/supplier";
import SupplierModuleService from "../../../modules/supplier/service";

export async function GET(req: MedusaRequest, res: MedusaResponse) {
    const service: SupplierModuleService = req.scope.resolve(SUPPLIER_MODULE);
    const suppliers = await service.listSuppliers();
    res.json({suppliers});
}
