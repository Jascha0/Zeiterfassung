import { useEffect, useId, useState } from 'react';
import { useServices } from '../app/ServicesContext';
import { useToast } from '../app/ToastContext';
import { ProjectLabel } from '../components/ProjectLabel';
import { mapWriteError } from '../data/writeErrors';
import { defaultProjectColor, PROJECT_COLOR_LABELS, PROJECT_COLORS, type ProjectColor } from '../domain/palette';
import { sortProjectsByName, validateProjectName } from '../domain/projects';
import type { Project, ProjectChanges } from '../domain/types';
import { LOAD_ERROR_MESSAGE } from '../hooks/useEntriesInRange';
import { useProjects } from '../hooks/useProjects';
import { NO_PROJECTS_MESSAGE, projectNameErrorMessage } from './projectMessages';

type Panel = { kind: 'none' } | { kind: 'rename'; id: string } | { kind: 'recolor'; id: string };

const NO_PANEL: Panel = { kind: 'none' };

function ColorRadios(props: {
  name: string;
  value: ProjectColor;
  describedBy?: string;
  onChange: (color: ProjectColor) => void;
}): React.JSX.Element {
  const { name, value, describedBy, onChange } = props;
  return (
    <>
      {PROJECT_COLORS.map((key) => (
        <label key={key} className="radio">
          <input
            type="radio"
            name={name}
            value={key}
            checked={value === key}
            aria-describedby={describedBy}
            onChange={() => onChange(key)}
          />
          <span className={`project-dot project-color-${key}`} aria-hidden="true" />
          {PROJECT_COLOR_LABELS[key]}
        </label>
      ))}
    </>
  );
}

function FormErrors(props: { id: string; messages: readonly string[] }): React.JSX.Element | null {
  if (props.messages.length === 0) return null;
  return (
    <div role="alert" id={props.id} className="form-errors">
      {props.messages.map((message, index) => (
        <p key={index}>{message}</p>
      ))}
    </div>
  );
}

function CreateProjectForm(props: {
  projects: readonly Project[];
  onCreate: (name: string, color: ProjectColor) => void;
}): React.JSX.Element {
  const { projects, onCreate } = props;
  const id = useId();
  const [name, setName] = useState('');
  const [chosenColor, setChosenColor] = useState<ProjectColor | null>(null);
  const [messages, setMessages] = useState<string[]>([]);
  const color = chosenColor ?? defaultProjectColor(projects);
  const errorsId = `${id}-errors`;
  const describedBy = messages.length > 0 ? errorsId : undefined;

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const result = validateProjectName(name, projects);
    if (!result.ok) {
      setMessages([projectNameErrorMessage(result.reason)]);
      return;
    }
    onCreate(result.name, color);
    setName('');
    setChosenColor(null);
    setMessages([]);
  };

  return (
    <form className="entry-form" aria-label="Neues Projekt" noValidate onSubmit={handleSubmit}>
      <div className="field">
        <label htmlFor={`${id}-name`}>Name</label>
        <input
          id={`${id}-name`}
          type="text"
          value={name}
          aria-describedby={describedBy}
          onChange={(event) => setName(event.target.value)}
        />
      </div>
      <fieldset className="theme-options">
        <legend>Farbe</legend>
        <ColorRadios name={`${id}-create-color`} value={color} describedBy={describedBy} onChange={setChosenColor} />
      </fieldset>
      <FormErrors id={errorsId} messages={messages} />
      <div className="button-row">
        <button type="submit" className="button-primary">
          Anlegen
        </button>
      </div>
    </form>
  );
}

function RenameForm(props: {
  project: Project;
  projects: readonly Project[];
  onSave: (name: string) => void;
  onCancel: () => void;
}): React.JSX.Element {
  const { project, projects, onSave, onCancel } = props;
  const id = useId();
  const [value, setValue] = useState(project.name);
  const [messages, setMessages] = useState<string[]>([]);
  const errorsId = `${id}-errors`;

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const result = validateProjectName(value, projects, project.id);
    if (!result.ok) {
      setMessages([projectNameErrorMessage(result.reason)]);
      return;
    }
    if (result.name === project.name) onCancel();
    else onSave(result.name);
  };

  return (
    <form className="entry-form" aria-label="Projekt umbenennen" noValidate onSubmit={handleSubmit}>
      <div className="field">
        <label htmlFor={`${id}-name`}>Neuer Name</label>
        <input
          id={`${id}-name`}
          type="text"
          value={value}
          aria-describedby={messages.length > 0 ? errorsId : undefined}
          onChange={(event) => setValue(event.target.value)}
        />
      </div>
      <FormErrors id={errorsId} messages={messages} />
      <div className="button-row">
        <button type="submit" className="button-primary">
          Speichern
        </button>
        <button type="button" onClick={onCancel}>
          Abbrechen
        </button>
      </div>
    </form>
  );
}

