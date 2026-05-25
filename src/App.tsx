import { lazy, Suspense, useEffect, type ReactNode } from "react";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { RouteAnalytics } from "./components/RouteAnalytics";
import { AuthProvider } from "./context/AuthProvider";
import { ToastProvider } from "./context/ToastProvider";
import { AppBootGate } from "./components/AppBootGate";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { BuildDeployBadge } from "./components/BuildDeployBadge";
import { bootLog, logBootHealth } from "./lib/bootDebug";
import { SessionIdleWatcher } from "./components/SessionIdleWatcher";
import { RequireAdmin, RequireAuth, RequireGuard, RequireMerchant } from "./components/RequireAuth";
import { HubLayout } from "./layouts/HubLayout";
import { Skeleton } from "./components/Skeleton";
import Landing from "./pages/Landing";
import Login from "./pages/Login";
import Register from "./pages/Register";
import ForgotPassword from "./pages/ForgotPassword";
import AuthCallback from "./pages/AuthCallback";
import PasswordReset from "./pages/PasswordReset";
import Terms from "./pages/Terms";
import Privacy from "./pages/Privacy";
import TipResolve from "./pages/TipResolve";
import PaymentSuccess from "./pages/PaymentSuccess";
import PaymentFailure from "./pages/PaymentFailure";
import NotFound from "./pages/NotFound";

const Onboarding = lazy(() => import("./pages/Onboarding"));
const Settings = lazy(() => import("./pages/Settings"));
const CustomerHome = lazy(() => import("./pages/CustomerHome"));
const CustomerDashboard = lazy(() => import("./pages/CustomerDashboard"));
const CustomerHistory = lazy(() => import("./pages/CustomerHistory"));
const CustomerWallet = lazy(() => import("./pages/CustomerWallet"));
const CustomerTransactions = lazy(() => import("./pages/CustomerTransactions"));
const TipCheckout = lazy(() => import("./pages/TipCheckout"));
const TipDone = lazy(() => import("./pages/TipDone"));
const QrTipLanding = lazy(() => import("./pages/QrTipLanding"));
const MerchantDashboard = lazy(() => import("./pages/MerchantDashboard"));
const MerchantSetup = lazy(() => import("./pages/MerchantSetup"));
const MerchantLocations = lazy(() => import("./pages/MerchantLocations"));
const MerchantQr = lazy(() => import("./pages/MerchantQr"));
const MerchantQrPrint = lazy(() => import("./pages/MerchantQrPrint"));
const MerchantGuards = lazy(() => import("./pages/MerchantGuards"));
const MerchantKyc = lazy(() => import("./pages/MerchantKyc"));
const GuardHome = lazy(() => import("./pages/GuardHome"));
const GuardSetup = lazy(() => import("./pages/GuardSetup"));
const GuardConnect = lazy(() => import("./pages/GuardConnect"));
const GuardQR = lazy(() => import("./pages/GuardQR"));
const GuardProfile = lazy(() => import("./pages/GuardProfile"));
const GuardHistory = lazy(() => import("./pages/GuardHistory"));
const PopiaNotice = lazy(() => import("./pages/PopiaNotice"));
const CookiesPolicy = lazy(() => import("./pages/CookiesPolicy"));
const RefundPolicy = lazy(() => import("./pages/RefundPolicy"));
const MerchantOnboardingLegal = lazy(() => import("./pages/MerchantOnboardingLegal"));
const Contact = lazy(() => import("./pages/Contact"));
const AdminDashboard = lazy(() => import("./pages/AdminDashboard"));
const AdminSecurity = lazy(() => import("./pages/AdminSecurity"));
const AdminTransactions = lazy(() => import("./pages/AdminTransactions"));
const AdminAnalytics = lazy(() => import("./pages/AdminAnalytics"));
const AdminMetrics = lazy(() => import("./pages/AdminMetrics"));
const AdminFraud = lazy(() => import("./pages/AdminFraud"));
const MerchantDisputes = lazy(() => import("./pages/MerchantDisputes"));

function RouteFallback() {
  return (
    <div className="shell mx-auto max-w-lg space-y-3 px-5 py-10">
      <Skeleton style={{ height: 28, width: "55%" }} />
      <Skeleton style={{ height: 140, width: "100%", borderRadius: 18 }} />
      <Skeleton style={{ height: 80, width: "100%", borderRadius: 14 }} />
    </div>
  );
}

