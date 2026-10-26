import { createContext, useContext } from "react";
import type { Workspace } from "./useWorkspace";
export const WorkspaceContext = createContext<Workspace | null>(null);
export function useWorkspaceState() {
  const state = useContext(WorkspaceContext);
  if (!state) throw new Error("Falta WorkspaceContext");
  return state;
}
