import inquirer from 'inquirer';
import chalk from "chalk";

export async function checkDependencies() {
  const answers = await inquirer.prompt([{
    type: "input",
    name: "check_docker",
    message: "Have you successfully installed docker and is the deamon running? (yes/no)",
    choices: ["yes", "no"],
    validate: function(answer) {
      const dependencyRegex = /yes/;
      if(!dependencyRegex.test(answer)) {
        return "🛑 Go install to >>> https://docs.docker.com/get-docker/ and follow the directions there.\n>> 🟢 Come back and write yes when it's done."
      }
      console.log(chalk.bgBlueBright("✅ Docker installed and Daemon running! Awesome! Continue..."));
      return true;
  }
  },
  {
    type: "input",
    name: "check_aws_cli",
    message: "Have you successfully installed the AWS CLI? (yes/no)",
    choices: ["yes", "no"],
    validate: function(answer) {
      const dependencyRegex = /yes/
      if(!dependencyRegex.test(answer)) {
          return "🛑 Go install to >>> https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html and follow the directions there.\n>> 🟢 Come back and write yes when it's done."
      }
      console.log(chalk.bgBlueBright("✅ AWS CLI installed! Awesome! Continue..."))
      return true
  }
  }]);
  console.log(chalk.greenBright("Thanks for checking dependencies! You are good to go 🥳"))

  return answers;
};

export async function checkQuicksight() {
  
  const answers = await inquirer.prompt([{
    type: "input",
    name: "check_docker",
    message: "Have you successfully installed docker and is the deamon running? (yes/no)",
    choices: ["yes", "no"],
    validate: function(answer) {
      const dependencyRegex = /yes/;
      if(!dependencyRegex.test(answer)) {
        return "🛑 Go install to >>> https://docs.docker.com/get-docker/ and follow the directions there.\n>> 🟢 Come back and write yes when it's done."
      }
      console.log(chalk.bgBlueBright("✅ Docker installed and Daemon running! Awesome! Continue..."));
      return true;
  }
  },
  {
    type: "input",
    name: "check_aws_cli",
    message: "Have you successfully installed the AWS CLI? (yes/no)",
    choices: ["yes", "no"],
    validate: function(answer) {
      const dependencyRegex = /yes/
      if(!dependencyRegex.test(answer)) {
          return "🛑 Go install to >>> https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html and follow the directions there.\n>> 🟢 Come back and write yes when it's done."
      }
      console.log(chalk.bgBlueBright("✅ AWS CLI installed! Awesome! Continue..."))
      return true
  }
  }]);
  return inquirer.prompt(answers);
};