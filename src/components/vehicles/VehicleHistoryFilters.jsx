import React from "react";
import HistoryFilters, { DEFAULT_HISTORY_FILTERS } from "@/components/history/HistoryFilters";

export const DEFAULT_VEHICLE_HISTORY_FILTERS = DEFAULT_HISTORY_FILTERS;

export default function VehicleHistoryFilters(props) {
  return <HistoryFilters {...props} />;
}