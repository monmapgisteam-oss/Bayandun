"use client";

import { createContext, useContext } from "react";
import type EsriMap from "@arcgis/core/Map";
import type MapView from "@arcgis/core/views/MapView";
import type SceneView from "@arcgis/core/views/SceneView";
import type { Dim } from "./MapCanvas";

export type MapState = {
  map: EsriMap | null;
  view: MapView | SceneView | null;
  dim: Dim;
  setDim: (d: Dim) => void;
  showLayers: (ids: string[]) => void;
};

export const MapCtx = createContext<MapState>({
  map: null, view: null, dim: "2d", setDim: () => {}, showLayers: () => {},
});
export const useMapCtx = () => useContext(MapCtx);
