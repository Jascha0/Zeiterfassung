import { createContext, useContext } from 'react';
import type { BackupRepository, EntryRepository, SettingsRepository } from '../data/repository';
import type { FileWriter } from './fileWriter';

export interface Services {
  entries: EntryRepository;
  settings: SettingsRepository;
  /** Export and replace-all import (0053). */
  backup: BackupRepository;
  /** Everything from outside the app a view may need — here: writing a file (0058). */
  files: FileWriter;
}

const ServicesContext = createContext<Services | null>(null);

export function ServicesProvider(props: { services: Services; children: React.ReactNode }): React.JSX.Element {
  return <ServicesContext.Provider value={props.services}>{props.children}</ServicesContext.Provider>;
}

export function useServices(): Services {
  const services = useContext(ServicesContext);
  if (services === null) throw new Error('useServices must be used within ServicesProvider');
  return services;
}
