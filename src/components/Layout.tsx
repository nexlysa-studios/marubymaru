import { ReactNode, useEffect } from "react";
import { Outlet, useLocation } from "react-router-dom";
import Navbar from "./Navbar";
import Footer from "./Footer";
import TikTokBrowserNotice from "./TikTokBrowserNotice";

const Layout = ({ children }: { children?: ReactNode }) => {
  const { pathname } = useLocation();

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <main className="flex-1 pt-24">
        <TikTokBrowserNotice />
        {children ?? <Outlet />}
      </main>
      <Footer />
    </div>
  );
};

export default Layout;
