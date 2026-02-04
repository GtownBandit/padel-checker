import { isDevMode } from '@angular/core';

const isLocalhost = typeof window !== 'undefined' &&
    (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

export const API_URL = (isDevMode() || isLocalhost)
    ? 'http://localhost:3000'
    : 'https://padelapi.pokebot.at';
