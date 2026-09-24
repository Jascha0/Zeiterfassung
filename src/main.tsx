import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import type { Services } from './app/ServicesContext';
import { IndexedDbAdapter } from './data/indexedDbAdapter';
import { createLocalStore } from './data/localStore';
import './styles.css';

const store = createLocalStore({ adapter: new IndexedDbAdapter() });
const services: Services = { entries: store, settings: store };

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <App services={services} />
  </StrictMode>,
);