function Lazy({ children }: { children: ReactNode }) {
  return <Suspense fallback={<RouteFallback />}>{children}</Suspense>;
}

function RouterMountedProbe() {
  useEffect(() => {
    bootLog("router mounted");
    logBootHealth("router mounted");
  }, []);
  return null;
}

function AppRoutes() {
  return (
    <>
      <RouterMountedProbe />
      <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/auth/callback" element={<AuthCallback />} />
      <Route path="/auth/reset" element={<PasswordReset />} />
      <Route path="/terms" element={<Terms />} />
      <Route path="/privacy" element={<Privacy />} />
      <Route
        path="/legal/popia"
        element={
          <Lazy>
            <PopiaNotice />
          </Lazy>
        }
      />
      <Route
        path="/legal/cookies"
        element={
          <Lazy>
            <CookiesPolicy />
          </Lazy>
        }
      />
      <Route
        path="/legal/refunds"
        element={
          <Lazy>
            <RefundPolicy />
          </Lazy>
        }
      />
      <Route
        path="/legal/merchant"
        element={
          <Lazy>
            <MerchantOnboardingLegal />
          </Lazy>
        }
      />
      <Route
        path="/contact"
        element={
          <Lazy>
            <Contact />
          </Lazy>
        }
      />
      <Route path="/t/:token" element={<TipResolve />} />
      <Route
        path="/tip/:token"
        element={
          <Lazy>
            <QrTipLanding />
          </Lazy>
        }
      />
      <Route
        path="/qr/:token"
        element={
          <Lazy>
            <QrTipLanding />
          </Lazy>
        }
      />
      <Route path="/payment/success" element={<PaymentSuccess />} />
      <Route path="/payment/failure" element={<PaymentFailure />} />
      <Route
        path="/customer/tip/:guardId"
        element={
          <RequireAuth>
            <Lazy>
              <TipCheckout />
            </Lazy>
          </RequireAuth>
        }
      />
      <Route
        path="/customer/done"
        element={
          <Lazy>
            <TipDone />
          </Lazy>
        }
      />
      <Route
        path="/onboarding"
        element={
          <RequireAuth>
            <Lazy>
              <Onboarding />
            </Lazy>
          </RequireAuth>
        }
      />
      <Route
        path="/settings"
        element={
          <RequireAuth>
            <Lazy>
              <Settings />
            </Lazy>
          </RequireAuth>
        }
      />

      <Route element={<HubLayout variant="customer" />}>
        <Route
          path="/customer"
          element={
            <Lazy>
              <CustomerHome />
            </Lazy>
          }
        />
        <Route
          path="/customer/dashboard"
          element={
            <RequireAuth>
              <Lazy>
                <CustomerDashboard />
              </Lazy>
            </RequireAuth>
          }
        />
        <Route
          path="/customer/history"
          element={
            <RequireAuth>
              <Lazy>
                <CustomerHistory />
              </Lazy>
            </RequireAuth>
          }
        />
        <Route
          path="/customer/wallet"
          element={
            <RequireAuth>
              <Lazy>
                <CustomerWallet />
              </Lazy>
            </RequireAuth>
          }
        />
        <Route
          path="/customer/transactions"
          element={
            <RequireAuth>
              <Lazy>
                <CustomerTransactions />
              </Lazy>
            </RequireAuth>
          }
        />
      </Route>

      <Route
        path="/guard/setup"
        element={
          <RequireAuth>
            <Lazy>
              <GuardSetup />
            </Lazy>
          </RequireAuth>
        }
      />
      <Route element={<HubLayout variant="guard" />}>
        <Route
          path="/guard"
          element={
            <RequireAuth>
              <RequireGuard>
                <Lazy>
                  <GuardHome />
                </Lazy>
              </RequireGuard>
            </RequireAuth>
          }
        />
        <Route
          path="/guard/connect"
          element={
            <RequireAuth>
              <RequireGuard>
                <Lazy>
                  <GuardConnect />
                </Lazy>
              </RequireGuard>
            </RequireAuth>
          }
        />
        <Route
          path="/guard/qr"
          element={
            <RequireAuth>
              <RequireGuard>
                <Lazy>
                  <GuardQR />
                </Lazy>
              </RequireGuard>
            </RequireAuth>
          }
        />
        <Route
          path="/guard/profile"
          element={
            <RequireAuth>
              <RequireGuard>
                <Lazy>
                  <GuardProfile />
                </Lazy>
              </RequireGuard>
            </RequireAuth>
          }
        />
        <Route
          path="/guard/history"
          element={
            <RequireAuth>
              <RequireGuard>
                <Lazy>
                  <GuardHistory />
                </Lazy>
              </RequireGuard>
            </RequireAuth>
          }
        />
      </Route>

      <Route
        path="/merchant/setup"
        element={
          <RequireAuth>
            <Lazy>
              <MerchantSetup />
            </Lazy>
          </RequireAuth>
        }
      />
      <Route element={<HubLayout variant="merchant" />}>
        <Route
          path="/merchant"
          element={
            <RequireAuth>
              <RequireMerchant>
                <Lazy>
                  <MerchantDashboard />
                </Lazy>
              </RequireMerchant>
            </RequireAuth>
          }
        />
        <Route
          path="/merchant/locations"
          element={
            <RequireAuth>
              <RequireMerchant>
                <Lazy>
                  <MerchantLocations />
                </Lazy>
              </RequireMerchant>
            </RequireAuth>
          }
        />
        <Route
          path="/merchant/qr"
          element={
            <RequireAuth>
              <RequireMerchant>
                <Lazy>
                  <MerchantQr />
                </Lazy>
              </RequireMerchant>
            </RequireAuth>
          }
        />
        <Route
          path="/merchant/qr/print"
          element={
            <RequireAuth>
              <RequireMerchant>
                <Lazy>
                  <MerchantQrPrint />
                </Lazy>
              </RequireMerchant>
            </RequireAuth>
          }
        />
        <Route
          path="/merchant/guards"
          element={
            <RequireAuth>
              <RequireMerchant>
                <Lazy>
                  <MerchantGuards />
                </Lazy>
              </RequireMerchant>
            </RequireAuth>
          }
        />
        <Route
          path="/merchant/kyc"
          element={
            <RequireAuth>
              <RequireMerchant>
                <Lazy>
                  <MerchantKyc />
                </Lazy>
              </RequireMerchant>
            </RequireAuth>
          }
        />
        <Route
          path="/merchant/disputes"
          element={
            <RequireAuth>
              <RequireMerchant>
                <Lazy>
                  <MerchantDisputes />
                </Lazy>
              </RequireMerchant>
            </RequireAuth>
          }
        />
      </Route>

      <Route
        path="/admin"
        element={
          <RequireAdmin>
            <Lazy>
              <AdminDashboard />
            </Lazy>
          </RequireAdmin>
        }
      />
      <Route
        path="/admin/security"
        element={
          <RequireAdmin>
            <Lazy>
              <AdminSecurity />
            </Lazy>
          </RequireAdmin>
        }
      />
      <Route
        path="/admin/transactions"
        element={
          <RequireAdmin>
            <Lazy>
              <AdminTransactions />
            </Lazy>
          </RequireAdmin>
        }
      />
      <Route
        path="/admin/analytics"
        element={
          <RequireAdmin>
            <Lazy>
              <AdminAnalytics />
            </Lazy>
          </RequireAdmin>
        }
      />
      <Route
        path="/admin/metrics"
        element={
          <RequireAdmin>
            <Lazy>
              <AdminMetrics />
            </Lazy>
          </RequireAdmin>
        }
      />
      <Route
        path="/admin/fraud"
        element={
          <RequireAdmin>
            <Lazy>
              <AdminFraud />
            </Lazy>
          </RequireAdmin>
        }
      />
      <Route path="/404" element={<NotFound />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
    </>
  );
}

export default function App() {
  bootLog("App render");
  logBootHealth("app shell");
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <RouteAnalytics />
        <ToastProvider>
          <AuthProvider>
            <SessionIdleWatcher />
            <AppBootGate>
              <AppRoutes />
            </AppBootGate>
            <BuildDeployBadge />
          </AuthProvider>
        </ToastProvider>
      </BrowserRouter>
    </ErrorBoundary>
  );
}
