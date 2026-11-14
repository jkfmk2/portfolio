import { Navigate, Route, Routes } from "react-router-dom";
import Layout from "./components/Layout";
import Dashboard from "./pages/Dashboard";
import Transactions from "./pages/Transactions";
import Accounts from "./pages/Accounts";
import Instruments from "./pages/Instruments";
import SettingsPage from "./pages/Settings";

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/transactions" element={<Transactions />} />
        <Route path="/instruments" element={<Instruments />} />
        <Route path="/accounts" element={<Accounts />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
