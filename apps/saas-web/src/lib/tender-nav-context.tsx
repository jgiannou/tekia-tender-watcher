import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

type TenderNavContextValue = {
  /** True while viewing a followed tender detail — highlights Παρακολουθούμενα. */
  viewingFollowedTender: boolean;
  setViewingFollowedTender: (value: boolean) => void;
};

const TenderNavContext = createContext<TenderNavContextValue | null>(null);

export const TenderNavProvider = ({ children }: { children: ReactNode }) => {
  const [viewingFollowedTender, setViewingFollowedTender] = useState(false);
  const value = useMemo(
    () => ({ viewingFollowedTender, setViewingFollowedTender }),
    [viewingFollowedTender],
  );
  return (
    <TenderNavContext.Provider value={value}>{children}</TenderNavContext.Provider>
  );
};

export const useTenderNav = () => {
  const ctx = useContext(TenderNavContext);
  const noop = useCallback((_value: boolean) => undefined, []);
  if (!ctx) {
    return {
      viewingFollowedTender: false,
      setViewingFollowedTender: noop,
    };
  }
  return ctx;
};