function RecolorForm(props: {
  project: Project;
  onSave: (color: ProjectColor) => void;
  onCancel: () => void;
}): React.JSX.Element {
  const { project, onSave, onCancel } = props;
  const id = useId();
  const [color, setColor] = useState<ProjectColor>(project.color);

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (color === project.color) onCancel();
    else onSave(color);
  };

  return (
    <form className="entry-form" aria-label="Farbe wählen" noValidate onSubmit={handleSubmit}>
      <fieldset className="theme-options">
        <legend>Neue Farbe</legend>
        <ColorRadios name={`${id}-recolor-color`} value={color} onChange={setColor} />
      </fieldset>
      <div className="button-row">
        <button type="submit" className="button-primary">
          Speichern
        </button>
        <button type="button" onClick={onCancel}>
          Abbrechen
        </button>
      </div>
    </form>
  );
}

export function ProjectsView(props: { uid: string }): React.JSX.Element {
  const { uid } = props;
  const { projects: repository } = useServices();
  const { showToast } = useToast();
  const data = useProjects(uid);
  const [panel, setPanel] = useState<Panel>(NO_PANEL);

  const loading = data.loading;
  const panelTargetMissing =
    !loading && panel.kind !== 'none' && !data.projects.some((project) => project.id === panel.id);

  useEffect(() => {
    if (panelTargetMissing) setPanel(NO_PANEL);
  }, [panelTargetMissing]);

  if (repository === undefined) {
    return (
      <main className="page">
        <section className="card">
          <h2>Projekte</h2>
          <p role="alert">{LOAD_ERROR_MESSAGE}</p>
        </section>
      </main>
    );
  }

  const close = () => setPanel(NO_PANEL);
  const toastOnFailure = (error: unknown) => showToast(mapWriteError(error));

  const update = (id: string, changes: ProjectChanges) => {
    repository.updateProject(uid, id, changes).catch(toastOnFailure);
  };

  const create = (name: string, color: ProjectColor) => {
    const now = Date.now();
    repository.createProject(uid, { name, color, archived: false, createdAt: now, updatedAt: now }).catch(toastOnFailure);
  };

  const sorted = sortProjectsByName(data.projects);
  const active = sorted.filter((project) => !project.archived);
  const archived = sorted.filter((project) => project.archived);

  const row = (project: Project) => (
    <li key={project.id}>
      <ProjectLabel project={project} />
      <span className="button-row entry-actions">
        <button type="button" className="button-link" onClick={() => setPanel({ kind: 'rename', id: project.id })}>
          Umbenennen
        </button>
        <button type="button" className="button-link" onClick={() => setPanel({ kind: 'recolor', id: project.id })}>
          Farbe ändern
        </button>
        <button
          type="button"
          className="button-link"
          onClick={() => update(project.id, { archived: !project.archived, updatedAt: Date.now() })}
        >
          {project.archived ? 'Wiederherstellen' : 'Archivieren'}
        </button>
      </span>
      {panel.kind === 'rename' && panel.id === project.id && (
        <RenameForm
          project={project}
          projects={data.projects}
          onCancel={close}
          onSave={(name) => {
            update(project.id, { name, updatedAt: Date.now() });
            close();
          }}
        />
      )}
      {panel.kind === 'recolor' && panel.id === project.id && (
        <RecolorForm
          project={project}
          onCancel={close}
          onSave={(color) => {
            update(project.id, { color, updatedAt: Date.now() });
            close();
          }}
        />
      )}
    </li>
  );

  return (
    <main className="page">
      <section className="card">
        <h2>Projekte</h2>
        {data.error !== null && <p role="alert">{data.error}</p>}
        {loading ? (
          data.error === null && <p>Lädt…</p>
        ) : (
          <>
            <CreateProjectForm projects={data.projects} onCreate={create} />
            {sorted.length === 0 && <p>{NO_PROJECTS_MESSAGE}</p>}
            {active.length > 0 && (
              <ul className="entry-list" aria-label="Aktive Projekte">
                {active.map(row)}
              </ul>
            )}
            {archived.length > 0 && (
              <>
                <h3>Archiviert</h3>
                <ul className="entry-list" aria-label="Archivierte Projekte">
                  {archived.map(row)}
                </ul>
              </>
            )}
          </>
        )}
      </section>
    </main>
  );
}
