"use client";

import { useRouter } from "next/navigation";
import WidgetForm from "@/components/WidgetForm";

export default function NewWidgetPage() {
  const router = useRouter();

  const handleSubmit = async (data: Record<string, unknown>) => {
    await fetch("/api/widgets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    router.push("/home-settings");
  };

  return (
    <div className="p-4">
      <WidgetForm onSubmit={handleSubmit} title="項目の追加" />
    </div>
  );
}
