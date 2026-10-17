"use client";

import { use } from "react";
import { CallScreen } from "@/components/call";

export default function CallPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <CallScreen callId={id} />;
}
