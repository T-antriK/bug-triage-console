import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { runMigrations } from './store/storage';
import { seedIfEmpty } from './store/seed';
import './styles/tokens.css';
import './styles/base.css';
import './styles/screens.css';

// One-time boot: bring storage to the current schema version, then
// load the 15 seed reports if the store is empty and the flag is on.
runMigrations();
seedIfEmpty();

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
);
