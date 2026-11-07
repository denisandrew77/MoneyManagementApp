import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider, useAuth } from './components/AuthProvider';
import { Dashboard } from './pages/Dashboard';
import { Login } from './pages/Login';
import { BudgetSetup } from './pages/BudgetSetup';
import './styles.css';
const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 1, staleTime: 30_000, gcTime: 300_000 } } });
function App() {
  const { session, loading } = useAuth();
  if (loading) return <main className="loading-screen" role="status">Opening your pocket…</main>;
  return <Routes><Route path="/login" element={session ? <Navigate to="/" replace/> : <Login/>}/><Route path="/auth/callback" element={session ? <Navigate to="/" replace/> : <Login/>}/><Route path="/" element={session ? <Dashboard/> : <Navigate to="/login" replace/>}/><Route path="/budget" element={session ? <BudgetSetup/> : <Navigate to="/login" replace/>}/><Route path="*" element={<Navigate to="/" replace/>}/></Routes>;
}
createRoot(document.getElementById('root')!).render(<StrictMode><QueryClientProvider client={queryClient}><BrowserRouter><AuthProvider><App/></AuthProvider></BrowserRouter></QueryClientProvider></StrictMode>);
