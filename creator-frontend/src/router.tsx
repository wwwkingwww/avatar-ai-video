import { createBrowserRouter } from 'react-router-dom'
import { LandingPage } from './pages/LandingPage'
import { CreatorPage } from './pages/CreatorPage'
import { Dashboard } from './pages/Dashboard'

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
])
