import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { SpinnerService } from './spinner.service';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import { faSpinner } from '@fortawesome/free-solid-svg-icons';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, FontAwesomeModule],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  faSpinner = faSpinner;

  constructor(private spinnerService: SpinnerService) {}

  get spinner() {
    return this.spinnerService.isSpinning;
  }
}
