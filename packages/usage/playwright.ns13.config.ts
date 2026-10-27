import {defineConfig} from '@playwright/test';
import base from './playwright.config';
export default defineConfig({...base,outputDir:'../../.artifacts/usage/ns13-browser-results',use:{...base.use,baseURL:'http://127.0.0.1:5197'},webServer:{command:'bun run dev --port 5197 --strictPort',url:'http://127.0.0.1:5197',reuseExistingServer:false,timeout:20_000}});
