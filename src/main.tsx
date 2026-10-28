import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { initDatabase } from './lib/db';
import './index.css';

// Åpne databasen FØR appen rendres, slik at en versjonskonflikt
// (blokkert Dexie-oppgradering) ikke henger hele UI-et.
initDatabase().catch((e) => {
  console.error('[belast] Kunne ikke åpne lokal database:', e);
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
