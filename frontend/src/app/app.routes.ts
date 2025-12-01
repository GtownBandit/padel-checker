import { Routes } from '@angular/router';
import { Dashboard } from './dashboard/dashboard';
import { dashboardResolver } from './dashboard/resolvers';

export const routes: Routes = [
  {
    path: '',
    component: Dashboard,
    resolve: { data: dashboardResolver },
  },
];
