import { lazy, Suspense } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider } from "./context/AuthProvider";
import { ToastProvider } from "./context/ToastProvider";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { RequireAdmin, RequireAuth, RequireGuard, RequireMerchant } from "./components/RequireAuth";
import Landing from "./pages/Landing";
import Login from "./pages/Login";
import Register from "./pages/Register";
import ForgotPassword from "./pages/ForgotPassword";
import AuthCallback from "./pages/AuthCallback";
import PasswordReset from "./pages/PasswordReset";
import Onboarding from "./pages/Onboarding";
import Settings from "./pages/Settings";
import Terms from "./pages/Terms";
import Privacy from "./pages/Privacy";
import CustomerHome from "./pages/CustomerHome";
import CustomerDashboard from "./pages/CustomerDashboard";
import MerchantDashboard from "./pages/MerchantDashboard";
import MerchantSetup from "./pages/MerchantSetup";
import TipCheckout from "./pages/TipCheckout";
import TipDone from "./pages/TipDone";
import TipResolve from "./pages/TipResolve";
import QrTipLanding from "./pages/QrTipLanding";
import MerchantLocations from "./pages/MerchantLocations";
import MerchantGuards from "./pages/MerchantGuards";
import GuardHome from "./pages/GuardHome";
import GuardSetup from "./pages/GuardSetup";
import GuardConnect from "./pages/GuardConnect";
import GuardQR from "./pages/GuardQR";
import GuardProfile from "./pages/GuardProfile";
import GuardHistory from "./pages/GuardHistory";
import CustomerHistory from "./pages/CustomerHistory";
import CustomerWallet from "./pages/CustomerWallet";
import PaymentSuccess from "./pages/PaymentSuccess";
import PaymentFailure from "./pages/PaymentFailure";
import CustomerTransactions from "./pages/CustomerTransactions";
import MerchantKyc from "./pages/MerchantKyc";
import { Skeleton } from "./components/Skeleton";

const AdminDashboard = lazy(() => import("./pages/AdminDashboard"));
const AdminSecurity = lazy(() => import("./pages/AdminSecurity"));
const AdminTransactions = lazy(() => import("./pages/AdminTransactions"));
const AdminAnalytics = lazy(() => import("./pages/AdminAnalytics"));

function AdminRouteFallback() {
  return (
    <div className="shell mx-auto max-w-lg space-y-3 px-5 py-10">
      <Skeleton style={{ height: 28, width: "55%" }} />
      <Skeleton style={{ height: 140, width: "100%", borderRadius: 18 }} />
      <Skeleton style={{ height: 80, width: "100%", borderRadius: 14 }} />
    </div>
  );
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/auth/callback" element={<AuthCallback />} />
      <Route path="/auth/reset" element={<PasswordReset />} />
      <Route path="/terms" element={<Terms />} />
      <Route path="/privacy" element={<Privacy />} />
      <Route path="/t/:token" element={<TipResolve />} />
      <Route path="/tip/:token" element={<QrTipLanding />} />
      <Route path="/customer" element={<CustomerHome />} />
      <Route
        path="/customer/dashboard"
        element={
          <RequireAuth>
            <CustomerDashboard />
          </RequireAuth>
        }
      />
      <Route
        path="/customer/history"
        element={
          <RequireAuth>
            <CustomerHistory />
          </RequireAuth>
        }
      />
      <Route
        path="/customer/wallet"
        element={
          <RequireAuth>
            <CustomerWallet />
          </RequireAuth>
        }
      />
      <Route
        path="/customer/tip/:guardId"
        element={
          <RequireAuth>
            <TipCheckout />
          </RequireAuth>
        }
      />
      <Route path="/customer/done" element={<TipDone />} />
      <Route path="/payment/success" element={<PaymentSuccess />} />
      <Route path="/payment/failure" element={<PaymentFailure />} />
      <Route
        path="/customer/transactions"
        element={
          <RequireAuth>
            <CustomerTransactions />
          </RequireAuth>
        }
      />
      <Route
        path="/onboarding"
        element={
          <RequireAuth>
            <Onboarding />
          </RequireAuth>
        }
      />
      <Route
        path="/settings"
        element={
          <RequireAuth>
            <Settings />
          </RequireAuth>
        }
      />
      <Route
        path="/guard"
        element={
          <RequireAuth>
            <RequireGuard>
              <GuardHome />
            </RequireGuard>
          </RequireAuth>
        }
      />
      <Route
        path="/guard/setup"
        element={
          <RequireAuth>
            <GuardSetup />
          </RequireAuth>
        }
      />
      <Route
        path="/guard/connect"
        element={
          <RequireAuth>
            <RequireGuard>
              <GuardConnect />
            </RequireGuard>
          </RequireAuth>
        }
      />
      <Route
        path="/guard/qr"
        element={
          <RequireAuth>
            <RequireGuard>
              <GuardQR />
            </RequireGuard>
          </RequireAuth>
        }
      />
      <Route
        path="/guard/profile"
        element={
          <RequireAuth>
            <RequireGuard>
              <GuardProfile />
            </RequireGuard>
          </RequireAuth>
        }
      />
      <Route
        path="/guard/history"
        element={
          <RequireAuth>
            <RequireGuard>
              <GuardHistory />
            </RequireGuard>
          </RequireAuth>
        }
      />
      <Route
        path="/merchant/setup"
        element={
          <RequireAuth>
            <MerchantSetup />
          </RequireAuth>
        }
      />
      <Route
        path="/merchant/kyc"
        element={
          <RequireAuth>
            <RequireMerchant>
              <MerchantKyc />
            </RequireMerchant>
          </RequireAuth>
        }
      />
      <Route
        path="/merchant"
        element={
          <RequireAuth>
            <RequireMerchant>
              <MerchantDashboard />
            </RequireMerchant>
          </RequireAuth>
        }
      />
      <Route
        path="/merchant/locations"
        element={
          <RequireAuth>
            <RequireMerchant>
              <MerchantLocations />
            </RequireMerchant>
          </RequireAuth>
        }
      />
      <Route
        path="/merchant/guards"
        element={
          <RequireAuth>
            <RequireMerchant>
              <MerchantGuards />
            </RequireMerchant>
          </RequireAuth>
        }
      />
      <Route
        path="/admin"
        element={
          <RequireAdmin>
            <Suspense fallback={<AdminRouteFallback />}>
              <AdminDashboard />
            </Suspense>
          </RequireAdmin>
        }
      />
      <Route
        path="/admin/security"
        element={
          <RequireAdmin>
            <Suspense fallback={<AdminRouteFallback />}>
              <AdminSecurity />
            </Suspense>
          </RequireAdmin>
        }
      />
      <Route
        path="/admin/transactions"
        element={
          <RequireAdmin>
            <Suspense fallback={<AdminRouteFallback />}>
              <AdminTransactions />
            </Suspense>
          </RequireAdmin>
        }
      />
      <Route
        path="/admin/analytics"
        element={
          <RequireAdmin>
            <Suspense fallback={<AdminRouteFallback />}>
              <AdminAnalytics />
            </Suspense>
          </RequireAdmin>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <ToastProvider>
          <AuthProvider>
            <AppRoutes />
          </AuthProvider>
        </ToastProvider>
      </BrowserRouter>
    </ErrorBoundary>
  );
}
