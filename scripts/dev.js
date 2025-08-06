#!/usr/bin/env node

import { spawn } from 'child_process';
import { rmSync, existsSync } from 'fs';
import { join } from 'path';

// Clear caches
function clearCaches() {
  const caches = [
    '.bun',
    'node_modules/.cache',
    'dist'
  ];
  
  caches.forEach(cache => {
    if (existsSync(cache)) {
      console.log(`Clearing cache: ${cache}`);
      rmSync(cache, { recursive: true, force: true });
    }
  });
}

// Start development server with clean cache
function startDev() {
  clearCaches();
  
  console.log('Starting development server with clean cache...');
  
  const child = spawn('bun', ['--hot', '--no-cache', 'src/index.ts'], {
    stdio: 'inherit',
    shell: true
  });
  
  child.on('error', (error) => {
    console.error('Failed to start development server:', error);
    process.exit(1);
  });
  
  child.on('exit', (code) => {
    console.log(`Development server exited with code ${code}`);
    process.exit(code);
  });
}

// Handle process termination
process.on('SIGINT', () => {
  console.log('\nShutting down development server...');
  process.exit(0);
});

startDev(); 