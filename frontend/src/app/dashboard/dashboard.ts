import { ChangeDetectionStrategy, Component, inject, signal, computed, ViewChild, ElementRef } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { take } from 'rxjs';
import { EversportsData, Slot } from './resolvers';
import { HttpClient } from '@angular/common/http';
import { DatePipe } from '@angular/common';
import { SpinnerService } from '../spinner.service';
import { API_URL } from '../config';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import { faStar, faFire, faFilter, faBolt } from '@fortawesome/free-solid-svg-icons';

const fetchedDates = new Set<string>();

@Component({
  selector: 'app-dashboard',
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FontAwesomeModule],
})
export class Dashboard {
  readonly faStar = faStar;
  readonly faFire = faFire;
  readonly faFilter = faFilter;
  readonly faBolt = faBolt;


  readonly eversportsData = signal<EversportsData | null>(null);
  readonly showGoldenOnly = signal(false);
  readonly showJackpotOnly = signal(false);
  readonly selectedDate = signal<string | null>(null);
  readonly hasLoadedExtendedRange = signal(false);
  readonly isLoadingExtended = signal(false);
  private activeRequests = 0;

  @ViewChild('dateContainer') dateContainer!: ElementRef<HTMLDivElement>;



  private readonly route = inject(ActivatedRoute);
  private readonly httpClient = inject(HttpClient);

  constructor(private spinnerService: SpinnerService) {
    this.route.data.pipe(take(1)).subscribe((data) => {
      const slots = data['data'].slots.filter((slot: Slot) => slot.date !== this.todayString());
      slots.forEach((slot: Slot) => fetchedDates.add(slot.date));
      this.eversportsData.set({ slots });

      if (slots.length > 0) {
        const uniqueDates: string[] = Array.from(new Set(slots.map((s: Slot) => s.date)));
        uniqueDates.sort((a, b) => a.localeCompare(b));
        if (uniqueDates.length > 0) {
          this.selectedDate.set(uniqueDates[0]);
        }
      }

      this.spinnerService.hide();
      this.fetchAdditionalSlots(5);
      this.fetchAdditionalSlots(10);
      this.fetchAdditionalSlots(14);
    });
  }

  readonly timeSlots = computed(() => {
    const activeDate = this.selectedDate();
    if (!activeDate) return [];
    const dateSlots = this.filteredOpenSlotsByDateAndCourt[activeDate];
    if (!dateSlots) return [];

    const byTime: Record<string, Record<number, any>> = {};
    for (const court of this.courtOrder) {
      const slots = dateSlots[court] || [];
      for (const slot of slots) {
        if (!byTime[slot.start]) byTime[slot.start] = {};
        byTime[slot.start][court] = slot;
      }
    }

    return Object.keys(byTime)
      .sort((a, b) => Number(a) - Number(b))
      .map((time) => ({
        time,
        courts: this.courtOrder.map((courtId) => byTime[time][courtId] || null),
      }));
  });

  readonly dateStats = computed(() => {
    const processed = this.filteredOpenSlotsByDateAndCourt;
    const stats: Record<string, { hasGolden: boolean; hasJackpot: boolean }> = {};
    for (const date of Object.keys(processed)) {
      let dateHasGolden = false;
      let dateHasJackpot = false;
      for (const court of this.courtOrder) {
        const slots: any[] = processed[date][court] || [];
        if (slots.some((s: any) => s.isGolden)) dateHasGolden = true;
        if (slots.some((s: any) => s.isJackpot)) dateHasJackpot = true;
      }
      stats[date] = { hasGolden: dateHasGolden, hasJackpot: dateHasJackpot };
    }
    return stats;
  });

