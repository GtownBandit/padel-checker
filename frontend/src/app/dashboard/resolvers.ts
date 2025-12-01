import { inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { ResolveFn } from '@angular/router';
import { Observable } from 'rxjs';
import { SpinnerService } from '../spinner.service';

export type Slot = {
  date: string;
  start: string;
  court: number;
  title: string | null;
  present: boolean;
  isUserBookingOwner: boolean;
  booking: unknown;
};

export type EversportsData = {
  slots: Slot[];
};

export const dashboardResolver: ResolveFn<EversportsData> = (): Observable<EversportsData> => {
  const spinnerService = inject(SpinnerService);
  spinnerService.show();
  const http = inject(HttpClient);
  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, '0');
  const dd = String(today.getDate()).padStart(2, '0');
  const startDate = `${yyyy}-${mm}-${dd}`;
  const url = `https://padelapi.pokebot.at/slots?&startDate=${startDate}`;
  return http.get<EversportsData>(url);
};
