import pc from 'picocolors';

export function info(msg: string): void {
  console.log(pc.cyan('i'), msg);
}

export function success(msg: string): void {
  console.log(pc.green('✓'), msg);
}

export function warn(msg: string): void {
  console.log(pc.yellow('!'), msg);
}

export function error(msg: string): void {
  console.error(pc.red('✗'), msg);
}

export function step(msg: string): void {
  console.log(pc.dim('→'), msg);
}

export function box(lines: string[]): void {
  console.log('');
  for (const line of lines) console.log('  ' + line);
  console.log('');
}
