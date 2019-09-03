const fs = require('fs');

const util = require('util');
const exec = util.promisify(require('child_process').exec);

async function createVersionsFile(filename) {
  const output = (await exec('env -i git log -1 --date=short  --pretty="format:%h;%cr"')).stdout.toString();
  const [commitId, commitAgo] = output.trim().split(';');

  const content =
    '// Automatically generated by ${__filename}\n' +
    `module.exports = ${JSON.stringify({ commitId, commitAgo, root: __dirname })};`;

  fs.writeFileSync(filename, content, { encoding: 'utf8' });
  console.log(`Git version information written to ${filename}`);
}

createVersionsFile('git.js');
