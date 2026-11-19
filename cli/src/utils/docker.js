const { spawn, execFile } = require('child_process');
const run = (cmd, args, cwd, withStderr = false) => new Promise((res, rej) =>
    execFile(cmd, args, { cwd }, (e, out, err) => (e ? rej(e) : res((withStderr ? out + err : out).trim()))));
const chalk = require('chalk');

/**
 * Run docker-compose command
 * @param {string} cwd - Working directory
 * @param {string} command - Docker compose command (up, down, etc)
 * @param {Array} args - Additional arguments
 * @returns {Promise}
 */
function runDockerCompose(cwd, command, args = []) {
  return new Promise((resolve, reject) => {
    const allArgs = [command, ...args];
    
    const process = spawn('docker-compose', allArgs, {
      cwd,
      stdio: 'pipe'
    });

    let stdout = '';
    let stderr = '';

    process.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    process.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    process.on('error', (error) => {
      if (error.code === 'ENOENT') {
        reject(new Error('docker-compose is not installed or not in PATH'));
      } else {
        reject(error);
      }
    });

    process.on('close', (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        reject(new Error(`docker-compose ${command} failed with code ${code}\n${stderr}`));
      }
    });
  });
}

/**
 * Check if Docker is running
 * @returns {Promise<boolean>}
 */
async function isDockerRunning() {
  return new Promise((resolve) => {
    const process = spawn('docker', ['ps']);
    
    process.on('error', () => {
      resolve(false);
    });

    process.on('close', (code) => {
      resolve(code === 0);
    });
  });
}

/**
 * Check if docker-compose is installed
 * @returns {Promise<boolean>}
 */
async function isDockerComposeInstalled() {
  return new Promise((resolve) => {
    const process = spawn('docker-compose', ['--version']);
    
    process.on('error', () => {
      resolve(false);
    });

    process.on('close', (code) => {
      resolve(code === 0);
    });
  });
}

/**
 * Get Docker version
 * @returns {Promise<string>}
 */
async function getDockerVersion() {
  return new Promise((resolve, reject) => {
    const process = spawn('docker', ['--version']);
    
    let output = '';
    
    process.stdout.on('data', (data) => {
      output += data.toString();
    });

    process.on('error', (error) => {
      reject(error);
    });

    process.on('close', (code) => {
      if (code === 0) {
        resolve(output.trim());
      } else {
        reject(new Error('Failed to get Docker version'));
      }
    });
  });
}

/**
 * Verify Docker environment
 */
async function verifyDockerEnvironment() {
  const dockerRunning = await isDockerRunning();
  const composeInstalled = await isDockerComposeInstalled();

  if (!dockerRunning) {
    console.error(chalk.red('\n❌ Docker is not running'));
    console.log(chalk.gray('Please start Docker Desktop or Docker daemon.\n'));
    process.exit(1);
  }

  if (!composeInstalled) {
    console.error(chalk.red('\n❌ docker-compose is not installed'));
    console.log(chalk.gray('Please install docker-compose to use easy-containers.\n'));
    console.log(chalk.cyan('Visit: https://docs.docker.com/compose/install/\n'));
    process.exit(1);
  }
}

// ponytail: fixed 30s poll; make it a flag if slow services (elasticsearch, gitlab) need longer
async function waitForContainers(cwd, timeoutMs = 30000) {
  const ids = (await run('docker-compose', ['ps', '-a', '-q'], cwd)).split('\n').filter(Boolean);
  const deadline = Date.now() + timeoutMs;
  while (true) {
    const states = await Promise.all(ids.map(id => run('docker', ['inspect', '-f',
      '{{.Name}}|{{.State.Status}}|{{if .State.Health}}{{.State.Health.Status}}{{end}}|{{.State.ExitCode}}', id])));
    const parsed = states.map(s => { const [name, status, health, code] = s.split('|'); return { name: name.slice(1), status, health, code }; });
    const dead = parsed.find(c => c.status === 'exited' || c.status === 'dead' || c.status === 'restarting' || c.health === 'unhealthy');
    if (dead) {
      const logs = await run('docker', ['logs', '--tail', '20', dead.name], cwd, true).catch(() => '');
      throw new Error(`${dead.name} is ${dead.health || dead.status} (exit ${dead.code})\n${logs}`);
    }
    if (parsed.every(c => c.status === 'running' && c.health !== 'starting')) return true;
    if (Date.now() > deadline) return false; // still starting: caller warns instead of failing
    await new Promise(r => setTimeout(r, 1000));
  }
}

module.exports = {
  runDockerCompose,
  isDockerRunning,
  isDockerComposeInstalled,
  getDockerVersion,
  verifyDockerEnvironment,
  waitForContainers
};