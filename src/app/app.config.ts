import { ApplicationConfig, inject, isDevMode, provideAppInitializer, provideBrowserGlobalErrorListeners, provideZonelessChangeDetection } from '@angular/core';
import { provideRouter, withComponentInputBinding, withInMemoryScrolling } from '@angular/router';
import { provideServiceWorker } from '@angular/service-worker';
import { routes } from './app.routes';
import { Profiles } from './core/profile/profile.service';
import { GameData } from './core/game-data/game-data.service';
import { Content } from './content/content.service';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZonelessChangeDetection(),
    provideRouter(routes, withComponentInputBinding(), withInMemoryScrolling({ scrollPositionRestoration: 'top' })),
    provideAppInitializer(() => {
      const profiles = inject(Profiles);
      const game = inject(GameData);
      const content = inject(Content);
      // Data failures are shown in the UI; they must not block the app from starting.
      return Promise.all([profiles.init(), game.load().catch(() => undefined), content.load()]).then(() => undefined);
    }),
    provideServiceWorker('ngsw-worker.js', {
      enabled: !isDevMode(),
      registrationStrategy: 'registerWhenStable:30000',
    }),
  ],
};
