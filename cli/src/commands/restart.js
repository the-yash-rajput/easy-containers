const chalk = require('chalk');
const ora = require('ora');
const { runDockerCompose, waitForContainers } = require('../utils/docker');
const { getServicePath } = require('../utils/config');
const fs = require('fs').promises;

async function restart(service, options = {}) {
  const spinner = ora(`Restarting ${service}...`).start();

  try {
    const servicePath = getServicePath(service);
    
    // Check if service exists
    try {
      await fs.access(servicePath);
    } catch {
      spinner.fail(chalk.red(`Service "${service}" not found`));
      console.log(chalk.gray('\nUse "easy list" to see available services.'));
      return;
    }

    // Stop the service
    spinner.text = `Stopping ${service}...`;
    await runDockerCompose(servicePath, 'down');
    
    // Wait a moment
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Start the service
    spinner.text = `Starting ${service}...`;
    await runDockerCompose(servicePath, 'up', ['-d']);

    spinner.text = `Waiting for ${service} to become healthy...`;
    const ready = await waitForContainers(servicePath);
    if (!ready) {
      spinner.warn(chalk.yellow(`${service} restarted but is still starting up. Check: easy logs ${service}`));
      return;
    }

    spinner.succeed(chalk.green(`✓ ${service} has been restarted!`));
    
    console.log(chalk.cyan(`\nService: ${service}`));
    console.log(chalk.gray(`Location: ${servicePath}`));
    console.log(chalk.yellow(`\nTo view logs: easy logs ${service}`));

  } catch (error) {
    spinner.fail(chalk.red(`Failed to restart ${service}`));
    throw error;
  }
}

module.exports = { restart };