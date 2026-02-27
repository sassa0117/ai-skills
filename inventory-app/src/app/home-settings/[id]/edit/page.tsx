"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import WidgetForm from "@/components/WidgetForm";

export default function EditWidgetPage() {
  const params = useParams();
  const router = useRouter();
  const [widget, setWidget] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/widgets/${params.id}`)
      .then((r) => r.json())
      .then((data) => {
        setWidget(data);
        setLoading(false);
      });
  }, [params.id]);

  const handleSubmit = async (data: Record<string, unknown>) => {
    await fetch(`/api/widgets/${params.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    router.push("/home-settings");
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
      <WidgetForm widget={widget} onSubmit={handleSubmit} title="項目の編集" />
    </div>
  );
}
