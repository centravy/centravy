import { z } from "@medusajs/framework/zod";

export const CreateSupplierSchema = z.object({
    name: z.string().min(1),
    email: z.email(),
    phone: z.string().min(6),
    collection_address: z.string().optional(),
})

export const UpdateSupplierSchema = CreateSupplierSchema.partial()
