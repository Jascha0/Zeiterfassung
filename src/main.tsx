import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { createFirebaseServices } from './firebase/app';
import { readFirebaseConfig } from './firebase/config';
import { ConfigMissing } from './views/ConfigMissing';
import './styles.css';

const root = createRoot(document.getElementById('root') as HTMLElement);
const config = readFirebaseConfig(import.meta.env);

if (config === null) {
  root.render(
    <StrictMode>
      <ConfigMissing />
    </StrictMode>,
  );
} else {
  root.render(
    <StrictMode>
      <App services={createFirebaseServices(config)} />
    </StrictMode>,
  );
}
