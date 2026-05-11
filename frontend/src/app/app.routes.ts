import { Routes } from '@angular/router';
import { AuthorizedPage } from './authorized.page';
import { LoginPage } from './login.page';

export const routes: Routes = [
	{ path: '', pathMatch: 'full', redirectTo: 'login' },
	{ path: 'login', component: LoginPage },
	{ path: 'authorized', component: AuthorizedPage },
	{ path: '**', redirectTo: 'login' },
];