  get openSlotsByDateAndCourt() {
    const grouped: Record<string, Record<number, any[]>> = {};
    const openSlots = this.eversportsData() ? this.findOpenSlots(this.eversportsData()!.slots) : [];
    for (const slot of openSlots) {
      if (!grouped[slot.date]) grouped[slot.date] = {};
      if (!grouped[slot.date][slot.court]) grouped[slot.date][slot.court] = [];
      grouped[slot.date][slot.court].push({ ...slot, isGolden: false, isJackpot: false, isBookable: false });
    }
    for (const date of Object.keys(grouped)) {
      const dateObj = new Date(date);
      const isBookable = dateObj.getTime() - Date.now() <= 30 * 24 * 60 * 60 * 1000;
      const isWeekend = dateObj.getDay() === 0 || dateObj.getDay() === 6;
      for (const court of Object.keys(grouped[date])) {
        const slots = grouped[date][Number(court)];
        slots.sort((a, b) => Number(a.start) - Number(b.start));
        for (let i = 0; i < slots.length; i++) {
          const startNum = Number(slots[i].start);
          slots[i].isGolden = isWeekend ? (startNum >= 800 && startNum < 1800) : (startNum >= 1500 && startNum < 1900);
          slots[i].isBookable = isBookable;
        }
        for (let i = 0; i < slots.length; i++) {
          if (!slots[i].isGolden) continue;
          const prev = i > 0 ? slots[i - 1] : undefined;
          const next = i < slots.length - 1 ? slots[i + 1] : undefined;
          if ((prev && prev.isGolden && Number(prev.start) === Number(slots[i].start) - 100) ||
            (next && next.isGolden && Number(next.start) === Number(slots[i].start) + 100)) {
            slots[i].isJackpot = true;
          }
        }
      }
    }
    return grouped;
  }

  get filteredOpenSlotsByDateAndCourt() {
    const base = this.openSlotsByDateAndCourt;
    if (!this.showGoldenOnly() && !this.showJackpotOnly()) return base;
    const filtered: any = {};
    for (const date of Object.keys(base)) {
      filtered[date] = {};
      for (const court of Object.keys(base[date])) {
        filtered[date][Number(court)] = base[date][Number(court)].filter((slot: any) => {
          if (this.showGoldenOnly()) return slot.isGolden;
          if (this.showJackpotOnly()) return slot.isJackpot;
          return true;
        });
      }
    }
    return filtered;
  }

  get dateBookableMap() {
    const map: Record<string, boolean> = {};
    for (const date of Object.keys(this.openSlotsByDateAndCourt)) {
      const dateObj = new Date(date);
      map[date] = dateObj.getTime() - Date.now() <= 30 * 24 * 60 * 60 * 1000;
    }
    return map;
  }

  get courtOrder(): number[] { return [110271, 110272, 110273]; }

  get dates(): string[] {
    const filtered = this.filteredOpenSlotsByDateAndCourt;
    return Object.keys(filtered)
      .filter((date) => {
        const courts = filtered[date];
        return this.courtOrder.some((court) => courts[court] && courts[court].length > 0);
      })
      .sort();
  }

