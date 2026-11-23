import { Injectable, computed, inject } from '@angular/core';
import { Content } from '../content/content.service';
import type { BuildAnalysis } from '../content/content.model';
import { Profiles } from '../core/profile/profile.service';
import { Builds } from '../domain/builds/builds.service';
import type { SavedBuild } from '../domain/builds/build.model';

/** Default "my build" per hero: the learner's decoded current builds shipped as content. */
const DEFAULT_BUILD_FOR_HERO: Record<string, string> = {
  hero_hornet: 'preset:vindicta-current',
  hero_necro: 'preset:graves-current',
};

/**
 * Resolves the learner's own build for the focus hero ("Master Your Build").
 * Priority: explicit choice in the profile -> default decoded build for the hero -> none.
 */
@Injectable({ providedIn: 'root' })
export class MyBuild {
  private readonly profiles = inject(Profiles);
  private readonly builds = inject(Builds);
  private readonly content = inject(Content);

  readonly build = computed<SavedBuild | null>(() => {
    const hero = this.profiles.settings().heroFocus;
    const chosen = this.profiles.current()?.myBuildId;
    const all = this.builds.all();
    const pick = (chosen && all.find((b) => b.id === chosen && b.heroKey === hero)) || all.find((b) => b.id === DEFAULT_BUILD_FOR_HERO[hero]);
    return pick ?? null;
  });

  /** Expert analysis when the build is one of the analysed presets. */
  readonly analysis = computed<BuildAnalysis | null>(() => {
    const b = this.build();
    if (!b || b.source.type !== 'preset' || !b.source.ref) return null;
    return this.content.build(b.source.ref) ?? null;
  });

  readonly itemKeys = computed<string[]>(() => {
    const b = this.build();
    return b ? this.builds.itemKeys(b) : [];
  });

  buildFor(heroKey: string): SavedBuild | null {
    const chosen = this.profiles.current()?.myBuildId;
    const all = this.builds.all();
    return (chosen && all.find((b) => b.id === chosen && b.heroKey === heroKey)) || all.find((b) => b.id === DEFAULT_BUILD_FOR_HERO[heroKey]) || null;
  }
}
