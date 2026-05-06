import { createBrowserRouter } from 'react-router-dom'
import { LandingPage } from './pages/LandingPage'
import { CreatorPage } from './pages/CreatorPage'
import { Dashboard } from './pages/Dashboard'
import { AdminLogin } from './pages/AdminLogin'
import { AdminDashboard } from './pages/admin/AdminDashboard'

export const router = createBrowserRouter([
  {
    path: '/',
    element: <LandingPage />,
  },
  {
    path: '/creator',
    element: <CreatorPage />,
  },
  {
    path: '/dashboard/:view?',
    element: <Dashboard />,
  },
  {
    path: '/admin/login',
    element: <AdminLogin />,
  },
  {
    path: '/admin/dashboard/:view?',
    element: <AdminDashboard />,
  },
])
