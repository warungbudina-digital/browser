import fs from 'node:fs/promises';
import path from 'node:path';

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

export class ProfileStore {
  constructor({ stateDir, seedProfiles, defaultProfile }) {
    this.stateDir = stateDir;
    this.file = path.join(stateDir, 'profiles.json');
    this.seedProfiles = seedProfiles;
    this.defaultProfile = defaultProfile;
  }

  async load() {
    await ensureDir(this.stateDir);
    try {
      const raw = await fs.readFile(this.file, 'utf8');
      const parsed = JSON.parse(raw);
      return this.#normalize(parsed);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      const initial = this.#normalize({ activeProfile: this.defaultProfile, profiles: this.seedProfiles });
      await this.save(initial);
      return initial;
    }
  }

  async save(data) {
    await ensureDir(this.stateDir);
    await fs.writeFile(this.file, JSON.stringify(this.#normalize(data), null, 2));
  }

  #normalize(data) {
    const profiles = { ...this.seedProfiles, ...(data?.profiles || {}) };
    const activeProfile = data?.activeProfile && profiles[data.activeProfile] ? data.activeProfile : this.defaultProfile;
    return { activeProfile, profiles };
  }
}
