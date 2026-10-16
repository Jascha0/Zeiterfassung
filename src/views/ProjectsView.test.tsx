import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ServicesProvider, type Services } from '../app/ServicesContext';
import { ToastProvider } from '../app/ToastContext';
import type { Unsubscribe } from '../auth/authTypes';
import { InMemoryRepository } from '../data/inMemoryRepository';
import type { ProjectColor } from '../domain/palette';
import type { Project } from '../domain/types';
import { FakeAuthService } from '../test/fakeAuthService';
import { ProjectsView } from './ProjectsView';

const UID = 'u1';

function project(id: string, name: string, color: ProjectColor = 'blue', archived = false): Project {
  return { id, name, color, archived, createdAt: 0, updatedAt: 0 };
}

class FailingProjectsRepository extends InMemoryRepository {
  override subscribeProjects(
    _uid: string,
    _onChange: (projects: Project[]) => void,
    onError: (error: Error) => void,
  ): Unsubscribe {
    queueMicrotask(() => onError(new Error('permission-denied')));
    return () => {};
  }
}

function renderProjects(repo: InMemoryRepository, withProjects = true) {
  const services: Services = withProjects
    ? { auth: new FakeAuthService(), entries: repo, settings: repo, projects: repo }
    : { auth: new FakeAuthService(), entries: repo, settings: repo };
  return render(
    <ServicesProvider services={services}>
      <ToastProvider>
        <ProjectsView uid={UID} />
      </ToastProvider>
    </ServicesProvider>,
  );
}

describe('ProjectsView', () => {
  it('creates "Kunde A" with the default color and lists it', async () => {
    const user = userEvent.setup();
    const repo = new InMemoryRepository();
    renderProjects(repo);

    await user.type(await screen.findByLabelText('Name'), 'Kunde A');
    await user.click(screen.getByRole('button', { name: 'Anlegen' }));

    const stored = repo.getProjects(UID);
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({ name: 'Kunde A', color: 'blue', archived: false });
    const list = await screen.findByRole('list', { name: 'Aktive Projekte' });
    await waitFor(() => expect(within(list).getByText('Kunde A')).toBeInTheDocument());
  });
});

function createForm(): HTMLElement {
  return screen.getByRole('form', { name: 'Neues Projekt' });
}

function rowFor(name: string): HTMLElement {
  const item = screen.getByText(name).closest('li');
  if (!item) throw new Error('list item missing');
  return item;
}

function denied(): Error {
  return Object.assign(new Error('denied'), { code: 'permission-denied' });
}

async function createNamed(user: ReturnType<typeof userEvent.setup>, name: string) {
  const input = within(await screen.findByRole('form', { name: 'Neues Projekt' })).getByLabelText('Name');
  await user.clear(input);
  if (name !== '') await user.type(input, name);
  await user.click(screen.getByRole('button', { name: 'Anlegen' }));
}

async function renameTo(user: ReturnType<typeof userEvent.setup>, current: string, next: string) {
  await user.click(within(await waitFor(() => rowFor(current))).getByRole('button', { name: 'Umbenennen' }));
  const form = screen.getByRole('form', { name: 'Projekt umbenennen' });
  const input = within(form).getByLabelText('Neuer Name');
  await user.clear(input);
  if (next !== '') await user.type(input, next);
  await user.click(within(form).getByRole('button', { name: 'Speichern' }));
}

const ALL_COLORS: readonly ProjectColor[] = ['blue', 'green', 'orange', 'red', 'purple', 'teal', 'yellow', 'gray'];

