const chalk = require('chalk');
const ora = require('ora');
const { downloadService } = require('../utils/downloader');
const { runDockerCompose, waitForContainers } = require('../utils/docker');

async function up(service) {
  const spinner = ora(`Starting ${service}...`).start();

  try {
    // Download service if not exists
    const servicePath = await downloadService(service);
    
    spinner.text = `Running docker-compose up for ${service}...`;
    
    // Run docker-compose up
    await runDockerCompose(servicePath, 'up', ['-d']);
    spinner.text = `Waiting for ${service} to become healthy...`;
    const ready = await waitForContainers(servicePath);
    if (!ready) {
      spinner.warn(chalk.yellow(`${service} started but is still starting up. Check: easy logs ${service}`));
      return;
    }

    spinner.succeed(chalk.green(`✓ ${service} is up and running!`));
    
    console.log(chalk.cyan(`\nService: ${service}`));
    console.log(chalk.gray(`Location: ${servicePath}`));
    console.log(chalk.yellow(`\nTo stop: easy down ${service}`));
  } catch (error) {
    spinner.fail(chalk.red(`Failed to start ${service}`));
    throw error;
  }
}

module.exports = { up };