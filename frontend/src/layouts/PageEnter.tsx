import { Outlet, useLocation } from "react-router-dom";

export function PageEnter() {
  const { pathname } = useLocation();
  return <div key={pathname} data-testid="page-enter" className="motion-safe:animate-[page-enter_200ms_ease-out]"><Outlet/></div>;
}
