import { useState } from 'react';
import { FEEDBACK_COPY, FEEDBACK_EMAIL, FEEDBACK_PLACEHOLDER } from '../config';
import { addFeedback } from '../store/feedback';
import { toast } from '../lib/toast';

/** Opens in its own tab. Saves to the feedback store and logs it; also
 *  offers a mailto: with the body prefilled. */
export default function Feedback() {
  const [body, setBody] = useState('');
  const [error, setError] = useState('');

  function submit() {
    if (body.trim().length === 0) {
      setError(FEEDBACK_COPY.EMPTY);
      return;
    }
    addFeedback(FEEDBACK_EMAIL, body.trim());
    setBody('');
    setError('');
    toast(FEEDBACK_COPY.SUBMIT);
  }

  const mailto = `mailto:${FEEDBACK_EMAIL}?subject=${encodeURIComponent(
    FEEDBACK_COPY.MAILTO_SUBJECT,
  )}&body=${encodeURIComponent(body)}`;

  return (
    <div className="page">
      <h1>{FEEDBACK_COPY.TITLE}</h1>

      <div className="field">
        <label>{FEEDBACK_COPY.TO_LABEL}</label>
        <a href={`mailto:${FEEDBACK_EMAIL}`}>{FEEDBACK_EMAIL}</a>
      </div>

      <div className="field">
        <label htmlFor="fb-body">{FEEDBACK_COPY.BODY_LABEL}</label>
        <textarea
          id="fb-body"
          value={body}
          placeholder={FEEDBACK_PLACEHOLDER}
          onChange={(e) => setBody(e.target.value)}
          style={{ fontStyle: body ? 'normal' : 'italic' }}
        />
        {error && <span className="error">{error}</span>}
      </div>

      <div className="row">
        <button type="button" className="btn btn-primary" onClick={submit}>
          {FEEDBACK_COPY.SUBMIT}
        </button>
        <a className="btn" href={mailto}>
          {FEEDBACK_COPY.OPEN_EMAIL}
        </a>
      </div>
    </div>
  );
}
