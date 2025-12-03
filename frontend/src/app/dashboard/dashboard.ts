import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { EversportsData, Slot } from './resolvers';
import { HttpClient } from '@angular/common/http';
import { DatePipe } from '@angular/common';
import { SpinnerService } from '../spinner.service';

@Component({
  selector: 'app-dashboard',
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe],
})
export class Dashboard {
  readonly eversportsData = signal<EversportsData | null>(null);
  readonly showGoldenOnly = signal(false);
  readonly showJackpotOnly = signal(false);
  private readonly route = inject(ActivatedRoute);
  private readonly httpClient = inject(HttpClient);

  constructor(private spinnerService: SpinnerService) {
    this.route.data.subscribe((data) => {
      this.eversportsData.set({
        slots: data['data'].slots.filter((slot: Slot) => slot.date !== this.todayString()),
      });
      this.spinnerService.hide();
      // this.fetchAdditionalSlots(5);
      // this.fetchAdditionalSlots(10);
    });
  }

  get openSlotsByDateAndCourt() {
    const grouped: Record<
      string,
      Record<
        number,
        Array<{
          court: number;
          start: string;
          date: string;
          isGolden: boolean;
          isJackpot: boolean;
          isBookable: boolean;
        }>
      >
    > = {};
    const openSlots = this.eversportsData() ? this.findOpenSlots(this.eversportsData()!.slots) : [];
    for (const slot of openSlots) {
      if (!grouped[slot.date]) grouped[slot.date] = {};
      if (!grouped[slot.date][slot.court]) grouped[slot.date][slot.court] = [];
      grouped[slot.date][slot.court].push({
        ...slot,
        isGolden: false,
        isJackpot: false,
        isBookable: false,
      });
    }
    for (const date of Object.keys(grouped)) {
      const dateObj = new Date(date);
      const isBookable = dateObj.getTime() - Date.now() <= 14 * 24 * 60 * 60 * 1000;
      const isWeekend = dateObj.getDay() === 0 || dateObj.getDay() === 6; // Sunday=0, Saturday=6
      for (const court of Object.keys(grouped[date])) {
        const slots = grouped[date][Number(court)];
        slots.sort((a, b) => Number(a.start) - Number(b.start));
        for (let i = 0; i < slots.length; i++) {
          const startNum = Number(slots[i].start);
          if (isWeekend) {
            slots[i].isGolden = startNum >= 800 && startNum < 1800;
          } else {
            slots[i].isGolden = startNum >= 1500 && startNum < 1900;
          }
          slots[i].isJackpot = false;
          slots[i].isBookable = isBookable;
        }
        for (let i = 0; i < slots.length; i++) {
          if (!slots[i].isGolden) continue;
          const prev = i > 0 ? slots[i - 1] : undefined;
          const next = i < slots.length - 1 ? slots[i + 1] : undefined;
          if (
            (prev && prev.isGolden && Number(prev.start) === Number(slots[i].start) - 100) ||
            (next && next.isGolden && Number(next.start) === Number(slots[i].start) + 100)
          ) {
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
    const filtered: typeof base = {};
    for (const date of Object.keys(base)) {
      filtered[date] = {};
      for (const court of Object.keys(base[date])) {
        filtered[date][Number(court)] = base[date][Number(court)].filter((slot) => {
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
      map[date] = dateObj.getTime() - Date.now() <= 14 * 24 * 60 * 60 * 1000;
    }
    return map;
  }

  get courtOrder(): number[] {
    return [110271, 110272, 110273];
  }

  get dates(): string[] {
    return Object.keys(this.openSlotsByDateAndCourt).sort();
  }

  findOpenSlots(slots: Slot[]): { court: number; start: string; date: string }[] {
    const grouped = new Map<string, Slot[]>();
    for (const slot of slots) {
      const key = `${slot.date}|${slot.court}`;
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key)!.push(slot);
    }
    const openSlots: { court: number; start: string; date: string }[] = [];
    for (const [key, group] of grouped.entries()) {
      const [date, courtStr] = key.split('|');
      const court = Number(courtStr);
      const allTimes: string[] = [];
      for (let hour = 8; hour <= 22; hour++) {
        allTimes.push((hour < 10 ? '0' : '') + hour + '00');
      }
      const taken = new Set(group.map((s) => s.start));
      for (const start of allTimes) {
        if (!taken.has(start)) {
          openSlots.push({ court, start, date });
        }
      }
    }
    return openSlots;
  }

  courtName(courtId: number): string {
    switch (courtId) {
      case 110271:
        return 'Court 1';
      case 110272:
        return 'Court 2';
      case 110273:
        return 'Court 3';
      default:
        return `Court ${courtId}`;
    }
  }

  getDayNameAndDate(date: string): string {
    const d = new Date(date);
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const dayName = days[d.getDay()];
    return `${dayName}, ${date}`;
  }

  private todayString(): string {
    const today = new Date();
    return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  }

  private fetchAdditionalSlots(offsetDays: number): void {
    const date = new Date();
    date.setDate(date.getDate() + offsetDays);
    const startDate = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    const url = `https://padelapi.pokebot.at/slots?&startDate=${startDate}`;
    console.log(url);
    this.httpClient.get<EversportsData>(url).subscribe((data: EversportsData) => {
      const current = this.eversportsData();
      if (current) {
        this.eversportsData.set({
          slots: [...current.slots, ...data.slots],
        });
      }
    });
  }

  setGoldenOnly(value: boolean) {
    this.showGoldenOnly.set(value);
    if (value) this.showJackpotOnly.set(false);
  }
  setJackpotOnly(value: boolean) {
    this.showJackpotOnly.set(value);
    if (value) this.showGoldenOnly.set(false);
  }
}
