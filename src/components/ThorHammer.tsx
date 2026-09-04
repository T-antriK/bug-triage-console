import { useCallback, useMemo, useState } from 'react';
import { THOR } from '../config';
import { Modal } from './Modal';

/**
 * The one playful surface past the start screen. Entirely self-contained
 * and gated by FEATURES.THOR_HAMMER_ENABLED at the call site — deleting
 * this file touches nothing else. No state is persisted or logged.
 */

function randomTarget(): number {
  const span = THOR.MAX_ATTEMPTS - THOR.MIN_ATTEMPTS + 1;
  return THOR.MIN_ATTEMPTS + Math.floor(Math.random() * span);
}

export function ThorHammer() {
  const [target, setTarget] = useState(randomTarget);
  const [clicks, setClicks] = useState(0);
  const [showFailure, setShowFailure] = useState(false);

  const lifted = clicks >= target;

  const onHammerClick = useCallback(() => {
    if (showFailure || lifted) return;
    const next = clicks + 1;
    setClicks(next);
    if (next < target) setShowFailure(true);
  }, [showFailure, lifted, clicks, target]);

  const onDrop = useCallback(() => {
    setClicks(0);
    setTarget(randomTarget());
  }, []);

  const hammerTransform = lifted
    ? `translateY(-${THOR.LIFT_OFFSET_PX}px) rotate(-4deg)`
    : 'translateY(0) rotate(0)';

  const liftStyle = useMemo(
    () => ({ ['--lift-ms' as string]: `${THOR.LIFT_DURATION_MS}ms` }),
    [],
  );

  return (
    <div className="thor" style={liftStyle}>
      <svg viewBox="0 0 320 260" role="img" aria-label="A hammer embedded in a grassy field">
        <defs>
          <linearGradient id="thor-sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--sky-top)" />
            <stop offset="100%" stopColor="var(--sky-bot)" />
          </linearGradient>
        </defs>

        <rect x="0" y="0" width="320" height="260" fill="url(#thor-sky)" />
        <rect x="0" y="180" width="320" height="80" fill="var(--grass)" />
        <ellipse cx="160" cy="182" rx="46" ry="9" fill={THOR.PALETTE.SHADOW} />

        {/* clickable hammer */}
        <g
          className="thor-hammer"
          style={{
            transform: hammerTransform,
            transformOrigin: '160px 170px',
            cursor: lifted ? 'default' : 'pointer',
          }}
          onClick={onHammerClick}
        >
          <title>{THOR.TOOLTIP}</title>
          {/* handle — sticks straight up out of the grass */}
          <rect x="152" y="52" width="16" height="132" rx="4" fill={THOR.PALETTE.HANDLE} />
          <rect x="150" y="46" width="20" height="10" rx="3" fill={THOR.PALETTE.HEAD_TOP} />
          {/* head — driven face-down into the ground, buried to its midline */}
          <rect
            x="120"
            y="168"
            width="80"
            height="40"
            rx="6"
            fill={THOR.PALETTE.HEAD}
            stroke={THOR.PALETTE.HEAD_EDGE}
            strokeWidth="2"
          />
          <rect x="150" y="164" width="20" height="10" rx="2" fill={THOR.PALETTE.HEAD_EDGE} />
        </g>
      </svg>

      <div className="thor-controls">
        {lifted ? (
          <button type="button" className="btn btn-primary" onClick={onDrop}>
            {THOR.DROP_BUTTON_LABEL}
          </button>
        ) : (
          <span className="small muted">{THOR.TOOLTIP}</span>
        )}
      </div>

      {showFailure && (
        <Modal
          title={THOR.FAILURE_MESSAGE}
          onClose={() => setShowFailure(false)}
          actions={
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => setShowFailure(false)}
            >
              {THOR.FAILURE_BUTTON}
            </button>
          }
        />
      )}
    </div>
  );
}
