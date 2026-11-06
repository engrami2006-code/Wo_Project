import { lazy, Suspense } from 'react';
import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { FullPageLoader, GuestRoute, ProtectedRoute } from './components/layout/ProtectedRoute';
import { SkeletonCards } from './components/ui';
import { ToastProvider } from './components/ui/Toast';
import { AuthProvider } from './hooks/useAuth';
import { FarmContextProvider } from './hooks/useFarmContext';
import { I18nProvider } from './i18n';
import { AppLayout } from './layouts/AppLayout';
import { ApiError } from './services/api';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import NotFoundPage from './pages/NotFoundPage';

const DashboardPage = lazy(() => import('./pages/DashboardPage'));
const FarmsPage = lazy(() => import('./pages/FarmsPage'));
const FarmDetailsPage = lazy(() => import('./pages/FarmDetailsPage'));
const CropsPage = lazy(() => import('./pages/CropsPage'));
const WaterPage = lazy(() => import('./pages/WaterPage'));
const CalculationsPage = lazy(() => import('./pages/CalculationsPage'));
const IrrigationPage = lazy(() => import('./pages/IrrigationPage'));
const HydroponicsPage = lazy(() => import('./pages/HydroponicsPage'));
const HydroSystemPage = lazy(() => import('./pages/HydroSystemPage'));
const WeatherPage = lazy(() => import('./pages/WeatherPage'));
const AnalyticsPage = lazy(() => import('./pages/AnalyticsPage'));
const AlertsPage = lazy(() => import('./pages/AlertsPage'));
const ChatbotPage = lazy(() => import('./pages/ChatbotPage'));
const LandPage = lazy(() => import('./pages/LandPage'));
const KnowledgeBasePage = lazy(() => import('./pages/KnowledgeBasePage'));
const RecommendationsPage = lazy(() => import('./pages/RecommendationsPage'));
const RecommendationDetailPage = lazy(() => import('./pages/RecommendationDetailPage'));
const ProfilePage = lazy(() => import('./pages/ProfilePage'));
const AdminPage = lazy(() => import('./pages/AdminPage'));

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        refetchOnWindowFocus: false,
        staleTime: 15_000,
        retry: (count, err) => {
          if (err instanceof ApiError && err.status >= 400 && err.status < 500) return false;
          return count < 1;
        },
      },
      mutations: { retry: false },
    },
  });
}

function PageSuspense({ children }: { children: ReactNode }) {
  return <Suspense fallback={<SkeletonCards count={6} />}>{children}</Suspense>;
}

export function AppRoutes() {
  return (
    <Routes>
      <Route
        path="/login"
        element={
          <GuestRoute>
            <LoginPage />
          </GuestRoute>
        }
      />
      <Route
        path="/register"
        element={
          <GuestRoute>
            <RegisterPage />
          </GuestRoute>
        }
      />
      <Route
        element={
          <ProtectedRoute>
            <FarmContextProvider>
              <AppLayout />
            </FarmContextProvider>
          </ProtectedRoute>
        }
      >
        <Route index element={<PageSuspense><DashboardPage /></PageSuspense>} />
        <Route path="farms" element={<PageSuspense><FarmsPage /></PageSuspense>} />
        <Route path="farms/:farmId" element={<PageSuspense><FarmDetailsPage /></PageSuspense>} />
        <Route path="crops" element={<PageSuspense><CropsPage /></PageSuspense>} />
        <Route path="water" element={<PageSuspense><WaterPage /></PageSuspense>} />
        <Route path="water/calculations" element={<PageSuspense><CalculationsPage /></PageSuspense>} />
        <Route path="irrigation" element={<PageSuspense><IrrigationPage /></PageSuspense>} />
        <Route path="hydroponics" element={<PageSuspense><HydroponicsPage /></PageSuspense>} />
        <Route path="hydroponics/:systemId" element={<PageSuspense><HydroSystemPage /></PageSuspense>} />
        <Route path="weather" element={<PageSuspense><WeatherPage /></PageSuspense>} />
        <Route path="analytics" element={<PageSuspense><AnalyticsPage /></PageSuspense>} />
        <Route path="alerts" element={<PageSuspense><AlertsPage /></PageSuspense>} />
        <Route path="assistant" element={<PageSuspense><ChatbotPage /></PageSuspense>} />
        <Route path="land" element={<PageSuspense><LandPage /></PageSuspense>} />
        <Route path="knowledge-base" element={<PageSuspense><KnowledgeBasePage /></PageSuspense>} />
        <Route path="recommendations" element={<PageSuspense><RecommendationsPage /></PageSuspense>} />
        <Route path="recommendations/:recId" element={<PageSuspense><RecommendationDetailPage /></PageSuspense>} />
        <Route path="profile" element={<PageSuspense><ProfilePage /></PageSuspense>} />
        <Route
          path="admin"
          element={
            <ProtectedRoute roles={['COMPANY_OWNER', 'SUPER_ADMIN']}>
              <PageSuspense>
                <AdminPage />
              </PageSuspense>
            </ProtectedRoute>
          }
        />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
      <Route path="*" element={<NotFoundPage standalone />} />
    </Routes>
  );
}

export function AppProviders({ children, queryClient }: { children: ReactNode; queryClient: QueryClient }) {
  return (
    <QueryClientProvider client={queryClient}>
      <I18nProvider>
        <ToastProvider>
          <AuthProvider>{children}</AuthProvider>
        </ToastProvider>
      </I18nProvider>
    </QueryClientProvider>
  );
}

const queryClient = createQueryClient();

export default function App() {
  return (
    <AppProviders queryClient={queryClient}>
      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Suspense fallback={<FullPageLoader />}>
          <AppRoutes />
        </Suspense>
      </BrowserRouter>
    </AppProviders>
  );
}
