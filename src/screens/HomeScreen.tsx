import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { FEATURES, HOME_COPY, ROUTES } from '../config';
import { isVerbose, setSession, setVerbose } from '../store/storage';
import { ThorHammer } from '../components/ThorHammer';

/** The control room. Five nav buttons in fixed positions around the
 *  Thor scene. With the hammer flag off, the centre column collapses and
 *  the buttons stack — the layout must not look broken either way. */
export default function HomeScreen() {
  const navigate = useNavigate();
  const thor = FEATURES.THOR_HAMMER_ENABLED;
  const [verbose, setVerboseState] = useState(isVerbose());

  function changeKey() {
    setSession(false);
    navigate(ROUTES.START);
  }

  function toggleVerbose() {
    const next = !verbose;
    setVerbose(next);
    setVerboseState(next);
  }

  return (
    <div className="home">
      <div className="home-head">
        <h1>{HOME_COPY.TITLE}</h1>
        <p>{HOME_COPY.SUBTITLE}</p>
      </div>

      <div className={`home-grid${thor ? '' : ' no-thor'}`}>
        <Link className="nav-btn cell-newreport" to={ROUTES.REPORT_NEW}>
          {HOME_COPY.NAV_NEW}
        </Link>
        <Link className="nav-btn cell-bulk" to={ROUTES.BULK}>
          {HOME_COPY.NAV_BULK}
        </Link>
        <Link className="nav-btn cell-queue" to={ROUTES.QUEUE}>
          {HOME_COPY.NAV_QUEUE}
        </Link>
        <Link className="nav-btn cell-guide" to={ROUTES.GUIDE}>
          {HOME_COPY.NAV_GUIDE}
        </Link>
        {FEATURES.ACTIVITY_LOG_ENABLED && (
          <Link className="nav-btn cell-activity" to={ROUTES.ACTIVITY}>
            {HOME_COPY.NAV_ACTIVITY}
          </Link>
        )}
        <Link className="nav-btn cell-data" to={ROUTES.DATA}>
          {HOME_COPY.NAV_DATA}
        </Link>

        {thor && (
          <div className="cell-thor">
            <ThorHammer />
          </div>
        )}
      </div>

      <div className="home-foot">
        <button type="button" className="btn-link" onClick={changeKey}>
          {HOME_COPY.FOOTER_CHANGE_KEY}
        </button>
        <button
          type="button"
          className="btn-link"
          onClick={toggleVerbose}
          aria-pressed={verbose}
          title={HOME_COPY.FOOTER_VERBOSE_TITLE}
        >
          {HOME_COPY.FOOTER_VERBOSE_LABEL}:{' '}
          <strong>{verbose ? HOME_COPY.FOOTER_VERBOSE_ON : HOME_COPY.FOOTER_VERBOSE_OFF}</strong>
        </button>
        <a href={ROUTES.FEEDBACK} target="_blank" rel="noreferrer">
          {HOME_COPY.FOOTER_FEEDBACK}
        </a>
      </div>
    </div>
  );
}
