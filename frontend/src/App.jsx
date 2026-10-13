import { Route, Routes } from 'react-router-dom'
import AppShell from './components/AppShell.jsx'
import AccountsPage from './pages/AccountsPage.jsx'
import BillsPage from './pages/BillsPage.jsx'
import DashboardPage from './pages/DashboardPage.jsx'
import HomePage from './pages/HomePage.jsx'
import InvestmentsPage from './pages/InvestmentsPage.jsx'
import LoginPage from './pages/LoginPage.jsx'
import RegisterPage from './pages/RegisterPage.jsx'
import TransactionsPage from './pages/TransactionsPage.jsx'

export default function App() {
  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/accounts" element={<AccountsPage />} />
        <Route path="/investments" element={<InvestmentsPage />} />
        <Route path="/bills" element={<BillsPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/transactions" element={<TransactionsPage />} />
      </Routes>
    </AppShell>
  )
}
