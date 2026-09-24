import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import type { Services } from './app/ServicesContext';
import { IndexedDbAdapter } from './data/indexedDbAdapter';
import { createLocalStore } from './data/localStore';
import { createFirebaseAuthService } from './firebase/app';
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
  const store = createLocalStore({ adapter: new IndexedDbAdapter() });
  const services: Services = { auth: createFirebaseAuthService(config), entries: store, settings: store };
  root.render(
    <StrictMode>
      <App services={services} />
    </StrictMode>,
  );
}
