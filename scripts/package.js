const os = require('node:os');

// Secretlint currently uses os.cpus().length as its scan concurrency. Some
// restricted environments report zero CPUs, which makes VSCE fail before it
// can inspect any files.
if (os.cpus().length === 0) {
  const fallbackCpu = {
    model: 'unknown',
    speed: 0,
    times: {
      user: 0,
      nice: 0,
      sys: 0,
      idle: 0,
      irq: 0,
    },
  };

  os.cpus = () => [fallbackCpu];
}

require('@vscode/vsce/out/main')(process.argv);
