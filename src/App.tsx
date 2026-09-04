import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { FEATURES, ROUTES } from './config';
import { hasSession } from './store/storage';
import { Layout } from './components/Layout';
import StartScreen from './screens/StartScreen';
import HomeScreen from './screens/HomeScreen';
import ReportForm from './screens/ReportForm';
import TriageQueue from './screens/TriageQueue';
import ActivityLog from './screens/ActivityLog';
import UserGuide from './screens/UserGuide';
import Feedback from './screens/Feedback';
import DataFiles from './screens/DataFiles';
import DataTable from './screens/DataTable';
import BulkUpload from './screens/BulkUpload';

/**
 * Router + layout shell. The start screen is bare; every other route
 * renders inside <Layout> and is gated on the session flag so a
 * refresh deep-links straight back through the arcade boot.
 */
function Gate({ children }: { children: JSX.Element }) {
  const loc = useLocation();
  if (!hasSession()) {
    return <Navigate to={ROUTES.START} replace state={{ from: loc.pathname }} />;
  }
  return children;
}

export default function App() {
  return (
    <Routes>
      <Route path={ROUTES.START} element={<StartScreen />} />

      <Route
        element={
          <Gate>
            <Layout />
          </Gate>
        }
      >
        <Route path={ROUTES.HOME} element={<HomeScreen />} />
        <Route path={ROUTES.REPORT_NEW} element={<ReportForm />} />
        <Route path={`${ROUTES.REPORT}/:id`} element={<ReportForm />} />
        <Route path={ROUTES.BULK} element={<BulkUpload />} />
        <Route path={ROUTES.QUEUE} element={<TriageQueue />} />
        {FEATURES.ACTIVITY_LOG_ENABLED && (
          <Route path={ROUTES.ACTIVITY} element={<ActivityLog />} />
        )}
        <Route path={ROUTES.GUIDE} element={<UserGuide />} />
        <Route path={ROUTES.FEEDBACK} element={<Feedback />} />
        <Route path={ROUTES.DATA} element={<DataFiles />} />
        <Route path={`${ROUTES.DATA_TABLE}/:name`} element={<DataTable />} />
      </Route>

      <Route path="*" element={<Navigate to={ROUTES.HOME} replace />} />
    </Routes>
  );
}
