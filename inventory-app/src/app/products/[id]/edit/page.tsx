"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import ProductForm from "@/components/ProductForm";

export default function EditProductPage() {
  const params = useParams();
  const router = useRouter();
  const [product, setProduct] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/products/${params.id}`)
      .then((r) => r.json())
      .then((data) => {
        setProduct(data);
        setLoading(false);
      });
  }, [params.id]);

  const handleSubmit = async (data: Record<string, unknown>) => {
    await fetch(`/api/products/${params.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    router.push("/products");
  };

  const handleDelete = async () => {
    if (confirm("この商品を削除しますか？")) {
      await fetch(`/api/products/${params.id}`, { method: "DELETE" });
      router.push("/products");
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-400">読み込み中...</div>
      </div>
    );
  }

  return (
    <div className="p-4">
      <h1 className="text-xl font-bold mb-4">商品を編集</h1>
      <ProductForm product={product} onSubmit={handleSubmit} />
      <div className="mt-8 pt-4 border-t">
        <button
          onClick={handleDelete}
          className="w-full py-3 text-red-600 bg-red-50 rounded-lg text-sm font-medium hover:bg-red-100 transition-colors"
        >
          この商品を削除する
        </button>
      </div>
    </div>
  );
}
