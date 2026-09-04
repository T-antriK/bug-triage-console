import { Link, NavLink, Outlet } from 'react-router-dom';
import { FEATURES, HOME_COPY, ROUTES } from '../config';
import { ToastHost } from './Toast';

/** The control-room shell: a hairline top bar with breadcrumbs + nav,
 *  then the routed screen. Left-aligned, no cards. */
export function Layout() {
  return (
    <div className="app-shell">
      <header className="app-topbar">
        <div className="crumbs">
          <Link to={ROUTES.HOME} style={{ textDecoration: 'none' }}>
            <strong>{HOME_COPY.TITLE}</strong>
          </Link>
        </div>
        <nav aria-label="Primary">
          <NavLink to={ROUTES.QUEUE}>{HOME_COPY.NAV_QUEUE}</NavLink>
          <NavLink to={ROUTES.REPORT_NEW}>{HOME_COPY.NAV_NEW}</NavLink>
          {FEATURES.ACTIVITY_LOG_ENABLED && (
            <NavLink to={ROUTES.ACTIVITY}>{HOME_COPY.NAV_ACTIVITY}</NavLink>
          )}
          <NavLink to={ROUTES.DATA}>{HOME_COPY.NAV_DATA}</NavLink>
          <NavLink to={ROUTES.GUIDE}>{HOME_COPY.NAV_GUIDE}</NavLink>
        </nav>
      </header>
      <main className="app-main">
        <Outlet />
      </main>
      <ToastHost />
    </div>
  );
}
