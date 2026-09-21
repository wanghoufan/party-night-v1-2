export type ClearSecretState = { confirmOpen: boolean; clearing: boolean; cleared: boolean; error?: string };
export type ClearSecretAction = { type: "open" | "cancel" | "confirm" | "success" } | { type: "failure"; error: string };

export const initialClearSecretState: ClearSecretState = { confirmOpen: false, clearing: false, cleared: false };

export function clearSecretReducer(state: ClearSecretState, action: ClearSecretAction): ClearSecretState {
  switch (action.type) {
    case "open": return { ...state, confirmOpen: true, cleared: false, error: undefined };
    case "cancel": return { ...state, confirmOpen: false, clearing: false };
    case "confirm": return { ...state, clearing: true };
    case "success": return { confirmOpen: false, clearing: false, cleared: true };
    case "failure": return { ...state, clearing: false, error: action.error };
  }
}
