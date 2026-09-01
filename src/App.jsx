import { useEffect } from 'react';
import './App.css'
import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import VisualEditAgent from '@/lib/VisualEditAgent'
import NavigationTracker from '@/lib/NavigationTracker'
import { pagesConfig } from './pages.config'
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import DevLogin from './lib/DevLogin';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import LankarWOView from './pages/LankarWOView';

import AccessDeniedLock from './lib/AccessDeniedLock';

const { Pages, Layout, mainPage } = pagesConfig;
const mainPageKey = mainPage ?? Object.keys(Pages)[0];
const MainPage = mainPageKey ? Pages[mainPageKey] : <></>;

const LayoutWrapper = ({ children, currentPageName }) => Layout ?
  <Layout currentPageName={currentPageName}>{children}</Layout>
  : <>{children}</>;

const RedirectToSSO = () => {
  const { navigateToLogin } = useAuth();
  useEffect(() => {
    navigateToLogin();
  }, [navigateToLogin]);

  return (
    <div className="fixed inset-0 flex items-center justify-center">
      <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin"></div>
    </div>
  );
};

const RedirectToEnrollment = () => (
  <div className="fixed inset-0 flex flex-col items-center justify-center gap-4 text-center px-6">
    <p className="text-sm text-slate-600 max-w-sm">
      Your account needs a second sign-in method (an authenticator app or a passkey) set up before you can
      continue. Head to your myKADR account settings to add one, then come back and reload this page.
    </p>
    <a
      href="https://my.kensauto.ca"
      className="text-sm font-medium text-slate-800 underline underline-offset-2"
    >
      Go to myKADR account settings
    </a>
  </div>
);

const AuthenticatedApp = () => {
  const { isLoadingAuth, isAuthenticated, needsEnrollment, hasNoAccess } = useAuth();

  // Show loading spinner while checking auth
  if (isLoadingAuth) {
    return (
      <div className="fixed inset-0 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin"></div>
      </div>
    );
  }

  // UI Lock: If authenticated user has no_access (or no matching Employee record), block the entire app
  if (isAuthenticated && hasNoAccess) {
    return <AccessDeniedLock />;
  }

  const GateFallback = needsEnrollment ? RedirectToEnrollment : RedirectToSSO;

  // Render the app with route protection
  return (
    <Routes>
      <Route path="/" element={
        isAuthenticated ? (
          <LayoutWrapper currentPageName={mainPageKey}>
            <MainPage />
          </LayoutWrapper>
        ) : (
          <GateFallback />
        )
      } />
      {Object.entries(Pages).map(([path, Page]) => (
        <Route
          key={path}
          path={`/${path}`}
          element={
            isAuthenticated ? (
              <LayoutWrapper currentPageName={path}>
                <Page />
              </LayoutWrapper>
            ) : (
              <GateFallback />
            )
          }
        />
      ))}
      <Route path="/dev-login" element={<DevLogin />} />
      <Route
        path="/LankarWOView"
        element={
          isAuthenticated ? (
            <LayoutWrapper currentPageName="LankarWOView">
              <LankarWOView />
            </LayoutWrapper>
          ) : (
            <GateFallback />
          )
        }
      />
      <Route path="*" element={<PageNotFound />} />
    </Routes>
  );
};


function App() {
  useEffect(() => {
    let wasDark = false;
    const handleBeforePrint = () => {
      wasDark = document.documentElement.classList.contains('dark');
      if (wasDark) {
        document.documentElement.classList.remove('dark');
      }
    };
    const handleAfterPrint = () => {
      if (wasDark) {
        document.documentElement.classList.add('dark');
      }
    };

    window.addEventListener('beforeprint', handleBeforePrint);
    window.addEventListener('afterprint', handleAfterPrint);
    
    return () => {
      window.removeEventListener('beforeprint', handleBeforePrint);
      window.removeEventListener('afterprint', handleAfterPrint);
    };
  }, []);

  return (
    <AuthProvider>
      <QueryClientProvider client={queryClientInstance}>
        <Router>
          <NavigationTracker />
          <AuthenticatedApp />
        </Router>
        <Toaster />
        <VisualEditAgent />
      </QueryClientProvider>
    </AuthProvider>
  )
}

export default App