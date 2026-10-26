import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: false,
  // Локал FeatureServer (app/api/site) egazar-ын нэгж талбарыг public/-аас уншина
  outputFileTracingIncludes: { "/api/site/FeatureServer/[[...path]]": ["./public/data/egazar_parcels.geojson"] },
};

export default nextConfig;