  findOpenSlots(slots: Slot[]): { court: number; start: string; date: string }[] {
    const grouped = new Map<string, Slot[]>();
    for (const slot of slots) {
      const key = `${slot.date}|${slot.court}`;
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key)!.push(slot);
    }
    const openSlots: any[] = [];
    for (const [key, group] of grouped.entries()) {
      const [date, courtStr] = key.split('|');
      const court = Number(courtStr);
      const allTimes: string[] = [];
      for (let hour = 8; hour <= 22; hour++) { allTimes.push((hour < 10 ? '0' : '') + hour + '00'); }
      const taken = new Set(group.map((s) => s.start));
      for (const start of allTimes) { if (!taken.has(start)) { openSlots.push({ court, start, date }); } }
    }
    return openSlots;
  }

  courtName(courtId: number): string {
    const names: Record<number, string> = { 110271: 'Court 1', 110272: 'Court 2', 110273: 'Court 3' };
    return names[courtId] || `Court ${courtId}`;
  }

  getDayNameAndDate(date: string): string {
    const d = new Date(date);
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    return `${days[d.getDay()]}, ${date}`;
  }

  private todayString(): string {
    const today = new Date();
    return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  }

  private fetchAdditionalSlots(offsetDays: number): void {
    const date = new Date();
    date.setDate(date.getDate() + offsetDays);
    const startDate = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    if (fetchedDates.has(startDate)) return;

    fetchedDates.add(startDate);
    this.activeRequests++;

    const url = `${API_URL}/slots?&startDate=${startDate}`;
    this.httpClient.get<EversportsData>(url).subscribe({
      next: (data: EversportsData) => {
        const currentData = this.eversportsData();
        if (currentData) {
          this.eversportsData.set({ slots: [...currentData.slots, ...(data.slots || [])] });
        }
      },
      complete: () => {
        this.activeRequests--;
        if (this.activeRequests <= 0) {
          this.isLoadingExtended.set(false);
        }
      }
    });
  }

  loadMoreDates(): void {
    if (this.hasLoadedExtendedRange()) return;
    this.isLoadingExtended.set(true);
    [20, 25, 30].forEach(d => this.fetchAdditionalSlots(d));
    this.hasLoadedExtendedRange.set(true);
  }







  setGoldenOnly(value: boolean) {
    this.showGoldenOnly.set(value);
    if (value) this.showJackpotOnly.set(false);
    this.autoSelectFirstDate();
  }

  setJackpotOnly(value: boolean) {
    this.showJackpotOnly.set(value);
    if (value) this.showGoldenOnly.set(false);
    this.autoSelectFirstDate();
  }

  private autoSelectFirstDate() {
    const availableDates = this.dates;
    if (availableDates.length > 0 && (!this.selectedDate() || !availableDates.includes(this.selectedDate()!))) {
      this.selectedDate.set(availableDates[0]);
    }
  }

  setSelectedDate(date: string) { this.selectedDate.set(date); }

  getShortDate(date: string): string {
    const d = new Date(date);
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    return `${days[d.getDay()]} ${d.getDate()}.${d.getMonth() + 1}`;
  }

  hasSlotsForDate(date: string): boolean {
    const filtered = this.filteredOpenSlotsByDateAndCourt[date];
    return !!filtered && this.courtOrder.some((court) => filtered[court]?.length > 0);
  }

  getBookingUrl(slot: { court: number; start: string; date: string; isJackpot?: boolean }): string {
    const courtUuidMap: Record<number, string> = {
      110271: 'b540af14-ac2d-40f7-8cd0-4b61a1cd08b3',
      110272: '22d02649-2719-4819-a8c6-a8a5ffde71e8',
      110273: 'f8050665-efd5-42da-a3c5-bac5bf258d80',
    };
    const facilityUuid = '436c3760-eed7-478d-8c7d-9bf899dae43d';
    const sportUuid = 'b388f543-69de-11e8-bdc6-02bd505aa7b2';
    const courtUuid = courtUuidMap[slot.court] || '';
    if (courtUuid.includes('PLACEHOLDER')) return `https://www.eversports.at/sb/padelzone-graz-or-racket-sport-center?sport=padel-indoor&date=${slot.date}`;
    const startStr = `${slot.date} ${slot.start.slice(0, 2)}:${slot.start.slice(2)}`;
    const startDate = new Date(`${slot.date}T${slot.start.slice(0, 2)}:${slot.start.slice(2)}:00`);
    const endDate = new Date(startDate.getTime() + (slot.isJackpot ? 2 : 1) * 60 * 60 * 1000);
    const endStr = `${endDate.getFullYear()}-${String(endDate.getMonth() + 1).padStart(2, '0')}-${String(endDate.getDate()).padStart(2, '0')} ${String(endDate.getHours()).padStart(2, '0')}:${String(endDate.getMinutes()).padStart(2, '0')}`;
    const params = new URLSearchParams({
      returnTo: `https://www.eversports.at/sb/padelzone-graz-or-racket-sport-center?sport=padel-indoor`,
      countryCode: 'AT', facilityUuid, courtUuid, start: startStr, end: endStr, sportUuid, origin: 'eversport', type: 'court-bookable-item', venueId: facilityUuid,
    });
    return `https://www.eversports.at/checkout/?${params.toString()}`;
  }
}
