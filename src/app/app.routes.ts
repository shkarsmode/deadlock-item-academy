import { inject } from '@angular/core';
import { CanActivateFn, Router, Routes } from '@angular/router';
import { Profiles } from './core/profile/profile.service';

/** First run: send the learner through onboarding (shared links and settings stay reachable). */
const onboarded: CanActivateFn = () => {
  const profiles = inject(Profiles);
  const router = inject(Router);
  return profiles.current()?.onboarded ? true : router.createUrlTree(['/onboarding']);
};

export const routes: Routes = [
  { path: '', canActivate: [onboarded], loadComponent: () => import('./features/dashboard/dashboard').then((m) => m.DashboardPage), title: 'Deadlock Item Academy' },
  { path: 'onboarding', loadComponent: () => import('./features/onboarding/onboarding').then((m) => m.OnboardingPage), title: 'Старт' },
  { path: 'practice', canActivate: [onboarded], loadComponent: () => import('./features/practice/launcher').then((m) => m.PracticeLauncher), title: 'Тренировка' },
  { path: 'practice/run', loadComponent: () => import('./features/practice/runner').then((m) => m.PracticeRunner), title: 'Тренировка' },
  { path: 'items', loadComponent: () => import('./features/items/items-page').then((m) => m.ItemsPage), title: 'Предметы' },
  { path: 'items/:key', loadComponent: () => import('./features/items/item-detail').then((m) => m.ItemDetailPage), title: 'Предмет' },
  { path: 'compare', loadComponent: () => import('./features/items/compare').then((m) => m.ComparePage), title: 'Сравнение' },
  { path: 'scenarios', canActivate: [onboarded], loadComponent: () => import('./features/scenarios/scenarios-page').then((m) => m.ScenariosPage), title: 'Ситуации' },
  { path: 'simulator', canActivate: [onboarded], loadComponent: () => import('./features/simulator/simulator').then((m) => m.SimulatorPage), title: 'Симулятор магазина' },
  { path: 'builds', canActivate: [onboarded], loadComponent: () => import('./features/builds/builds-page').then((m) => m.BuildsPage), title: 'Build Doctor' },
  { path: 'builds/:id', canActivate: [onboarded], loadComponent: () => import('./features/builds/build-detail').then((m) => m.BuildDetailPage), title: 'Билд' },
  { path: 'active', canActivate: [onboarded], loadComponent: () => import('./features/active/active-page').then((m) => m.ActivePage), title: 'Активки и Imbue' },
  { path: 'paths', canActivate: [onboarded], loadComponent: () => import('./features/paths/paths-page').then((m) => m.PathsPage), title: 'Курсы героев' },
  { path: 'paths/:hero', canActivate: [onboarded], loadComponent: () => import('./features/paths/hero-path').then((m) => m.HeroPathPage), title: 'Курс героя' },
  { path: 'analytics', canActivate: [onboarded], loadComponent: () => import('./features/analytics/analytics-page').then((m) => m.AnalyticsPage), title: 'Аналитика' },
  { path: 'mistakes', canActivate: [onboarded], loadComponent: () => import('./features/mistakes/mistakes-page').then((m) => m.MistakesPage), title: 'Тетрадь ошибок' },
  { path: 'problems', loadComponent: () => import('./features/problems/problems-page').then((m) => m.ProblemsPage), title: 'Поиск по проблеме' },
  { path: 'reflect', canActivate: [onboarded], loadComponent: () => import('./features/reflect/reflect-page').then((m) => m.ReflectPage), title: 'После матча' },
  { path: 'settings', loadComponent: () => import('./features/settings/settings-page').then((m) => m.SettingsPage), title: 'Настройки' },
  { path: 'share/:code', loadComponent: () => import('./features/share/share-page').then((m) => m.SharePage), title: 'Тренировка друга' },
  { path: '**', redirectTo: '' },
];
