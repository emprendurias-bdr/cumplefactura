import { useEffect } from "react";
import { InvoiceWorkspace } from "./features/invoices/InvoiceWorkspace";
import { WorkspaceContext } from "./shared/context";
import { SuiteShell } from "./shared/SuiteShell";
import { useWorkspace } from "./shared/useWorkspace";
export default function App() {
  const state = useWorkspace();
  useEffect(() => {
    if ("__TAURI_INTERNALS__" in window) void state.refreshData();
  }, []);
  return (
    <WorkspaceContext.Provider value={state}>
      <SuiteShell state={state}>
        <InvoiceWorkspace />
      </SuiteShell>
    </WorkspaceContext.Provider>
  );
}