describe('ProjectsView: create (edge cases 1–4, 7)', () => {
  it('stores the trimmed name with the chosen color and clears the form (edge case 1)', async () => {
    const user = userEvent.setup();
    const repo = new InMemoryRepository();
    renderProjects(repo);

    await screen.findByRole('form', { name: 'Neues Projekt' });
    await user.click(within(createForm()).getByRole('radio', { name: 'Türkis' }));
    await createNamed(user, '  Kunde A  ');

    expect(repo.getProjects(UID).map(({ name, color, archived }) => ({ name, color, archived }))).toEqual([
      { name: 'Kunde A', color: 'teal', archived: false },
    ]);
    expect(within(createForm()).getByLabelText('Name')).toHaveValue('');
    expect(within(createForm()).getByRole('radio', { name: 'Blau' })).toBeChecked();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it.each([
    ['', 'Bitte gib einen Projektnamen ein.'],
    ['   ', 'Bitte gib einen Projektnamen ein.'],
    ['x'.repeat(41), 'Der Projektname darf höchstens 40 Zeichen lang sein.'],
  ])('rejects %j with a message and writes nothing (edge cases 2, 3)', async (name, message) => {
    const user = userEvent.setup();
    const repo = new InMemoryRepository();
    const spy = vi.spyOn(repo, 'createProject');
    renderProjects(repo);

    await createNamed(user, name);

    const alert = within(createForm()).getByRole('alert');
    expect(alert).toHaveTextContent(message);
    expect(within(createForm()).getByLabelText('Name')).toHaveAttribute('aria-describedby', alert.id);
    expect(spy).not.toHaveBeenCalled();
    expect(repo.getProjects(UID)).toEqual([]);
  });

  it('accepts a 40-char name (edge case 3)', async () => {
    const user = userEvent.setup();
    const repo = new InMemoryRepository();
    renderProjects(repo);

    await createNamed(user, 'y'.repeat(40));

    expect(repo.getProjects(UID).map((p) => p.name)).toEqual(['y'.repeat(40)]);
  });

  it('rejects "kunde a" while an archived "Kunde A" exists (edge case 4)', async () => {
    const user = userEvent.setup();
    const repo = new InMemoryRepository();
    repo.seedProjects(UID, [project('p1', 'Kunde A', 'blue', true)]);
    const spy = vi.spyOn(repo, 'createProject');
    renderProjects(repo);

    await createNamed(user, 'kunde a');

    expect(within(createForm()).getByRole('alert')).toHaveTextContent('Es gibt bereits ein Projekt mit diesem Namen.');
    expect(spy).not.toHaveBeenCalled();
  });

  it.each<[string, Project[], string]>([
    ['no projects', [], 'Blau'],
    ['active Blau + Grün', [project('p1', 'A', 'blue'), project('p2', 'B', 'green')], 'Orange'],
    ['Blau only archived', [project('p1', 'A', 'blue', true)], 'Blau'],
    ['all 8 active', ALL_COLORS.map((color, i) => project(`p${i}`, `P${i}`, color)), 'Blau'],
  ])('default color with %s is %s (edge case 7)', async (_label, projects, expected) => {
    const repo = new InMemoryRepository();
    repo.seedProjects(UID, projects);
    renderProjects(repo);

    const form = await screen.findByRole('form', { name: 'Neues Projekt' });
    expect(within(form).getByRole('radio', { name: expected })).toBeChecked();
  });

  it('follows the default live until the user picks a color, then keeps the choice (edge case 7)', async () => {
    const user = userEvent.setup();
    const repo = new InMemoryRepository();
    renderProjects(repo);
    const form = await screen.findByRole('form', { name: 'Neues Projekt' });
    expect(within(form).getByRole('radio', { name: 'Blau' })).toBeChecked();

    act(() => repo.seedProjects(UID, [project('p1', 'A', 'blue')]));
    await waitFor(() => expect(within(form).getByRole('radio', { name: 'Grün' })).toBeChecked());

    await user.click(within(form).getByRole('radio', { name: 'Rot' }));
    act(() => repo.seedProjects(UID, [project('p1', 'A', 'blue'), project('p2', 'B', 'green')]));
    await waitFor(() => expect(screen.getByText('B')).toBeInTheDocument());
    expect(within(form).getByRole('radio', { name: 'Rot' })).toBeChecked();
  });

  it('shows the 8 colors in palette order with German labels and a color dot', async () => {
    renderProjects(new InMemoryRepository());
    const form = await screen.findByRole('form', { name: 'Neues Projekt' });
    const fieldset = within(form).getByRole('group', { name: 'Farbe' });
    expect(within(fieldset).getAllByRole('radio').map((radio) => radio.closest('label')?.textContent)).toEqual([
      'Blau',
      'Grün',
      'Orange',
      'Rot',
      'Lila',
      'Türkis',
      'Gelb',
      'Grau',
    ]);
    expect(fieldset.querySelector('.project-dot.project-color-teal')).toHaveAttribute('aria-hidden', 'true');
  });
});

describe('ProjectsView: lists', () => {
  it('shows "Noch keine Projekte." without projects and no lists', async () => {
    renderProjects(new InMemoryRepository());
    expect(await screen.findByText('Noch keine Projekte.')).toBeInTheDocument();
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });

  it('sorts active and archived lists by German collation; duplicates do not crash (edge case 40)', async () => {
    const repo = new InMemoryRepository();
    repo.seedProjects(UID, [
      project('p3', 'b'),
      project('p2', 'Ä'),
      project('p1', 'a'),
      project('p5', 'Dup', 'green'),
      project('p4', 'Dup', 'red'),
      project('p6', 'Zeta', 'red', true),
      project('p7', 'Alpha', 'gray', true),
    ]);
    renderProjects(repo);

    const activeList = await screen.findByRole('list', { name: 'Aktive Projekte' });
    const activeItems = within(activeList).getAllByRole('listitem');
    expect(activeItems.map((li) => li.querySelector('.project-name')?.textContent)).toEqual(['a', 'Ä', 'b', 'Dup', 'Dup']);
    expect(activeItems[3].querySelector('.project-color-red')).not.toBeNull();
    expect(screen.getByRole('heading', { name: 'Archiviert' })).toBeInTheDocument();
    const archivedList = screen.getByRole('list', { name: 'Archivierte Projekte' });
    expect(
      within(archivedList)
        .getAllByRole('listitem')
        .map((li) => li.querySelector('.project-name')?.textContent),
    ).toEqual(['Alpha (archiviert)', 'Zeta (archiviert)']);
    expect(screen.queryByText('Noch keine Projekte.')).not.toBeInTheDocument();
  });

  it('offers no delete action anywhere (edge case 29)', async () => {
    const user = userEvent.setup();
    const repo = new InMemoryRepository();
    repo.seedProjects(UID, [project('p1', 'Kunde A'), project('p2', 'Kunde B', 'green', true)]);
    renderProjects(repo);
    await waitFor(() => rowFor('Kunde A'));

    expect(screen.queryByText(/Löschen/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /lösch/i })).not.toBeInTheDocument();
    await user.click(within(rowFor('Kunde A')).getByRole('button', { name: 'Umbenennen' }));
    expect(screen.queryByText(/Löschen/)).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Abbrechen' }));
    await user.click(within(rowFor('Kunde A')).getByRole('button', { name: 'Farbe ändern' }));
    expect(screen.queryByText(/Löschen/)).not.toBeInTheDocument();
  });
});

describe('ProjectsView: rename (edge cases 2–6)', () => {
  it('renames to the trimmed new name and closes the panel', async () => {
    const user = userEvent.setup();
    const repo = new InMemoryRepository();
    repo.seedProjects(UID, [project('p1', 'Kunde A')]);
    const spy = vi.spyOn(repo, 'updateProject');
    renderProjects(repo);

    await user.click(within(await waitFor(() => rowFor('Kunde A'))).getByRole('button', { name: 'Umbenennen' }));
    expect(screen.getByLabelText('Neuer Name')).toHaveValue('Kunde A');
    await renameTo(user, 'Kunde A', '  Kunde Z ');

    expect(Object.keys(spy.mock.calls[0][2])).toEqual(['name', 'updatedAt']);
    expect(repo.getProjects(UID)[0]).toMatchObject({ name: 'Kunde Z', color: 'blue', archived: false });
    expect(screen.queryByRole('form', { name: 'Projekt umbenennen' })).not.toBeInTheDocument();
    expect(await screen.findByText('Kunde Z')).toBeInTheDocument();
  });

  it('accepts its own name in a different case (edge case 5)', async () => {
    const user = userEvent.setup();
    const repo = new InMemoryRepository();
    repo.seedProjects(UID, [project('p1', 'Kunde A')]);
    renderProjects(repo);

    await renameTo(user, 'Kunde A', 'KUNDE A');

    expect(repo.getProjects(UID)[0].name).toBe('KUNDE A');
  });

  it.each([
    ['', 'Bitte gib einen Projektnamen ein.'],
    ['   ', 'Bitte gib einen Projektnamen ein.'],
    ['z'.repeat(41), 'Der Projektname darf höchstens 40 Zeichen lang sein.'],
    ['kunde b', 'Es gibt bereits ein Projekt mit diesem Namen.'],
  ])('rejects %j inline and writes nothing', async (name, message) => {
    const user = userEvent.setup();
    const repo = new InMemoryRepository();
    repo.seedProjects(UID, [project('p1', 'Kunde A'), project('p2', 'Kunde B', 'green', true)]);
    const spy = vi.spyOn(repo, 'updateProject');
    renderProjects(repo);

    await renameTo(user, 'Kunde A', name);

    const form = screen.getByRole('form', { name: 'Projekt umbenennen' });
    const alert = within(form).getByRole('alert');
    expect(alert).toHaveTextContent(message);
    expect(within(form).getByLabelText('Neuer Name')).toHaveAttribute('aria-describedby', alert.id);
    expect(spy).not.toHaveBeenCalled();
  });

  it('closes without a write when the name is unchanged (edge case 6)', async () => {
    const user = userEvent.setup();
    const repo = new InMemoryRepository();
    repo.seedProjects(UID, [project('p1', 'Kunde A')]);
    const spy = vi.spyOn(repo, 'updateProject');
    renderProjects(repo);

    await renameTo(user, 'Kunde A', ' Kunde A ');

    expect(screen.queryByRole('form', { name: 'Projekt umbenennen' })).not.toBeInTheDocument();
    expect(spy).not.toHaveBeenCalled();
  });

  it('"Abbrechen" closes the panel without a write', async () => {
    const user = userEvent.setup();
    const repo = new InMemoryRepository();
    repo.seedProjects(UID, [project('p1', 'Kunde A')]);
    const spy = vi.spyOn(repo, 'updateProject');
    renderProjects(repo);

    await user.click(within(await waitFor(() => rowFor('Kunde A'))).getByRole('button', { name: 'Umbenennen' }));
    await user.click(screen.getByRole('button', { name: 'Abbrechen' }));

    expect(screen.queryByRole('form', { name: 'Projekt umbenennen' })).not.toBeInTheDocument();
    expect(spy).not.toHaveBeenCalled();
  });
});

describe('ProjectsView: recolor (edge case 6)', () => {
  it('preselects the current color and writes only the new color', async () => {
    const user = userEvent.setup();
    const repo = new InMemoryRepository();
    repo.seedProjects(UID, [project('p1', 'Kunde A', 'purple')]);
    const spy = vi.spyOn(repo, 'updateProject');
    renderProjects(repo);

    await user.click(within(await waitFor(() => rowFor('Kunde A'))).getByRole('button', { name: 'Farbe ändern' }));
    const form = screen.getByRole('form', { name: 'Farbe wählen' });
    expect(within(form).getByRole('group', { name: 'Neue Farbe' })).toBeInTheDocument();
    expect(within(form).getByRole('radio', { name: 'Lila' })).toBeChecked();
    await user.click(within(form).getByRole('radio', { name: 'Gelb' }));
    await user.click(within(form).getByRole('button', { name: 'Speichern' }));

    expect(spy).toHaveBeenCalledTimes(1);
    expect(Object.keys(spy.mock.calls[0][2])).toEqual(['color', 'updatedAt']);
    expect(repo.getProjects(UID)[0].color).toBe('yellow');
    expect(screen.queryByRole('form', { name: 'Farbe wählen' })).not.toBeInTheDocument();
    await waitFor(() => expect(rowFor('Kunde A').querySelector('.project-color-yellow')).not.toBeNull());
  });

  it('closes without a write when the color is unchanged', async () => {
    const user = userEvent.setup();
    const repo = new InMemoryRepository();
    repo.seedProjects(UID, [project('p1', 'Kunde A', 'purple')]);
    const spy = vi.spyOn(repo, 'updateProject');
    renderProjects(repo);

    await user.click(within(await waitFor(() => rowFor('Kunde A'))).getByRole('button', { name: 'Farbe ändern' }));
    await user.click(within(screen.getByRole('form', { name: 'Farbe wählen' })).getByRole('button', { name: 'Speichern' }));

    expect(screen.queryByRole('form', { name: 'Farbe wählen' })).not.toBeInTheDocument();
    expect(spy).not.toHaveBeenCalled();
  });

  it('uses a radio group name distinct from the create form (spec-audit NB6)', async () => {
    const user = userEvent.setup();
    const repo = new InMemoryRepository();
    repo.seedProjects(UID, [project('p1', 'Kunde A', 'purple')]);
    renderProjects(repo);

    await user.click(within(await waitFor(() => rowFor('Kunde A'))).getByRole('button', { name: 'Farbe ändern' }));
    const recolor = screen.getByRole('form', { name: 'Farbe wählen' });
    const createName = within(createForm()).getAllByRole('radio')[0].getAttribute('name');
    const recolorName = within(recolor).getAllByRole('radio')[0].getAttribute('name');
    expect(createName).toBeTruthy();
    expect(recolorName).toBeTruthy();
    expect(createName).not.toBe(recolorName);
    expect(within(createForm()).getByRole('radio', { name: 'Blau' })).toBeChecked();
    expect(within(recolor).getByRole('radio', { name: 'Lila' })).toBeChecked();

    await user.click(within(recolor).getByRole('radio', { name: 'Rot' }));
    expect(within(createForm()).getByRole('radio', { name: 'Blau' })).toBeChecked();
  });
});

describe('ProjectsView: archive (edge case 8)', () => {
  it('"Archivieren" moves the project to "Archiviert", "Wiederherstellen" brings it back', async () => {
    const user = userEvent.setup();
    const repo = new InMemoryRepository();
    repo.seedProjects(UID, [project('p1', 'Kunde A'), project('p2', 'Kunde B')]);
    const spy = vi.spyOn(repo, 'updateProject');
    renderProjects(repo);

    await user.click(within(await waitFor(() => rowFor('Kunde A'))).getByRole('button', { name: 'Archivieren' }));

    const archivedList = await screen.findByRole('list', { name: 'Archivierte Projekte' });
    expect(within(archivedList).getByText('Kunde A (archiviert)')).toBeInTheDocument();
    expect(within(screen.getByRole('list', { name: 'Aktive Projekte' })).queryByText('Kunde A')).not.toBeInTheDocument();
    expect(repo.getProjects(UID)[0].archived).toBe(true);
    expect(spy.mock.calls[0][2]).toMatchObject({ archived: true });
    expect(Object.keys(spy.mock.calls[0][2])).toEqual(['archived', 'updatedAt']);

    await user.click(within(rowFor('Kunde A (archiviert)')).getByRole('button', { name: 'Wiederherstellen' }));

    await waitFor(() =>
      expect(within(screen.getByRole('list', { name: 'Aktive Projekte' })).getByText('Kunde A')).toBeInTheDocument(),
    );
    expect(screen.queryByRole('list', { name: 'Archivierte Projekte' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Archiviert' })).not.toBeInTheDocument();
    expect(spy.mock.calls[1][2]).toMatchObject({ archived: false });
    expect(repo.getProjects(UID)[0].archived).toBe(false);
  });
});

describe('ProjectsView: remote changes (edge case 27)', () => {
  it('shows a rename/recolor from another device without any entry write', async () => {
    const repo = new InMemoryRepository();
    repo.seedProjects(UID, [project('p1', 'Kunde A', 'blue')]);
    const spies = [vi.spyOn(repo, 'updateEntry'), vi.spyOn(repo, 'applyTransition'), vi.spyOn(repo, 'createEntry')];
    renderProjects(repo);
    await waitFor(() => rowFor('Kunde A'));

    act(() => repo.seedProjects(UID, [project('p1', 'Kunde Neu', 'red')]));

    await waitFor(() => expect(rowFor('Kunde Neu').querySelector('.project-color-red')).not.toBeNull());
    expect(screen.queryByText('Kunde A')).not.toBeInTheDocument();
    for (const spy of spies) expect(spy).not.toHaveBeenCalled();
  });

  it('closes an open panel when its project disappears', async () => {
    const user = userEvent.setup();
    const repo = new InMemoryRepository();
    repo.seedProjects(UID, [project('p1', 'Kunde A'), project('p2', 'Kunde B')]);
    renderProjects(repo);

    await user.click(within(await waitFor(() => rowFor('Kunde A'))).getByRole('button', { name: 'Umbenennen' }));
    act(() => repo.seedProjects(UID, [project('p2', 'Kunde B')]));

    await waitFor(() => expect(screen.queryByRole('form', { name: 'Projekt umbenennen' })).not.toBeInTheDocument());
  });
});

describe('ProjectsView: offline and rejected writes (edge cases 36, 37)', () => {
  it('create, rename and archive offline show immediately with no toast', async () => {
    const user = userEvent.setup();
    const repo = new InMemoryRepository();
    renderProjects(repo);
    await screen.findByRole('form', { name: 'Neues Projekt' });
    repo.setOffline(true);

    await createNamed(user, 'Kunde A');
    expect(await screen.findByText('Kunde A')).toBeInTheDocument();
    await renameTo(user, 'Kunde A', 'Kunde B');
    expect(await screen.findByText('Kunde B')).toBeInTheDocument();
    await user.click(within(rowFor('Kunde B')).getByRole('button', { name: 'Archivieren' }));
    expect(await screen.findByText('Kunde B (archiviert)')).toBeInTheDocument();
    expect(screen.getByRole('status')).toBeEmptyDOMElement();

    await act(async () => repo.setOffline(false));
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
    expect(repo.getProjects(UID)[0]).toMatchObject({ name: 'Kunde B', archived: true });
  });

  it('a rejected create shows the toast and the project disappears again', async () => {
    const user = userEvent.setup();
    const repo = new InMemoryRepository();
    renderProjects(repo);
    await screen.findByRole('form', { name: 'Neues Projekt' });

    repo.failNextWrite(denied());
    await createNamed(user, 'Kunde A');

    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent('Speichern fehlgeschlagen: keine Berechtigung.'),
    );
    await waitFor(() => expect(screen.queryByText('Kunde A')).not.toBeInTheDocument());
    expect(screen.getByText('Noch keine Projekte.')).toBeInTheDocument();
    expect(repo.getProjects(UID)).toEqual([]);
  });

  it('a rejected rename shows the toast and the old name returns', async () => {
    const user = userEvent.setup();
    const repo = new InMemoryRepository();
    repo.seedProjects(UID, [project('p1', 'Kunde A')]);
    renderProjects(repo);

    repo.failNextWrite(denied());
    await renameTo(user, 'Kunde A', 'Kunde B');

    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent('Speichern fehlgeschlagen: keine Berechtigung.'),
    );
    expect(await screen.findByText('Kunde A')).toBeInTheDocument();
    expect(repo.getProjects(UID)[0].name).toBe('Kunde A');
  });
});

describe('ProjectsView: load states (edge case 39)', () => {
  it('shows the alert and no list or form on a subscription error', async () => {
    const repo = new FailingProjectsRepository();
    repo.seedProjects(UID, [project('p1', 'Kunde A')]);
    renderProjects(repo);

    expect(await screen.findByRole('alert')).toHaveTextContent('Daten konnten nicht geladen werden.');
    expect(screen.getByRole('heading', { name: 'Projekte' })).toBeInTheDocument();
    expect(screen.queryByText('Lädt…')).not.toBeInTheDocument();
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
    expect(screen.queryByRole('form', { name: 'Neues Projekt' })).not.toBeInTheDocument();
  });

  it('shows the alert when the projects service is absent', () => {
    renderProjects(new InMemoryRepository(), false);

    expect(screen.getByRole('heading', { name: 'Projekte' })).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Daten konnten nicht geladen werden.');
    expect(screen.queryByRole('form', { name: 'Neues Projekt' })).not.toBeInTheDocument();
  });

  it('shows "Lädt…" before the first delivery', () => {
    renderProjects(new InMemoryRepository());
    expect(screen.getByText('Lädt…')).toBeInTheDocument();
  });
});
