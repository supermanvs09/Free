import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './app/App';
import { initSync } from './lib/local/state';
import './styles/index.css';

/* Join the shared workspace first (a couple of seconds at most), so the
   first screen already shows what everyone else sees. */
initSync().finally(() => {
  createRoot(document.getElementById('root')).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
});
