"use client";

import dynamic from "next/dynamic";

// ArcGIS зөвхөн хөтөч дээр ажиллана
const Portal = dynamic(() => import("./Portal"), { ssr: false });

export default function ClientRoot() {
  return <Portal />;
}
