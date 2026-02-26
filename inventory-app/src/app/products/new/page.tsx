"use client";

import ProductForm from "@/components/ProductForm";
import { useRouter } from "next/navigation";

export default function NewProductPage() {
  const router = useRouter();

  const handleSubmit = async (data: Record<string, unknown>) => {
    await fetch("/api/products", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    router.push("/products");
  };

  return (
    <div className="p-4">
      <h1 className="text-xl font-bold mb-4">商品を追加</h1>
      <ProductForm onSubmit={handleSubmit} />
    </div>
  );
}
