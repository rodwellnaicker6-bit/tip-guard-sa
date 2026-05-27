import { Route, Routes } from "react-router-dom";
import AdminDashboard from "../pages/AdminDashboard";
import AdminSecurity from "../pages/AdminSecurity";
import AdminTransactions from "../pages/AdminTransactions";
import AdminAnalytics from "../pages/AdminAnalytics";
import AdminMetrics from "../pages/AdminMetrics";
import AdminFraud from "../pages/AdminFraud";

/** Single lazy chunk for all admin surfaces (code-split from main bundle). */
export default function AdminRoutes() {
  return (
    <Routes>
      <Route index element={<AdminDashboard />} />
      <Route path="security" element={<AdminSecurity />} />
      <Route path="transactions" element={<AdminTransactions />} />
      <Route path="analytics" element={<AdminAnalytics />} />
      <Route path="metrics" element={<AdminMetrics />} />
      <Route path="fraud" element={<AdminFraud />} />
    </Routes>
  );
}
